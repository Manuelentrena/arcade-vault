# SPEC 33 — Replay en servidor para SERPIENTE

> **Estado:** Implementado
> **Depende de:** SPEC 25 (motor de SERPIENTE), SPEC 29 (RLS de `scores` y token de sesión de partida), SPEC 32 (replay en servidor para TETRIX — patrón y columna `games.requiere_replay` que esta spec reutiliza)
> **Versión:** Menor
> **Fecha:** 2026-10-05
> **Objetivo:** El servidor reproduce la partida de SERPIENTE a partir del registro de giros del jugador y una semilla propia, y la puntuación que se guarda en `scores` es siempre la que calcula ese replay, nunca la que afirma el cliente.

## Por qué existe esta spec

SPEC 32 cerró el riesgo de score falso-pero-plausible para TETRIX y documentó explícitamente que los otros cuatro motores seguían con el riesgo aceptado en SPEC 29. Esta spec es la primera de cuatro (una por motor, en el orden SERPIENTE → BUSCAMINAS → ASTEROIDES → ARKANOID, de menor a mayor distancia con el patrón de TETRIX) que extienden ese cierre al resto del catálogo. SERPIENTE va primero porque su superficie de entrada es la más parecida a TETRIX: giros discretos por flanco, sin repetición, sobre una rejilla con un paso por tiempo — el mismo acumulador que ya reproduce `lib/tetris-replay.ts`, cambiando `dropIntervalMs(level)` por `tickMs(level)`.

Como SERPIENTE es el primer motor en seguir a TETRIX, esta spec también generaliza dos piezas que SPEC 32 dejó escritas a medida de TETRIX porque entonces era el único caso: el PRNG determinista de `lib/tetris-replay.ts` (que no tiene nada de TETRIX, es genérico) y el tramo de `components/game-player.tsx` que manda el registro de acciones a validar (que estaba nombrado y tipado como si TETRIX fuera a ser el único motor con replay para siempre). Las tres specs siguientes heredan esa generalización sin tener que repetirla.

## Scope

**Dentro:**

- Extraer el PRNG determinista de `lib/tetris-replay.ts` (`mulberry32`, `seedToInt`, `createSeededRng`) a un módulo nuevo y genérico, `lib/replay-rng.ts`. `lib/tetris-replay.ts` pasa a importar `createSeededRng` de ahí y re-exportarlo, así que `components/tetris-game.tsx` no cambia su import. `lib/serpiente-replay.ts` importa del mismo módulo nuevo — un solo PRNG, no cuatro copias.
- Generalizar `components/game-player.tsx`: `EngineProps.onOver` pasa de aceptar solo `TetrixActionLog` a aceptar una unión (`TetrixActionLog | SerpienteActionLog`); el `ref` y la función que hoy se llaman `tetrixLogRef`/`validarPartidaTetrix` pasan a `actionLogRef`/`validarPartida(slug, token, log)`, y la URL que llaman pasa de estar escrita a mano (`/api/validar-partida-tetrix`) a construirse como `` `/api/validar-partida-${slug}` `` — el mismo patrón de nombre de ruta que ya usa TETRIX, ahora genérico. El comportamiento para TETRIX no cambia en nada observable.
- `lib/serpiente.ts`: `createState(lives, rng)` gana un segundo parámetro opcional `rng: () => number = Math.random`, guardado en un campo nuevo del estado (`SerpienteState.rng`, no exportado en el contrato público del motor hacia el componente — es un detalle interno de la reproducibilidad). `placeFruit()` usa `state.rng()` en vez de `Math.random()` directamente. Sin cambio de comportamiento para las llamadas existentes sin ese argumento.
- Nuevo módulo puro `lib/serpiente-replay.ts`: tipos del registro de giros y `replaySerpiente()`, que reproduce una partida completa reutilizando `createState`/`enqueueDir`/`enqueueTurn`/`step`/`tickMs` de `lib/serpiente.ts`, con el mismo acumulador de tiempo que `lib/tetris-replay.ts` ya usa para la gravedad.
- `components/serpiente-game.tsx`: usa la semilla recibida para sembrar `createState`; construye el registro de giros (tipo + timestamp relativo al inicio) de cada dirección encolada por teclado o por el mando, y de cada pausa/reanudación; expone el registro por el `onOver` ya generalizado.
- Nueva ruta `app/api/validar-partida-serpiente/route.ts` (Node runtime), calcada de `app/api/validar-partida-tetrix/route.ts`: verifica el token, acota el registro, reproduce la partida con `replaySerpiente()` y devuelve `{ score, level, proof }` firmado con `issue_score_proof`.
- `games.requiere_replay` pasa a `true` también para la fila de `serpiente` (la columna ya existe desde SPEC 32; esta spec solo añade la fila a la actualización).
- Mismo tope anti-abuso que TETRIX: 60.000 acciones o 45 minutos de duración, lo que se alcance primero.
- Bloque de test "SERPIENTE — motor de replay (módulo puro)" en `tests/screens.spec.ts`, junto a los que ya existen para `lib/arkanoid.ts`/`lib/serpiente.ts`/`lib/tetris-replay.ts`: prueba `lib/serpiente-replay.ts` directamente, sin navegador.
- `SECURITY.md`: amplía la sección de SPEC 32 para marcar SERPIENTE como cerrado también, y deja ASTEROIDES, ARKANOID y BUSCAMINAS como pendientes.
- Paso de cierre estándar: bump `Menor` de versión (`1.2.0` → `1.3.0`) y post de changelog.

**Fuera de alcance (para su propia spec, en el orden ya decidido):**

- Activar `requiere_replay` para BUSCAMINAS, ASTEROIDES o ARKANOID — SPEC 34, 35 y 36 respectivamente.
- Cualquier cambio a la lógica de negocio de `start_game_session`/`save_score`/`verify_game_session`/`issue_score_proof` más allá de incluir `serpiente` en la condición de `requiere_replay` que SPEC 32 ya dejó genérica por `games.requiere_replay`. No hace falta tocar esas funciones: ya leen la columna, no el nombre del juego.
- Comparar el score del cliente contra el del servidor con tolerancia. Igual que en SPEC 32, el valor del cliente se descarta sin más.
- Registrar los pasos de la rejilla en el log. El servidor los deriva del tiempo real entre giros, con el mismo acumulador por nivel (`tickMs`) que ya usa el bucle del cliente.
- Persistir el registro de giros en una tabla.

## Modelo de datos

```ts
// lib/replay-rng.ts (nuevo, extraído de lib/tetris-replay.ts)

/** mulberry32: PRNG determinista y seedable a partir de un entero de 32 bits. */
export function mulberry32(seed: number): () => number;

/** La semilla hex de `start_game_session` a un entero de 32 bits para sembrar el PRNG. */
export function seedToInt(seed: string): number;

/** PRNG seedeado a partir del string de semilla. Un solo generador para los cinco motores. */
export function createSeededRng(seed: string): () => number;
```

```ts
// lib/serpiente-replay.ts

export type SerpienteActionType =
  | "dir_up"
  | "dir_down"
  | "dir_left"
  | "dir_right"
  | "turn_left"
  | "turn_right"
  | "pause"
  | "resume";

export type SerpienteLogEntry = {
  type: SerpienteActionType;
  /** Milisegundos desde el inicio de la partida (reloj del propio cliente, monotónico). */
  t: number;
};

export type SerpienteActionLog = SerpienteLogEntry[];

export type ReplayResult = {
  score: number;
  level: number;
  over: boolean;
};

export function replaySerpiente(
  log: SerpienteActionLog,
  seed: string,
  lives: number,
): ReplayResult;
```

```sql
-- supabase/migrations/<timestamp>_games_requiere_replay_serpiente.sql
update public.games set requiere_replay = true where slug = 'serpiente';
```

`dir_up`/`dir_down`/`dir_left`/`dir_right` llaman a `enqueueDir(state, DIRS.<dirección>)`; `turn_left`/`turn_right` llaman a `enqueueTurn(state, -1 | 1)` — el mismo par de caminos que ya usan el teclado y el mando en `components/serpiente-game.tsx`, sin inventar una tercera forma de girar.

## Plan de implementación

1. Extraer `mulberry32`, `seedToInt` y `createSeededRng` de `lib/tetris-replay.ts` a `lib/replay-rng.ts`. `lib/tetris-replay.ts` importa `createSeededRng` de ahí y lo re-exporta con `export { createSeededRng } from "@/lib/replay-rng"`, así que `components/tetris-game.tsx` no cambia. Verificar con `npm test` que el bloque "TETRIX — motor de replay" sigue en verde.
2. `components/game-player.tsx`: generalizar `EngineProps.onOver` a `(log?: TetrixActionLog | SerpienteActionLog) => void`; renombrar `tetrixLogRef` → `actionLogRef`, `validarPartidaTetrix` → `validarPartida(slug, token, log)` con la URL construida como `` `/api/validar-partida-${slug}` ``; `handleSave` pasa `game.id` en vez de un nombre de ruta fijo. Verificar manualmente que TETRIX sigue guardando igual tras el renombrado (mismo comportamiento, solo nombres distintos).
3. `lib/serpiente.ts`: `SerpienteState` gana un campo `rng: () => number` (no se expone en ningún tipo que viaje hacia el componente salvo a través del propio estado); `createState(lives: number, rng: () => number = Math.random)` lo guarda; `placeFruit()` cambia su `Math.random()` por `state.rng()`. Sin cambio de comportamiento para las llamadas sin ese segundo argumento.
4. Nuevo `lib/serpiente-replay.ts`: los tipos de arriba y `replaySerpiente()` — reconstruye el estado con `createState(lives, createSeededRng(seed))` y, en orden cronológico del log, acumula el tiempo transcurrido desde la última acción (reiniciando el acumulador en cada `resume`) para aplicar los `step()` que correspondan según `tickMs(state.level)` antes de aplicar la acción logueada (`enqueueDir`/`enqueueTurn`); ignora el tiempo entre `pause` y `resume`. Test "módulo puro" en este mismo paso: mismo log + misma semilla siempre da el mismo `score`/`level`.
5. `components/serpiente-game.tsx`: recibe `seed: string` por prop (ya forma parte de `EngineProps` desde SPEC 32), construye el PRNG seedeado y lo pasa a `createState`; mantiene en un `useRef` el log de giros con el timestamp relativo (`performance.now() - startRef.current`) de cada `enqueueDir`/`enqueueTurn` (teclado y mando) y de cada toggle de pausa; al terminar la partida pasa el log al `onOver` ya generalizado.
6. `app/api/validar-partida-serpiente/route.ts` (Node runtime, `POST`), calcada de la ruta de TETRIX: lee `{ slug, token, log }`, verifica `verify_game_session`, confirma `gid`/usuario, rechaza por encima de 60.000 entradas o 45 minutos sin reproducir nada, ejecuta `replaySerpiente(log, session.seed, game.vidas)` (SERPIENTE no tiene tope de nivel: `game.niveles` es `null` y no entra en la firma de `replaySerpiente`), y si `over` es `true` pide `issue_score_proof` y devuelve `{ score, level, proof }`.
7. Migración `games_requiere_replay_serpiente`: `update public.games set requiere_replay = true where slug = 'serpiente'`. Verificar tras `npx supabase db reset` que `/jugar/serpiente` sigue cargando.
8. `npx supabase gen types typescript` para refrescar `types.ts` si hiciera falta (la columna ya existe desde SPEC 32; esta migración solo cambia datos, no esquema). `npx supabase db push` contra el proyecto remoto antes del merge a `main`.
9. `SECURITY.md`: amplía la sección de SPEC 32 (o añade una fechada 2026-10-05 para SPEC 33) marcando SERPIENTE como cerrado y dejando ASTEROIDES/ARKANOID/BUSCAMINAS como pendientes de las specs 34-36.
10. Cierre: bump `Menor` en `package.json`, `components/footer.tsx` y `logo-version` de `components/nav.tsx` (`1.2.0` → `1.3.0`); post en `content/blog/v1.3.0.mdx` resumiendo esta spec.

## Criterios de aceptación

- [x] `lib/replay-rng.ts` existe y `lib/tetris-replay.ts` lo reexporta; el bloque "TETRIX — motor de replay" sigue en verde sin cambios de comportamiento.
- [x] Una partida honesta de SERPIENTE guarda exactamente el score/nivel que el replay del servidor calcula a partir del log — verificable comparando el valor guardado con el que `replaySerpiente()` reproduce para esa misma semilla y log.
- [x] Llamar a `save_score` para SERPIENTE sin `p_proof` (o con uno inválido/caducado) no guarda nada — mismo resultado visible que un intento que no es récord.
- [x] Llamar a `save_score` para TETRIX, ASTEROIDES, ARKANOID o BUSCAMINAS sigue funcionando exactamente igual que antes de esta spec.
- [x] Un registro de giros que supera 60.000 entradas o 45 minutos de duración es rechazado por la ruta de validación sin que se ejecute ningún replay.
- [x] El bloque "SERPIENTE — motor de replay (módulo puro)" prueba `replaySerpiente()` directamente: misma semilla + mismo log siempre da el mismo resultado.
- [x] `npm test` sigue en verde, incluyendo los flujos de guardado existentes de TETRIX y SERPIENTE.
- [x] `SECURITY.md` refleja que SERPIENTE está cerrado y que ASTEROIDES, ARKANOID y BUSCAMINAS siguen pendientes.
- [x] La versión sube como `Menor` a `1.3.0` en `package.json`, `components/footer.tsx` y `components/nav.tsx` (`logo-version`), y `/blog/v1.3.0` renderiza un post que resume esta spec.

## Decisiones

- **Sí:** SERPIENTE es el primer motor en seguir a TETRIX porque su entrada ya es discreta, por flanco y sin repetición — el patrón del acumulador de `lib/tetris-replay.ts` se traslada casi literal, solo cambiando `dropIntervalMs` por `tickMs`.
- **Sí:** extraer el PRNG de `lib/tetris-replay.ts` a `lib/replay-rng.ts` ahora, no antes: SPEC 32 no lo hizo porque entonces era prematuro ("añadir un segundo motor más adelante" era hipotético); con un segundo motor real llegando, duplicar `mulberry32` sería la segunda copia de la misma función.
- **Sí:** generalizar el tramo de `game-player.tsx` que manda a validar (`actionLogRef`/`validarPartida`) en esta spec y no en TETRIX, por el mismo motivo — hacerlo antes habría sido diseñar para un futuro hipotético; hacerlo ahora es la primera vez que ese futuro es real.
- **Sí:** el `rng` del estado de SERPIENTE es un campo interno del motor, no parte del contrato que ve `components/serpiente-game.tsx` fuera de pasarlo a `createState`. Evita que cada función interna que necesite aleatoriedad (hoy solo `placeFruit`, pero el patrón es el mismo para los tres motores que siguen) tenga que recibir el generador como argumento propio.
- **No:** loguear los pasos de la rejilla. Igual que TETRIX con la gravedad, el servidor los deriva del tiempo transcurrido con el mismo acumulador que ya usa el cliente.
- **No:** tocar `start_game_session`, `save_score`, `verify_game_session` o `issue_score_proof`. Ya son genéricas por `games.requiere_replay` desde SPEC 32; esta spec solo cambia el valor de esa columna para una fila más.

## Riesgos

| Riesgo                                                                                       | Mitigación                                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Extraer el PRNG a un módulo compartido rompe sin querer el replay de TETRIX ya en producción | El bloque de test "TETRIX — motor de replay" existente se ejecuta tal cual tras la extracción, antes de escribir una sola línea de SERPIENTE.                |
| `game-player.tsx` generalizado introduce una regresión silenciosa en el guardado de TETRIX   | El flujo "fin de partida como invitado"/guardado de TETRIX de `tests/screens.spec.ts` cubre ese camino end-to-end y debe seguir en verde tras el renombrado. |

## Qué **no** entra en esta spec

- Activar `requiere_replay` para BUSCAMINAS, ASTEROIDES o ARKANOID.
- Cualquier cambio de comportamiento a `start_game_session`, `save_score`, `verify_game_session` o `issue_score_proof` más allá del valor de `games.requiere_replay`.
- Comparar o tolerar diferencias entre el score del cliente y el del servidor.
- Persistir el registro de giros en una tabla para histórico o auditoría.

Cada uno de estos, si llega, va en su propia spec.
