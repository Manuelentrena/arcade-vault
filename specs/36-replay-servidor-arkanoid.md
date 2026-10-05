# SPEC 36 — Replay en servidor para ARKANOID

> **Estado:** Implementado
> **Depende de:** SPEC 15 (motor de ARKANOID), SPEC 24 (premios y multibola), SPEC 29 (RLS de `scores` y token de sesión de partida), SPEC 32 (patrón de replay y columna `games.requiere_replay`), SPEC 33 (generaliza `components/game-player.tsx` y `lib/replay-rng.ts`), SPEC 35 (paso fijo de física para el replay — ARKANOID reutiliza el mismo criterio)
> **Versión:** Menor
> **Fecha:** 2026-10-05
> **Objetivo:** El servidor reproduce la partida de ARKANOID a partir del registro de entradas del jugador —teclado mantenido y arrastre de la pala con el puntero— y una semilla propia, y la puntuación que se guarda en `scores` es siempre la que calcula ese replay, nunca la que afirma el cliente.

## Por qué existe esta spec

Última de las cuatro specs que extienden a todo el catálogo el cierre que SPEC 32 hizo solo para TETRIX (orden: SERPIENTE → BUSCAMINAS → ASTEROIDES → ARKANOID). ARKANOID va al final porque su pala admite dos vías de control que coexisten sin excluirse: mantener una flecha del teclado (`movePaddle(state, dir, dt)`, velocidad constante) **y** arrastrar con el dedo o el ratón (`setPaddleX(state, cx)`, posición absoluta) — "la forma más precisa de jugar [la pala]" según `references/started-games/games.md`, y la única de las cuatro entradas analógicas de verdad del catálogo: no es un estado mantenido como el empuje de ASTEROIDES, es una coordenada que el jugador fija directamente.

Registrar cada evento `pointermove` del navegador generaría un log desproporcionado: a 60-120 eventos por segundo, una partida larga se iría a cientos de miles de entradas solo para la pala. En vez de eso, el cliente muestrea la posición de la pala por cambio o por frecuencia —lo que ocurra antes— y el servidor reproduce la física con el mismo paso fijo que SPEC 35 introdujo para ASTEROIDES (`1/120` s), aplicando `movePaddle()` en cada paso mientras una tecla está mantenida y saltando directamente a la `x` de una muestra de arrastre quien la haya logueado, exactamente en el orden en que ambas fuentes se aplican hoy en el cliente (las dos pueden escribir `paddle.x` en el mismo fotograma sin conflicto: el teclado cada fotograma del bucle, el arrastre cada evento de puntero).

## Scope

**Dentro:**

- `lib/arkanoid.ts`: `createState(lives, rng)` gana un segundo parámetro opcional `rng: () => number = Math.random`, guardado en un campo interno `rng` del estado. El único `Math.random()` del motor —el sorteo de si un ladrillo roto suelta premio, en `maybeDropFrom()`— pasa a `state.rng()`. Los niveles 6 en adelante siguen generándose con el LCG determinista ya existente, sembrado por el número de nivel: no usan `Math.random()` y no cambian en esta spec.
- Nuevo módulo puro `lib/arkanoid-replay.ts`: tipos del registro de entradas (teclado mantenido, muestras de posición de la pala, saque, pausa/reanudación) y `replayArkanoid()`, que reproduce una partida completa integrando `step()` a pasos fijos de `1/120` s (mismo criterio que SPEC 35), llamando `movePaddle()` en cada paso mientras una tecla está mantenida y `setPaddleX()` exactamente en el timestamp de cada muestra de arrastre logueada.
- `components/arkanoid-game.tsx`: usa la semilla recibida para sembrar `createState`; construye el registro de entradas —pulsar/soltar izquierda-derecha del teclado o del mando, muestras de `setPaddleX()` limitadas por umbral de cambio o frecuencia, `serve()`, pausa/reanudación— con el timestamp relativo al inicio; expone el registro por el `onOver` ya generalizado, ampliando la unión con `ArkanoidActionLog`.
- Nueva ruta `app/api/validar-partida-arkanoid/route.ts` (Node runtime), calcada de las rutas existentes: verifica el token, acota el registro, reproduce la partida con `replayArkanoid()` y devuelve `{ score, level, proof }` firmado con `issue_score_proof`.
- `games.requiere_replay` pasa a `true` también para la fila de `arkanoid`.
- Tope anti-abuso propio, más alto que el de los otros cuatro motores por el canal de muestras de posición: 150.000 acciones o 45 minutos de duración, lo que se alcance primero.
- Bloque de test "ARKANOID — motor de replay (módulo puro)" en `tests/screens.spec.ts`, junto al bloque ya existente "ARKANOID — motor de premios y multibola (módulo puro)".
- `SECURITY.md`: amplía la sección de SPEC 32/33/34/35 marcando ARKANOID como cerrado — con esta spec, los cinco motores del catálogo quedan sin el riesgo que SPEC 29 había dejado aceptado.
- Paso de cierre estándar: bump `Menor` de versión (`1.5.0` → `1.6.0`) y post de changelog.

**Fuera de alcance:**

- Cualquier cambio a `start_game_session`/`save_score`/`verify_game_session`/`issue_score_proof` más allá de incluir `arkanoid` en `games.requiere_replay`.
- Cambiar el LCG determinista que genera los niveles 6 en adelante. Ya es determinista, sembrado por el número de nivel; esta spec no lo toca.
- Cualquier tolerancia de posición entre la pala que el cliente dibujó y la que el servidor calculó — solo el `score`/`level`/`over` finales tienen que coincidir.
- Comparar el score del cliente contra el del servidor con tolerancia.
- Persistir el registro de entradas en una tabla.
- Tocar el control táctil directo del tablero (arrastrar la pala, que sigue siendo la forma más precisa de jugar) — esta spec lo deja intacto; solo añade el muestreo necesario para reproducirlo en el servidor.

## Modelo de datos

```ts
// lib/arkanoid-replay.ts

export type ArkanoidActionLog = ArkanoidLogEntry[];

export type ArkanoidLogEntry =
  | {
      type:
        | "left_down"
        | "left_up"
        | "right_down"
        | "right_up"
        | "serve"
        | "pause"
        | "resume";
      /** Milisegundos desde el inicio de la partida (reloj del propio cliente, monotónico). */
      t: number;
    }
  | {
      type: "paddle_x";
      /** Posición lógica (coordenadas del mundo, 0-800) del centro apuntado por el puntero. */
      x: number;
      t: number;
    };

export type ReplayResult = {
  score: number;
  level: number;
  over: boolean;
};

export function replayArkanoid(
  log: ArkanoidActionLog,
  seed: string,
  lives: number,
): ReplayResult;
```

```sql
-- supabase/migrations/<timestamp>_games_requiere_replay_arkanoid.sql
update public.games set requiere_replay = true where slug = 'arkanoid';
```

Muestreo de `paddle_x` en el cliente: una muestra nueva se añade al log solo si han pasado al menos `1000 / 30` ms desde la última muestra **o** la `x` cambió más de 2px lógicos desde la última muestra registrada, lo que ocurra primero — el mismo criterio con el que un pointermove ya se descarta si no mueve nada. Entre dos muestras (o mientras no hay ninguna activa), la pala se mueve solo por `movePaddle()` si hay una tecla mantenida, exactamente como hoy.

## Plan de implementación

1. `lib/arkanoid.ts`: `ArkanoidState` gana un campo interno `rng: () => number`; `createState(lives: number, rng: () => number = Math.random)` lo guarda; `maybeDropFrom()` cambia su `Math.random()` por `state.rng()`. Sin cambio de comportamiento para las llamadas existentes sin el segundo argumento.
2. Nuevo `lib/arkanoid-replay.ts`: los tipos de arriba, reutiliza `FIXED_DT = 1 / 120` (mismo valor que `lib/asteroids-replay.ts`, SPEC 35 — considerar extraerlo a `lib/replay-rng.ts` si al escribir este paso resulta que ambos módulos ya lo necesitan igual, para no mantener la misma constante en dos sitios), y `replayArkanoid()` — reconstruye el estado con `createState(lives, createSeededRng(seed))`, ordena el log por `t`, mantiene un estado local `{ left: boolean; right: boolean }` actualizado por `left_down`/`left_up`/`right_down`/`right_up`, y avanza en pasos de `FIXED_DT`: en cada paso, si `left !== right` llama `movePaddle(state, left ? -1 : 1, FIXED_DT)` antes de `step(state, FIXED_DT)`; al llegar exactamente al `t` de una entrada `paddle_x` llama `setPaddleX(state, entry.x)`; `serve` llama `serve(state)`; `pause`/`resume` detienen/reanudan el avance del tiempo, igual que en `lib/asteroids-replay.ts`. Corta en cuanto `state.over` es `true`. Test "módulo puro" en este mismo paso: mismo log + misma semilla siempre da el mismo `score`/`level`.
3. `components/arkanoid-game.tsx`: recibe `seed: string`, construye el PRNG seedeado y lo pasa a `createState`; mantiene en un `useRef` el log de entradas. Instrumenta `onKeyDown`/`onKeyUp` (y la rama equivalente del `PadHandle`) para `left_down`/`left_up`/`right_down`/`right_up`; instrumenta `aim()` (el callback que traduce la posición del puntero y llama `setPaddleX`) para añadir una muestra `paddle_x` solo cuando pasa el umbral de tiempo o de cambio descrito arriba; instrumenta los puntos donde se llama `serve(state)` (tecla, clic en el tablero, botón A del mando) para `serve`; añade `pause`/`resume` donde hoy se limpia `heldRef.current` al pausar. Al terminar la partida pasa el log al `onOver` generalizado.
4. `components/game-player.tsx`: amplía la unión de `EngineProps.onOver`/`actionLogRef` con `ArkanoidActionLog`.
5. `app/api/validar-partida-arkanoid/route.ts` (Node runtime, `POST`), calcada de las rutas existentes con un tope distinto: lee `{ slug, token, log }`, verifica `verify_game_session`, confirma `gid`/usuario, rechaza por encima de 150.000 entradas o 45 minutos sin reproducir nada, ejecuta `replayArkanoid(log, session.seed, game.vidas)` (sin tope de nivel: `game.niveles` es `null`), y si `over` es `true` pide `issue_score_proof` y devuelve `{ score, level, proof }`.
6. Migración `games_requiere_replay_arkanoid`: `update public.games set requiere_replay = true where slug = 'arkanoid'`. Verificar tras `npx supabase db reset` que `/jugar/arkanoid` sigue cargando.
7. `npx supabase db push` contra el proyecto remoto antes del merge a `main`.
8. `SECURITY.md`: amplía la sección de SPEC 32/33/34/35 marcando ARKANOID como cerrado y señalando que, con esta spec, los cinco motores del catálogo quedan protegidos frente al riesgo que SPEC 29 había documentado como aceptado.
9. Cierre: bump `Menor` en `package.json`, `components/footer.tsx` y `logo-version` de `components/nav.tsx` (`1.5.0` → `1.6.0`); post en `content/blog/v1.6.0.mdx` resumiendo esta spec y cerrando la serie de las cuatro (SPEC 33-36).

## Criterios de aceptación

- [ ] Una partida honesta de ARKANOID jugada solo con teclado guarda exactamente el score/nivel que el replay del servidor calcula a partir del log.
- [ ] Una partida honesta de ARKANOID jugada arrastrando la pala con el puntero guarda exactamente el score/nivel que el replay del servidor calcula a partir del log, incluyendo las muestras de `paddle_x`.
- [ ] Llamar a `save_score` para ARKANOID sin `p_proof` (o con uno inválido/caducado) no guarda nada — mismo resultado visible que un intento que no es récord.
- [ ] Llamar a `save_score` para TETRIX, SERPIENTE, BUSCAMINAS o ASTEROIDES sigue funcionando exactamente igual que antes de esta spec.
- [ ] Un registro de entradas que supera 150.000 entradas o 45 minutos de duración es rechazado por la ruta de validación sin que se ejecute ningún replay.
- [ ] El bloque "ARKANOID — motor de replay (módulo puro)" prueba `replayArkanoid()` directamente: misma semilla + mismo log siempre da el mismo resultado, tanto con entradas de teclado como con muestras de `paddle_x`.
- [ ] `npm test` sigue en verde, incluyendo los flujos de guardado existentes de los cinco motores y el bloque "ARKANOID — motor de premios y multibola (módulo puro)" ya existente.
- [ ] `SECURITY.md` refleja que los cinco motores del catálogo están cerrados frente al riesgo de SPEC 29.
- [ ] La versión sube como `Menor` a `1.6.0` en `package.json`, `components/footer.tsx` y `components/nav.tsx` (`logo-version`), y `/blog/v1.6.0` renderiza un post que resume esta spec.

## Decisiones

- **Sí:** el arrastre de la pala se loguea como muestras de posición limitadas por umbral de cambio (2px) o frecuencia (30 Hz), no como cada evento `pointermove`. Mantiene la fidelidad del control táctil —la forma más precisa de jugar, según `games.md`— sin que el log se dispare de tamaño.
- **Sí:** tope de log propio y más alto (150.000 frente a 60.000) solo para ARKANOID, por ser el único motor con un canal de muestreo continuo. Los otros cuatro mantienen 60.000 porque sus entradas son siempre discretas por pulsación.
- **Sí:** mismo paso fijo (`1/120` s) que SPEC 35 introdujo para ASTEROIDES — ARKANOID también integra física continua con `step(state, dt)`, y ese `step()` ya subdivide internamente en sub-pasos de 8px con `dt` topado a 50 ms, así que un paso externo fino compone bien con esa precisión interna sin tocarla.
- **Sí:** las dos vías de control de la pala (teclado mantenido, arrastre por puntero) se reproducen en el mismo orden relativo en que el cliente las aplica hoy —el teclado cada paso de física, el arrastre en el instante exacto de su muestra— en vez de forzar que una excluya a la otra. Así el replay no cambia la experiencia de juego documentada.
- **Sí:** el `rng` de ARKANOID solo cubre el sorteo de premio en `maybeDropFrom()`. El LCG de los niveles 6+ ya es determinista por diseño (sembrado por el nivel) y no pasa por `Math.random()`, así que no necesita tocarse.
- **No:** ninguna tolerancia de posición de pala entre cliente y servidor. Solo el resultado final importa.
- **No:** tocar `start_game_session`, `save_score`, `verify_game_session` o `issue_score_proof` más allá del valor de `games.requiere_replay`.

## Riesgos

| Riesgo                                                                                                                                                            | Mitigación                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un umbral de muestreo demasiado laxo deja huecos donde la pala "salta" en el replay respecto a lo que el jugador vio, cambiando si atrapa o no una bola al límite | 2px/30 Hz es fino frente al ancho de la pala (81-171px) y a la velocidad de la bola; si en la práctica resulta insuficiente, ajustar el umbral es un cambio de una constante en el cliente, sin tocar el formato del log ni el servidor.    |
| El tope de 150.000 entradas resulta insuficiente para una partida real muy larga con arrastre continuo                                                            | 30 Hz × 45 minutos son 81.000 muestras como máximo solo de `paddle_x`; sumado a eventos de teclado/saque/pausa da margen bajo 150.000 en el caso normal. Si no bastara, ajustar el tope es un cambio de una constante, igual que en TETRIX. |
| Reutilizar `FIXED_DT` duplicado entre `lib/asteroids-replay.ts` y `lib/arkanoid-replay.ts` diverge con el tiempo si uno se ajusta y el otro no                    | Señalado explícitamente en el plan de implementación (paso 2): si al escribir este módulo ambos ya comparten el mismo valor, se extrae a `lib/replay-rng.ts` en el mismo paso en vez de dejarlo duplicado.                                  |

## Qué **no** entra en esta spec

- Cualquier cambio de comportamiento a `start_game_session`, `save_score`, `verify_game_session` o `issue_score_proof` más allá del valor de `games.requiere_replay`.
- Cambios al LCG determinista de los niveles 6 en adelante.
- Comparar o tolerar diferencias entre el score del cliente y el del servidor.
- Persistir el registro de entradas en una tabla para histórico o auditoría.
- Cualquier cambio al control táctil directo del tablero.

Con esta spec se cierra la serie: los cinco motores del catálogo —TETRIX, SERPIENTE, BUSCAMINAS, ASTEROIDES y ARKANOID— quedan sin el riesgo que SPEC 29 había dejado aceptado.
