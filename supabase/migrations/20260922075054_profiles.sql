-- SPEC 06 — Perfiles públicos y RLS.
--
-- `profiles` es el único sitio donde el nombre de jugador es único y
-- consultable: `auth.users.raw_user_meta_data` no puede llevar una restricción
-- de unicidad ni lo puede leer un leaderboard.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username = upper(username) and char_length(username) between 2 and 10),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Los nombres son públicos a propósito: el Salón de la Fama los pinta sin
-- sesión. Los correos viven en `auth.users`, que RLS no expone.
create policy "perfiles visibles para todos"
  on public.profiles for select using (true);

create policy "cada cual edita el suyo"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Sin política de insert ni de delete: la fila la crea el trigger de abajo
-- (`security definer`, se salta RLS) y cae en cascada con el usuario.

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  -- Formulario: username en options.data. OAuth: derivado del local-part del correo.
  base := upper(regexp_replace(
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    '[^a-zA-Z0-9_]', '', 'g'));
  base := left(nullif(base, ''), 10);
  if base is null then base := 'PLAYER'; end if;

  -- Desambiguación sólo para OAuth: en el formulario un nombre ocupado se
  -- rechaza antes de llamar a signUp, para no renombrar al jugador a su espalda.
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := left(base, 10 - length(n::text)) || n::text;
  end loop;

  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
