-- SERPIENTE: quinto juego del catálogo, puramente aditivo — no hay ninguna
-- fila decorativa que sustituir ni columna nueva que añadir (SPEC 25).
--
-- `color = 'green'` se reutiliza de BUSCAMINAS a propósito: los cuatro valores
-- del CHECK están tomados, y como BUSCAMINAS es PUZZLE y SERPIENTE es ARCADE
-- los dos verdes nunca aparecen juntos bajo un filtro de categoría.
-- `dificultad = 1` era el único valor del rango 1..5 que ningún juego ocupaba.
insert into public.games (
  slug, nombre, niveles, vidas,
  categoria_id, color, cover, image, short, long,
  dificultad, jugadores, perifericos
) values (
  'serpiente', 'SERPIENTE', null, 1,
  (select id from public.categorias where nombre = 'ARCADE'),
  'green', 'cover-snake', '/juegos/serpiente.png',
  'Crece sin morderte la cola ni chocar contra el muro.',
  'Una serpiente de neón recorre una rejilla de 20 por 15 y nunca se detiene: gírala para atrapar la fruta y hacerla más larga. Cada cinco frutas sube el nivel y el paso se acorta, sin final. Una sola vida: chocar contra el muro o contra tu propio cuerpo termina la partida.',
  1, 1, array['teclado']
);
