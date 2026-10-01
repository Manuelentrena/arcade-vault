# SPEC 24 — ARKANOID: premios que caen, segunda bola y pala que crece

**Estado:** Implementado
**Depende de:** SPEC 15 (el motor de ARKANOID), SPEC 18 (vidas reales desde `games.vidas`), SPEC 21 (la banda de leyenda dentro del tubo), SPEC 22 (el panel del fin de partida y el helper `loseArkanoid` de las pruebas)
**Fecha:** 2026-09-30
**Objetivo:** Que romper un ladrillo en ARKANOID pueda soltar un premio que cae —una segunda bola o un ensanche de pala— siguiendo el mismo patrón de `Drop` que ASTEROIDES ya tiene.

## 1. Punto de partida

### 1.1 ARKANOID es el único de los cuatro sin premios

ASTEROIDES ya los tiene desde la SPEC 14, y su motor es el modelo a copiar
(`lib/asteroids.ts`): un tipo `DropKind` con dos valores, un array `drops` en el
estado, una constante `DROP_CHANCE`, un contador de compasión `DROP_PITY` que
garantiza el premio tras N kills sin suerte, y una leyenda dentro del tubo que
pinta un `.screen-legend-item` por habilidad con su color
(`.screen-legend .triple`, `.screen-legend .shield`).

ARKANOID, en cambio, tiene la leyenda vacía (`arkanoid-game.tsx:400`, un
`.screen-legend-empty` con la palabra `LEYENDA`) porque hasta ahora no tenía nada
que explicar: el muro se lee solo. Con premios, sí lo tiene.

### 1.2 El motor sólo sabe de una bola

`ArkanoidState` (`lib/arkanoid.ts:77-91`) tiene `ball` en singular, un objeto, y
`serving` como bandera **del estado**, no de la bola. Eso se nota en tres sitios:

- `step()` corta con `if (state.serving) return` antes de mover nada.
- `stickBall()`, `serve()`, `movePaddle()` y `setPaddleX()` hablan de `state.ball`.
- `advance()` resuelve paredes, pala y un ladrillo contra `state.ball`.

Con esa forma, una segunda bola pegada a la pala esperando saque **congelaría
también a la primera**, que es justo lo contrario de lo que se quiere. El paso de
`ball` a `balls[]` no es un adorno: es la condición para que la funcionalidad
exista.

### 1.3 La pala es de ancho fijo

`PADDLE_W = 81` es una constante de módulo y `createState()` la copia a
`paddle.w`. Nada la cambia después, y `bounceOffPaddle()` calcula el ángulo con
`paddle.w / 2`, así que una pala más ancha ya rebota bien sola sin tocar esa
función.

## 2. Alcance

**Dentro:**

- **Premios que caen.** Al romper un ladrillo puede soltarse un premio en su
  posición. Cae **en línea recta, hacia abajo y a velocidad constante**, y
  **no participa en la física**: la bola lo atraviesa sin rebotar y sin
  desviarlo. Sólo la pala lo recoge; el que llega al suelo se pierde.
- **Dos habilidades, con forma de cuadrado y un color cada una:**
  - **`BOLA EXTRA`**, verde. Al recogerlo aparece una **segunda bola pegada a la
    pala**, lista para lanzar, sin tocar la que ya está en juego.
  - **`+ PALA`**, rojo. Ensancha la pala **15px por cada lado**.
- **Las reglas de la bola extra:**
  - Sólo puede **soltarse** si hay **exactamente una** bola en pantalla. Con dos,
    no aparece.
  - El tope es **dos bolas**. No hay tercera.
- **Las reglas del ensanche:**
  - **Persiste entre niveles.**
  - Tope de **tres** ensanches acumulados (81px → 171px).
  - El trozo añadido se pinta **en rojo**, para que se lea como añadido y no como
    una pala distinta, y se dibuja **una línea blanca por cada ensanche** para
    poder contarlos de un vistazo.
  - **Al perder una vida se pierde el último ensanche.**
- **Un premio de cada tipo por nivel, contando los que caen.** Si el jugador no
  llega a él, la oportunidad se pierde hasta el nivel siguiente.
- **Perder una bola, con dos en juego, no cuesta vida.** La bola desaparece y la
  partida sigue con la que queda. La vida se descuenta **sólo cuando cae la
  última bola**, y es ahí donde se vuelve al saque y donde se pierde un ensanche.
- **La leyenda de ARKANOID** deja de estar vacía: dos `.screen-legend-item` con
  `BOLA EXTRA` y `+ PALA`, cada uno con su color, igual que BUSCAMINAS y
  ASTEROIDES. **Sólo se ve en móvil**, que es donde vive esa banda; en escritorio
  no se añade nada.
- Pruebas nuevas y actualizadas en `tests/screens.spec.ts`, incluida la revisión
  del helper `loseArkanoid()`.
- Actualización de `references/started-games/games.md`.

**Fuera de alcance (explícito):**

- **Más habilidades.** Nada de bola lenta, láser, pala imantada o vida extra. Dos,
  y las dos que se pidieron.
- **Tres bolas o más.** El tope es dos, y la regla de que el premio no cae con dos
  en pantalla está puesta precisamente para que no haga falta pensar en la tercera.
- **Premios en los otros tres juegos.** TETRIX y BUSCAMINAS no los quieren, y
  ASTEROIDES ya tiene los suyos.
- **Que el ensanche caduque por tiempo.** Se pierde al perder una vida, y por nada
  más. No hay contador de segundos como el `triple`/`shield` de ASTEROIDES.
- **Cambiar la puntuación.** Recoger un premio no suma puntos; su valor es la
  habilidad.
- **Cualquier cambio en `save_score`, en el HUD común o en el panel de la SPEC 22.**
- **La leyenda en escritorio.** La banda `.screen-legend` sólo se ve a ≤ 720px por
  diseño de la SPEC 21, y esta spec no la sube.

## 3. Modelo de datos

Ninguna tabla, ninguna columna, ninguna migración. Todo vive en `ArkanoidState`,
que es efímero y sólo existe dentro de un `useRef` del componente.

### 3.1 El cambio estructural: de `ball` a `balls[]`

```ts
/** Las dos habilidades. Mismo patrón que `DropKind` en lib/asteroids.ts. */
export type DropKind = "ball" | "paddle";

export type Drop = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: DropKind;
};

export type Ball = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  /** Pegada a la pala esperando saque. Es de la bola, no del estado. */
  serving: boolean;
};

export type ArkanoidState = {
  paddle: { x: number; y: number; w: number; h: number };
  balls: Ball[]; // antes: ball
  bricks: Brick[];
  bursts: Burst[];
  drops: Drop[];
  /** Ensanches acumulados, 0-3. Persiste entre niveles. */
  widenings: number;
  /** Premios ya soltados en este nivel, uno por tipo. Se resetea al subir. */
  droppedThisLevel: Record<DropKind, boolean>;
  score: number;
  level: number;
  lives: number;
  serves: number;
  over: boolean;
};
```

`state.serving` desaparece del estado; quien lo necesite mira
`state.balls.every((b) => b.serving)` o el `serving` de la bola concreta.

### 3.2 Números de partida

Valores iniciales explícitos, a ajustar midiendo a ojo — igual que la SPEC 22 dio
su tabla de tamaños:

| Constante        | Valor   | Por qué                                                    |
| ---------------- | ------- | ---------------------------------------------------------- |
| `DROP_SIZE`      | 16px    | El mismo `BALL_SIZE`: se lee a la misma distancia          |
| `DROP_SPEED`     | 180px/s | Cae más lento que la bola del nivel 1 (224px/s): da tiempo |
| `WIDEN_PER_PICK` | 15px    | Por cada lado, o sea +30px de ancho                        |
| `MAX_WIDENINGS`  | 3       | 81px → 171px, aún lejos de los 800 del campo               |
| `MAX_BALLS`      | 2       | El tope duro                                               |
| `DROP_CHANCE`    | 0.15    | El mismo de ASTEROIDES, con el tope por nivel como freno   |

El color de cada premio sale de los tokens del tema, no de un literal:
`--green` para `BOLA EXTRA` y `--red` para `+ PALA`, leídos igual que
`arkanoid-game.tsx` ya lee `--cyan` y los siete `--brick-*`.

### 3.3 Las transiciones que cambian

| Suceso                              | Qué pasa ahora                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Se rompe un ladrillo                | Si el tipo no ha caído aún en este nivel y pasa el `DROP_CHANCE`, se empuja un `Drop`. `"ball"` además exige `balls.length === 1` |
| Un `Drop` toca la pala              | `"ball"` → se añade una `Ball` con `serving: true`. `"paddle"` → `widenings++` hasta el tope                                      |
| Un `Drop` pasa del suelo            | Se descarta. La oportunidad de ese tipo ya está gastada para el nivel                                                             |
| Una bola pasa del suelo, quedan más | Se quita del array. **Sin coste**: ni vida, ni ensanche, ni saque                                                                 |
| Cae la **última** bola              | `lives--`, se pierde **un** ensanche, y vuelta al saque con una bola                                                              |
| Muro limpio                         | Sube el nivel, `drops = []`, `droppedThisLevel` a `false`, y **`widenings` se conserva**                                          |

## 4. Plan de implementación

1. **`lib/arkanoid.ts` — de `ball` a `balls[]`.** Sin premios todavía: sólo el
   cambio de forma, con `balls` de un elemento. Tocar `createState`, `stickBall`,
   `serve`, `movePaddle`, `setPaddleX`, `bounceOffPaddle`, `loseBall`,
   `clearLevel`, `advance` y `step`. Al terminar este paso ARKANOID tiene que
   jugarse **exactamente igual que antes**: es un refactor puro y es el sitio
   donde comprobarlo, no al final.
2. **`components/arkanoid-game.tsx` — dibujar el array.** El `draw` recorre
   `state.balls`; el `PadHandle` y el teclado sirven la bola que esté en
   `serving`. Mismo criterio: nada de comportamiento nuevo aún.
3. **`lib/arkanoid.ts` — el ancho de la pala.** `widenings` en el estado y el
   ancho derivado (`PADDLE_W + widenings * 2 * WIDEN_PER_PICK`). Recolocar la pala
   dentro del campo al crecer, para que no se salga por el borde derecho.
4. **`lib/arkanoid.ts` — los premios que caen.** El array `drops`, su avance
   dentro de `step()` —fuera del bucle de subpasos, porque no colisionan con
   nada—, la recogida con la pala y el descarte por el suelo. `droppedThisLevel`
   y las dos guardas: una por tipo y por nivel, y la de `balls.length === 1` para
   la bola extra.
5. **`lib/arkanoid.ts` — la regla de vidas.** `loseBall` pasa a recibir qué bola
   se pierde: si quedan más, sólo se quita; si era la última, `lives--`,
   `widenings = Math.max(0, widenings - 1)` y vuelta al saque.
6. **`components/arkanoid-game.tsx` — pintar los premios y la pala.** Los `Drop`
   como cuadrados de su color; la pala con el cuerpo cian de siempre, los trozos
   añadidos en rojo y una línea blanca por ensanche. Los extremos claros que ya
   tiene (`paddle.w * 0.18`) siguen marcando dónde cambia el ángulo.
7. **`components/arkanoid-game.tsx` — la leyenda.** Cambiar el
   `.screen-legend-empty` por dos `.screen-legend-item` con `BOLA EXTRA` y
   `+ PALA`, y añadir en `app/globals.css` las dos clases de color junto a
   `.screen-legend .triple` / `.shield` / `.flag` / `.mine`.
8. **`tests/screens.spec.ts` — revisar `loseArkanoid()` antes que nada.** Ese
   helper da por hecho que perder las tres vidas con la pala quieta cuesta ~11s.
   Con las reglas nuevas hay que volver a medirlo simulando el módulo puro en
   Node, igual que se midió al escribirlo, y ajustar el tiempo o el criterio.
   **Si este helper se rompe, se caen las pruebas de guardado de la SPEC 22.**
9. **`tests/screens.spec.ts` — lo nuevo.** Las reglas deterministas se comprueban
   sobre el módulo puro donde se pueda; en el navegador, al menos: la leyenda de
   ARKANOID pinta las dos habilidades en móvil y nada en escritorio, y el tope de
   bolas y de ensanches no se pasa nunca.
10. **Documentación.** `references/started-games/games.md`: ARKANOID gana una
    sección de premios, y la tabla de leyendas por juego deja de decir que la suya
    está vacía.
11. **Cierre:** `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`.

## 5. Criterios de aceptación

- [x] Romper ladrillos suelta premios que caen **rectos y a velocidad constante**,
      y la bola los **atraviesa** sin rebotar ni desviarlos.
- [x] Recoger el premio verde con la pala añade una segunda bola **pegada a la
      pala**; la bola que ya estaba en juego **no se detiene** mientras la nueva
      espera saque.
- [x] El premio verde **no aparece** mientras hay dos bolas en pantalla.
- [x] Nunca hay tres bolas.
- [x] Recoger el premio rojo ensancha la pala 15px por lado, el trozo añadido se
      ve **rojo** y hay **una línea blanca por cada ensanche**.
- [x] El ensanche **sobrevive al cambio de nivel**.
- [x] No se acumulan más de **tres** ensanches.
- [x] Con dos bolas en juego, perder una **no descuenta vida**, no quita ensanche
      y no vuelve al saque: la partida sigue con la otra.
- [x] Perder la **última** bola descuenta una vida, quita **un** ensanche y vuelve
      al saque.
- [x] En un mismo nivel cae **como mucho un premio de cada tipo**, tanto si se
      recoge como si se pierde por el suelo.
- [x] Quedarse sin vidas sigue abriendo el panel `FIN DEL JUEGO` de la SPEC 22 con
      su rama de guardado intacta.
- [x] En móvil, la leyenda de ARKANOID muestra `BOLA EXTRA` y `+ PALA`; en
      escritorio la banda sigue sin verse.
- [x] El espacio de juego sigue midiendo `4 / 3` y la captura del reproductor en
      TETRIX no cambia.
- [x] El helper `loseArkanoid()` sigue terminando una partida dentro de su
      presupuesto de tiempo, y las pruebas de guardado de la SPEC 22 siguen verdes.
- [x] `npm run build`, `npx tsc --noEmit`, `npm run lint` y `npm test` pasan. `build`/`tsc`/`lint`
      limpios. `npm test`: 175/179 verdes; los 4 rojos son `salón de la fama` (asume base de datos
      vacía, pero para cuando esas pruebas corren PX_KAI ya tiene una puntuación real de ARKANOID
      guardada por una prueba anterior del mismo `npm test`) — confirmado preexistente en `main` sin
      ningún cambio de esta spec, ejecutando la suite completa dos veces (con y sin estos cambios).
      Fuera de alcance de la SPEC 24.

## 6. Verificación manual

Con el stack local arriba y `npm run dev`, en `/jugar/arkanoid`:

1. **El refactor primero.** Después del paso 2 del plan, jugar un nivel entero sin
   premios todavía y confirmar que nada se nota: mismo saque, mismo rebote, mismas
   vidas, mismo paso de nivel.
2. **El premio verde.** Recogerlo y comprobar que la primera bola **no se para**
   mientras la segunda espera en la pala. Lanzar la segunda y jugar con las dos.
3. **La regla de la vida.** Con dos bolas, dejar caer una a propósito: las vidas
   del HUD **no** deben bajar. Dejar caer la que queda: ahí sí baja, se pierde un
   ensanche y vuelve el saque.
4. **El premio rojo.** Recoger tres y comprobar el tope, las tres líneas blancas y
   que el rojo se distingue del cian. Pasar de nivel y comprobar que la pala sigue
   ancha.
5. **El tope por nivel.** Romper un muro entero y contar: como mucho un premio de
   cada color.
6. **Móvil, 390 × 844.** La leyenda con las dos habilidades, y el mando de la
   SPEC 21 sin cambios. Repetir con `⛶` activado.

## 7. Decisiones tomadas y descartadas

- **Perder una de dos bolas no cuesta vida** (multiball clásico). La descripción
  inicial decía que cada bola perdida restara una vida; se descartó al verlo
  escrito: con tres vidas y dos bolas, un despiste costaba dos tercios de la
  partida, y el premio pasaba de recompensa a castigo. La vida se cobra cuando no
  queda ninguna bola, que es cuando el jugador se ha quedado sin juego.
- **El tope por nivel cuenta los premios que caen, no los que se recogen.** La
  alternativa —volver a intentarlo si se falla— se descartó porque un jugador que
  falla mucho vería premios sin parar, y porque «cayó o no cayó» es una condición
  que una prueba puede afirmar sin ambigüedad.
- **Los premios no responden a la física.** Es explícito: la bola los atraviesa.
  Que rebotaran sería una segunda simulación de colisiones para algo que sólo
  tiene que bajar en línea recta.
- **`balls[]` en vez de `ball` + `ball2`.** Un segundo campo opcional obligaría a
  duplicar cada rama del motor. El array cuesta un refactor grande una vez y deja
  el tope en una constante en lugar de en la forma del tipo.
- **`serving` pasa a ser de la bola.** Es la consecuencia inevitable de lo
  anterior: con `serving` en el estado, `step()` congela las dos bolas y la
  funcionalidad no existe.
- **El ensanche no caduca por tiempo.** ASTEROIDES mide sus habilidades en
  segundos (`DROP_DURATION`), pero aquí el usuario ató el ensanche a las vidas.
  Se respeta: es una regla más fácil de leer en pantalla —las líneas blancas se
  cuentan— que un contador que corre.
- **Se copia el patrón `Drop` de ASTEROIDES en vez de inventar otro.** Los dos
  motores son módulos puros independientes y no comparten código a propósito,
  pero sí deben compartir vocabulario: `DropKind`, `drops`, `DROP_CHANCE`.
- **La leyenda no se sube a escritorio.** La banda es de móvil por diseño de la
  SPEC 21 y el usuario lo pidió así explícitamente.

## 8. Riesgos identificados

- **El refactor de `ball` a `balls[]` es el riesgo principal.** Toca nueve
  funciones del motor y el `draw` del componente, y un fallo ahí no rompe un
  premio: rompe ARKANOID entero. Por eso el paso 1 del plan es el refactor **solo**,
  con la comprobación manual de que el juego se comporta igual antes de añadir
  nada.
- **`loseArkanoid()` es una dependencia oculta de la SPEC 22.** Ese helper de
  `tests/screens.spec.ts` da por hecho que la partida termina en ~11s con la pala
  quieta, y de él cuelgan la prueba del guardado real, la del invitado y las dos
  de que el panel cabe en el tubo. Las reglas nuevas cambian ese tiempo —los
  premios caen solos y el ensanche hace la pala más difícil de esquivar—, así que
  el paso 8 va **antes** que las pruebas nuevas, no después.
- **La pala más ancha cambia el rebote sin que nadie lo toque.**
  `bounceOffPaddle()` normaliza el punto de impacto con `paddle.w / 2`, así que
  con 171px el mismo desplazamiento en píxeles da un ángulo más suave. No es un
  fallo —es coherente—, pero hace el juego más fácil de lo que sugiere el simple
  «la pala es más grande», y conviene notarlo al jugar.
- **Dos bolas duplican los subpasos.** `step()` calcula subpasos por distancia
  recorrida; con dos bolas rápidas son el doble de iteraciones por fotograma. A
  las velocidades del nivel 1 es irrelevante, pero conviene mirarlo en móvil
  alrededor del nivel 15, donde la bola ya va a 800px/s.
- **El premio puede caer donde la pala no llega a tiempo**, y con el tope por
  nivel eso significa perder la oportunidad entera. Es la regla elegida a
  propósito, pero si al jugar resulta frustrante, la palanca a mover es
  `DROP_SPEED`, no el tope.
