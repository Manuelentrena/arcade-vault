-- categorias: entidad propia en vez de un enum embebido en games.
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

alter table public.categorias enable row level security;

create policy "categorias visibles para todas"
  on public.categorias for select using (true);
-- Sin insert/update/delete: el catálogo de categorías lo mantiene esta migración.

insert into public.categorias (nombre) values
  ('ARCADE'),
  ('PUZZLE'),
  ('SHOOTER'),
  ('VERSUS');

-- games: datos cosméticos y de ficha que antes vivían como mock en
-- lib/games.ts, más el contador real de partidas jugadas.
alter table public.games
  add column categoria_id uuid references public.categorias (id),
  add column color text
    check (color in ('cyan', 'magenta', 'yellow', 'green')),
  add column cover text,
  add column image text,
  add column short text,
  add column long text,
  add column plays integer not null default 0
    check (plays >= 0),
  add column dificultad integer
    check (dificultad between 1 and 5),
  add column jugadores integer
    check (jugadores in (1, 2)),
  add column perifericos text[]
    check (
      perifericos <@ array['teclado', 'raton']::text[]
      and array_length(perifericos, 1) > 0
    );

update public.games set
  categoria_id = (select id from public.categorias where nombre = 'PUZZLE'),
  color = 'magenta',
  cover = 'cover-tetro',
  image = '/juegos/tetrix.png',
  short = 'Encaja los tetrominós y limpia líneas sin llegar al techo.',
  long = 'Siete piezas de neón caen sobre una rejilla de 10 × 20. Rótalas, deslízalas y encájalas para limpiar líneas: cada diez líneas sube el nivel y las piezas caen más rápido, hasta el nivel 10. Una sola vida: si el montón llega al techo, la partida termina y empiezas de nuevo.',
  dificultad = 4,
  jugadores = 1,
  perifericos = array['teclado']
where slug = 'tetrix';

update public.games set
  categoria_id = (select id from public.categorias where nombre = 'SHOOTER'),
  color = 'yellow',
  cover = 'cover-rocas',
  image = '/juegos/asteroides.png',
  short = 'Pulveriza rocas a la deriva y recoge lo que sueltan.',
  long = 'Tu nave flota en gravedad cero: gira, empuja y dispara para partir cada roca en fragmentos más pequeños y rápidos. Al romperlas caen objetos — disparo triple y escudo — que duran unos segundos. Una sola vida: el primer impacto termina la partida.',
  dificultad = 5,
  jugadores = 1,
  perifericos = array['teclado']
where slug = 'asteroides';

update public.games set
  categoria_id = (select id from public.categorias where nombre = 'ARCADE'),
  color = 'cyan',
  cover = 'cover-bricks',
  image = '/juegos/arkanoid.png',
  short = 'Rompe el muro sin dejar caer la bola.',
  long = 'Una bola de neón rebota entre las paredes de la pantalla y tú sólo controlas la pala. Rompe todos los ladrillos para pasar de nivel: el muro cambia en cada uno y la bola va cada vez más rápida, sin final. Golpea con el borde de la pala para desviarla y apuntar. Tres vidas; cuando cae la última bola, se acabó.',
  dificultad = 3,
  jugadores = 1,
  perifericos = array['teclado', 'raton']
where slug = 'arkanoid';

alter table public.games
  alter column categoria_id set not null,
  alter column color set not null,
  alter column short set not null,
  alter column long set not null,
  alter column dificultad set not null,
  alter column jugadores set not null,
  alter column perifericos set not null;

-- increment_game_plays: contador real de partidas empezadas. security definer
-- para no abrir un UPDATE público sobre toda la tabla games; se concede a
-- anon y authenticated porque cualquier visitante, incluido un invitado,
-- puede empezar una partida.
create or replace function public.increment_game_plays(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.games set plays = plays + 1 where slug = p_slug;
end;
$$;

revoke execute on function public.increment_game_plays(text) from public;
grant execute on function public.increment_game_plays(text) to anon, authenticated;
