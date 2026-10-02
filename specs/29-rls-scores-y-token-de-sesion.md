# SPEC 29 — Cierra el bypass de RLS en `scores` y firma la sesión de partida

> **Estado:** Implementado
> **Depende de:** SPEC 06 (Supabase Auth real), SPEC 07 (modo invitado), SPEC 08 (purga de invitados — precedente del patrón Vault/pgcrypto), SPEC 16 (tablas Supabase de juegos y puntuaciones), SPEC 17 (catálogo real), SPEC 18 (guardado real de puntuaciones — introduce `save_score` y la política RLS que aquí se retira), SPEC 26 (versión y blog)
> **Versión:** Minor
> **Fecha:** 2026-10-02
> **Objetivo:** Elimina la política RLS que permite escribir en `scores` sin pasar por `save_score`, y sustituye la confianza ciega en el score/nivel que reporta el cliente por un techo global más un token de sesión de partida firmado por el servidor.

## Por qué existe esta spec

`SECURITY.md` (auditoría de 2026-10-02) encontró dos hallazgos de prioridad ALTA en el límite entre cliente y base de datos para las puntuaciones. El resto de la auditoría (prioridad MEDIA/BAJA) queda fuera a propósito — ver Alcance.

## Scope

**Dentro:**

- Retirar la política `"cada cual guarda su propia partida"` (`insert with check (auth.uid() = user_id)`) de `public.scores`. `save_score`, al ser `security definer`, sigue pudiendo insertar sin que RLS se lo impida.
- Nueva RPC `start_game_session(p_slug text)`, `security definer`, revocada de `public`/`anon`, concedida a `authenticated`: devuelve un token firmado (HMAC-SHA256 vía `pgcrypto`) y su caducidad. Payload antes de firmar: usuario (`auth.uid()`), juego (`game_id` resuelto de `p_slug`) y expiración (60 minutos desde la emisión). Sin tabla nueva: la verificación recalcula el HMAC, no hace falta persistir sesiones.
- Secreto nuevo en Supabase Vault, `game_session_secret`, mismo mecanismo que `guest_purge_url`/`guest_purge_key` (SPEC 08).
- Reescribir `save_score` con un cuarto parámetro `p_token text`. Antes de insertar verifica: firma y caducidad del token, que el usuario y el juego del token coincidan con `auth.uid()` y el `game_id` resuelto, que `p_score` no exceda un techo global de `10000000`, y que `p_level` esté en `[1, games.niveles]` cuando `niveles` no es null (cuando es null, solo `p_level >= 1`). Cualquier fallo de estas comprobaciones devuelve `(is_new_record: false, previous_best: <marca actual>)` sin insertar — misma forma que la rama "no es récord" que ya existe, nunca una excepción visible.
- `supabase/seed.sql`: sembrar `game_session_secret` con un valor fijo de desarrollo vía `vault.create_secret`, para que el flujo de guardado siga funcionando tras `npx supabase db reset` sin configuración manual.
- `app/jugar/[id]/page.tsx`: pedir el token llamando a `start_game_session` con el cliente de servidor en cada carga de la página, y pasarlo (junto con su caducidad) como prop nueva a `<GamePlayer>`.
- `components/game-player.tsx`: aceptar esa prop y enviar `p_token` en la llamada a `supabase.rpc('save_score', …)` de `handleSave`. Ningún otro comportamiento de UI cambia — el rechazo silencioso ya tiene la misma forma que la rama "no es récord" existente.
- `lib/supabase/types.ts`: regenerar.
- `README.md`: documentar `game_session_secret` de producción en el checklist de despliegue (mismo lugar que `PURGE_SECRET`), y añadir la fila de SPEC 29 al índice de specs.
- Cierre estándar: bump de versión **Minor** (1.0.2 → 1.1.0) y post de changelog en `/blog/v1.1.0`, **sin revelar detalles técnicos explotables** (ni la política RLS, ni el nombre de la RPC, ni el mecanismo del token, ni el techo, ni el payload de la URL): solo que se descubrieron y parchearon dos vulnerabilidades de seguridad en el guardado de puntuaciones y que las partidas ahora usan sesiones firmadas. Incluye, igual de discreto, un "también incluye" con SPEC 27 y SPEC 28 (las dos `Fix` publicadas desde el último post, v1.0.0).

**Fuera de alcance (para futuras specs):**

- Capa mediada por Next.js (rutas `/api/jugar/sesion` y `/api/jugar/guardar`) en vez del token nativo en Postgres — rompería la regla "las RPCs son el único camino de escritura" y no la pide el informe.
- Techo de score por juego (columna nueva en `games`) — un techo global cubre el ataque concreto del informe sin inventar un número plausible por juego sin dato real que lo respalde.
- Token emitido por partida individual en vez de por carga de página — un token por carga ya cubre sesiones largas sin wiring nuevo en el ciclo de vida del motor.
- Cerrar del todo la posibilidad de que un usuario real, ya autenticado y con un token legítimo en curso, plante vía `?puntuacion=&nivel=` un valor fabricado pero _dentro_ del techo global y del tope de nivel (el token certifica que hubo una carga de página reciente de ese usuario para ese juego, no que la puntuación se jugó de verdad). Ver Riesgos.
- Los hallazgos de prioridad MEDIA/BAJA de `SECURITY.md` (#3 a #12: rate limit en memoria del formulario de contacto, `increment_game_plays` sin límite, cabeceras de seguridad ausentes, cookies sin `secure` explícito, enumeración de email en registro, política de contraseñas débil, checklist post-despliegue de captcha/rate limits, guard de rutas hardcodeado, verificación de username desde el navegador, bearer de `borrar-invitados` sin límite de intentos) — cada uno, si se aborda, en su propia spec.

## Modelo de datos

Esta spec no añade tablas. Introduce:

```
// Payload del token, antes de firmar (JSON compacto)
{ "uid": "<auth.uid()>", "gid": "<game_id>", "exp": <epoch_seconds> }

// Token final
base64url(payload) + "." + hex(hmac_sha256(payload, game_session_secret))
```

- `start_game_session(p_slug text) returns table(token text, expires_at timestamptz)`.
- `save_score(p_slug text, p_score integer, p_level integer, p_token text) returns table(is_new_record boolean, previous_best integer)` — mismo tipo de retorno que hoy, firma con un parámetro más.
- Secreto Vault `game_session_secret` (texto, HMAC key). Local: valor fijo en `seed.sql`. Producción: valor real generado y creado a mano, documentado en README.
- Techo de score: constante `10000000` dentro de la función, no una columna.
- Tope de nivel: reutiliza `games.niveles`, ya existente.

## Plan de implementación

1. **Migración — retirar la política RLS obsoleta (hallazgo #1).** `drop policy "cada cual guarda su propia partida" on public.scores;`. Paso aislado y revertible. Verificación manual: un insert directo a `scores` desde un cliente autenticado (incluido invitado) falla por RLS.
2. **Migración — `pgcrypto` + `start_game_session`.** `create extension if not exists pgcrypto with schema extensions;` y la función nueva, `security definer`, `revoke`/`grant` como las demás RPCs de este estilo. Verificación manual: `select * from start_game_session('tetrix')` autenticado devuelve token y caducidad a 60 minutos.
3. **Migración — reescribir `save_score`.** Cuarto parámetro `p_token`; verificación de firma/caducidad/usuario/juego, techo global, tope de nivel; mismo `revoke`/`grant` que ya tenía. Verificación manual: token válido + score dentro de rango guarda igual que hoy; token caducado/alterado o score por encima del techo devuelve `is_new_record=false` sin insertar.
4. **`supabase/seed.sql` — sembrar `game_session_secret`.** Verificación: `npx supabase db reset` seguido de la llamada del paso 2 sigue funcionando sin pasos manuales.
5. **`lib/supabase/types.ts` — regenerar** (`npx supabase gen types typescript`).
6. **`app/jugar/[id]/page.tsx` — pedir el token.** Llamar a `start_game_session(id)` con el cliente de servidor en cada carga, pasar `{ token, expiresAt }` como prop nueva a `<GamePlayer>`. Verificación: la página sigue cargando sin error de tipos para invitado, anónimo y usuario real.
7. **`components/game-player.tsx` — enviar el token.** Aceptar la prop, incluir `p_token` en la llamada a `save_score` dentro de `handleSave`. Verificación manual en navegador: jugar una partida real de récord se sigue guardando igual que antes de esta spec.
8. **Replicar los dos exploits del informe contra el entorno ya parcheado.** El insert directo del hallazgo #1 y la URL `?puntuacion=999999999&nivel=10` del hallazgo #2 ya no deben plantar fila nueva.
9. **`README.md`** — sección del secreto `game_session_secret` de producción (mismo lugar que `PURGE_SECRET`) y fila de SPEC 29 en el índice de specs.
10. **Cierre.** Bump de versión **Minor** — `package.json`, `components/footer.tsx`, etiqueta de `components/nav.tsx` a `1.1.0`. Nuevo `content/blog/v1.1.0.mdx` (`metadata.bump: "Menor"`) **sin detalles técnicos explotables**: dice que se descubrieron y parchearon dos vulnerabilidades de seguridad en el guardado de puntuaciones y que ahora las partidas usan sesiones firmadas — nunca menciona la política RLS, el nombre de la RPC, el mecanismo del token, el valor del techo ni el payload de `?puntuacion=&nivel=`. Incluye además un "también incluye" con un resumen (igual de discreto, sin detalle interno) de SPEC 27 y SPEC 28. `npx tsc --noEmit`, `npm run lint`, y `npm test` corridos al final del plan (no entre pasos intermedios), dos veces consecutivas.

## Criterios de aceptación

- [ ] La política `"cada cual guarda su propia partida"` ya no existe en `public.scores`; un insert directo desde un cliente autenticado (incluido invitado) falla por RLS.
- [ ] `start_game_session` existe, es `security definer`, revocada de `public`/`anon`, concedida a `authenticated`, devuelve token + caducidad de 60 minutos.
- [ ] `save_score` exige `p_token` válido (firma, caducidad, mismo usuario, mismo juego) además del techo global (10.000.000) y el tope de nivel (`games.niveles` cuando no es null); cualquier fallo devuelve `is_new_record=false` sin insertar, nunca una excepción visible.
- [ ] Repetir el exploit del hallazgo #1 y el del hallazgo #2 contra el stack local ya no planta ninguna fila falsa.
- [ ] `supabase/seed.sql` siembra `game_session_secret`; `npx supabase db reset` deja el guardado real funcionando sin configuración manual en local.
- [ ] `/jugar/[id]` pide un token en cada carga y `game-player.tsx` lo envía en cada guardado real; una partida de récord real se sigue guardando igual que antes de esta spec.
- [ ] `README.md` documenta `game_session_secret` de producción junto al resto del checklist de despliegue, y tiene la fila de SPEC 29.
- [ ] `package.json`, `components/footer.tsx` y la etiqueta del logo en `components/nav.tsx` muestran `1.1.0`.
- [ ] `content/blog/v1.1.0.mdx` existe, renderiza en `/blog/v1.1.0`, resume esta spec sin revelar detalles técnicos explotables (solo "se descubrieron y parchearon dos vulnerabilidades de seguridad en el guardado de puntuaciones; las partidas ahora usan sesiones firmadas") y añade un "también incluye" con SPEC 27 y SPEC 28, igual de discreto.
- [ ] `npx tsc --noEmit`, `npm run lint` y dos corridas consecutivas de `npm test` pasan.

## Decisiones tomadas y descartadas

- **Sí:** quitar sin más la política de INSERT obsoleta en vez de sustituirla por una más estricta. `save_score` ya cubre el único camino de escritura necesario hoy.
- **Sí:** techo global único (10.000.000) para los 5 juegos. Evita inventar un máximo plausible por juego sin dato real que lo respalde, y basta contra el ataque concreto del informe.
- **Sí:** rechazo silencioso (`is_new_record=false`, sin excepción) ante token inválido o valores fuera de rango. Reutiliza la forma de respuesta que ya existe para "no es récord"; no revela al atacante dónde está el límite.
- **Sí:** token nativo en Postgres (HMAC + Vault) en vez de una capa mediada por Next.js. Reutiliza el patrón ya asentado por SPEC 08 y no rompe la regla de que las RPCs son el único camino de escritura.
- **Sí:** token emitido una vez por carga de `/jugar/[id]`, reutilizable 60 minutos. Cubre sesiones de juego largas sin pedir token por partida individual.
- **Sí:** sembrar `game_session_secret` en `seed.sql` con valor fijo de desarrollo. A diferencia del secreto de la purga (opcional), guardar puntuaciones es funcionalidad core que la suite Playwright ejercita en casi todos los juegos.
- **No:** implementar la capa mediada por Next.js (`/api/jugar/sesion`, `/api/jugar/guardar`). Rompe el patrón "RPC es el único camino" y multiplica el alcance sin que el informe lo exija.
- **No:** resolver también los hallazgos MEDIA/BAJA de `SECURITY.md`. El usuario pidió específicamente los dos de prioridad ALTA.
- **Sí:** el post de changelog (`/blog/v1.1.0`) no revela ningún detalle técnico explotable — ni la política RLS, ni el nombre de la RPC, ni el mecanismo del token, ni el techo, ni el payload de la URL. Solo dice que se descubrieron y parchearon dos vulnerabilidades de seguridad en el guardado de puntuaciones y que las partidas ahora usan sesiones firmadas — decisión explícita del usuario, un blog público no es el lugar para documentar un vector de ataque.

## Riesgos identificados

| Riesgo                                                                                                                                                                                                                                                                         | Mitigación                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un token válido certifica que hubo una carga reciente de `/jugar/[id]` para ese usuario y ese juego, no que la puntuación se jugó de verdad — un valor fabricado pero dentro del techo global y del tope de nivel, enviado vía `?puntuacion=&nivel=`, aún podría autoguardarse | Aceptado como riesgo residual: el techo + el tope de nivel acotan el daño a "algo plausible"; cerrarlo del todo exigiría una sesión de partida verificable jugada a jugada, fuera de alcance de esta spec |
| Si `game_session_secret` de producción no se crea antes del `db push` de esta spec, todo guardado real queda roto en producción (falla cerrado, no abierto) hasta crearlo                                                                                                      | Añadir el paso al checklist de despliegue del README junto a `PURGE_SECRET`                                                                                                                               |
| El valor sembrado en `seed.sql` es conocido y está en el repo — si se reutilizase en producción, el techo de seguridad del token se perdería                                                                                                                                   | El checklist de despliegue debe generar un secreto real distinto para producción, nunca reusar el valor de `seed.sql`                                                                                     |

## Qué **no** está en esta spec

- La capa mediada por Next.js para guardado de puntuaciones.
- Techo de score por juego.
- Token emitido por partida individual.
- Cierre total de la fabricación de un valor plausible vía URL por un usuario ya autenticado con token vigente.
- Los hallazgos de prioridad MEDIA y BAJA de `SECURITY.md`.

Cada uno, si se aborda, en su propia spec.
