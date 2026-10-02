-- SPEC 29 (hallazgo #1) — `save_score` ya es el único camino de escritura en
-- `scores` desde la SPEC 18: al ser `security definer` corre con los
-- privilegios de su dueño, que no está sujeto a esta política. La política
-- sólo servía para que un cliente autenticado insertara *directamente* en
-- la tabla, sin pasar por las comprobaciones de `save_score` (récord real,
-- de aquí en adelante también el token de sesión y el techo). Retirarla no
-- rompe el guardado real; cierra el atajo que lo esquivaba.
drop policy "cada cual guarda su propia partida" on public.scores;
