# SPEC 32 — Replay en servidor para TETRIX

> **Estado:** Implementado
> **Depende de:** SPEC 13 (motor de TETRIX), SPEC 18 (guardado real de puntuaciones), SPEC 29 (RLS de `scores` y token de sesión de partida)
> **Versión:** Menor
> **Fecha:** 2026-10-05
> **Objetivo:** El servidor reproduce la partida de TETRIX a partir del registro de acciones del jugador y una semilla propia, y la puntuación que se guarda en `scores` es siempre la que calcula ese replay, nunca la que afirma el cliente.

## Por qué existe esta spec

SPEC 29 cerró el bypass directo de RLS sobre `scores` y acotó `save_score` con techos de score/nivel, pero documentó explícitamente un riesgo que dejó abierto: un usuario autenticado real puede llamar a `save_score` a mano con un score falso-pero-plausible dentro de esos techos, sin que nada lo contradiga. Esta spec cierra ese hueco para TETRIX reemplazando la confianza en el cliente por una reproducción determinista de la partida: el cliente manda la secuencia de acciones que hizo, no el resultado, y el servidor ejecuta el mismo motor puro (`lib/tetris.ts`) sobre esa secuencia para obtener el score real.

Se eligió reproducir solo las entradas del jugador (mover, rotar, bajar, pausar/reanudar) y que el servidor derive la caída por gravedad a partir del tiempo real transcurrido entre acciones — exactamente la misma cuenta que ya hace el bucle de `requestAnimationFrame` de `components/tetris-game.tsx` — en vez de pedir al cliente que registre cada tick. Menos payload, menos superficie para falsear, y el cálculo es determinista porque depende solo de deltas de tiempo relativos al inicio de la propia partida, no del reloj del sistema.

El patrón queda separado en un módulo de replay propio para que añadir un segundo motor más adelante sea barato, pero esta spec solo lo activa para TETRIX.

## Scope

**Dentro:**

- Semilla de aleatoriedad emitida por `start_game_session` (extiende su payload firmado) para que el servidor pueda regenerar exactamente la misma secuencia de piezas que vio el cliente.
- `lib/tetris.ts`: `randomPiece()`/`createState()` aceptan un generador de números aleatorios opcional (por defecto `Math.random`, sin cambiar el comportamiento actual del cliente).
- Nuevo módulo puro `lib/tetris-replay.ts`: PRNG determinista seedable, tipos del registro de acciones, y una función que reproduce una partida completa de TETRIX reutilizando `move`/`rotate`/`softDrop`/`hardDrop`/`tick`/`createState` de `lib/tetris.ts`.
- `components/tetris-game.tsx`: usa la semilla recibida para su generador de piezas y construye el registro de acciones (tipo + timestamp relativo al inicio) de cada movimiento, giro, bajada, pausa y reanudación.
- Nueva ruta `app/api/validar-partida-tetrix/route.ts` (Node runtime): recibe el token de sesión y el registro de acciones, verifica el token, acota el tamaño del registro, reproduce la partida y devuelve el score/nivel calculados junto con una prueba firmada.
- Nuevas funciones SQL `verify_game_session(p_token)` y `issue_score_proof(p_token, p_score, p_level)`, con el mismo secreto de Vault y el mismo estilo de firma HMAC que `start_game_session`/`save_score` (SPEC 29).
- `games.requiere_replay`: columna nueva (`boolean not null default false`), `true` solo para la fila de TETRIX. Decide si `save_score` exige la prueba.
- `save_score` acepta un quinto parámetro opcional `p_proof`. Cuando `games.requiere_replay` es `true` para ese juego, una prueba ausente o inválida se rechaza en silencio (mismo resultado que un intento que no es récord); cuando es `true` y la prueba es válida, el score/nivel que se guardan son los de la prueba, no `p_score`/`p_level`. Cuando `requiere_replay` es `false` (los otros cuatro motores), nada cambia.
- `components/game-player.tsx`: antes de guardar una partida de un juego con `requiere_replay`, llama a la ruta de validación con el registro de acciones y usa su respuesta para la llamada a `save_score`. Un fallo de validación se trata como el mismo error de guardado de siempre, no como "no es récord".
- Tope anti-abuso sobre el registro de acciones: 60.000 acciones o 45 minutos de duración, lo que se alcance primero. Por encima, la ruta rechaza sin reproducir nada.
- Bloque de test "TETRIX — motor de replay (módulo puro)" en `tests/screens.spec.ts`, en la línea de los que ya existen para `lib/arkanoid.ts`/`lib/serpiente.ts`: prueba `lib/tetris-replay.ts` directamente, sin navegador.
- `SECURITY.md`: sección fechada 2026-10-05 (SPEC 32) documentando qué se cierra para TETRIX y qué sigue igual para los otros cuatro motores.
- Paso de cierre estándar: bump `Menor` de versión y post de changelog, recogiendo los Fixes de SPEC 28, SPEC 29, SPEC 30 y SPEC 31 publicados desde el último post (`v1.1.0`).

**Fuera de alcance (para otra spec, si llega):**

- Activar `requiere_replay` para ASTEROIDES, ARKANOID, BUSCAMINAS o SERPIENTE. Siguen guardando exactamente como hoy; el patrón de `lib/tetris-replay.ts` queda deliberadamente separado para que extenderlo a otro motor no obligue a tocar TETRIX, pero esta spec no lo extiende.
- Comparar el score del cliente contra el del servidor con algún margen de tolerancia. El valor del cliente se descarta sin más — nunca se compara, nunca se usa.
- Registrar cada tick de gravedad en el log. El servidor lo deriva del tiempo real entre acciones, siguiendo la misma cuenta por acumulador que ya usa el bucle del cliente.
- Persistir el registro de acciones en una tabla. Se usa solo para el replay de esa petición y se descarta — no hay histórico ni auditoría de partidas.
- Cualquier límite de cadencia por acción individual (ej. rechazar una secuencia de giros físicamente imposible por rapidez). El tope de esta spec es solo sobre el tamaño/duración total del registro.
- Cambios a la lógica de negocio de `start_game_session` o `save_score` fuera de lo descrito arriba (expiración, techos de score/nivel existentes, etc. — SPEC 29 ya los fijó y esta spec no los toca).

## Modelo de datos

```ts
// lib/tetris-replay.ts

export type TetrixActionType =
  | "move_left"
  | "move_right"
  | "rotate"
  | "soft_drop"
  | "hard_drop"
  | "pause"
  | "resume";

export type TetrixLogEntry = {
  type: TetrixActionType;
  /** Milisegundos desde el inicio de la partida (reloj del propio cliente, monotónico). */
  t: number;
};

export type TetrixActionLog = TetrixLogEntry[];

export type ReplayResult = {
  score: number;
  level: number;
  over: boolean;
};

export function replayTetrix(
  log: TetrixActionLog,
  seed: string,
  lives: number,
  maxLevel: number | null,
): ReplayResult;
```

```sql
-- supabase/migrations/<timestamp>_games_requiere_replay.sql
alter table public.games
  add column requiere_replay boolean not null default false;

update public.games set requiere_replay = true where slug = 'tetrix';
```

Los dos tokens HMAC (sesión y prueba) comparten el mismo secreto de Vault (`game_session_secret`) pero llevan formas de payload distintas, discriminadas por un campo `typ` para que uno no pueda colarse donde se espera el otro:

```jsonc
// payload de start_game_session (extendido con "seed" y "typ")
{ "typ": "session", "uid": "...", "gid": "...", "exp": 1234567890, "seed": "a1b2c3..." }

// payload de issue_score_proof
{ "typ": "proof", "uid": "...", "gid": "...", "score": 4800, "level": 3, "exp": 1234567890 }
```

`issue_score_proof` firma una caducidad corta (5 minutos) — solo necesita sobrevivir el viaje de vuelta de la ruta de validación a `save_score`, no los 60 minutos de la sesión de partida.

## Plan de implementación

1. Migración: extender `start_game_session(p_slug)` para generar una semilla (`encode(extensions.gen_random_bytes(16), 'hex')`), incluirla junto con `"typ": "session"` en el payload firmado, y devolverla como tercera columna (`token`, `expires_at`, `seed`). Verificar manualmente tras `npx supabase db reset` que `/jugar/tetrix` sigue cargando y que la fila devuelta trae `seed`.
2. Migración: nueva función `verify_game_session(p_token text) returns table(uid uuid, gid uuid, seed text)`, misma lógica de decodificación/verificación HMAC que ya usa `save_score`, exige `typ = 'session'` y `exp` futuro. `revoke execute … from public, anon; grant execute … to authenticated`.
3. Migración: nueva función `issue_score_proof(p_token text, p_score integer, p_level integer) returns text`, reverifica `p_token` con la misma lógica, firma `{typ: 'proof', uid, gid, score: p_score, level: p_level, exp: now() + 5 minutos}` con el mismo secreto. Mismos `revoke`/`grant` que `verify_game_session`.
4. Migración `games_requiere_replay`: columna `requiere_replay boolean not null default false`, `update … where slug = 'tetrix'`. Verificar que `getGames()`/`getGameBySlug()` no necesitan cambios de tipos hasta el paso 11.
5. Migración: `save_score` gana un quinto parámetro `p_proof text default null`. Cuando el juego tiene `requiere_replay = true`: decodifica `p_proof` con el mismo secreto, exige `typ = 'proof'`, `uid`/`gid` coincidentes con `p_token` y `exp` futuro; si falta o no verifica, mismo camino de rechazo silencioso que un intento sin récord; si verifica, usa su `score`/`level` en vez de `p_score`/`p_level` (sigue aplicando los techos existentes de SPEC 29 como cinturón adicional). Cuando `requiere_replay = false`, comportamiento idéntico al actual. Verificar con `npm test` que los otros cuatro motores siguen guardando igual.
6. `lib/tetris.ts`: `randomPiece(rng: () => number = Math.random)` y `createState(lives, maxLevel, rng: () => number = Math.random)` pasando `rng` a sus llamadas internas a `randomPiece`. Sin cambio de comportamiento para las llamadas existentes sin ese argumento.
7. Nuevo `lib/tetris-replay.ts`: PRNG determinista seedable (ej. `mulberry32` a partir del hex de la semilla), los tipos de arriba, y `replayTetrix()` — reconstruye el estado con `createState(lives, maxLevel, rng)` y, en orden cronológico del log, acumula el tiempo transcurrido desde la última acción (reiniciando el acumulador en cada `resume`, igual que el `useEffect` del bucle de caída en el cliente) para aplicar los `tick()` de gravedad que correspondan antes de aplicar la acción logueada (`move`/`rotate`/`softDrop`/`hardDrop`); ignora el tiempo entre `pause` y `resume`. Test "módulo puro" en este mismo paso: mismo log + misma semilla siempre da el mismo `score`/`level`.
8. `components/tetris-game.tsx`: recibe `seed: string` por prop, construye el PRNG seedeado y lo pasa a `createState`/toda regeneración de pieza siguiente; mantiene en un `useRef` el log de acciones con el timestamp relativo (`performance.now() - startRef.current`) de cada `move`/`rotate`/`softDrop`/`hardDrop` y de cada toggle de pausa; al terminar la partida expone el log vía el `onOver` ya existente (extendido para aceptar un segundo argumento opcional, los otros tres motores siguen llamándolo sin él).
9. `components/game-player.tsx`: `EngineProps` gana `seed?: string`; el `ENGINES` de TETRIX la recibe desde `gameSession.seed`. `handleOver` guarda el log recibido en estado. `lib/games.ts`/`Game` gana `requiereReplay: boolean` (de `games.requiere_replay`).
10. `app/api/validar-partida-tetrix/route.ts` (Node runtime, `POST`): lee `{ slug, token, log }`, usa el cliente de servidor (cookies) para llamar `verify_game_session`, confirma que `gid` corresponde al `slug` recibido y que el usuario de la sesión coincide; rechaza si el log supera 60.000 entradas o 45 minutos de duración total sin reproducir nada; si pasa, llama `getGameBySlug(slug)` para `vidas`/`niveles`, ejecuta `replayTetrix(log, seed, vidas, niveles)`, y si `over` es `true` llama `issue_score_proof(token, score, level)` para obtener la prueba; devuelve `{ score, level, proof }`. Cualquier fallo de verificación, tamaño o replay devuelve 4xx sin prueba.
11. `lib/supabase/scores.ts`: `GameSession` gana `seed: string`; nueva función `validarPartidaTetrix(slug, token, log)` que hace el `POST` a la ruta del paso 10 y devuelve `{ score, level, proof } | null`. El tipo de la llamada a `save_score` acepta `p_proof` opcional.
12. `handleSave` en `components/game-player.tsx`: cuando `game.requiereReplay`, llama primero a `validarPartidaTetrix`; si devuelve `null`, mismo camino que `setSaveError(true)` de hoy (sin intentar `save_score` con los valores del cliente); si devuelve datos, llama a `save_score` con ese `score`/`level`/`proof` en vez de `run.score`/`run.level`. Para los demás motores, llamada idéntica a la actual (sin `p_proof`).
13. `npx supabase gen types typescript` para refrescar `types.ts` con la columna y las firmas nuevas. `npx supabase db push` contra el proyecto remoto antes del merge a `main` (regla de "base de datos primero").
14. `SECURITY.md`: sección "Actualización 2026-10-05 (SPEC 32)" documentando el cierre para TETRIX y que los otros cuatro motores siguen con el mismo riesgo aceptado en SPEC 29 hasta que (si llega) se les active `requiere_replay`.
15. Cierre: bump `Menor` en `package.json`, `components/footer.tsx` y `logo-version` de `components/nav.tsx` (`1.1.2` → `1.2.0`); post en `content/blog/v1.2.0.mdx` resumiendo esta spec y recogiendo en "también incluye" los Fixes de SPEC 28, 29, 30 y 31 publicados desde `v1.1.0`.

## Criterios de aceptación

- [x] `start_game_session('tetrix')` devuelve `seed` además de `token`/`expires_at`; para los otros cuatro juegos sigue funcionando igual (la columna extra no les afecta).
- [x] Una partida honesta de TETRIX guarda exactamente el score/nivel que el replay del servidor calcula a partir del log — verificable comparando el valor guardado con el que el replay reproduce para esa misma semilla y log.
- [x] Llamar a `save_score` para TETRIX sin `p_proof` (o con uno inválido/caducado) no guarda nada — mismo resultado visible que un intento que no es récord.
- [x] Llamar a `save_score` para cualquiera de los otros cuatro juegos sin `p_proof` sigue funcionando exactamente igual que antes de esta spec.
- [x] Un registro de acciones que supera 60.000 entradas o 45 minutos de duración es rechazado por la ruta de validación sin que se ejecute ningún replay.
- [x] El bloque "TETRIX — motor de replay (módulo puro)" prueba `replayTetrix()` directamente: misma semilla + mismo log siempre da el mismo resultado.
- [x] `npm test` sigue en verde, incluyendo el flujo existente de "fin de partida como invitado"/guardado de TETRIX.
- [x] `SECURITY.md` documenta, fechado 2026-10-05, qué cierra esta spec y qué sigue aceptado como riesgo para los otros cuatro motores.
- [x] La versión sube como `Menor` a `1.2.0` en `package.json`, `components/footer.tsx` y `components/nav.tsx` (`logo-version`), y `/blog/v1.2.0` renderiza un post que resume esta spec y recoge los Fixes de SPEC 30–31 publicados desde `v1.1.0` (SPEC 28/29 ya estaban recogidos en ese post).

## Decisiones

- **Sí:** solo TETRIX activa el replay en esta spec; el patrón (`lib/tetris-replay.ts`, `games.requiere_replay`) queda separado para que un segundo motor lo adopte después sin tocar TETRIX, pero no se generaliza antes de que exista un segundo caso real.
- **Sí:** el cliente registra solo sus propias acciones (mover, rotar, bajar, pausar/reanudar); el servidor deriva la gravedad del tiempo real transcurrido, replicando el mismo acumulador que ya usa el bucle de `requestAnimationFrame` del cliente, reiniciado en cada reanudación. Menos payload, menos superficie de manipulación.
- **Sí:** el score que se guarda es siempre el del servidor, sin comparación ni tolerancia contra el del cliente — el cliente deja de ser fuente de verdad, punto.
- **Sí:** cerrar el hueco que SPEC 29 dejó aceptado para TETRIX de verdad, vía un segundo token firmado (`issue_score_proof`) que `save_score` exige cuando `requiere_replay` es `true`, en vez de repetir el mismo riesgo aceptado. Para los otros cuatro motores el riesgo de SPEC 29 sigue intacto hasta que (si llega) se les active el replay.
- **Sí:** los dos tipos de token comparten secreto de Vault pero llevan un campo `typ` que los distingue, para que un token de sesión no pueda colarse como prueba de score ni viceversa.
- **Sí:** el registro de acciones no se persiste — se usa una vez para el replay de esa petición y se descarta. No hay necesidad de auditoría histórica todavía, y guardarlo sería una tabla nueva sin un consumidor real.
- **No:** replicar cada tick de gravedad en el log. El cálculo es determinista a partir del tiempo transcurrido; pedir al cliente que mande cada tick solo infla el payload sin añadir garantías.
- **No:** un límite de cadencia por acción individual (anti-TAS por velocidad de input). Fuera de alcance — el tope de tamaño/duración total ya basta para el objetivo de esta spec (que el score guardado sea el real, no que se detecte asistencia por software).
- **No:** tocar los techos de score/nivel ni la expiración de 60 minutos de `start_game_session` que fijó SPEC 29. Siguen como cinturón adicional incluso con la prueba verificada.

## Riesgos

| Riesgo                                                                                                     | Mitigación                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drift de reloj del cliente hace que un replay honesto no cuadre con lo que el jugador vio en pantalla      | Los timestamps del log son deltas desde el inicio de la propia partida (`performance.now()`), no hora de pared — el drift del reloj del sistema no entra en la cuenta. |
| Un registro de acciones enorme o malformado hace lenta o cae la ruta de validación                         | Tope de 60.000 acciones / 45 minutos verificado antes de reproducir nada; por encima, rechazo inmediato sin ejecutar el replay.                                        |
| Reutilizar el mismo secreto de Vault para token de sesión y prueba de score abre una confusión entre tipos | Campo `typ` en cada payload; `verify_game_session` e `issue_score_proof` exigen el valor esperado y rechazan el otro tipo.                                             |
| Un jugador legítimo de nivel muy alto agota el tope de acciones/duración en una partida real muy larga     | 60.000 acciones / 45 minutos da margen generoso frente a una partida real sostenida; si llega a ser insuficiente, ajustar el tope es un cambio de una constante.       |

## Qué **no** entra en esta spec

- Activar `requiere_replay` para ASTEROIDES, ARKANOID, BUSCAMINAS o SERPIENTE.
- Comparar o tolerar diferencias entre el score del cliente y el del servidor.
- Registrar los ticks de gravedad en el log de acciones.
- Persistir el registro de acciones en una tabla para histórico o auditoría.
- Límites de cadencia por acción individual.
- Cualquier cambio a los techos de score/nivel o a la expiración del token de sesión que fijó SPEC 29.

Cada uno de estos, si llega, va en su propia spec.
