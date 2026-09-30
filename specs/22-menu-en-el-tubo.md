# SPEC 22 — El MENÚ dentro del tubo: el fin de partida sale del modal

**Estado:** Implementado
**Depende de:** SPEC 18 (`game-player.tsx` y el guardado real), SPEC 19 (pantalla completa en móvil), SPEC 21 (el mando y las cuatro bandas del tubo)
**Fecha:** 2026-09-30
**Objetivo:** Sacar el modal de fin de partida de encima de la página y pintarlo dentro de `.crt-screen`, igual que el cartel de `EN PAUSA`, convirtiéndolo además en un menú reanudable al que se llega por un botón que deja de llamarse `FIN` y pasa a llamarse `MENÚ` en el HUD y en el mando.

## 1. Punto de partida

### 1.1 Lo que hay hoy

El final de una partida vive en un modal a pantalla completa: `components/game-player.tsx:456-519` pinta
`.modal-bd` (`position: fixed; inset: 0; z-index: 80`) con `.modal` dentro, y su CSS ocupa
`app/globals.css:2084-2180`. Se abre por dos caminos:

| Camino                                         | Quién lo dispara                |
| ---------------------------------------------- | ------------------------------- |
| El botón `FIN` del HUD (`game-player.tsx:346`) | El jugador, cuando quiere       |
| El botón `FIN` del mando (`game-pad.tsx:164`)  | El jugador, en móvil (SPEC 21)  |
| `onOver()` del motor                           | El motor, al quedarse sin vidas |
| `recuperada` (vuelta de `/auth`)               | La partida que viaja en la URL  |

Los cuatro ponen el mismo estado, `over`, y `over` congela el motor (`paused={paused || over}`,
línea 385).

Esto choca con el resto del reproductor. Desde la SPEC 19 y la SPEC 21 **todo lo que el jugador toca
vive dentro del tubo o en el mando soldado debajo**: el cartel de `EN PAUSA` se pinta dentro de
`.crt-screen` como un `.crt-content` (líneas 411-433), las cuatro bandas —señal, leyenda, juego y
marcador— viven dentro del tubo, y el mando cierra el mueble por abajo. El modal es lo único que se
sale de la máquina y se come la página entera, y en pantalla completa de móvil el efecto es peor
todavía: el mueble desaparece bajo una caja que no se parece a nada de lo que hay alrededor.

Y hay un problema de nombre. `FIN` **mata la partida sin vuelta atrás**, y solo lo cuenta después de
pulsarlo. Quien lo pulsa esperando un menú pierde la partida.

### 1.2 Dos defectos concretos

1. **`.no-record` no está centrada** (`app/globals.css:2235`). Lleva `max-width: 34ch` con
   `margin: 22px 0 12px` —los márgenes laterales son `0`, no `auto`—, así que la línea
   «TU MEJOR MARCA EN X SIGUE SIENDO N» se pega al borde izquierdo del modal de 480px. En escritorio
   se ve; en móvil, con el modal a `96vw`, casi no.
2. **La ficha del jugador está repetida.** `.modal-player` pinta el nombre que el HUD ya muestra
   justo encima, en los dos viewports (en móvil el HUD se queda precisamente con el nombre y nada
   más, SPEC 21).

### 1.3 Lo que se quiere

Un solo panel, dentro del tubo, con dos estados:

```
┌──── el tubo ─────────┐   ┌──── el tubo ─────────┐
│        MENÚ          │   │    FIN DEL JUEGO     │
│   PUNTUACIÓN         │   │   PUNTUACIÓN         │
│     12.400           │   │     12.400           │
│  [ REINICIAR ]       │   │  [ GUARDAR PUNT. ]   │
│  [ SALIR ]           │   │  [ REINICIAR ]       │
│                      │   │  [ SALIR ]           │
└──────────────────────┘   └──────────────────────┘
  Pulsa MENÚ para cerrar      FIN DEL JUEGO
   (partida viva)            (partida terminada)
```

El botón que lo abre se llama `MENÚ`, es un interruptor que congela la partida **sin costarla** — pulsarlo de nuevo la devuelve entera. Por eso el panel no tiene `CONTINUAR` — la vuelta es automática. `SALIR` se movió al panel, no al HUD.

## 2. Alcance

**Dentro:**

- Panel nuevo dentro de `.crt-screen`, hermano del cartel de `EN PAUSA` y por encima de él,
  reemplazando por completo a `.modal-bd` / `.modal`.
- Estado `menu` nuevo en `components/game-player.tsx`, junto al `over` que ya existe. El panel se
  pinta con `menu || over`; el título y la lista de opciones los decide `over`.
- **`MENÚ` es un interruptor reanudable:** congela el motor como `PAUSA`, pero pulsarlo de nuevo
  devuelve la partida entera sin perder puntuación, vidas ni nivel. No hay botón `CONTINUAR` — la
  vuelta es automática. Por eso los dos estados del panel ofrecen solo `REINICIAR` y `SALIR`.
- **No se guarda con la partida viva.** La rama de guardado —y con ella `GUARDAR PUNTUACIÓN`, el
  aviso verde, el mensaje de error, la línea de «tu mejor marca» y la copia de invitado— se pinta
  **solo** con `over`. En el estado menú no hay guardado de ninguna clase.
- **Los nombres de las opciones:** `REINICIAR` (antes `JUGAR DE NUEVO`) y `SALIR` (antes
  `VOLVER AL VAULT`, ahora en el panel, no en el HUD).
- **`PAUSA` y `MENÚ` se excluyen:** abierto el panel, `PAUSA` se apaga y se pinta gris deshabilitado;
  en pausa, `MENÚ` se apaga igual. El que no toca se desactiva antes de pulsarlo, tanto en el HUD
  como en el mando.
- Renombrado de `FIN` a `MENÚ` **en todos los sitios**: el botón del HUD (`game-player.tsx:347`), la
  pastilla del mando y su `aria-label` (`game-pad.tsx:169-173`), la prop `onEnd` → `onMenu`, la clase
  CSS `.pad-end` → `.pad-menu`, los textos de `tests/screens.spec.ts` y la documentación.
- **`PAUSA` se queda** tal cual, en el HUD y en el mando, con su cartel de `EN PAUSA`. Sigue siendo
  el camino de un toque; `MENÚ` es el panel.
- Navegación con puntero, dedo y teclado: `<button>` de verdad, `Tab`/`Enter` gratis, `Esc` cierra
  **solo** el estado menú. El foco entra en la primera opción al abrir y vuelve al botón que lo abrió
  al cerrar.
- **El panel no se desplaza nunca.** Se quita la ficha del jugador y se reduce el título para que la
  rama más alta quepa en el tubo a 390px.
- La copia de invitado se reduce a una línea: «Inicia sesión para guardar esta puntuación.»
- La etiqueta `PUNTUACIÓN` del panel es más clara: `--ink-dim` en lugar de `--ink-faint`, sobre el
  negro del tubo.
- Arreglo del centrado de `.no-record` (`margin-inline: auto`).
- Los botones del panel —`GUARDAR PUNTUACIÓN`, `INICIAR SESIÓN PARA GUARDAR`, `REINICIAR`, `SALIR`—
  miden todos lo mismo (`min(260px, 100%)`), aunque sus rótulos difieran.
- Pantalla completa también en escritorio (no solo móvil): `⛶` vive en `.hud-actions` a la derecha
  de `MENÚ`, en los dos viewports. En pantalla completa, el tubo manda en altura y deduce su ancho
  del `aspect-ratio: 4 / 3`; el HUD y el `.crt-bottom` se quedan con lo suyo; nada desborda.
- El mando y todos los botones del reproductor no dejan seleccionar texto con el dedo: `user-select:
none`, `-webkit-user-select: none`, `-webkit-touch-callout: none` en `.game-pad` y `.btn`.
- Desempate determinista en `getGames()`: `.order("created_at").order("slug")` para que los tres
  primeros juegos —que comparten fecha de migración— vuelvan en orden consistente entre reconstrucciones
  de la base (SPEC 21 debt).
- Borrado del CSS muerto de `.modal*` y `.modal-bd`.
- Pruebas nuevas y actualizadas en `tests/screens.spec.ts`.
- Regeneración de **todas** las capturas de referencia: reproductor (renombrado), home/biblioteca/salon
  (orden del catálogo).
- Actualización de `references/started-games/games.md`, `CLAUDE.md` y el índice del `README.md`.

**Fuera de alcance (explícito):**

- **Navegar las opciones con la cruceta del mando.** Movería la selección con ▲/▼ y elegiría con `A`,
  pero obliga a desviar el `PadHandle` mientras el panel está abierto para que el motor no vea esas
  pulsaciones, y a mantener un índice de selección en `game-player.tsx`. Con el dedo encima de la
  pantalla, el botón se toca directamente. Si algún día el mando gobierna todo, es otra spec.
- Cualquier cambio en `save_score`, en `increment_game_plays` o en las reglas de los cuatro motores.
- Cualquier cambio en el contrato `EngineProps` / `PadHandle` / `PadLayout` / `ENGINES`. El panel es
  asunto de `game-player.tsx` y ningún motor se entera de que existe.
- Un menú de opciones de verdad (volumen, dificultad, controles). Aquí `MENÚ` es el nombre honesto de
  lo que el panel ya hace, no la promesa de ajustes que no existen.
- Guardar durante la partida, y guardar más de una vez. Se guarda al final, y una sola vez.
- Tocar el cartel de `EN PAUSA`, que se queda exactamente como está.

## 3. Modelo de datos

Ninguno. No hay tabla nueva, ni columna, ni migración, ni tipo nuevo exportado. Lo único que se añade
es un `useState<boolean>` (`menu`) en `GamePlayer`, efímero y con el mismo ciclo de vida que `over`.
El guardado sigue pasando por la RPC `save_score` de la SPEC 18, sin un solo cambio.

### 3.1 La máquina de estados del panel

| `menu`  | `over`  | Qué se ve                     | Guardado | Opciones              |
| ------- | ------- | ----------------------------- | -------- | --------------------- |
| `false` | `false` | Nada. Se juega.               | —        | —                     |
| `true`  | `false` | Panel, título `MENÚ`          | No       | `REINICIAR` · `SALIR` |
| —       | `true`  | Panel, título `FIN DEL JUEGO` | Sí       | `REINICIAR` · `SALIR` |

`over` manda: da igual cómo estuviera `menu`, si `over` es cierto el panel es el de fin de partida.
Transiciones:

- `MENÚ` (HUD o mando) → `menu = true`, `paused = false` (para que `EN PAUSA` no se pinte debajo).
  El otro botón se desactiva: `PAUSA` → `disabled`. Ambos se reactivarán al cerrar.
- `MENÚ` de nuevo (o `Esc`) → `menu = false`. `PAUSA` se reactiva.
- `PAUSA` → `paused = true`, `menu` no cambia. `MENÚ` → `disabled` para evitar que se abra el panel
  estando pausado (que lo pintaría encima de `EN PAUSA`).
- `onOver()` del motor → `over = true` (venga de donde venga `menu`). El panel cambia de título y
  monta la rama de guardado; se recalculan `CONTINUAR` (no existe con `over`) y los botones de
  guardado. `PAUSA` queda inerte (el motor ya está pausado).
- `restart()` → `menu = false`, `over = false`, `paused = false`, y todo lo demás como ya lo deja hoy.

`handleSave()` no toca ni `menu` ni `over`: cuando se puede guardar, `over` ya es cierto.

La rama de guardado —el escalón de cuatro que ya existe: `saved` → invitado → `isRecord` → sin récord—
**no cambia de lógica**. Cambia dónde se pinta y que ahora está colgada de `over`: el estado menú no
la monta.

## 4. Plan de implementación (ejecutado)

1. **`components/game-player.tsx` — estado e interruptor.** Añadir `const [menu, setMenu] = useState(false)`.
   `toggleMenu()` es un interruptor: abre el panel si está cerrado, lo cierra si está abierto,
   sin perder la partida. La prop del motor pasa a `paused={paused || over || menu}`. `restart()`
   limpia `menu` y `over`. Los refs guardan el botón que lo abrió para devolver el foco.
2. **Mismo archivo — HUD y mando.** `FIN` → `MENÚ`. El botón del HUD llama a `toggleMenu`. La prop
   `onEnd` → `onMenu`. Ambos se deshabilitan mutuamente: `disabled={paused || over}` en `MENÚ`,
   `disabled={panelOpen}` en `PAUSA`, donde `panelOpen = menu || over`.
3. **Mismo archivo — SALIR.** El botón `<Link>` de `SALIR` se quita del HUD; vive en el panel, en
   `.crt-menu-actions`.
4. **`components/game-pad.tsx`.** Segunda pastilla: `aria-label="MENÚ"`, rótulo `MENÚ`, clase
   `pad-menu`, prop `onMenu={toggleMenu}`. Props nuevas `pauseDisabled` / `menuDisabled` (booleanos)
   marcan cuál se apaga: el pad-slot que no toca lleva clase `is-disabled` y su tecla/rótulo se
   atenúan con opacidad.
5. **`components/game-player.tsx` — el panel.** Sustituir el bloque `.modal-bd` por `.crt-menu` dentro
   de `.crt-screen`, después del cartel `EN PAUSA` en el JSX (por encima en `z-index`). Estructura:
   - `<div className="crt-menu" role="dialog" aria-modal aria-labelledby="av-crt-menu">`
   - `<h2>` con `{over ? "FIN DEL JUEGO" : "MENÚ"}`
   - `.final-label` + `.final` (clases reutilizadas)
   - `.crt-menu-save` **solo con `{over && …}`**: guardado, invitado, récord, sin récord
   - `.crt-menu-actions`: botones según `over` → `!over && REINICIAR · SALIR` vs `over && REINICIAR · SALIR`
6. **Mismo archivo — navegación.** `useEffect` que cierra con `Escape` solo mientras `menu && !over`.
   Foco entra en primer botón al abrir; vuelve al opener (HUD o mando) al cerrar.
7. **Guardado colgado de `over`.** `handleSave()` no cambia. Cambio: su botón y la rama de guardado
   entera solo existen con `over`, así que no hay forma de guardar con partida viva.
8. **`app/globals.css` — panel.** `.crt-menu`: `position: absolute; inset: 0; z-index: 6` dentro de
   `.crt-screen`. Reutiliza `.final`, `.final-label`, `.toast-saved`, `.save-error`, `.no-record`,
   `.guest-save` bajo un bloque `.crt-menu`. Etiqueta `PUNTUACIÓN` en `--ink-dim` (más clara).
   `.crt-menu-save` y `.crt-menu-actions` con `width: 100%`; botones con `width: min(260px, 100%)`.
9. **Mismo — `.no-record` centrada.** `margin: 22px auto 12px`.
10. **Mismo — scale mobile.** `@media (max-width: 720px)` con tamaños explícitos: h2 10px, final 20px,
    opciones 28px, espacios 8px. Panel cabe en tubo de ~300px a 390px sin scroll.
11. **Mismo — desktop fullscreen.** `@media (min-width: 721px) .av-player:fullscreen`: el reproductor
    es una columna que mide exactamente la pantalla (height 100%, flex column); HUD toma lo suyo
    (`flex: 0 0 auto`); CRT toma el resto (`flex: 1 1 0, min-height: 0`) y deduce su ancho del
    `aspect-ratio: 4 / 3`; todo centrado.
12. **Mismo — sin seleccionar texto.** `.game-pad` y `.btn`: `user-select: none`,
    `-webkit-user-select: none`, `-webkit-touch-callout: none`, `-webkit-tap-highlight-color: transparent`.
13. **Mismo — limpieza.** Borrar `.modal-bd`, `.modal*`, `.modal-player*`. Renombrar `.pad-end`
    → `.pad-menu`. Cambiar `PAUSA`/`FIN` → `PAUSA`/`MENÚ` en comentarios y documentación del CSS.
14. **`lib/supabase/games.ts` — desempate.** `getGames()` pasa de `.order("created_at")` a
    `.order("created_at").order("slug")` para que los tres primeros juegos (mismo timestamp de
    migración) vuelvan en orden determinista entre reconstrucciones de la base.
15. **`tests/screens.spec.ts` — tests nuevos.** 7 pruebas:
    - Fin de partida real (perder en ARKANOID con helper `loseArkanoid()`)
    - MENÚ es interruptor: abre → cierra sin perder score
    - Panel sin guardado con partida viva
    - Esc cierra menú, no fin de partida
    - PAUSA y MENÚ se excluyen (visual feedback)
    - Panel cabe en tubo sin scroll (rama invitado más alta)
    - Botones del panel miden igual
16. **Capturas.** `npm run dev` + verificación manual → `--update-snapshots` para ambos proyectos:
    reproductor (renombrado), home/biblioteca/salon (orden del catálogo).
17. **Documentación.** Actualizar `references/started-games/games.md`, `CLAUDE.md` con las dos nuevas
    reglas: dentro del tubo, guardado solo con fin. Índice del `README.md`: fila SPEC 22 con deps.
18. **Cierre:** `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`.

## 5. Criterios de aceptación

- [ ] No queda ni un `FIN` visible en la interfaz: ni en `.hud-actions`, ni en el rótulo de la
      pastilla del mando, ni en su `aria-label`. El botón se llama `MENÚ` en los dos viewports.
- [ ] `.modal-bd` y `.modal` no existen en el DOM de `/jugar/[id]` en ningún estado, y su CSS no está
      en `app/globals.css`.
- [ ] Pulsar `MENÚ` durante una partida congela el motor y pinta el panel **dentro de `.crt-screen`**
      (`.crt-screen .crt-menu` existe; `.crt-menu` no es hijo de `.av-player` ni de `body`).
- [ ] El panel en estado menú ofrece `CONTINUAR`, `REINICIAR` y `SALIR`; `CONTINUAR` devuelve la
      partida con la puntuación, las vidas y el nivel intactos.
- [ ] El panel en estado menú **no ofrece ninguna forma de guardar**: ni `GUARDAR PUNTUACIÓN`, ni
      aviso, ni línea de «tu mejor marca», ni copia de invitado. Solo aparecen con la partida
      terminada.
- [ ] `Esc` cierra el estado menú y **no** cierra el estado fin de partida.
- [ ] `PAUSA` sigue existiendo en el HUD (escritorio) y en el mando (móvil), y sigue pintando el
      cartel de `EN PAUSA`. Abrir `MENÚ` estando en pausa no deja los dos carteles superpuestos.
- [ ] Quedarse sin vidas abre el mismo panel con el título `FIN DEL JUEGO`, sin `CONTINUAR` y con
      la rama de guardado.
- [ ] Con una puntuación que es récord, `GUARDAR PUNTUACIÓN` muestra el aviso verde de nueva marca y
      el botón desaparece: una partida, un guardado.
- [ ] Con una puntuación que no es récord, la línea «TU MEJOR MARCA EN … SIGUE SIENDO N» se ve
      **centrada** en escritorio.
- [ ] Como invitado, el panel muestra una sola línea de texto más `INICIAR SESIÓN PARA GUARDAR`, y ese
      botón sigue llevando a `/auth?next=…` con la puntuación y el nivel en la URL. Volver de `/auth`
      reabre el panel en estado **fin de partida**.
- [ ] La ficha `.modal-player` ya no existe; el nombre del jugador sigue visible en el HUD en los dos
      viewports.
- [ ] A 390 × 844 el panel cabe en el tubo **sin desplazamiento** en el estado menú y en las cuatro
      ramas de guardado del fin de partida (guardado, invitado, récord, sin récord), tanto en modo
      normal como en pantalla completa.
- [ ] El espacio de juego sigue midiendo `4 / 3` en los cuatro juegos: el panel no cambia la altura de
      ninguna banda.
- [ ] `reproductor-desktop-darwin.png` y `reproductor-mobile-darwin.png` se regeneran; las otras doce
      capturas no cambian.
- [ ] `npm run build`, `npx tsc --noEmit`, `npm run lint` y `npm test` pasan.

## 6. Verificación manual

Con el stack local arriba (`npx supabase start`) y `npm run dev`:

1. **Escritorio, 1440 × 900, con sesión real.** `/jugar/tetrix`: puntuar algo, pulsar `MENÚ`, ver el
   panel dentro del tubo **sin nada de guardado**, pulsar `CONTINUAR`, comprobar que la puntuación no
   se ha perdido. Repetir y cerrar con `Esc`. Pulsar `PAUSA` y comprobar que `EN PAUSA` sigue
   apareciendo igual que siempre.
2. **El récord.** Con la misma sesión, terminar una partida y `GUARDAR PUNTUACIÓN`: aviso verde y el
   botón fuera. Jugar otra partida peor y terminarla: la línea de «tu mejor marca» tiene que verse
   **centrada**.
3. **Fin de partida real.** Perder todas las vidas en `ARKANOID` (o `ASTEROIDES`) y comprobar el
   título `FIN DEL JUEGO` sin `CONTINUAR`.
4. **Invitado.** Entrar con `JUGAR COMO INVITADO`, puntuar, terminar la partida, seguir el botón de
   sesión hasta `/auth` y volver: el panel reaparece en fin de partida con la puntuación.
5. **Móvil, 390 × 844.** La pastilla del mando dice `MENÚ`. Abrir el panel en los cuatro juegos, en
   el estado menú y en las cuatro ramas de guardado del fin de partida, y confirmar que **nunca
   aparece una barra de desplazamiento** dentro del tubo. Repetir con `⛶` activado.
6. Solo después de esto, regenerar las capturas:
   `npx playwright test --project=desktop --update-snapshots` y lo mismo con `--project=mobile`.

## 7. Decisiones tomadas y descartadas

- **`MENÚ` es reanudable, no un `FIN` con otro nombre.** Un botón que se llama menú y mata la partida
  es una trampa peor que uno que se llama `FIN` y la mata. Se descartó conservar el comportamiento
  actual bajo el nombre nuevo.
- **Un solo panel con dos estados, no dos componentes.** El fin de partida real y el menú comparten
  título, puntuación y dos de sus tres opciones; el guardado es lo único que los separa. Mantener dos
  componentes era la alternativa, y se descartó: duplicaba la maquetación del panel para una
  diferencia que es un `{over && …}`.
- **`PAUSA` se queda.** Se valoró que `MENÚ` absorbiera la pausa, pero congelar la partida pasaría de
  un toque a dos, y el mando perdería una de sus dos pastillas —la silueta de la SPEC 21 es común a
  los cuatro juegos y no se toca por comodidad—.
- **No se guarda con la partida viva.** La alternativa —guardar desde el menú y seguir jugando— es
  inocua en el servidor (`save_score` solo inserta si es récord), pero hace que «mi récord» y «mi
  partida» dejen de ser lo mismo: se guardaría una puntuación intermedia de una partida que después
  sigue subiendo. También se descartó la versión intermedia —guardar desde el menú y que eso diera la
  partida por terminada—, porque convierte una opción del menú en una trampa igual que el `FIN`
  viejo. Se guarda cuando la partida ha terminado, y una sola vez.
- **Se quita la ficha del jugador del panel.** El nombre ya está en el HUD en los dos viewports, y en
  móvil el HUD se quedó precisamente con él (SPEC 21). Era la línea más fácil de sacrificar para que
  el panel quepa sin desplazamiento.
- **El panel no se desplaza nunca.** Un panel de fin de partida con scroll dentro de un tubo de CRT no
  se parece a ninguna máquina recreativa. El precio es que cualquier línea que se añada en el futuro
  obliga a volver a medir a 390px, y eso queda anotado como riesgo.
- **Sin navegación por cruceta.** Descartada por lo que cuesta: desviar el `PadHandle` mientras el
  panel está abierto y llevar un índice de selección, para una pantalla táctil en la que el dedo ya
  toca el botón directamente.
- **Se reutilizan `.final`, `.final-label`, `.toast-saved`, `.save-error`, `.no-record` y
  `.guest-save`.** Son las clases que ya describen esos contenidos y las que las pruebas leen; lo que
  muere es el contenedor, no el contenido.
- **`role="dialog" aria-modal="true"` se conserva.** El panel congela la partida y es lo único con lo
  que se puede interactuar mientras está abierto: sigue siendo un diálogo modal aunque ya no flote
  sobre la página. Además mantiene vivas las pruebas que lo localizan por rol.

## 8. Riesgos identificados

- **El espacio a 390px es el riesgo principal.** La rama de invitado en fin de partida son siete
  elementos apilados en unos 300px de tubo. Si no entra con la escala de la tabla del paso 11, lo
  primero que cede es el tamaño de `.final`, y después la etiqueta `PUNTUACIÓN`; lo último que se
  toca es el alto de las opciones, que es lo que las hace tocables con el dedo (mínimo 28px).
- **Las teclas del motor durante el panel.** Comprobado: los cuatro motores cortan todas sus entradas
  con `if (… paused …) return` (`tetris-game.tsx:279,330`, `asteroids-game.tsx:377`,
  `arkanoid-game.tsx:284,328,340,364`, `buscaminas-game.tsx:319,424,489,501`), así que con
  `paused || over || menu` el teclado queda inerte solo. Si un motor futuro se saltara esa regla, el
  panel se volvería atravesable.
- **Las dos capturas a la vez.** El proyecto pide regenerar solo el proyecto afectado, precisamente
  para que una regresión no se convierta en la referencia nueva. Aquí los dos están afectados de
  verdad, y por eso el paso 17 va después de la verificación manual completa, no antes.
- **`Esc` y la pantalla completa.** En móvil con `⛶` activo, `Esc` (teclado conectado) sale de la
  pantalla completa **y** podría cerrar el menú en el mismo gesto. No es grave —el jugador quería
  salir de algo—, pero conviene comprobar que la partida no se pierde en esa combinación.
