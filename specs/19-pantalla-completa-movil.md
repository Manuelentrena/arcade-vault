# SPEC 19 — Pantalla completa en el reproductor, solo en móvil

**Estado:** Implementado
**Depende de:** SPEC 12 (correcciones responsive en móvil), SPEC 13/14/15 (motores reales), SPEC 18 (`game-player.tsx` como está hoy)
**Fecha:** 2026-09-27
**Objetivo:** Añadir un botón, visible solo en móvil (≤720px), que active la Fullscreen API real sobre todo el reproductor (`.av-player`) para que jugar en el móvil no compita con la barra del navegador.

## Alcance

**Dentro:**

- Nuevo botón icono en `.hud-actions` de `components/game-player.tsx`, junto a `PAUSA`/`FIN`/`SALIR`, visible solo por debajo de 720px (mismo breakpoint que el resto del proyecto, `app/globals.css`), siguiendo el patrón ya usado por `.hamburger` en `components/nav.tsx`: oculto por defecto (`display: none`), visible dentro de la media query.
- El botón usa `document.documentElement`-style detección de soporte: solo se pinta si `Element.prototype.requestFullscreen` existe, comprobado en un `useEffect` al montar (no en el render inicial, para no desincronizar el HTML del servidor — que nunca tiene `document` — del primer render en el cliente).
- Al pulsarlo, alterna `requestFullscreen()` / `exitFullscreen()` sobre el contenedor raíz `.av-player` (HUD, CRT y pie incluidos). La Fullscreen API oculta automáticamente el resto de la página (`nav`, `footer`) sin CSS adicional.
- Un listener de `fullscreenchange` en `document` mantiene un estado `isFullscreen` sincronizado con la realidad del navegador, cubriendo cualquier salida que no pase por el propio botón (Esc en un teclado conectado, gesto atrás de Android, etc.).
- Salir de pantalla completa automáticamente cuando el reproductor se desmonta (navegar a `SALIR` o a `VOLVER AL VAULT` con el modal de fin abierto) si seguía activa en ese momento.
- `aria-label` y `aria-pressed` que reflejan el estado (`"Activar pantalla completa"` / `"Salir de pantalla completa"`), mismo patrón de accesibilidad que el resto de botones icono del proyecto (`aria-label="Abrir menú"` en el hamburger).
- Estilo del botón en `app/globals.css`: icono compacto (un solo carácter, sin texto) para no desbordar `.hud-actions` a 390px, donde `PAUSA`/`FIN`/`SALIR` ya ocupan casi todo el ancho.
- Test nuevo en `tests/screens.spec.ts` (bloque `reproductor`): el botón existe y tiene el `aria-label` de activar en el proyecto `mobile`, y no existe en el proyecto `desktop`. No se fuerza una entrada real a pantalla completa en la suite.
- Regenerar `reproductor-mobile-darwin.png` (única captura afectada: el botón nuevo cambia el HUD en móvil). `reproductor-desktop-darwin.png` y las 12 restantes no se tocan.
- Fila de la SPEC 19 en el índice de specs del `README.md`.

**Fuera de alcance (explícito):**

- Bloqueo o sugerencia de orientación (forzar landscape). No se pidió y la Fullscreen API no lo hace por sí sola: rotar a portrait con la pantalla completa activa no la cierra en ningún navegador — el reproductor simplemente se reajusta, igual que ya hace hoy sin pantalla completa. Ver decisión más abajo.
- Fallback con prefijos de vendor (`webkitRequestFullscreen`, etc.) para Safari/iOS anterior a 16.4. El feature-detection oculta el botón ahí; si en el futuro hace falta cubrir esos navegadores, es una spec aparte.
- Escalar o rediseñar el layout interno de `.crt`/`.crt-screen` para aprovechar más espacio en pantalla completa. Esta spec solo oculta el chrome del navegador; el tamaño del HUD y del CRT no cambian.
- Cualquier cambio en desktop: el botón no existe ahí (ni en el DOM tras el efecto de detección, condicionado también al ancho de viewport vía CSS).
- Pantalla completa fuera del reproductor (`/biblioteca`, `/juego/[id]`, `/salon`, etc.). Solo aplica a `/jugar/[id]`.
- Persistir la preferencia de pantalla completa entre partidas o sesiones. Cada vez que se entra a `/jugar/[id]` arranca en modo normal; el jugador vuelve a pulsar el botón si quiere.

## Modelo de datos

Ninguno. Esta spec no toca Supabase, ni añade tipos nuevos, ni persiste nada: es estado de componente efímero (`isFullscreen`, `supportsFullscreen`) que vive y muere con el montaje de `GamePlayer`.

## Plan de implementación

1. `components/game-player.tsx`: `useRef` sobre el `<div className="av-player fade-in">` raíz; estado `supportsFullscreen` (arranca en `false`) que un `useEffect` al montar pone a `true` si `document.documentElement.requestFullscreen` existe; estado `isFullscreen` (arranca en `false`).
2. Mismo componente: `useEffect` que suscribe `document.addEventListener("fullscreenchange", …)` para sincronizar `isFullscreen` con `document.fullscreenElement === ref.current`, y se desuscribe al desmontar; ese mismo cleanup llama `document.exitFullscreen()` si `document.fullscreenElement === ref.current` en ese momento.
3. `toggleFullscreen`: si `!isFullscreen`, `ref.current?.requestFullscreen()`; si ya lo está, `document.exitFullscreen()`. Ambas envueltas en `void … .catch(() => {})` (el navegador puede rechazar la promesa si el gesto de usuario ya expiró; no hay nada que mostrarle al jugador por eso, el botón simplemente no habrá hecho nada visible).
4. Botón nuevo en `.hud-actions`, entre `SALIR` y el cierre del `div`, condicionado a `supportsFullscreen` (`{supportsFullscreen && (<button …>)}`), con `aria-label` y `aria-pressed={isFullscreen}` como arriba. Comprobación manual: en Chrome DevTools con emulación de móvil a 390px, el botón aparece y alterna pantalla completa; a 1440px no aparece aunque `supportsFullscreen` sea `true`.
5. `app/globals.css`: clase para el botón (`display: none` por defecto, visible dentro de la `@media (max-width: 720px)` que ya reestrecha `.av-player`), tamaño de icono coherente con los demás botones de `.hud-actions`.
6. `tests/screens.spec.ts`, bloque `reproductor`: test que en `isMobile` comprueba `page.getByRole("button", { name: "Activar pantalla completa" })` visible, y en `!isMobile` comprueba que está oculto (`toBeHidden()`) — existe en el DOM porque la detección de soporte no depende del viewport, pero el CSS lo esconde por debajo de 720px, igual que `.hamburger`.
7. Verificación manual completa en un móvil real o emulado: entrar a `/jugar/tetrix` en un viewport ≤720px, activar pantalla completa, jugar, pulsar `SALIR` y confirmar que la página vuelve a modo normal (sin barra del navegador oculta) antes de llegar a `/juego/tetrix`. Repetir terminando por `FIN` → `VOLVER AL VAULT`. Repetir saliendo con el gesto atrás del sistema operativo (o Esc si se prueba en un navegador de escritorio con emulación táctil) y confirmar que el icono vuelve a su estado "activar".
8. `npx playwright test --project=mobile --update-snapshots` para regenerar solo `reproductor-mobile-darwin.png`; revisar el diff y confirmar que ninguna otra captura cambia.
9. Fila de la SPEC 19 en el índice del `README.md`.
10. Verificación final: `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test` (suite completa).

## Criterios de aceptación

- [ ] En el proyecto `mobile` (390 × 844), `/jugar/[id]` muestra un botón icono con `aria-label="Activar pantalla completa"` en `.hud-actions`.
- [ ] En el proyecto `desktop` (1440 × 900), ese botón está oculto (existe en el DOM, igual que `.hamburger` en `nav.tsx`, pero el CSS lo esconde por encima de 720px).
- [ ] Pulsar el botón en un viewport ≤720px activa la Fullscreen API real sobre `.av-player` (HUD, CRT y pie); el `aria-label` pasa a `"Salir de pantalla completa"` y `aria-pressed` a `"true"`.
- [ ] Pulsarlo de nuevo estando en pantalla completa la cierra y el botón vuelve a su estado inicial.
- [ ] Salir del reproductor por `SALIR` o por `VOLVER AL VAULT` mientras la pantalla completa está activa la cierra automáticamente antes de completar la navegación.
- [ ] Salir de pantalla completa por un gesto ajeno al botón (Esc, gesto atrás del sistema) deja el icono sincronizado en su estado "activar", sin necesidad de recargar la página.
- [ ] En un navegador donde `Element.prototype.requestFullscreen` no existe, el botón no se pinta en absoluto (no aparece deshabilitado, no aparece y falla al pulsarlo).
- [ ] `reproductor-desktop-darwin.png` no se regenera; de las 14 capturas de referencia solo `reproductor-mobile-darwin.png` cambia.
- [ ] `npm run build`, `npx tsc --noEmit`, `npm run lint` y `npm test` (suite completa) pasan.

## Decisiones tomadas y descartadas

- **Sí:** Fullscreen API real (`requestFullscreen`/`exitFullscreen`), no un modo "inmersivo" solo con CSS — decisión explícita del usuario: quiere que la barra del navegador desaparezca de verdad, no solo maquetar el HUD a pantalla completa dejando la barra visible.
- **No:** activación automática al montar el reproductor. La Fullscreen API exige un gesto de usuario reciente para conceder el permiso — en la mayoría de navegadores móviles una llamada automática al montar sin clic previo es rechazada silenciosamente — y además sorprendería al jugador. Decisión explícita del usuario: botón explícito.
- **Sí:** todo `.av-player` como elemento fullscreen, no solo `.crt`. Mantiene el HUD (jugador, puntuación, vidas, nivel, `PAUSA`/`FIN`/`SALIR`) visible y no reabre la regla de "el HUD es común a los tres juegos y nada específico entra en el canvas" (SPEC 18) — un HUD-overlay flotante encima del canvas sería un segundo lugar donde pintar esos mismos datos.
- **Sí:** botón icono compacto en `.hud-actions`, no un botón flotante nuevo sobre el CRT. Reutiliza el patrón de fila de acciones ya existente en vez de introducir un elemento posicionado aparte; a cambio, el icono va sin texto para caber en 390px junto a los otros tres botones.
- **Sí:** ocultar el botón por completo si `requestFullscreen` no existe (feature-detection), en vez de mostrarlo deshabilitado — un botón visible que nunca hace nada es peor que uno que no está.
- **La detección de soporte vive en un `useEffect`, no en el render inicial** — `document` no existe en el servidor; comprobarlo durante el render produciría un desajuste de hidratación entre el HTML del servidor (sin `document`, botón ausente) y el primer render del cliente (con `document`, botón presente). El efecto corre después de hidratar, así que el botón puede aparecer un instante después de la carga en vez de estar ya en el primer pintado — aceptado, es el precio habitual de cualquier detección de capacidades solo-cliente.
- **No:** fallback con prefijos de vendor para Safari/iOS antiguo. Añadiría una segunda rama de código (`webkitRequestFullscreen`, `webkitExitFullscreen`, `webkitfullscreenchange`) para navegadores cada vez más minoritarios; si hace falta cubrirlos, es una spec aparte con su propia verificación en un dispositivo real.
- **No:** forzar la salida de pantalla completa solo por rotar el dispositivo a portrait. La pregunta original agrupaba `SALIR`/fin de partida/rotar a portrait bajo una misma respuesta, pero rotar no es un evento de salida de la Fullscreen API en ningún navegador — el reproductor ya es responsive dentro de pantalla completa igual que fuera de ella (SPEC 12), así que no hay nada que forzar. Lo que sí se implementa, y cubre el espíritu de la respuesta, es la salida automática al desmontar (`SALIR`/`VOLVER AL VAULT`) y la sincronización de estado ante cualquier salida nativa (Esc, gesto atrás), que si son casos reales de la Fullscreen API.
- **No:** cubrir la entrada/salida real a pantalla completa en Playwright. La API depende de un gesto de usuario y de un entorno con pantalla real; en Chromium headless su comportamiento es menos fiable que el resto de la suite (que nunca congela el reloj de los tres motores, por la misma razón de no introducir dependencias frágiles de entorno). Se prueba solo la presencia condicional del botón y su `aria-label`; la entrada/salida real se verifica a mano (paso 7 del plan).
- **No:** persistir si el jugador prefiere pantalla completa entre partidas. Cada entrada a `/jugar/[id]` es una decisión nueva; no se pidió recordarla y añadiría un estado más que sincronizar (¿en qué se guardaría, `localStorage`? el proyecto ya evita una segunda fuente de verdad ahí desde la SPEC 06).

## Riesgos identificados

- Si el jugador cierra pestaña o recarga estando en pantalla completa, el navegador la cierra por su cuenta antes de que el `cleanup` de React llegue a ejecutarse — no hay nada que mitigar, es el comportamiento nativo esperado y no dispara ningún error.
- Un doble clic muy rápido sobre el botón antes de que `isFullscreen` se actualice podría llamar `requestFullscreen()` dos veces seguidas; el navegador la ignora si ya está en curso, así que no debería producir un estado inconsistente, pero conviene confirmarlo a mano en la verificación manual (paso 7).
- La detección de soporte por `useEffect` significa que, en una conexión muy lenta o con JavaScript tardando en hidratar, el botón puede tardar un instante en aparecer tras la primera pintura — aceptado, ver decisiones.
- Si en el futuro se añade un cuarto motor con un HUD distinto, este botón sigue siendo válido sin cambios: no depende de qué motor esté montado, solo de `.av-player` como contenedor.

