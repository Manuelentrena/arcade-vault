# SPEC 35 — Replay en servidor para ASTEROIDES

> **Estado:** Implementado
> **Depende de:** SPEC 14 (motor de ASTEROIDES), SPEC 29 (RLS de `scores` y token de sesión de partida), SPEC 32 (patrón de replay y columna `games.requiere_replay`), SPEC 33 (generaliza `components/game-player.tsx` y `lib/replay-rng.ts`)
> **Versión:** Menor
> **Fecha:** 2026-10-05
> **Objetivo:** El servidor reproduce la partida de ASTEROIDES a partir del registro de entradas mantenidas del jugador (empuje, giro, disparo) y una semilla propia, y la puntuación que se guarda en `scores` es siempre la que calcula ese replay, nunca la que afirma el cliente.

## Por qué existe esta spec

Tercera de las cuatro specs que extienden a todo el catálogo el cierre que SPEC 32 hizo solo para TETRIX (orden: SERPIENTE → BUSCAMINAS → ASTEROIDES → ARKANOID). ASTEROIDES es la primera de las cuatro con física continua de verdad: `step(state, input, dt)` integra posición y velocidad de la nave cuadro a cuadro, con rozamiento dependiente de `dt` — a diferencia de TETRIX/SERPIENTE, que avanzan en pasos discretos de rejilla a un intervalo fijo por nivel, y de BUSCAMINAS, que no tiene ningún paso por tiempo.

El motor, sin embargo, no recibe un movimiento continuo del jugador: recibe cuatro banderas mantenidas (`left`, `right`, `thrust`, `fire`) que cambian solo quien las pulsa o suelta — el mismo tipo de entrada "pulsar y soltar" que ya usa el `PadHandle` del mando de móvil. Eso es lo que hace viable un log ligero: en vez de grabar el `dt` de cada fotograma del cliente (que inflaría el registro a un ritmo de ~60 entradas por segundo, contradiciendo el espíritu de payload mínimo de SPEC 32), el log solo graba los instantes en que una bandera cambia de valor, y el servidor reproduce la física con su propio paso fijo y pequeño, aplicando esas banderas entre un paso y el siguiente. El rozamiento de ASTEROIDES ya está diseñado para ser independiente de los fotogramas por segundo ("la referencia multiplica por 0,987 en cada vuelta del bucle... aquí el factor es por segundo y se eleva a `dt`", `lib/asteroids.ts`), así que el resultado de la física no depende de qué tan fino sea ese paso fijo, siempre que sea razonablemente pequeño.

## Scope

**Dentro:**

- `lib/asteroids.ts`: `createState(lives, rng)` gana un segundo parámetro opcional `rng: () => number = Math.random`, guardado en un campo interno `rng` del estado. Los helpers `rand()`/`randInt()` y los dos `Math.random()` sueltos de `destroyRock()` (decisión de caída de objeto y su tipo) pasan a leer `state.rng()` — incluidas las llamadas puramente cosméticas de `createRock()` (forma del polígono) y `explode()` (partículas), porque cliente y servidor ejecutan el mismo código en el mismo orden: si una leyera de la semilla y la otra no, las siguientes tiradas que sí importan para el score (posición/velocidad de la próxima roca) se desincronizarían entre los dos.
- Nuevo módulo puro `lib/asteroids-replay.ts`: tipos del registro de pulsaciones/sueltas y `replayAsteroides()`, que reproduce una partida completa integrando `step()` a pasos fijos pequeños (`FIXED_DT = 1/120` s) entre los instantes logueados, aplicando el cambio de bandera correspondiente en cada uno.
- `components/asteroids-game.tsx`: usa la semilla recibida para sembrar `createState`; construye el registro de pulsaciones/sueltas (tipo + timestamp relativo al inicio) de cada cambio en `inputRef.current` —tanto los que vienen del teclado como los que vienen del `PadHandle` del mando— y de cada pausa/reanudación; expone el registro por el `onOver` ya generalizado, ampliando la unión con `AsteroidsActionLog`.
- Nueva ruta `app/api/validar-partida-asteroides/route.ts` (Node runtime), calcada de las rutas existentes: verifica el token, acota el registro, reproduce la partida con `replayAsteroides()` y devuelve `{ score, level, proof }` firmado con `issue_score_proof`.
- `games.requiere_replay` pasa a `true` también para la fila de `asteroides`.
- Tope anti-abuso: 60.000 acciones o 45 minutos de duración, lo que se alcance primero — mismo valor que TETRIX/SERPIENTE/BUSCAMINAS; con solo cuatro banderas que cambian por pulsación/suelta (no por fotograma), una partida de ASTEROIDES se queda muy por debajo incluso en una sesión larga y agresiva.
- Bloque de test "ASTEROIDES — motor de replay (módulo puro)" en `tests/screens.spec.ts`.
- `SECURITY.md`: amplía la sección de SPEC 32/33/34 marcando ASTEROIDES como cerrado y dejando ARKANOID pendiente.
- Paso de cierre estándar: bump `Menor` de versión (`1.4.0` → `1.5.0`) y post de changelog.

**Fuera de alcance:**

- Activar `requiere_replay` para ARKANOID — SPEC 36.
- Loguear el `dt` de cada fotograma del cliente. El servidor integra con su propio paso fijo; el rozamiento por segundo del motor ya hace el resultado independiente de la granularidad exacta.
- Cualquier tolerancia de posición/velocidad entre lo que el cliente dibujó y lo que el servidor calculó — solo importa que el `score`/`level`/`over` finales coincidan con lo que el replay produce, nunca la trayectoria visual exacta.
- Cualquier cambio a `start_game_session`/`save_score`/`verify_game_session`/`issue_score_proof` más allá de incluir `asteroides` en `games.requiere_replay`.
- Comparar el score del cliente contra el del servidor con tolerancia.
- Persistir el registro de entradas en una tabla.

## Modelo de datos

```ts
// lib/asteroids-replay.ts

export type AsteroidsActionType =
  | "left_down"
  | "left_up"
  | "right_down"
  | "right_up"
  | "thrust_down"
  | "thrust_up"
  | "fire_down"
  | "fire_up"
  | "pause"
  | "resume";

export type AsteroidsLogEntry = {
  type: AsteroidsActionType;
  /** Milisegundos desde el inicio de la partida (reloj del propio cliente, monotónico). */
  t: number;
};

export type AsteroidsActionLog = AsteroidsLogEntry[];

export type ReplayResult = {
  score: number;
  level: number;
  over: boolean;
};

export function replayAsteroides(
  log: AsteroidsActionLog,
  seed: string,
  lives: number,
): ReplayResult;
```

```sql
-- supabase/migrations/<timestamp>_games_requiere_replay_asteroides.sql
update public.games set requiere_replay = true where slug = 'asteroides';
```

`replayAsteroides()` mantiene su propio `Input` (las cuatro banderas, arrancando en `false`) y lo actualiza con cada entrada `*_down`/`*_up`; entre dos entradas consecutivas (y antes de la primera, y después de la última hasta el final del log) avanza `step(state, input, FIXED_DT)` en pasos de `1/120` s hasta alcanzar el `t` de la siguiente entrada, sin acumular tiempo mientras está en pausa — mismo criterio de "reiniciar en cada `resume`" que ya usan `lib/tetris-replay.ts`/`lib/serpiente-replay.ts`, aplicado aquí al paso fijo en vez de a un intervalo de tick.

## Plan de implementación

1. `lib/asteroids.ts`: `AsteroidsState` gana un campo interno `rng: () => number`; `createState(lives: number, rng: () => number = Math.random)` lo guarda. `rand()`/`randInt()` dejan de ser funciones de módulo que llaman a `Math.random()` global y pasan a recibir el generador como parámetro (o a leerlo de un `state` que ya tienen a mano en todos sus puntos de llamada — `spawnWave`, `createRock`, `destroyRock`); los dos `Math.random()` sueltos de `destroyRock()` (decisión de caída y tipo de objeto) cambian a `state.rng()`. Sin cambio de comportamiento para las llamadas existentes sin el segundo argumento de `createState`.
2. Nuevo `lib/asteroids-replay.ts`: los tipos de arriba, la constante `FIXED_DT = 1 / 120`, y `replayAsteroides()` — reconstruye el estado con `createState(lives, createSeededRng(seed))` (de `lib/replay-rng.ts`), ordena el log por `t`, mantiene un `Input` local actualizado por cada `*_down`/`*_up`, y entre entradas avanza `step()` en pasos de `FIXED_DT` (el último paso parcial se recorta al tiempo exacto restante) salvo mientras está en pausa; corta en cuanto `state.over` es `true`. Test "módulo puro" en este mismo paso: mismo log + misma semilla siempre da el mismo `score`/`level`.
3. `components/asteroids-game.tsx`: recibe `seed: string`, construye el PRNG seedeado y lo pasa a `createState`; mantiene en un `useRef` el log de pulsaciones/sueltas. Instrumenta `setFlag()` (el único punto donde `inputRef.current[flag]` cambia, ya usado tanto por el teclado como por el `PadHandle` del mando — ver `references/started-games/games.md`, "el engine gets `press`/`release`, never a high-level action") para empujar `{ type: \`${flag}_${value ? "down" : "up"}\`, t }`al log en cada cambio real de valor (sin duplicar si el valor no cambia); añade entradas de`pause`/`resume`donde hoy se limpia`inputRef.current`al pausar. Al terminar la partida pasa el log al`onOver` generalizado.
4. `components/game-player.tsx`: amplía la unión de `EngineProps.onOver`/`actionLogRef` con `AsteroidsActionLog`.
5. `app/api/validar-partida-asteroides/route.ts` (Node runtime, `POST`), calcada de las rutas existentes: lee `{ slug, token, log }`, verifica `verify_game_session`, confirma `gid`/usuario, rechaza por encima de 60.000 entradas o 45 minutos sin reproducir nada, ejecuta `replayAsteroides(log, session.seed, game.vidas)` (sin tope de nivel: `game.niveles` es `null`), y si `over` es `true` pide `issue_score_proof` y devuelve `{ score, level, proof }`.
6. Migración `games_requiere_replay_asteroides`: `update public.games set requiere_replay = true where slug = 'asteroides'`. Verificar tras `npx supabase db reset` que `/jugar/asteroides` sigue cargando.
7. `npx supabase db push` contra el proyecto remoto antes del merge a `main`.
8. `SECURITY.md`: amplía la sección de SPEC 32/33/34 marcando ASTEROIDES como cerrado y dejando ARKANOID pendiente de SPEC 36.
9. Cierre: bump `Menor` en `package.json`, `components/footer.tsx` y `logo-version` de `components/nav.tsx` (`1.4.0` → `1.5.0`); post en `content/blog/v1.5.0.mdx` resumiendo esta spec.

## Criterios de aceptación

- [ ] Una partida honesta de ASTEROIDES guarda exactamente el score/nivel que el replay del servidor calcula a partir del log — verificable comparando el valor guardado con el que `replayAsteroides()` reproduce para esa misma semilla y log.
- [ ] Llamar a `save_score` para ASTEROIDES sin `p_proof` (o con uno inválido/caducado) no guarda nada — mismo resultado visible que un intento que no es récord.
- [ ] Llamar a `save_score` para TETRIX, SERPIENTE, BUSCAMINAS o ARKANOID sigue funcionando exactamente igual que antes de esta spec.
- [ ] Un registro de entradas que supera 60.000 entradas o 45 minutos de duración es rechazado por la ruta de validación sin que se ejecute ningún replay.
- [ ] El bloque "ASTEROIDES — motor de replay (módulo puro)" prueba `replayAsteroides()` directamente: misma semilla + mismo log siempre da el mismo resultado.
- [ ] Disparar/empujar/girar por teclado y por el mando de móvil producen las mismas entradas de log (mismo `type`) que el servidor reproduce idénticamente.
- [ ] `npm test` sigue en verde, incluyendo los flujos de guardado existentes de los cinco motores.
- [ ] `SECURITY.md` refleja que ASTEROIDES está cerrado y que ARKANOID sigue pendiente.
- [ ] La versión sube como `Menor` a `1.5.0` en `package.json`, `components/footer.tsx` y `components/nav.tsx` (`logo-version`), y `/blog/v1.5.0` renderiza un post que resume esta spec.

## Decisiones

- **Sí:** el log graba solo cambios de bandera (pulsar/soltar), no el `dt` de cada fotograma. El rozamiento de ASTEROIDES ya es independiente de los fps por diseño (SPEC 14), así que el paso fijo del servidor no necesita coincidir con el frame rate real del cliente para llegar al mismo resultado.
- **Sí:** paso fijo de `1/120` s para el replay, elegido por ser fino de sobra frente al `MAX_DT` de 50 ms del cliente sin generar un bucle de integración caro — una partida de 45 minutos son como mucho unos 324.000 pasos internos, triviales para una función pura sin E/S.
- **Sí:** todas las llamadas a `Math.random()` de `lib/asteroids.ts` pasan por `state.rng()`, incluidas las cosméticas (forma del polígono de una roca, partículas de explosión). Cliente y servidor ejecutan el mismo código en el mismo orden; si una tirada cosmética no se sembrara igual, las tiradas siguientes que sí importan para el score se desincronizarían.
- **Sí:** reutilizar `lib/replay-rng.ts` y el `actionLogRef`/`validarPartida` genéricos de SPEC 33 sin tocarlos.
- **No:** ninguna tolerancia de posición/velocidad entre cliente y servidor. Solo el resultado final (`score`/`level`/`over`) tiene que coincidir — la trayectoria visual que vio el jugador no se audita.
- **No:** tocar `start_game_session`, `save_score`, `verify_game_session` o `issue_score_proof` más allá del valor de `games.requiere_replay`.

## Riesgos

| Riesgo                                                                                                                                                                                                       | Mitigación                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un paso fijo distinto al que de hecho usó el cliente hace que una colisión al límite (bala rozando una roca, nave rozando un objeto) resuelva distinto en el replay que en lo que el jugador vio en pantalla | Aceptado: el motor ya tolera un roce de hasta 0,82 del radio en nave-contra-roca precisamente para perdonar ese tipo de borde: el resultado final (destruir o no una roca concreta un fotograma antes o después) no cambia la mecánica, solo el instante exacto, y con un paso de 1/120 s la ventana de discrepancia es de pocos milisegundos. |
| Una sesión muy agresiva con el disparo mantenido genera más balas de las que el jugador recuerda, pero no más entradas de log (disparar es un estado, no un flanco)                                          | No es un riesgo de este replay: `fire` solo genera una entrada cuando se pulsa o se suelta, igual que hoy genera un único cambio de estado en el cliente; el número de balas disparadas lo decide `step()` a partir del `cooldown`, no el log.                                                                                                 |

## Qué **no** entra en esta spec

- Activar `requiere_replay` para ARKANOID.
- Loguear el `dt` de cada fotograma del cliente.
- Cualquier tolerancia de posición/velocidad entre cliente y servidor.
- Cualquier cambio de comportamiento a `start_game_session`, `save_score`, `verify_game_session` o `issue_score_proof` más allá del valor de `games.requiere_replay`.
- Persistir el registro de entradas en una tabla para histórico o auditoría.

Cada uno de estos, si llega, va en su propia spec.
