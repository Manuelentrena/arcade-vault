-- SPEC 34 — BUSCAMINAS se suma a TETRIX y SERPIENTE exigiendo la prueba de
-- replay en `save_score`. ASTEROIDES y ARKANOID siguen guardando exactamente
-- como antes (SPEC 35-36 las activará una a una).
update public.games set requiere_replay = true where slug = 'buscaminas';
