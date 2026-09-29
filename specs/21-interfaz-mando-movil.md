# SPEC 21 — Mando de consola en móvil: los controles salen del CRT

> **Estado:** Implementado
> **Depende de:** SPEC 12, SPEC 13, SPEC 14, SPEC 15, SPEC 19, SPEC 20
> **Fecha:** 2026-09-29
> **Objetivo:** En móvil (≤ 720px) sacar los mandos de los cuatro motores fuera del espacio de juego y sustituirlos por un mando de consola único, soldado al mismo mueble bajo el tubo, y reorganizar el tubo en bandas —señal, leyenda, juego y marcador— de forma que el espacio de juego mida exactamente lo mismo en los cuatro y el HUD de arriba se quede solo con el nombre del jugador.
>
> **Este documento describe lo que se construyó, no lo que se propuso.** El dibujo del mando y el reparto del tubo cambiaron varias veces durante la implementación, sobre una foto de referencia de consola portátil; la sección 8 recoge en qué se apartó del diseño aprobado y por qué.

---

## 1. Punto de partida

### 1.1 Lo que hay hoy

Los cuatro motores pintan sus propios mandos **dentro** de `.crt-screen`, en su propio JSX:

| Motor        | Mandos dentro del tubo                                                   | Dónde                                    |
| ------------ | ------------------------------------------------------------------------ | ---------------------------------------- |
| `TETRIX`     | `.tetris-side`: cruceta (↻ ← ↓ →), `▼▼` y la vista de `SIGUIENTE`        | `components/tetris-game.tsx:391-445`     |
| `ASTEROIDES` | `.rocks-side`: cruceta (▲ ◀ ▶), `◉ FUEGO` y la leyenda `TRIPLE`/`ESCUDO` | `components/asteroids-game.tsx:468-518`  |
| `ARKANOID`   | `.ark-pad`: `←`, `LANZAR`, `→` en una fila bajo el tablero               | `components/arkanoid-game.tsx:369-392`   |
| `BUSCAMINAS` | `.minas-side`: cruceta (▲ ◀ ▼ ▶), `␣ REVELAR` y `⚑ MARCAR`               | `components/buscaminas-game.tsx:493-547` |

Para hacerles sitio en móvil, tres de los cuatro fuerzan la pantalla a vertical bajo `@media (max-width: 720px)`: `.crt-screen.tetris`, `.crt-screen.rocks` y `.crt-screen.minas` pasan de `4 / 3` a `3 / 4` (`app/globals.css:1411`, `:1567`, `:1697`). Solo `TETRIX` lo necesita de verdad —su tablero es 10 × 20—; `ASTEROIDES` (800 × 600) y `BUSCAMINAS` (576 × 432) son **exactamente 4 : 3** y hoy se quedan con una fracción del tubo únicamente porque el mando les roba sitio.

A eso se suma el relleno: `.av-player` pone 16px por lado en móvil (`app/globals.css:2280-2282`), `.crt` otros 24px (`:1224`) y `.crt-screen` un radio de 28px. A 390px de ancho el lienzo real se queda en ~310px.

Arriba, `.hud-actions` lleva `PAUSA` / `FIN` / `SALIR`, y el botón de pantalla completa de la SPEC 19 flota sobre el CRT (`.crt .fullscreen-toggle`, `app/globals.css:1205-1213`) precisamente para no competir por sitio con esos tres a 390px. La regla `.av-player:fullscreen .hud-actions { display: none }` (`:1216`) los oculta en pantalla completa, dejando el botón flotante como única salida.

### 1.2 Lo que se quiere

La metáfora de una consola portátil, **solo en móvil**: el tubo arriba con todo lo que da, y soldado a él
—mismo cuerpo, mismo negro, sin franja ni junta entre los dos— un mando físico que cierra el mueble por
abajo. El mando es **el mismo para los cuatro juegos**: cambia lo que hace cada tecla, no la silueta. Y
tiene que **parecer físico**: cada tecla lleva relieve —cara maciza, canto inferior y sombra propia— y
responde al pulsarla con un hundimiento y un destello.

Dentro del tubo, el espacio de juego deja de depender del juego: **los cuatro miden lo mismo a la misma
resolución**, y lo que antes rodeaba al lienzo —la señal, la leyenda de objetos, los números del HUD—
pasa a ocupar bandas reservadas propias, por encima y por debajo de ese espacio.

## 2. Alcance

**Dentro:**

- Componente nuevo `components/game-pad.tsx` (`"use client"`) con el mando completo: marca, cruceta de
  cuatro brazos, dos botones de acción en diagonal y dos pastillas en horizontal. Ninguna tecla lleva
  nada escrito dentro; el nombre va **debajo**, en su propio rótulo.
- Contrato nuevo en `components/game-player.tsx`: `PadAction`, `PadHandle`, `PadLayout`; `EngineProps`
  gana `padRef`; el registro `ENGINES` gana una `pad` por juego.
- `useImperativeHandle` en los cuatro `components/*-game.tsx`, mapeando cada `PadAction` a las funciones
  de entrada que cada motor **ya tiene**.
- Cuatro bandas dentro de `.crt-screen` en móvil: `.screen-signal`, `.screen-legend`, el escenario del
  juego y `.screen-stats`. La leyenda la pinta cada motor; la señal y el marcador, `game-player.tsx`.
- **El espacio de juego, idéntico en los cuatro**: `aspect-ratio: 4 / 3` en el escenario, no en
  `.crt-screen`. `TETRIX` pierde el `3 / 4` que tenía para él solo.
- HUD móvil reducido al nombre del jugador más `⛶` y `SALIR`; `PAUSA`, `FIN` y los tres números se van
  abajo.
- Tokens de color en `app/globals.css`: `--violet` y `--amber` ascienden al bloque de acentos como alias
  de hexadecimales que el tema ya repetía, y `--red` entra como color nuevo.
- Receta compartida de relieve y pulsación (`.pad-key`), con variante maciza para las tres familias.
- Eliminar `.av-player:fullscreen .hud-actions { display: none }` (SPEC 19) y bajar `⛶` a `.hud-actions`.
- Recaptura de `public/juegos/tetrix.png` y `public/juegos/buscaminas.png`: solo el lienzo, sin mandos.
- Tests nuevos en `tests/screens.spec.ts` y regeneración de las capturas afectadas.
- Documentar el contrato en `references/started-games/games.md` y la fila de la SPEC 21 en `README.md`.

**Fuera de alcance (explícito):**

- **Tablet y escritorio (> 720px): ni un cambio en el reproductor.** Los mandos internos de los cuatro
  motores siguen exactamente donde están, la `.crt-bottom` de dentro de `.crt` sigue con sus tres textos,
  las cuatro bandas nuevas están en `display: none` y `reproductor-desktop-darwin.png` **no se
  regeneró** — comprobado al cierre. Que siga intacta es la prueba de que el cambio no se filtró.
- `lib/tetris.ts`, `lib/asteroids.ts`, `lib/arkanoid.ts` y `lib/buscaminas.ts` no se tocan: los motores
  puros no se enteran de esta spec.
- Nada de Supabase: ni migración, ni tipos regenerados, ni columna nueva.
- Nada de vibración háptica, Gamepad API para mandos físicos, ni bloqueo de orientación.
- El HUD no cambia de **contenido**: `Jugador · Puntuación · Vidas · Nivel` siguen siendo los mismos
  cuatro datos. Lo que cambia con el viewport es dónde se leen, nunca cuáles son.
- El overlay `EN PAUSA` y el modal `FIN DEL JUEGO` no se rediseñan.
- `public/juegos/arkanoid.png` y `public/juegos/asteroides.png` no se tocan: ya son lienzo puro.
- No se añade un quinto juego ni se toca el registro más allá de la columna `pad`.

**Entró en la rama sin estar en el alcance original**, por pedirse durante la implementación:

- La lupa de la barra de búsqueda de `/biblioteca` (`.av-search .ico`): estaba a 11px y en `--pixel`, que
  **no trae el glifo `⌕`** y caía en la tipografía de respaldo. Pasa a `--mono` a 24px. Afecta a
  escritorio y a móvil, y por eso `biblioteca-desktop-darwin.png` también se regeneró.

## 3. Modelo de datos

No hay datos persistidos: todo es contrato de componente. Tres tipos en `components/game-player.tsx`:

```ts
/** Las seis entradas físicas del mando. Nada más: si un juego necesita una
    séptima, el mando deja de ser común y eso es otra spec. */
export type PadAction = "up" | "down" | "left" | "right" | "a" | "b";

/** Lo que un motor expone hacia arriba para que el mando lo pulse. Mismo
    camino que un teclado: pulsar y soltar, nunca "hacer la acción". */
export type PadHandle = {
  press: (action: PadAction) => void;
  release: (action: PadAction) => void;
};

/** El esquema de un juego. Declarativo y estático: vive en ENGINES, no en el
    motor. Son solo nombres: ninguna tecla pinta nada en su cara, así que aquí
    no hay glifos — cada entrada es el `aria-label` de su tecla y nada más. */
export type PadLayout = {
  dpad: Partial<Record<"up" | "down" | "left" | "right", string>>;
  buttons: [string | null, string | null]; // A y B; null = presente pero inerte
};
```

`EngineProps` gana `padRef: Ref<PadHandle>` y `ENGINES` pasa de `{ Component, screen }` a
`{ Component, screen, pad }`.

### 3.1 Esquema por juego

| Juego        | ↑             | ↓            | ←           | →           | A (arriba-dcha.)  | B (abajo-izq.) |
| ------------ | ------------- | ------------ | ----------- | ----------- | ----------------- | -------------- |
| `TETRIX`     | rotar         | bajar rápido | mover izq.  | mover der.  | caída instantánea | — (inerte)     |
| `ASTEROIDES` | empuje        | — (inerte)   | girar izq.  | girar der.  | disparar          | — (inerte)     |
| `ARKANOID`   | — (inerte)    | — (inerte)   | pala izq.   | pala der.   | lanzar la bola    | — (inerte)     |
| `BUSCAMINAS` | cursor arriba | cursor abajo | cursor izq. | cursor der. | revelar           | marcar         |

Las direcciones y el botón que un juego no usa **se pintan igualmente**, atenuados, como `<span>` con
`pointer-events: none` y `aria-hidden="true"`: ni rol, ni foco, ni puntero. La silueta es la misma en los
cuatro.

## 4. Lo que se construyó

### 4.1 El mando (`components/game-pad.tsx`)

Tres filas, siguiendo la consola de referencia:

1. **La marca.** `ARCADE VAULT` con el mismo rombo, tipografía y neón del encabezado. Decorativa
   (`aria-hidden`): el nombre del sitio ya lo anuncia el Nav.
2. **Los controles.** Cruceta a la izquierda; a la derecha, los dos botones de acción en diagonal —`B`
   abajo-izquierda, `A` arriba-derecha—, cada uno con su rótulo debajo.
3. **`PAUSA` y `FIN`**, abajo del todo, centradas y en horizontal, donde la consola pone `SELECT`/`START`,
   también con el rótulo debajo.

Cuatro reglas lo gobiernan:

- **El motor recibe `press`/`release`, nunca una acción de alto nivel.** Que `←` se repita mientras se
  mantiene es asunto del motor, que ya lo resuelve.
- **El esquema vive en `ENGINES`, no en el motor.** Los cuatro se leen juntos en veinte líneas.
- **Ninguna tecla dice lo que hace.** La cara de un botón de acción está lisa; sus flechas las dibuja el
  CSS (`.pad-arm::before`), no el JSX, de modo que el mando no tiene ni un nodo de texto en la cruceta ni
  dentro de ningún botón. Lo escrito son la marca y los cuatro rótulos. Para un lector de pantalla el
  nombre es el `aria-label`, y el rótulo de debajo es `aria-hidden`.
- **Lo que un juego no usa se pinta igual**, apagado e inerte.

El nombre accesible de las pastillas es el mismo que su rótulo visible (`PAUSA`/`REANUDAR`, `FIN`): quien
lo oye y quien lo lee usan la misma palabra.

### 4.2 Los motores

Cada `components/*-game.tsx` publica su `PadHandle` con `useImperativeHandle` y **lo enruta por el camino
de entrada que ya tenía**, sin lógica nueva: `press`/`stopRepeat` en `tetris-game.tsx`, `setFlag` en
`asteroids-game.tsx`, `heldRef` + `serve()` en `arkanoid-game.tsx`, `markDown`/`markUp` en
`buscaminas-game.tsx`. Eso es también lo que protege una pulsación que llegue antes de que exista el
bucle: las guardas que ya había la cubren.

`BUSCAMINAS` es el único que saca estado a React además del HUD: un `useState` con las banderas puestas y
las minas del nivel, sincronizado desde `act()` con un comparador que devuelve `prev` cuando nada cambia,
así que llamarlo tras cada acción no cuesta un repintado de más.

### 4.3 Las cuatro bandas del tubo

A ≤ 720px `.crt-screen` deja de ser una caja `4 / 3` y pasa a ser una columna de cuatro:

| Banda            | Quién la pinta    | Qué lleva                                                            |
| ---------------- | ----------------- | -------------------------------------------------------------------- |
| `.screen-signal` | `game-player.tsx` | LED verde + `SEÑAL OK` a la izquierda, título del juego a la derecha |
| `.screen-legend` | **cada motor**    | contenido propio; el hueco lo reservan los cuatro por igual          |
| escenario        | el motor          | **`aspect-ratio: 4 / 3`, el mismo en los cuatro**                    |
| `.screen-stats`  | `game-player.tsx` | `PTS`, `VIDAS` y `NIVEL`, con los colores del HUD                    |

La leyenda la pinta el motor porque su contenido es estado del juego y solo él lo conoce:

- `BUSCAMINAS` — banderas puestas sobre las disponibles (que son tantas como minas) y el total de minas.
- `ASTEROIDES` — `TRIPLE` y `ESCUDO`, los dos objetos que suelta.
- `TETRIX` y `ARKANOID` — no tienen nada que explicar: muestran el rótulo `LEYENDA` centrado.

**Dos declaraciones son estructurales en el escenario: `min-height: 0` y `overflow: hidden`.** Sin ellas
el tablero 10 × 20 de `TETRIX` estira su propia banda y el `4 / 3` deja de valer en silencio.

### 4.4 El mueble y el HUD

`.crt` pierde su radio y su anillo inferiores a ≤ 720px (`clip-path`) y el mando recoge los dos, así que
entre ambos **no queda junta** y es el mando quien cierra el mueble por abajo. La `.crt-bottom` de dentro
de `.crt` se oculta y **no hay ninguna franja bajo el mando**: `.crt-bottom-mobile` no existe.

El HUD móvil se queda con el nombre del jugador y, en la otra punta de la fila, `⛶` y `SALIR`. `⛶` baja
de su posición flotante sobre el CRT, y se elimina `.av-player:fullscreen .hud-actions { display: none }`
de la SPEC 19: ocultar el HUD escondería ahora también `SALIR`.

### 4.5 Los colores

| Pieza             | Color                                                     |
| ----------------- | --------------------------------------------------------- |
| Cruceta           | `--cyan`                                                  |
| Botones `A` y `B` | `--magenta` — el mismo con el que el logo escribe `VAULT` |
| `PAUSA` y `FIN`   | `--ink`, el blanco del tema                               |

Las dos pastillas comparten color a propósito: lo que las distingue es su rótulo. `--violet` y `--amber`
ascendieron a acentos con nombre por el camino y **ninguno está hoy en el mando**; los dos ya estaban en
el tema tres veces cada uno (`--piece-j`/`--brick-violet`/`--rock-rock` y
`--piece-z`/`--brick-amber`/`--rock-flame`), así que nombrarlos no movió un píxel de las piezas, los
ladrillos ni las rocas. `--red` (`#ff2f45`) es el único color de verdad nuevo, y le queda **un solo uso**:
el glifo de la mina en la leyenda de `BUSCAMINAS`, que en magenta se confundiría con la bandera.

### 4.6 Medidas reales a 390 × 844

| Pieza                | Medida                                       |
| -------------------- | -------------------------------------------- |
| Espacio de juego     | **370 × 278 px, ratio 1,333, en los cuatro** |
| HUD                  | 73 px (eran 197 con los cuatro datos)        |
| Reproductor completo | 860 px                                       |
| Junta tubo-mando     | 0 px                                         |

## 5. Criterios de aceptación

- [x] A 390 × 844, en los cuatro juegos, `.crt-screen` no muestra ni un solo `<button>` visible.
- [x] El mando aparece soldado bajo el CRT —sin franja, sin junta y sin separación visible— y con la
      misma silueta en los cuatro juegos.
- [x] `PAUSA`/`REANUDAR` y `FIN` hacen exactamente lo mismo que hacían en el HUD.
- [x] Ninguna tecla lleva nada escrito dentro; lo escrito son la marca y los cuatro rótulos de debajo.
      `TRIPLE`/`ESCUDO` no aparece en el mando: vive en la leyenda, dentro del tubo.
- [x] Cada tecla tiene relieve en reposo y responde con hundimiento y destello; con
      `prefers-reduced-motion: reduce` la pulsación se sigue notando, sin animación.
- [x] A 390 × 844 `.hud-actions` contiene exactamente dos controles: `⛶` y `SALIR`, y el HUD muestra un
      solo dato: el nombre del jugador.
- [x] En pantalla completa a ≤ 720px se ven HUD, CRT y mando a la vez.
- [x] Las direcciones y el botón que un juego no usa se pintan atenuados, no reciben foco y no aparecen
      en el árbol de accesibilidad.
- [x] **El espacio de juego mide lo mismo en los cuatro juegos**, con la proporción en el escenario y no
      en `.crt-screen`.
- [x] La señal va dentro del tubo, como primera banda, con su LED verde; no queda ninguna franja bajo el
      mando.
- [x] Los cuatro juegos reservan banda de leyenda, con contenido propio o con el rótulo `LEYENDA`.
- [x] Los tres números viven bajo el juego, con los colores del HUD, y `.screen-stats` es el último hijo
      de `.crt-screen`.
- [x] `public/juegos/tetrix.png` y `buscaminas.png` muestran solo el lienzo; `arkanoid.png` y
      `asteroides.png` siguen siendo los mismos ficheros.
- [x] Las piezas de `TETRIX`, los ladrillos de `ARKANOID` y las rocas de `ASTEROIDES` se ven igual que
      antes de introducir `--violet` y `--amber`.
- [x] Se puede jugar una partida completa de cada uno de los cuatro juegos usando solo el mando.
- [x] En `ARKANOID` se sigue pudiendo arrastrar la pala, y en `BUSCAMINAS` tocar una celda directamente.
- [x] A 1440 × 900 el reproductor no cambia y `reproductor-desktop-darwin.png` no se regeneró.
- [x] `npm run build`, `npx tsc --noEmit` y `npm run lint` pasan.
- [ ] `npm test` pasa — **no se cumple, por causas anteriores a esta spec.** Ver §9.

## 6. Decisiones tomadas y descartadas

- **Sí: `max-width: 720px` como corte de "móvil".** Es el que ya usan las media queries de los motores, y
  deja fuera el iPad vertical. Descartado `pointer: coarse`, que activaría el mando en tablets con
  teclado y en portátiles táctiles.
- **Sí: los mandos internos se ocultan con CSS, no se desmontan con JavaScript.** Un `matchMedia` añadiría
  una segunda fuente de verdad sobre qué es "móvil" y el riesgo de desajuste de hidratación que la SPEC 19
  ya tuvo que resolver. El precio es DOM duplicado; a cambio, escritorio no se toca y Playwright no ve lo
  que está en `display: none`.
- **Sí: el esquema (`PadLayout`) vive en `ENGINES`, no dentro de cada motor.**
- **Sí: el motor expone `press`/`release`, no acciones de alto nivel.** Un mando físico pulsa y suelta.
- **Sí: cruz completa y dos botones siempre, con los no usados apagados e inertes.** Descartado ocultar
  los que no se usan, que deformaría la cruz de `ARKANOID` a dos brazos.
- **Sí: la leyenda la pinta cada motor.** Su contenido es estado del juego —las banderas de `BUSCAMINAS`
  cambian con cada marca— y el motor es el único que lo conoce. Descartado hacerla pasar por `onRun`, que
  habría metido datos de un solo juego en un contrato común a los cuatro.
- **Sí: la proporción se muda de `.crt-screen` al escenario.** Es lo único que hace que los cuatro juegos
  midan igual, que era el requisito. `TETRIX` paga el precio en tamaño de celda (§7).
- **Sí: `--violet` y `--amber` como acentos con nombre.** Los dos hexadecimales ya estaban tres veces cada
  uno: ascenderlos es ponerle nombre a algo que el tema ya usaba, no inventar un color.
- **Sí: los controles táctiles sobre el canvas se mantienen.** Arrastrar la pala es el control más preciso
  de `ARKANOID` y tocar la celda es el gesto natural de `BUSCAMINAS`. El mando es una vía más.
- **No: vibración háptica al pulsar.** La Vibration API no existe en iOS Safari; funcionaría en la mitad
  de los móviles. El destello y el hundimiento sí funcionan en todos.

## 7. Riesgos, los que se materializaron

- **`TETRIX` juega más pequeño.** Al uniformar el espacio de juego a `4 / 3`, su celda baja de ~18,6px a
  ~13px. Es el precio explícito de que los cuatro midan igual. Si resulta incómodo, la palanca es **subir
  la proporción común** (a `1 / 1` o `5 / 4`, para todos), no devolverle el `3 / 4` a él solo.
- **El reproductor mide 860px de alto a 390 × 844**, así que desplaza un poco. Las cuatro bandas, la marca
  y los rótulos suman; el HUD reducido devolvió 124px de los que se habían gastado.
- **DOM duplicado.** Cada partida en móvil lleva en el árbol los mandos internos del motor en
  `display: none`. Son botones sin listeners activos, pero conviene no dejar que crezca.
- **`--red` con un solo uso.** Entró para los botones de acción, que acabaron en magenta. Hoy solo pinta
  el glifo de la mina. Si molesta, se quita pasando la mina a otro acento.

## 8. En qué se apartó del diseño aprobado

El documento aprobado describía un mando distinto. Lo que cambió, y por qué:

| Aprobado                                             | Construido                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Pastillas inclinadas `-14°` entre cruceta y botones  | Pastillas horizontales, centradas **abajo del todo** (sitio de SELECT/START) |
| Glifo en la cara de cada botón (`▼▼`, `◉`, `␣`, `⚑`) | Caras lisas; el nombre va **debajo** de la tecla                             |
| Botones en fila, ambos a la misma altura             | En diagonal: `B` abajo-izquierda, `A` arriba-derecha                         |
| `FIN` en `--violet`, `PAUSA` en `--yellow`           | Las dos pastillas en `--ink`; los botones de acción en `--magenta`           |
| Sin marca en el mando                                | `ARCADE VAULT` arriba, como la consola de referencia                         |
| Franja `SEÑAL OK` **debajo** del mando               | Banda de señal **dentro del tubo**, encima del juego                         |
| Sin banda de leyenda; `TRIPLE`/`ESCUDO` eliminados   | Banda de leyenda reservada en los cuatro; `ASTEROIDES` la recupera           |
| `TETRIX` conserva `3 / 4`                            | Los cuatro en `4 / 3`: el espacio de juego es el mismo                       |
| HUD móvil con nombre, puntuación, vidas y nivel      | HUD móvil solo con el nombre; los tres números bajan a su banda              |

El `PadLayout` se simplificó en consecuencia: al no pintarse glifos, el tipo `PadButton` desapareció y
`buttons` pasó a ser `[string | null, string | null]` — solo los `aria-label`.

Además, durante la implementación se ajustaron a mano tres espaciados del mando (`.game-pad`,
`.pad-brand`, `.pad-mid`) y el fondo de los lienzos. **Son deliberados: no revertirlos.**

## 9. Estado de las pruebas al cierre

`npm run build`, `npx tsc --noEmit` y `npm run lint` pasan. `npm test` deja **148 pasando y 7 fallando**,
y los siete son **anteriores a esta spec**: se reprodujeron sobre `main` limpio antes de empezar.

- **Cinco** salen de que el catálogo no tiene un orden determinista: `getGames()` ordena por `created_at`
  y los tres primeros juegos comparten timestamp. Diagnóstico completo y evidencia en la sección «Deuda
  conocida» del `README.md`. Son `home › el carril enlaza al detalle`, las capturas `home` y `biblioteca`
  en `mobile`, y las dos de `salón de la fama`.
- **Dos** son el registro por correo, que termina en `/auth?error=confirm`. Sin diagnosticar, también
  anotado en `README.md`.

Lo que sí se hizo en esta spec:

- El bloque `mando de consola en móvil` y su espejo `el reproductor de escritorio no se entera del mando`
  pasan enteros, incluidos los dos tests nuevos de leyenda y marcador.
- Un test propio salió intermitente —comparaba medidas redondeadas y el alto real es 277,5— y se corrigió
  a comparar en crudo con un píxel de margen.
- Se regeneraron **seis** capturas: `reproductor-mobile`, `biblioteca` (los dos proyectos, por la lupa),
  `detalle` (los dos, por las portadas nuevas) y `home-mobile`. `reproductor-desktop-darwin.png` no se
  tocó, que era la garantía de esta spec.
