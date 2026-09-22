-- SPEC 07 — Nombre de perfil para las sesiones anónimas.
--
-- Un usuario anónimo no trae correo ni `username` en los metadatos, así que la
-- versión de SPEC 06 lo dejaba caer en 'PLAYER' y lo desambiguaba con un
-- sondeo lineal que crece con cada invitado. Se le da rama propia: un
-- identificador derivado del uuid, único sin sondear.
--
-- `create or replace` conserva el trigger `on_auth_user_created`, que sigue
-- apuntando a esta misma función.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  if new.is_anonymous then
    -- 10 caracteres exactos y ya en mayúsculas: cumple el check de
    -- profiles.username sin tocar la tabla. Es un identificador técnico, no un
    -- nombre de jugador: la interfaz pinta 'INVITADO' vía displayName().
    base := 'INV' || upper(substr(replace(new.id::text, '-', ''), 1, 7));
  else
    -- Formulario: username en options.data. OAuth: derivado del local-part del correo.
    base := upper(regexp_replace(
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
      '[^a-zA-Z0-9_]', '', 'g'));
    base := left(nullif(base, ''), 10);
    if base is null then base := 'PLAYER'; end if;
  end if;

  -- Desambiguación sólo para OAuth: en el formulario un nombre ocupado se
  -- rechaza antes de llamar a signUp, para no renombrar al jugador a su espalda.
  -- Para los anónimos es red de seguridad: el hex del uuid no colisiona.
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := left(base, 10 - length(n::text)) || n::text;
  end loop;

  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end $$;
