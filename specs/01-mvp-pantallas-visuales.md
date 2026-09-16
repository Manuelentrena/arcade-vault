# SPEC 01 — MVP visual de las pantallas de Arcade Vault

> **Estado:** Aprovado
> **Depende de:** ninguna
> **Fecha:** 2026-09-15
> **Objetivo:** Portar las cinco pantallas de `references/templates/` a Next.js App Router como maqueta navegable y sin lógica real de negocio.

---

## 1. Por qué existe esta spec

El repo es todavía el scaffold de `create-next-app`. La dirección visual ya está decidida y materializada en `references/templates/` (HTML + JSX sobre React UMD + Babel en el navegador + `styles.css` de 950 líneas). Esta spec congela esa maqueta como aplicación Next.js real, con rutas propias, para que las specs siguientes puedan añadir juego real, autenticación real y datos reales sobre una base visual estable.

Un commit anterior ya portó **la parte base** del tema a `app/globals.css` (529 líneas: tokens `:root`, bloque `@theme inline`, `.btn`, `.chip`, `.card`, `.field`, `.av-bg`, `.av-noise`, `.av-shell`, keyframes, `prefers-reduced-motion`) y las fuentes a `app/layout.tsx` (`Press_Start_2P`, `JetBrains_Mono`). Esta spec continúa desde ahí; no reescribe lo ya portado.

---

## 2. Alcance

**Dentro:**

- Cinco rutas reales del App Router con URLs en español: `/`, `/juego/[id]`, `/jugar/[id]`, `/auth`, `/salon`.
- `Nav` (con logo, enlaces activos, contador de créditos decorativo y drawer móvil con hamburguesa) y `footer`, ambos en `app/layout.tsx`.
- Porte **literal** del CSS de pantalla que falta desde `references/templates/styles.css` a `app/globals.css`, conservando los mismos nombres de clase en el JSX.
- Las 8 portadas CSS puras (`cover-bricks`, `cover-tetro`, `cover-snake`, `cover-glot`, `cover-invaders`, `cover-rocas`, `cover-rana`, `cover-duelo`). Sin imágenes.
- Responsive completo: todas las media queries del template y el panel móvil `.av-mobile-panel` operativo.
- Interactividad decorativa igual que el template: buscador y chips de categoría filtran, el formulario de auth crea un usuario falso, el reproductor incrementa la puntuación sola, pausa, "FIN" y modal de game over con toast de guardado.
- Sesión falsa compartida mediante un React Context (`SessionProvider`) persistido en `localStorage` bajo la clave `av_user`.
- Animación del arena CRT en `/jugar/[id]` (rejilla, tres enemigos, nave).
- `app/not-found.tsx` con el tema arcade y `notFound()` cuando el `id` de juego no existe.
- `app/error.tsx` con el tema arcade.
- Accesibilidad mínima ya presente en el template: bloque `prefers-reduced-motion`, `:focus-visible`, `aria-label` en botones que solo llevan icono.
- Suite Playwright: humo + capturas de referencia propias, en Chromium desktop y móvil.

**Fuera de alcance (para specs futuras):**

- Motores de juego reales. Los ocho juegos siguen siendo decorativos.
- Backend, base de datos, API o autenticación real. El formulario de `/auth` no valida nada.
- Puntuaciones reales. `seededScores()` genera datos falsos deterministas y nadie escribe `av_scores`.
- Lógica del contador "CRÉDITOS · 03" del `Nav`.
- Página de cuenta. El botón `{user.name} ▾` del `Nav` solo cierra sesión.
- Login social real (Google / GitHub). Los botones son decorativos.
- Internacionalización. La interfaz es solo español.
- Tema claro. La aplicación es dark-only, como el template.

---

## 3. Modelo de datos

Tres estructuras nuevas, todas en `lib/`, todas mock. No hay persistencia de dominio.

```ts
// lib/games.ts
export type GameColor = "cyan" | "magenta" | "yellow" | "green";
export type GameCat = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export type Game = {
  id: string;        // "bloque-buster" — también el segmento de URL
  title: string;     // "BLOQUE BUSTER"
  short: string;     // una línea, para la tarjeta
  long: string;      // párrafo, para el detalle
  cat: GameCat;
  cover: string;     // clase CSS: "cover-bricks"
  color: GameColor;  // variante del botón JUGAR
  best: number;      // 28450
  plays: string;     // "12.4K"
};

export const GAMES: Game[];                       // los 8 del template, contenido idéntico
export const CATS: readonly ["TODOS", ...GameCat[]];
```

```ts
// lib/scores.ts
export type ScoreRow = {
  rank: number;
  name: string;   // "PX_KAI"
  score: number;
  date: string;   // "07/03/2026"
};

// LCG determinista idéntico al del template: mismo seed, mismas filas.
export function seededScores(seed: number, count?: number): ScoreRow[];
export const PLAYERS: readonly string[];          // los 18 nombres del template
```

```ts
// lib/session.ts
export type SessionUser = { name: string };       // "PX_KAI", máx. 10 caracteres

export const SESSION_KEY = "av_user";
export function readSession(): SessionUser | null; // tolera JSON corrupto y localStorage bloqueado
export function writeSession(user: SessionUser | null): void;
```

Semillas de `seededScores()` heredadas del template, para que las tablas no cambien al portar:

- Detalle: `seededScores(id.length * 17 + 3, 10)`.
- Salón de la Fama: `seededScores(id.length * 23 + 7, 12)`.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y navegable.

1. **Limpiar el scaffold.** Vaciar `app/page.tsx` dejando un placeholder mínimo con el tema arcade. Borrar `public/next.svg`, `public/vercel.svg`, `public/file.svg`, `public/globe.svg`, `public/window.svg` si no se usan. `npm run dev` arranca sin el contenido de plantilla.

2. **Portar el CSS de pantalla.** Copiar desde `references/templates/styles.css` a `app/globals.css` los bloques que faltan, en este orden: `.av-nav`, `.av-mobile-backdrop`, `.av-mobile-panel`, `.av-hero`, `.av-filters`, `.av-search`, `.av-chips`, `.av-grid`, `.cover-bg` + las 8 `.cover-*`, `.score-badge`, `.av-detail`, `.detail-cover`, `.detail-info`, `.detail-tags`, `.stat-strip`, `.detail-actions`, `.leaderboard`, `.lb-row` (+ `.top1/.top2/.top3`), `.av-player`, `.player-hud`, `.hud-stat` (+ `.lives`, `.level`), `.hud-actions`, `.crt`, `.crt-screen`, `.crt-content`, `.crt-bottom`, `.game-arena`, `.modal-bd`, `.modal`, `.toast-saved`, `.av-auth-wrap`, `.auth-card`, `.auth-header`, `.auth-tabs`, `.auth-divider`, `.social`, `.av-hall`, `.hall-head`, `.hall-tabs`, `.podium`, `.podium-slot` (+ `.gold/.silver/.bronze`), `.hall-table`, y todas las media queries asociadas. Adaptar solo lo imprescindible: `#root` no existe (el shell es `.av-shell`) y las fuentes vienen de las variables de `next/font` ya declaradas.

3. **Crear `lib/games.ts` y `lib/scores.ts`** con los datos y el generador del template, tipados. `npx tsc --noEmit` limpio.

4. **Crear `lib/session.ts` y `components/session-provider.tsx`.** Provider cliente con `useSession()`, lectura de `localStorage` en `useEffect` para no romper la hidratación, y `signIn` / `signOut`.

5. **Crear `components/nav.tsx` y `components/footer.tsx`** y montarlos en `app/layout.tsx` dentro del `SessionProvider`. Estado activo calculado con `usePathname()`: `/juego/*` y `/jugar/*` marcan "Biblioteca". `{children}` va dentro de `<main className="av-main">`. El drawer móvil abre y cierra.

6. **Pantalla Biblioteca (`app/page.tsx`).** Hero, buscador, chips y rejilla. `components/game-card.tsx` es cliente por el efecto tilt con `onMouseMove`; el filtrado vive en `components/library-browser.tsx`. La tarjeta entera navega a `/juego/[id]`. Estado vacío incluido.

7. **Pantalla Detalle (`app/juego/[id]/page.tsx`).** Portada grande, tags, descripción larga, `stat-strip`, botones "JUGAR AHORA" (a `/jugar/[id]`) y "VOLVER AL VAULT" (a `/`), más `components/leaderboard.tsx` con 10 filas. Si el `id` no está en `GAMES`, llamar a `notFound()`.

8. **Pantalla Reproductor (`app/jugar/[id]/page.tsx` + `components/game-player.tsx`).** HUD con jugador / puntuación / vidas / nivel, arena CRT animada, botones PAUSA, FIN y SALIR, y modal de fin de partida con input de iniciales y toast `▸ PUNTUACIÓN GUARDADA_`. El intervalo de puntuación (`+10..99` cada 220 ms) se limpia al desmontar y se detiene en pausa o fin. El botón de guardar **no escribe nada**; solo cambia el estado a guardado. `notFound()` si el `id` no existe.

9. **Pantalla Auth (`app/auth/page.tsx` + `components/auth-form.tsx`).** Pestañas INICIAR SESIÓN / CREAR CUENTA (la segunda añade el campo de correo con `slide-in`), campos usuario y contraseña, botón de envío, "JUGAR COMO INVITADO", divisor y los dos botones sociales decorativos. Enviar hace `signIn({ name })` con el usuario en mayúsculas recortado a 10 caracteres, por defecto `PLAYER1`, y redirige a `/`. "JUGAR COMO INVITADO" hace `signOut()` y redirige a `/`.

10. **Pantalla Salón de la Fama (`app/salon/page.tsx` + `components/hall-of-fame.tsx`).** Cabecera, chips por juego, podio de tres puestos (orden visual 02 · 01 · 03) y tabla de 12 filas con `animationDelay` escalonado de 50 ms. Si hay sesión, se añaden las dos filas "TU MEJOR MARCA". Botón final a `/`.

11. **Estados de ruta.** `app/not-found.tsx` y `app/error.tsx` (cliente, con botón de reintento), ambos con el tema arcade. Sin `loading.tsx`: ver la decisión correspondiente.

12. **Repaso de accesibilidad.** `aria-label` en la hamburguesa y en el cierre del drawer, `<button>` real donde el template usaba `<a onClick>`, `alt`/`aria-hidden` en los elementos puramente decorativos, y comprobar que `prefers-reduced-motion` sigue apagando animaciones tras el porte.

13. **Instalar Playwright.** `npm i -D @playwright/test` + `npx playwright install chromium`. Crear `playwright.config.ts` con `webServer` levantando `npm run build && npm run start`, `baseURL` local, y dos proyectos: `desktop` (1440×900) y `mobile` (`devices["iPhone 13"]`). Añadir los scripts `test` y `test:update` a `package.json` y `test-results/` a `.gitignore`.

14. **Escribir `tests/screens.spec.ts`.** Una prueba por ruta: aserciones de humo más `toHaveScreenshot({ animations: "disabled" })`. Generar las capturas de referencia con `--update-snapshots` y commitearlas.

---

## 5. Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings nuevos.
- [ ] `npm run lint` sale limpio.
- [ ] `npx tsc --noEmit` sale limpio.
- [ ] `npx playwright test` pasa en los proyectos `desktop` y `mobile`.
- [ ] `/` muestra exactamente 8 tarjetas de juego.
- [ ] Escribir "ser" en el buscador de `/` deja exactamente 1 tarjeta (SERPENTINA).
- [ ] Pulsar el chip "PUZZLE" en `/` deja exactamente 1 tarjeta (CAÍDA).
- [ ] Una búsqueda sin resultados muestra el bloque "NO HAY RESULTADOS".
- [ ] Pulsar una tarjeta navega a `/juego/<id>` y el botón atrás del navegador vuelve a `/`.
- [ ] `/juego/serpentina` muestra el título SERPENTINA, la descripción larga, 3 celdas en `stat-strip` y 10 filas en la tabla de puntuaciones.
- [ ] `/juego/no-existe` renderiza la página 404 con el tema arcade, no un error de servidor.
- [ ] En `/jugar/serpentina` la puntuación aumenta sola y se congela al pulsar PAUSA.
- [ ] En `/jugar/serpentina` pulsar FIN abre el modal con la puntuación final; GUARDAR PUNTUACIÓN muestra el toast y `localStorage.av_scores` sigue sin existir.
- [ ] Enviar el formulario de `/auth` con el usuario `px_kai` redirige a `/` y el `Nav` muestra `PX_KAI ▾`.
- [ ] Recargar la página tras iniciar sesión conserva el nombre en el `Nav`.
- [ ] Pulsar `PX_KAI ▾` en el `Nav` vuelve a mostrar "Iniciar Sesión" y borra la clave `av_user`.
- [ ] La pestaña CREAR CUENTA de `/auth` añade el campo de correo y la de INICIAR SESIÓN lo quita.
- [ ] `/salon` muestra 3 puestos de podio, 12 filas de tabla y 8 chips de juego.
- [ ] Con sesión iniciada, `/salon` añade la fila "TU MEJOR MARCA EN <juego>".
- [ ] A 390 px de ancho el `Nav` muestra la hamburguesa y pulsarla abre `.av-mobile-panel`.
- [ ] A 390 px de ancho ninguna pantalla produce scroll horizontal.
- [ ] Las cinco rutas usan las clases del template y no quedan clases de `styles.css` sin portar entre las listadas en el paso 2.
- [ ] Con `prefers-reduced-motion: reduce` no se anima ni el fondo, ni `.flicker`, ni `.blink`, ni `.btn.pulse`.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en ninguna de las cinco rutas.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** rutas reales del App Router con URLs en español (`/juego/[id]`, `/jugar/[id]`, `/salon`). Dan enlaces compartibles, botón atrás y coherencia con la interfaz, que es toda en español.
- **No:** replicar el enrutado por hash del template (`location.hash` con JSON codificado). Es un apaño de página estática y desperdicia el router de Next.
- **No:** una sola ruta con cambio de pantalla por `useState`. Era el porte más rápido, pero sin URLs reales ni historial.
- **Sí:** portar el CSS restante **literal** a `app/globals.css` conservando los nombres de clase. Fidelidad pixel a pixel y cero deriva visual.
- **No:** reescribir las 600 líneas como utilidades de Tailwind. Traducir a mano gradientes, `clip-path`, el efecto CRT y las transformaciones 3D garantizaba deriva visual a cambio de nada en un MVP.
- **No:** híbrido CSS para efectos + Tailwind para layout. Dos sitios donde mirar por componente.
- **Sí:** `components/` y `lib/` en la raíz. `app/` queda solo con rutas y el alias `@/*` ya apunta a la raíz.
- **Sí:** `SessionProvider` con Context sobre `localStorage`. `Nav` vive en el layout y el reproductor necesita el mismo usuario; sin un origen único se desincronizan hasta recargar.
- **Sí:** mantener la interactividad decorativa del template (filtros, contador de puntuación, modal de fin). Sin ella la demo parece muerta y el coste es estado local de cliente.
- **No:** escribir en `localStorage.av_scores`. El template escribe ahí y nunca lo lee; es una escritura muerta. La persistencia real llega con backend en otra spec.
- **No:** mostrar las puntuaciones guardadas en el Salón de la Fama. Implica lógica real de ranking y mezcla con datos mock: es otra spec.
- **Sí:** Playwright con humo más capturas de referencia propias, `animations: "disabled"`. Comparar píxeles contra el HTML estático del template no es viable (fuentes, animaciones vivas), así que el template queda como referencia humana y las capturas como red anti-regresión.
- **Sí:** Chromium en dos viewports, escritorio y móvil. El proyecto móvil es lo único que demuestra que el drawer y la rejilla responsive funcionan.
- **No:** matriz con WebKit y Firefox. Triplica tiempo y capturas para una maqueta de demo.
- **Sí:** `not-found.tsx` y `error.tsx` dentro de esta spec. El template renderiza `null` ante un `id` desconocido, lo que en Next sería una página en blanco.
- **No:** `app/loading.tsx` en la raíz. Convierte las rutas dinámicas en respuestas por streaming: las cabeceras salen con el shell de carga antes de que `notFound()` se ejecute, así que `/juego/no-existe` y `/jugar/no-existe` devolvían `200` en vez de `404` (verificado quitando el fichero: los tres vuelven a `404`). Todos los datos son mock en memoria, así que el shell de carga no llega a pintarse: no aporta nada y rompía un criterio de aceptación.
- **No:** página de cuenta. No hay plantilla para ella, requeriría diseño nuevo.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
| --- | --- |
| Error de hidratación al leer `localStorage` durante el render | `SessionProvider` arranca con `null` y lee en `useEffect`. El `Nav` renderiza el estado desconectado en el primer paint. |
| `localStorage` bloqueado (modo privado, cookies de terceros) | `readSession()` y `writeSession()` van envueltas en `try/catch`. La aplicación funciona, simplemente no recuerda la sesión. |
| Capturas de Playwright inestables por fuentes o animaciones | `animations: "disabled"`, esperar a `document.fonts.ready` y viewports fijos. Si una ruta sigue parpadeando, enmascarar el elemento concreto en vez de bajar el umbral global. |
| El intervalo de puntuación del reproductor sigue vivo al navegar | El `useEffect` devuelve `clearInterval` y depende de `over` y `paused`. Cubierto por la aserción de PAUSA. |
| Añadir un `loading.tsx` en la raíz vuelve a romper el estado 404 de las rutas dinámicas | Los criterios de aceptación comprueban el código de estado, no solo el contenido. |
| El CSS portado choca con las clases base ya presentes en `globals.css` | Portar en el orden del paso 2 y revisar duplicados de `.btn`, `.chip`, `.card` y `.field` antes de pegar: esas cuatro ya están y no deben duplicarse. |
| `globals.css` cerca de 1100 líneas se vuelve difícil de navegar | Conservar los comentarios de sección `/* ===== ... ===== */` del template como separadores. |

---

## 8. Lo que **no** entra en esta spec

- Juegos jugables de verdad: los ocho siguen siendo decorativos.
- Autenticación real, backend, base de datos y login social.
- Puntuaciones reales, persistidas o rankings calculados.
- Lógica del contador de créditos del `Nav`.
- Página de cuenta de usuario.
- Internacionalización y tema claro.

Cada uno de ellos, si llega, va en su propia spec.
