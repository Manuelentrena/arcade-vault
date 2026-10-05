-- SPEC 32 — marca qué juegos exigen la prueba de replay en `save_score`.
-- Solo TETRIX la activa en esta spec; los otros cuatro siguen guardando
-- exactamente como antes.
alter table public.games
  add column requiere_replay boolean not null default false;

update public.games set requiere_replay = true where slug = 'tetrix';
