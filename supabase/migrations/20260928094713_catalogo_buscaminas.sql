-- BUSCAMINAS: cuarto juego del catálogo, puramente aditivo — no hay ninguna
-- fila decorativa que sustituir ni columna nueva que añadir (SPEC 20).
insert into public.games (
  slug, nombre, niveles, vidas,
  categoria_id, color, cover, image, short, long,
  dificultad, jugadores, perifericos
) values (
  'buscaminas', 'BUSCAMINAS', null, 1,
  (select id from public.categorias where nombre = 'PUZZLE'),
  'green', 'cover-minas', '/juegos/buscaminas.png',
  'Descubre la rejilla sin detonar ninguna mina.',
  'Mueve el cursor por una rejilla de 16 por 12 casillas y revela terreno seguro. Los números marcan minas vecinas: márcalas con una bandera para no pisarlas. Cada rejilla despejada sube el nivel y añade una mina más — un solo error termina la partida.',
  2, 1, array['teclado', 'raton']
);
