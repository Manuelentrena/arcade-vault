-- SPEC 33 — SERPIENTE se suma a TETRIX exigiendo la prueba de replay en
-- `save_score`. ASTEROIDES, ARKANOID y BUSCAMINAS siguen guardando
-- exactamente como antes (SPEC 34-36 las activará una a una).
update public.games set requiere_replay = true where slug = 'serpiente';
