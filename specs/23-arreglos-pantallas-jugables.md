# SPEC 23 — Tres arreglos del reproductor: selección, botón B y contador de banderas

**Estado:** Aprovado
**Depende de:** SPEC 20 (BUSCAMINAS y su leyenda), SPEC 21 (el mando de móvil y las bandas del tubo), SPEC 22 (el panel dentro del tubo y el `user-select` de `.btn` y `.game-pad`)
**Fecha:** 2026-09-30
**Objetivo:** Cerrar tres defectos del reproductor —el texto que se selecciona con el dedo, el botón B inerte de TETRIX y el contador de banderas de BUSCAMINAS que no se mueve— sin tocar las reglas de ningún motor.

## 1. Punto de partida

Los tres son defectos independientes. No comparten archivo ni causa, y van juntos
en una spec sólo porque los tres se ven jugando con el dedo y ninguno merece una
rama propia. Lo que sí comparten es la regla que los ordena: **ninguno cambia las
reglas de ningún motor**. El botón B de TETRIX no rota «de otra forma», llama al
mismo `rotate` que ▲; el contador de banderas no se calcula de nuevo, se sincroniza
por un camino que hoy se lo salta.

### 1.1 El texto se sigue seleccionando con el dedo

La SPEC 22 puso `user-select: none`, `-webkit-user-select: none` y
`-webkit-touch-callout: none` en `.btn` (`app/globals.css:293`) y en `.game-pad`
(`1517`), y los cuatro juegos ya lo tenían en sus propios mandos de dentro del
tubo (`.tetris-pad .btn`, `.rocks-pad .btn`, `.minas-pad .btn`, `.ark-pad .btn`).

Eso cubre las teclas y nada más. **Todo el texto del reproductor sigue siendo
seleccionable**, y mantener el dedo encima de cualquiera de estos sitios abre el
menú de copiar de iOS en mitad de una partida:

| Dónde            | Qué texto                                                    |
| ---------------- | ------------------------------------------------------------ |
| `.player-hud`    | `Jugador` / el nombre, `Puntuación`, `Vidas`, `Nivel`        |
| `.screen-signal` | `SEÑAL OK` y el título del juego                             |
| `.screen-legend` | `LEYENDA`, y en BUSCAMINAS `⚑ 0 / 10` y `10 MINAS`           |
| `.screen-stats`  | `PTS`, `VIDAS`, `NIVEL` y sus números                        |
| `.crt-bottom`    | `SEÑAL OK`, `TETRIX · CRT-83 · 60 HZ`, `CARGA · 1MB`         |
| `.crt-menu`      | el título, `PUNTUACIÓN`, la puntuación, la copia de invitado |

El menú tapa el tubo, y cerrarlo cuesta un toque que el juego interpreta como
jugada. En una recreativa eso no existe.

### 1.2 El botón B de TETRIX está apagado

La SPEC 21 fijó que la silueta del mando es la misma en los cuatro juegos: lo que
un juego no usa se pinta atenuado como un `<span>` inerte, no se oculta. TETRIX
sólo declara una acción, así que B es uno de esos huecos apagados. Son dos sitios,
no uno:

- `components/game-player.tsx:101` — `buttons: ["Caída instantánea", null]`. Ese
  `null` es exactamente lo que hace que `game-pad.tsx` pinte B como `<span>`
  inerte, sin rol, sin foco y sin puntero.
- `components/tetris-game.tsx:388-407` — el `switch` del `PadHandle` tiene
  `up`, `down`, `left`, `right` y `a`. No hay `case "b"`, así que cae en
  `default: break`.

Pulgar derecho arriba y pulgar izquierdo abajo es la postura natural en una
consola; obligar a rotar con ▲ mientras el pulgar derecho descansa sobre una tecla
muerta es incómodo, y la tecla está ahí.

### 1.3 El contador de banderas no se mueve

Éste es el único que parece un fallo de reglas y no lo es. `toggleFlag()`
(`lib/buscaminas.ts:239-247`) actualiza `state.flags` correctamente en los dos
sentidos y respeta su tope. El motor está bien.

El agujero está en `components/buscaminas-game.tsx`, y es un camino que se salta
la sincronización:

- La leyenda no lee el motor: vive en un `useState` (`301`) que `syncLegend()`
  (`305`) copia desde `state.flags` y `state.mines`.
- `act()` (`316`) llama a `syncLegend()` después de cada acción. Por ahí entra
  **el ratón** (`onBoardPointerDown` → `act(toggleFlag)`), y por eso en escritorio
  con clic derecho el contador **sí** funciona.
- El bucle de `requestAnimationFrame` (`376-377`) llama a `reveal(state)` y
  `toggleFlag(state)` **directamente, sin pasar por `act()`**. Por ahí entran el
  teclado (`Espacio`/`F`), la cruceta de dentro del tubo y **el mando de móvil**,
  que es el caso que reportó el usuario: la bandera aparece en el canvas —porque
  el canvas se repinta cada fotograma— pero el `0 / 10` de la leyenda no se mueve
  nunca.
- El mismo agujero afecta a `reveal`: cuando despejar la rejilla sube de nivel,
  `freshGrid()` cambia `state.mines`, y la leyenda se queda con el número del
  nivel anterior.

## 2. Alcance

**Dentro:**

- **Una sola regla** en `app/globals.css` sobre `.av-player` (`1178`) que impide
  seleccionar texto en todo el reproductor: `user-select: none`,
  `-webkit-user-select: none`, `-webkit-touch-callout: none` y
  `-webkit-tap-highlight-color: transparent`. Va en el contenedor y no en cada
  elemento a propósito, y el comentario del CSS lo explica: lo que se selecciona
  son nodos de texto sueltos repartidos por seis contenedores distintos, y una
  regla por contenedor sería una lista que hay que acordarse de ampliar cada vez
  que el tubo gane una banda.
- **TETRIX gana el botón B**, con la misma acción que ▲:
  - `ENGINES.tetrix.pad.buttons` pasa a `["Caída instantánea", "Rotar la pieza"]`.
  - `case "b": press(rotate, false)` en el `PadHandle` de `tetris-game.tsx`,
    idéntico al `case "up"` que ya existe. Una acción, dos teclas.
- **`syncLegend()` se llama también desde el bucle** de `buscaminas-game.tsx`,
  detrás de `reveal` y de `toggleFlag`. `setLegend` ya devuelve `prev` cuando no
  cambia nada, así que llamarlo cada fotograma no cuesta un render de más — es
  la misma garantía en la que se apoya `act()` hoy.
- Pruebas nuevas en `tests/screens.spec.ts`.
- Actualización de `references/started-games/games.md`: el esquema del mando de
  TETRIX y la nota de que el reproductor entero no se selecciona.

**Fuera de alcance (explícito):**

- **Los premios de ARKANOID.** Salieron en la misma conversación y son la SPEC 24.
- **El nav y el pie de `/jugar/[id]`.** Siguen siendo texto normal, como en las
  otras seis pantallas. Cubrirlos obligaría a marcar la ruta entera —una clase en
  el `<body>` o en el layout— para no afectar al resto del sitio, y el gesto que
  molesta ocurre sobre el tubo, no sobre la cabecera.
- **Cualquier cambio en las reglas de los motores.** `rotate` no se toca;
  `toggleFlag` y `reveal` no se tocan.
- **El contrato `PadLayout` / `PadHandle` / `ENGINES`.** TETRIX rellena un hueco
  que el contrato ya preveía; no se añade ni una propiedad.
- **Dar a B una acción distinta en los otros tres juegos.** ASTEROIDES y ARKANOID
  siguen con su B apagado; BUSCAMINAS ya lo usa para la bandera.
- **Regenerar capturas.** Ninguno de los tres cambios altera un píxel en reposo:
  el `user-select` no pinta, B pasa de `<span>` apagado a `<button>` encendido
  pero con la misma silueta y el mismo rótulo `A`/`B` debajo, y la leyenda de
  BUSCAMINAS arranca en `0 / 10` igual que hoy.

## 3. Modelo de datos

Ninguno. No hay tabla, ni columna, ni migración, ni tipo nuevo, ni estado de React
nuevo. Los tres arreglos son: una regla de CSS, un `case` en un `switch` más un
literal de `ENGINES`, y dos llamadas a una función que ya existe.

## 4. Plan de implementación

1. **`app/globals.css` — el reproductor no se selecciona.** Añadir el bloque a
   `.av-player` (`1178`), con el comentario que explica por qué la regla vive en
   el contenedor. Comprobar que no rompe el arrastre de la pala de ARKANOID ni el
   toque de celda de BUSCAMINAS: `user-select` no afecta a los eventos de puntero,
   pero es justo lo que hay que mirar a ojo antes de seguir.
2. **`components/game-player.tsx` — el esquema del mando de TETRIX.**
   `buttons: ["Caída instantánea", "Rotar la pieza"]`. El texto es el `aria-label`
   de la tecla, así que tiene que ser el mismo que ya usa `dpad.up`.
3. **`components/tetris-game.tsx` — el `case` que falta.** Añadir
   `case "b": press(rotate, false); break;` junto al `case "up"`. Sin repetición
   (`false`) como el de arriba: rotar mientras se mantiene el dedo giraría la
   pieza sola.
4. **`components/buscaminas-game.tsx` — cerrar el camino del bucle.** Llamar a
   `syncLegend()` en el bucle después de `reveal` y `toggleFlag` (`376-377`).
   Documentar en el comentario que hay dos caminos de entrada —`act()` para el
   ratón, el bucle para todo lo demás— y que los dos tienen que sincronizar.
5. **`tests/screens.spec.ts` — lo nuevo.** Tres pruebas:
   - **B rota la pieza en TETRIX** (móvil): el mando ya no pinta ninguna tecla
     apagada en TETRIX, la tecla `B` tiene `aria-label="Rotar la pieza"`, y
     pulsarla cambia el tablero igual que ▲.
   - **El contador de banderas avanza desde el mando** (móvil): con BUSCAMINAS
     montado, la leyenda dice `0 / 10`; pulsar `B` en el mando la deja en `1 / 10`.
     Y la misma comprobación con la tecla `F` en escritorio, que es el otro camino
     que hoy está roto.
   - **El reproductor no se selecciona**: `user-select` computado es `none` sobre
     `.player-hud`, `.screen-stats` y `.crt-bottom`. Se lee con
     `getComputedStyle`, no con un intento de selección real: seleccionar con
     Playwright no reproduce el gesto del dedo.
6. **Documentación.** `references/started-games/games.md`: el esquema del mando de
   TETRIX pasa a tener las dos acciones, y la nota de la SPEC 22 sobre no poder
   seleccionar el mando se amplía al reproductor entero.
7. **Cierre:** `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`.

## 5. Criterios de aceptación

- [ ] En `/jugar/[id]`, mantener el dedo (o arrastrar el ratón) sobre el HUD, la
      banda de señal, la leyenda, el marcador, el pie del tubo o el panel del MENÚ
      **no selecciona nada** y no abre el menú de copiar.
- [ ] `getComputedStyle` devuelve `user-select: none` para `.player-hud`,
      `.screen-stats` y `.crt-bottom` en los dos viewports.
- [ ] Arrastrar la pala de ARKANOID y tocar una celda de BUSCAMINAS siguen
      funcionando exactamente igual: la regla no toca los eventos de puntero.
- [ ] En TETRIX, el mando de móvil **no tiene ninguna tecla apagada**: los cuatro
      brazos y los dos botones son `<button>` con `aria-label`.
- [ ] La tecla `B` de TETRIX rota la pieza, y lo hace de un disparo: mantenerla
      pulsada **no** gira la pieza en bucle.
- [ ] `A` sigue siendo la caída instantánea y ▲ sigue rotando: ninguna de las dos
      cambia.
- [ ] En BUSCAMINAS, poner una bandera mueve el contador de la leyenda **por los
      cuatro caminos**: tecla `F`, cruceta de dentro del tubo, botón `B` del mando
      y clic derecho del ratón. Quitarla lo devuelve.
- [ ] Al despejar una rejilla y subir de nivel, la leyenda pinta las minas del
      nivel nuevo, no las del anterior.
- [ ] Las catorce capturas de referencia siguen pasando **sin regenerar**.
- [ ] `npm run build`, `npx tsc --noEmit`, `npm run lint` y `npm test` pasan.

## 6. Verificación manual

Con el stack local arriba (`npx supabase start`) y `npm run dev`:

1. **Móvil, 390 × 844.** En los cuatro juegos, mantener el dedo sobre el HUD, la
   banda de señal, la leyenda y el marcador: no debe aparecer el menú de copiar ni
   quedar texto resaltado. Repetir con `⛶` activado y con el panel del MENÚ
   abierto.
2. **TETRIX en móvil.** Comprobar que B ya no está apagado, que rota la pieza y
   que mantenerlo pulsado la rota una sola vez. Comprobar que A sigue siendo la
   caída instantánea.
3. **BUSCAMINAS en móvil.** Poner y quitar banderas con el botón B del mando y ver
   el contador moverse en los dos sentidos. Despejar una rejilla entera y
   comprobar que las minas de la leyenda suben con el nivel.
4. **BUSCAMINAS en escritorio.** Lo mismo con la tecla `F` y con el clic derecho.
5. **ARKANOID en móvil.** Arrastrar la pala con el dedo sobre el lienzo: tiene que
   seguir respondiendo igual que antes de la regla de CSS.

## 7. Decisiones tomadas y descartadas

- **La regla de selección va en `.av-player`, no en una lista de elementos.** La
  alternativa era enumerar `.player-hud`, `.screen-signal`, `.screen-legend`,
  `.screen-stats`, `.crt-bottom` y `.crt-menu`. Se descartó porque esa lista hay
  que acordarse de ampliarla cada vez que el tubo gane una banda —y ya ha ganado
  tres en dos specs—, y porque en el reproductor no hay un solo texto que alguien
  quiera seleccionar.
- **No se cubren el nav ni el pie.** Se valoró marcar la ruta entera, pero eso
  obliga a una clase en el layout que sólo existe para una de las siete pantallas.
  El gesto que molesta ocurre sobre el tubo.
- **B rota, no hace otra cosa.** Se valoró darle la caída suave o una acción
  propia. Se descartó: la referencia de la SPEC 21 dice que la cara de una tecla
  nunca cuenta lo que hace, así que dos teclas con la misma acción es gratis de
  explicar —no hay nada que explicar—, mientras que una acción nueva obligaría a
  contarla en la leyenda, que en TETRIX está vacía a propósito.
- **B no repite.** `press(rotate, false)`, igual que ▲. Con repetición la pieza
  giraría sola mientras el pulgar descansa encima, que es justo la postura que
  este arreglo quiere permitir.
- **La leyenda se sincroniza, no se lee del motor.** La alternativa era que el
  bucle publicara banderas y minas por `onRun`, junto a los tres números del HUD.
  Se descartó: `EngineRun` es el contrato común a los cuatro motores y ampliarlo
  con dos campos que sólo usa BUSCAMINAS lo rompería. `syncLegend()` ya existe y
  ya tiene la guarda que evita el render de más.
- **Se arregla también `reveal`, no sólo `toggleFlag`.** El usuario reportó las
  banderas, pero el mismo camino deja la cuenta de minas obsoleta al subir de
  nivel. Arreglar uno y dejar el otro sería dejar el defecto a medias.

## 8. Riesgos identificados

- **`user-select: none` también impide copiar la puntuación con el ratón en
  escritorio.** Es la contrapartida de poner la regla en el contenedor. Se acepta
  —es una recreativa, no un documento— y queda escrito aquí para que no se
  descubra como sorpresa dentro de tres specs.
- **El `-webkit-touch-callout` es el que realmente cierra el menú de iOS**, y no
  es verificable en Playwright: la suite sólo puede comprobar `user-select`. Por
  eso el paso 1 de la verificación manual es en un móvil de verdad, o al menos en
  la emulación táctil del navegador, y no se da por bueno con las pruebas en verde.
- **TETRIX deja de ser un juego con teclas apagadas**, y era uno de los ejemplos
  de la regla de la SPEC 21 —la silueta es la misma en los cuatro y lo que un
  juego no usa se pinta atenuado—. La regla sigue viva: ASTEROIDES y ARKANOID
  conservan su B apagado, y ARKANOID además las tres del eje vertical.
  Comprobado: la prueba que la vigila
  (`las teclas que un juego no usa no tienen rol ni reciben foco`) se apoya en
  **ARKANOID**, no en TETRIX, así que no hay que moverla. Lo que sí cambia es que
  TETRIX pasa de cinco a seis `<button>` en el mando, por si alguna prueba futura
  cuenta teclas por juego.
