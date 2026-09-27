-- games: catálogo de los juegos reales del arcade (ver CLAUDE.md — solo
-- TETRIX, ASTEROIDES y ARKANOID tienen motor jugable propio).
create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug = lower(slug)),
  nombre text not null,
  niveles integer
    check (niveles is null or niveles > 0),
  vidas integer not null
    check (vidas > 0),
  created_at timestamptz not null default now()
);

alter table public.games enable row level security;

create policy "catalogo de juegos visible para todos"
  on public.games for select using (true);
-- Sin insert/update/delete: el catálogo lo mantiene esta migración, no la API pública.

insert into public.games (slug, nombre, niveles, vidas) values
  ('tetrix', 'TETRIX', 10, 1),
  ('asteroides', 'ASTEROIDES', null, 1),
  ('arkanoid', 'ARKANOID', null, 3);

-- scores: historial de partidas jugadas. Esquema listo, sin datos:
-- el guardado real de una partida es una spec futura.
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id),
  score integer not null check (score >= 0),
  level integer not null default 1 check (level >= 1),
  created_at timestamptz not null default now()
);

alter table public.scores enable row level security;

create policy "puntuaciones visibles para todos"
  on public.scores for select using (true);

create policy "cada cual guarda su propia partida"
  on public.scores for insert with check (auth.uid() = user_id);
-- Sin update/delete: una puntuación guardada es un hecho histórico inmutable.

create index scores_game_id_score_idx on public.scores (game_id, score desc);
create index scores_user_id_idx on public.scores (user_id);
