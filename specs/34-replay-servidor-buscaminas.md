# SPEC 34 — Replay en servidor para BUSCAMINAS

> **Estado:** Implementado
> **Depende de:** SPEC 20 (motor de BUSCAMINAS), SPEC 29 (RLS de `scores` y token de sesión de partida), SPEC 32 (patrón de replay y columna `games.requiere_replay`), SPEC 33 (generaliza `components/game-player.tsx` y extrae `lib/replay-rng.ts` — esta spec reutiliza ambos sin volver a tocarlos)
> **Versión:** Menor
> **Fecha:** 2026-10-05
> **Objetivo:** El servidor reproduce la partida de BUSCAMINAS a partir del registro de celdas reveladas y marcadas por el jugador y una semilla propia, y la puntuación que se guarda en `scores` es siempre la que calcula ese replay, nunca la que afirma el cliente.

## Por qué existe esta spec

Segunda de las cuatro specs que extienden a todo el catálogo el cierre que SPEC 32 hizo solo para TETRIX (orden decidido en SPEC 33: SERPIENTE → BUSCAMINAS → ASTEROIDES → ARKANOID). BUSCAMINAS va segunda porque, aunque su entrada incluye ratón además de teclado, el motor no tiene ni gravedad ni ningún `tick()` por tiempo — "el bucle no tiene `tick()` porque nada cae: solo repinta y repite tecla" (`references/started-games/games.md`) — así que el replay no necesita reproducir ningún acumulador de tiempo en absoluto, lo que lo hace más simple que SERPIENTE en ese sentido concreto, aunque más rico en superficie de entrada (teclado, cruceta y ratón comparten el mismo `state.cursor`).

La pieza que sí distingue a BUSCAMINAS es que `reveal()`/`toggleFlag()` solo leen la celda bajo `state.cursor` **en el instante en que se llaman** — no el camino que siguió el cursor para llegar ahí. Por eso el log no necesita loguear movimientos de cursor (flechas, ni muestras de la posición del ratón): basta con loguear cada `reveal`/`flag` junto con la celda que afectó en ese momento, y el servidor coloca el cursor ahí directamente antes de llamar a la función del motor. Menos payload, menos superficie, sin perder nada: el motor nunca mira el camino.

## Scope

**Dentro:**

- `lib/buscaminas.ts`: `createState(lives, rng)` gana un segundo parámetro opcional `rng: () => number = Math.random`, guardado en un campo interno `rng` del estado (mismo patrón que SPEC 33 introdujo en `SerpienteState`). `placeMines()` usa `state.rng()` en vez de `Math.random()` en sus dos sorteos de fila/columna.
- Nuevo módulo puro `lib/buscaminas-replay.ts`: tipos del registro de celdas y `replayBuscaminas()`, que reproduce una partida completa colocando el cursor con `setCursor()` y llamando a `reveal()`/`toggleFlag()` en el orden del log — sin acumulador de tiempo, porque el motor no lo necesita.
- `components/buscaminas-game.tsx`: usa la semilla recibida para sembrar `createState`; en los dos puntos donde hoy se llama a `reveal(state)`/`toggleFlag(state)` (el `pressed("Space")`/`pressed("KeyF")` del bucle, y `act(reveal)`/`act(toggleFlag)` del `onBoardPointerDown`), añade una entrada al log con la celda (`state.cursor.row`/`state.cursor.col`) vigente en ese instante antes de llamar a la función; expone el registro por el `onOver` ya generalizado (SPEC 33), ampliando la unión de `EngineProps.onOver` con `BuscaminasActionLog`.
- Nueva ruta `app/api/validar-partida-buscaminas/route.ts` (Node runtime), calcada de las rutas de TETRIX/SERPIENTE: verifica el token, acota el registro, reproduce la partida con `replayBuscaminas()` y devuelve `{ score, level, proof }` firmado con `issue_score_proof`.
- `games.requiere_replay` pasa a `true` también para la fila de `buscaminas`.
- Tope anti-abuso: 60.000 acciones o 45 minutos de duración, lo que se alcance primero — mismo valor que TETRIX/SERPIENTE; una partida de BUSCAMINAS nunca se acerca a esa cifra en celdas reveladas/marcadas, así que el tope es generoso por diseño, no ajustado a la baja.
- Bloque de test "BUSCAMINAS — motor de replay (módulo puro)" en `tests/screens.spec.ts`.
- `SECURITY.md`: amplía la sección de SPEC 32/33 marcando BUSCAMINAS como cerrado y dejando ASTEROIDES/ARKANOID pendientes.
- Paso de cierre estándar: bump `Menor` de versión (`1.3.0` → `1.4.0`) y post de changelog.

**Fuera de alcance:**

- Activar `requiere_replay` para ASTEROIDES o ARKANOID — SPEC 35 y 36.
- Loguear el camino del cursor (flechas mantenidas, muestras de posición del ratón). El motor no lo necesita: `reveal()`/`toggleFlag()` solo leen la celda en el instante de la llamada.
- Loguear pausa/reanudación. Sin gravedad ni ningún `tick()` por tiempo, pausar no tiene ningún efecto sobre lo que el replay tiene que reproducir — a diferencia de TETRIX/SERPIENTE, donde pausar sí detiene un acumulador real.
- Cualquier cambio a `start_game_session`/`save_score`/`verify_game_session`/`issue_score_proof` más allá de incluir `buscaminas` en `games.requiere_replay`.
- Comparar el score del cliente contra el del servidor con tolerancia.
- Persistir el registro de celdas en una tabla.

## Modelo de datos

```ts
// lib/buscaminas-replay.ts

export type BuscaminasLogEntry = {
  type: "reveal" | "flag";
  row: number;
  col: number;
  /** Milisegundos desde el inicio de la partida (reloj del propio cliente, monotónico). */
  t: number;
};

export type BuscaminasActionLog = BuscaminasLogEntry[];

export type ReplayResult = {
  score: number;
  level: number;
  over: boolean;
};

export function replayBuscaminas(
  log: BuscaminasActionLog,
  seed: string,
  lives: number,
): ReplayResult;
```

```sql
-- supabase/migrations/<timestamp>_games_requiere_replay_buscaminas.sql
update public.games set requiere_replay = true where slug = 'buscaminas';
```

A diferencia de `lib/tetris-replay.ts`/`lib/serpiente-replay.ts`, `replayBuscaminas()` no ordena ni integra ningún acumulador de tiempo contra `t` — solo lo usa para ordenar el log cronológicamente antes de reproducirlo, por si llega desordenado. El `row`/`col` de cada entrada es la celda bajo el cursor en el momento exacto de la pulsación/clic, capturada por el cliente antes de llamar a `reveal`/`toggleFlag` — nunca recalculada en el servidor a partir de un camino.

## Plan de implementación

1. `lib/buscaminas.ts`: `BuscaminasState` gana un campo interno `rng: () => number`; `createState(lives: number, rng: () => number = Math.random)` lo guarda; `placeMines()` cambia sus dos `Math.random()` por `state.rng()`. Sin cambio de comportamiento para las llamadas sin ese segundo argumento.
2. Nuevo `lib/buscaminas-replay.ts`: los tipos de arriba y `replayBuscaminas()` — reconstruye el estado con `createState(lives, createSeededRng(seed))` (importando `createSeededRng` de `lib/replay-rng.ts`, SPEC 33), ordena el log por `t`, y para cada entrada llama `setCursor(state, entry.row, entry.col)` seguido de `reveal(state)` o `toggleFlag(state)` según `entry.type`; corta en cuanto `state.over` es `true`. Test "módulo puro" en este mismo paso: mismo log + misma semilla siempre da el mismo `score`/`level`.
3. `components/buscaminas-game.tsx`: recibe `seed: string`, construye el PRNG seedeado y lo pasa a `createState`; mantiene en un `useRef` el log de celdas. Instrumenta los dos puntos donde el motor revela/marca — el `if (pressed("Space")) reveal(state)` / `if (pressed("KeyF")) toggleFlag(state)` del bucle, y el `act(reveal)` / `act(toggleFlag)` de `onBoardPointerDown` — para empujar `{ type, row: state.cursor.row, col: state.cursor.col, t }` al log justo antes de invocar la función del motor en ambos casos. Al terminar la partida pasa el log al `onOver` generalizado.
4. `components/game-player.tsx`: amplía la unión de `EngineProps.onOver`/`actionLogRef` con `BuscaminasActionLog` (ya generalizado en SPEC 33; aquí solo se añade el tipo nuevo a la unión).
5. `app/api/validar-partida-buscaminas/route.ts` (Node runtime, `POST`), calcada de las rutas existentes: lee `{ slug, token, log }`, verifica `verify_game_session`, confirma `gid`/usuario, rechaza por encima de 60.000 entradas o 45 minutos sin reproducir nada, ejecuta `replayBuscaminas(log, session.seed, game.vidas)` (sin tope de nivel: `game.niveles` es `null`), y si `over` es `true` pide `issue_score_proof` y devuelve `{ score, level, proof }`.
6. Migración `games_requiere_replay_buscaminas`: `update public.games set requiere_replay = true where slug = 'buscaminas'`. Verificar tras `npx supabase db reset` que `/jugar/buscaminas` sigue cargando.
7. `npx supabase db push` contra el proyecto remoto antes del merge a `main`.
8. `SECURITY.md`: amplía la sección de SPEC 32/33 marcando BUSCAMINAS como cerrado y dejando ASTEROIDES/ARKANOID pendientes de las specs 35-36.
9. Cierre: bump `Menor` en `package.json`, `components/footer.tsx` y `logo-version` de `components/nav.tsx` (`1.3.0` → `1.4.0`); post en `content/blog/v1.4.0.mdx` resumiendo esta spec.

## Criterios de aceptación

- [ ] Una partida honesta de BUSCAMINAS guarda exactamente el score/nivel que el replay del servidor calcula a partir del log — verificable comparando el valor guardado con el que `replayBuscaminas()` reproduce para esa misma semilla y log.
- [ ] Llamar a `save_score` para BUSCAMINAS sin `p_proof` (o con uno inválido/caducado) no guarda nada — mismo resultado visible que un intento que no es récord.
- [ ] Llamar a `save_score` para TETRIX, SERPIENTE, ASTEROIDES o ARKANOID sigue funcionando exactamente igual que antes de esta spec.
- [ ] Un registro de celdas que supera 60.000 entradas o 45 minutos de duración es rechazado por la ruta de validación sin que se ejecute ningún replay.
- [ ] El bloque "BUSCAMINAS — motor de replay (módulo puro)" prueba `replayBuscaminas()` directamente: misma semilla + mismo log siempre da el mismo resultado.
- [ ] Revelar/marcar por teclado, por la cruceta del mando y por ratón producen las mismas entradas de log (misma celda, mismo tipo) que el servidor reproduce idénticamente, sin importar cuál de las tres vías se usó.
- [ ] `npm test` sigue en verde, incluyendo los flujos de guardado existentes de los cinco motores.
- [ ] `SECURITY.md` refleja que BUSCAMINAS está cerrado y que ASTEROIDES y ARKANOID siguen pendientes.
- [ ] La versión sube como `Menor` a `1.4.0` en `package.json`, `components/footer.tsx` y `components/nav.tsx` (`logo-version`), y `/blog/v1.4.0` renderiza un post que resume esta spec.

## Decisiones

- **Sí:** el log solo contiene `reveal`/`flag` con su celda objetivo, nunca el camino del cursor. `reveal()`/`toggleFlag()` leen `state.cursor` en el instante de la llamada y nada más — replicar el camino añadiría payload sin cambiar ni el score ni el estado final.
- **Sí:** sin pausa/reanudación en el log. Sin gravedad ni `tick()` por tiempo, pausar BUSCAMINAS no detiene ningún acumulador que el replay necesite reproducir — a diferencia de TETRIX/SERPIENTE.
- **Sí:** mismo tope de 60.000 acciones/45 minutos que TETRIX/SERPIENTE, aunque BUSCAMINAS nunca se acerque a esa cifra en la práctica (como mucho unos cientos de celdas por rejilla despejada). Reutilizar el mismo valor evita inventar una constante ajustada sin un caso real que la justifique.
- **Sí:** reutilizar `lib/replay-rng.ts` y el `actionLogRef`/`validarPartida` genéricos de SPEC 33 sin tocarlos — esta spec solo añade su tipo a la unión y su rama a `ENGINES`.
- **No:** tocar `start_game_session`, `save_score`, `verify_game_session` o `issue_score_proof`. Siguen siendo genéricas por `games.requiere_replay` desde SPEC 32.

## Riesgos

| Riesgo                                                                                                                                                        | Mitigación                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un jugador que revela/marca muy rápido con el ratón genera entradas de log con la misma celda repetida sin cambiar nada (clics que no mueven el cursor)       | Inofensivo: `reveal()`/`toggleFlag()` ya son no-op sobre una celda revelada/marcada dos veces, así que reproducirlas en el servidor tampoco cambia el resultado. No hace falta deduplicar en el cliente.            |
| Las tres vías de entrada (teclado, cruceta, ratón) instrumentadas en dos puntos distintos del componente divergen sutilmente en qué `t` o qué celda registran | El bloque de test "módulo puro" cubre `replayBuscaminas()` aislado; el criterio de aceptación sobre las tres vías obliga a verificar a mano que las tres producen el mismo tipo de entrada antes de cerrar la spec. |

## Qué **no** entra en esta spec

- Activar `requiere_replay` para ASTEROIDES o ARKANOID.
- Loguear el camino del cursor o la pausa/reanudación.
- Cualquier cambio de comportamiento a `start_game_session`, `save_score`, `verify_game_session` o `issue_score_proof` más allá del valor de `games.requiere_replay`.
- Comparar o tolerar diferencias entre el score del cliente y el del servidor.
- Persistir el registro de celdas en una tabla para histórico o auditoría.

Cada uno de estos, si llega, va en su propia spec.
