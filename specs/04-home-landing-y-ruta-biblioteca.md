# SPEC 04 — Home landing en `/` y biblioteca en `/biblioteca`

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 03
> **Fecha:** 2026-09-18
> **Objetivo:** Mover la biblioteca actual de `/` a `/biblioteca` y poner en la raíz una landing nueva, portada de `references/templates/home-about/home.jsx`, con su entrada `Inicio` en el nav. `about.jsx` y su entrada de nav quedan fuera, por decisión explícita.

---

## 1. Alcance

**Dentro:**

- `/biblioteca` (`app/biblioteca/page.tsx`): exactamente el contenido actual de `app/page.tsx` (hero `av-hero` + `LibraryBrowser`).
- `/` nueva: portada de `home.jsx`, sus siete secciones (hero, `//01` por qué, `//02` juegos, stats, `//03` actividad, `//04` precios/FAQ, CTA final), en `components/home/`.
- CSS del home portado a `app/globals.css` desde `references/templates/home-about/styles.css` (ver §4, paso 4).
- Entrada `Inicio` en nav desktop y móvil; `inicio` en `sectionOf`.
- Redirección de los enlaces que hoy van a `/` y significan "biblioteca" (tabla en §4, paso 2).
- Tests: nueva ruta `home`, `biblioteca` apuntando a `/biblioteca`, `page.goto("/")` corregidos.
- Regenerar las 10 capturas existentes + 2 nuevas de `home` (nav cambia en las 5 pantallas).
- `README.md`: tabla de pantallas, nº de capturas, tabla de specs.

**Fuera:**

- `about.jsx` y `Acerca de` (otra spec).
- Cambios en `/juego/[id]`, `/jugar/[id]`, `/auth`, `/salon` más allá de a dónde apuntan sus enlaces de vuelta.
- Redirect/alias de compatibilidad `/` → `/biblioteca` (no hay enlaces externos que preservar).
- Motor de juego, backend, sesión real, puntuaciones persistidas.
- `lib/scores.ts`, `lib/games.ts`, `lib/session.ts`, `AGENTS.md`.
- Migrar CSS a Tailwind.

---

## 2. Modelo de datos

Sin tipos nuevos en `lib/`. Todo literal dentro del componente que lo pinta, copiado tal cual de `home.jsx`:

- `home-features.tsx`: 4 features (icon/título/desc/color), sección `//01`.
- `home-stats.tsx`: 3 stats, sección stats.
- `home-activity.tsx`: ticker (7 filas) + top (5 filas), sección `//03`. Formatear números con `toLocaleString("es-ES")`.
- `home-pricing.tsx`: tarjeta de plan único (6 viñetas) + 3 FAQ, sección `//04`.

Excepción — el carril `//02` sí usa datos reales: `GAMES.slice(0, 6)` de `lib/games.ts`, leído en servidor y pasado por props.

---

## 3. Componentes

Un fichero por sección en `components/home/`. Solo `home-hero.tsx` y `use-reveal.ts` llevan `"use client"`; todo lo demás es servidor. Todo `onClick={() => navigate(...)}` del mockup se convierte en `Link` de `next/link` — ningún botón navega con `router.push`.

| Fichero | CTA / enlace |
| --- | --- |
| `home-hero.tsx` | `EXPLORAR JUEGOS` → `/biblioteca`, `CREAR CUENTA` → `/auth` |
| `home-silhouettes.tsx` | — (8 SVG `s1`–`s8`, `aria-hidden`) |
| `home-features.tsx` + `feature-icon.tsx` | — |
| `home-games.tsx` + `mini-card.tsx` | `mini-card` es `Link` a `/juego/[id]`, no `div` con `onClick`; botón `VER TODOS →` a `/biblioteca` |
| `home-stats.tsx` | — |
| `home-activity.tsx` | `VER SALÓN →` a `/salon` |
| `home-pricing.tsx` | CTA a `/auth` |
| `home-final.tsx` | `INSERTAR MONEDA →` a `/biblioteca` |
| `use-reveal.ts` | hook, ver §4 paso 5 |

`app/page.tsx`: componente de servidor fino, lee `GAMES.slice(0,6)` y compone las 7 secciones en `<div className="home fade-in">`. Sin `"use client"`, sin marcado propio.

---

## 4. Plan de implementación

Cada paso deja la app compilando y navegable.

1. **Mover biblioteca.** Crear `app/biblioteca/page.tsx` = contenido actual de `app/page.tsx`. No tocar aún `app/page.tsx`. Verificar `/biblioteca` (búsqueda y chips funcionan).

2. **Redirigir enlaces** que hoy apuntan a `/` y significan "biblioteca":

   | Fichero | Elemento | Nuevo destino |
   | --- | --- | --- |
   | `components/nav.tsx` | enlace `Biblioteca` (desktop+móvil) | `/biblioteca` |
   | `components/nav.tsx` | enlace logo | `/` (sin cambio) |
   | `components/auth-form.tsx` | 2× `router.push("/")` | `/biblioteca` |
   | `components/hall-of-fame.tsx` | botón volver | `/biblioteca` |
   | `components/game-player.tsx` | botón `SALIR` | `/biblioteca` |
   | `app/juego/[id]/page.tsx` | botón volver | `/biblioteca` |
   | `app/not-found.tsx`, `app/error.tsx` | botón volver | `/biblioteca` |

3. **Nav — sección `inicio`.** `type Section` → añadir `"inicio"`. `sectionOf`: `/` → `inicio`; `/biblioteca`, `/juego/*`, `/jugar/*` → `biblioteca`; `/salon` → `salon`. Añadir enlace `Inicio` primero en `.links` y en el panel móvil (antes de `Biblioteca`), con `cls("inicio")`.

4. **CSS del home.** Portar a `app/globals.css` (sección nueva, comentada) todo el bloque de `references/templates/home-about/styles.css` que no exista ya en `globals.css`, incluidas sus media queries y `@keyframes float`/`@keyframes bounce` (faltan hoy). Regla de conflicto: si una regla ya existe en `globals.css` (`.btn.xl`, `.btn.lg`, `.pulse`, `.blink`, `.fade-in`, `.cover-*`, `.pixel`, `.neon-*`, …), gana la existente y no se copia.

   **Excepción — `.reveal` no se porta tal cual.** En el mockup es invisible por defecto (`opacity: 0`), lo que puede dejar secciones en blanco en capturas `fullPage` sin scroll. Aquí se porta *visible por defecto*, y JS añade `armed` al montar:

```css
   .reveal.armed { opacity: 0; transform: translateY(24px); }
   .reveal { transition: opacity 600ms ease, transform 600ms ease; }
   .reveal.armed.in { opacity: 1; transform: none; }
```

5. **Hook `useReveal`** (`components/home/use-reveal.ts`, cliente): al montar, añade `armed` a los `.reveal` del home, los observa con `IntersectionObserver` (`threshold: 0.12`), añade `in` al intersectar y deja de observar ese elemento; desconecta al desmontar. Si `matchMedia("(prefers-reduced-motion: reduce)")` coincide, no arma nada.

6. **Crear componentes de `components/home/`** según tabla en §3.

7. **Crear `app/page.tsx`** según §3.

8. **Verificación manual** (`npm run dev`, 1440×900 y 390×844): las 7 secciones pintan, siluetas flotan, reveal aparece al bajar sin dejar nada invisible; `/biblioteca` idéntica a la raíz antigua; nav marca activo correctamente en `/`, `/biblioteca`, `/juego/serpentina`, `/jugar/serpentina`, `/salon`; login deja en `/biblioteca`; todos los "volver"/`SALIR` llevan a `/biblioteca`.

9. **Tests** (`tests/screens.spec.ts`): añadir `{ name: "home", path: "/" }` primero en `ROUTES`; `biblioteca` → `path: "/biblioteca"`; corregir los `page.goto("/")` de los bloques `biblioteca`/`responsive`/`signIn` y el `toHaveURL` de `signIn` → `/biblioteca`; nuevo `describe("home")` con aserciones de contenido (h1 del hero, 6 `.mini-card`, 4 `.feature-card`, CTA `EXPLORAR JUEGOS` → `/biblioteca`, `VER SALÓN →` → `/salon`); test de que ningún `.reveal` queda en `opacity: 0` tras cargar sin scroll.

10. **Capturas** (solo después del paso 8, porque el nav cambia en las 5 pantallas): `npx playwright test --project=desktop --update-snapshots` y luego `--project=mobile`. Resultado: 12 ficheros en `tests/screens.spec.ts-snapshots/` (10 actualizados + `home-desktop-darwin.png` + `home-mobile-darwin.png`).

11. **README:** fila `/` → landing, añadir fila `/biblioteca`; "diez capturas"/"cinco por proyecto" → "doce"/"seis"; sumar fila de esta spec a la tabla de specs.

12. **Verificar:** `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm test`, en ese orden, todos en verde. (`tsc` necesita que `.next/types` exista — correr `next dev` o `next build` una vez tras crear `app/biblioteca/page.tsx` antes de typechequear.)

---

## 5. Criterios de aceptación

- [x] `/biblioteca` pinta hero `av-hero` + `LibraryBrowser` con los 8 juegos; `/` ya no contiene `LibraryBrowser`.
- [x] `/` pinta las 7 secciones; `//02` tiene exactamente 6 `.mini-card` (cada una `Link` a `/juego/<id>`); `//01` tiene exactamente 4 `.feature-card`.
- [x] `components/home/` sigue la tabla de §3; solo `home-hero.tsx` y `use-reveal.ts` llevan `"use client"`; `app/page.tsx` no lleva `"use client"` ni marcado propio.
- [x] Ningún componente navega con `router.push`.
- [x] `grep -rn 'href="/"' app components` solo devuelve enlaces de `nav.tsx`: el logo y los dos `Inicio` (barra y panel móvil). Ningún "volver" apunta ya a la raíz.
- [x] `auth-form.tsx` redirige a `/biblioteca` en ambos caminos.
- [x] Nav muestra `Inicio`, `Biblioteca`, `Salón de la Fama` en ese orden; activo solo en `/`, en `/biblioteca`+`/juego/*`+`/jugar/*`, y en `/salon` respectivamente.
- [x] `globals.css` tiene `@keyframes float`/`bounce` y las reglas `.home-hero`, `.home-silos`, `.feature-grid`, `.mini-rail`, `.home-stats`, `.activity-grid`, `.pricing-grid`, `.home-final`, sin duplicar nada existente.
- [x] Sin JS, ningún `.reveal` sin `armed` queda con `opacity` distinto de 1; con `prefers-reduced-motion: reduce`, todo visible desde el inicio.
- [x] `tests/screens.spec.ts-snapshots/` tiene 12 ficheros; las 10 antiguas se regeneraron después de la verificación manual del paso 8, no antes.
- [x] `describe("home")` con aserciones de contenido existe.
- [x] `lint`, `tsc --noEmit`, `build`, `test` en verde.
- [x] `README.md` refleja `/` como landing, `/biblioteca`, doce capturas, fila de esta spec.
- [x] Sin cambios en `lib/games.ts`, `lib/scores.ts`, `lib/session.ts`. Sin componente/ruta de `Acerca de`.

---

## 6. Ajustes durante la implementación

Cosas que el plan no previó y se decidieron al ejecutarlo.

| Ajuste | Por qué |
| --- | --- |
| `.hero-scroll` sale de `.home-hero-inner` y cuelga de `.home-hero` con `bottom: 24px` | En la maqueta el `bottom: -20px` deja el `DESLIZA ▼` encima de los CTA, en desktop y en móvil. |
| `.tp-bar` no se porta y `.top-row` pasa a `36px 1fr auto` | El `.tp-fill` de la maqueta no tiene regla en ninguna parte: el elemento es invisible y la barra la pinta `.top-row::before`. |
| Los kickers van entre llaves: `{"// 01"}` | ESLint (`react/jsx-no-comment-textnodes`) los lee como comentario JSX. El texto renderizado es el mismo. |
| `useReveal` revela también lo que ya alcanzó la pantalla (`top < clientHeight`), no solo lo que intersecta | Con solo el observador, un salto de scroll —o una sección más alta que el viewport que asoma sin llegar al 12%— se queda en `opacity: 0` para siempre. |
| El test de captura del home llama a `disarmReveal` antes del screenshot | La variante «visible por defecto» del paso 4 solo cubre el caso sin JavaScript. Con JS, que es el de Playwright, la captura `fullPage` salía negra de la mitad hacia abajo. |
| La captura del home usa `timeout: 30_000` | Mide casi 4000px y los 5s por defecto no dan para las dos tomas idénticas que Playwright exige. |
| Las 10 capturas viejas exigieron `--update-snapshots=all` | Con `maxDiffPixelRatio: 0.01`, el enlace `Inicio` no llega al umbral: la suite pasaba y el modo `changed` no reescribía nada. Documentado en el README. |
| Los tests de clic esperan hidratación (`hydrated`), quietud de la sección (`settled`) y `NAV_TIMEOUT` de 15s | Tres fuentes de flakiness reales: clic perdido antes de hidratar, clic a mitad de la transición de 600ms, y la URL que no cambia hasta que llega la respuesta RSC. |

---

## 7. Decisiones no obvias

| Decisión | Alternativa descartada | Por qué |
| --- | --- | --- |
| Ruta `/biblioteca` | `/game` (petición literal) | Choca visualmente con `/juego/[id]`; `/biblioteca` ya lo usan nav, `sectionOf` y las capturas. |
| `.reveal` visible por defecto, `armed` vía JS | Portar `opacity: 0` tal cual | Puede dejar secciones en blanco en capturas `fullPage` con animaciones desactivadas. |
| Datos del home como literales por componente | Derivarlos de `lib/scores.ts` / centralizarlos en `lib/home.ts` | Los seeds de `scores.ts` reescriben todas las capturas del proyecto por un dato decorativo; cada bloque de datos solo lo usa un componente, así que un módulo compartido añade indirección sin consumidor. |
| Sin redirect de compatibilidad en `/` | Redirect permanente a `/biblioteca` | No hay enlaces externos que preservar; ensuciaría justo la ruta que se está liberando. |

---

## 8. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| CSS portado pisa reglas del tema actual | Regla de conflicto en §4 paso 4 (gana lo existente) + criterio de aceptación sin duplicados. |
| Captura de `/` sale con secciones invisibles por el reveal | Reveal visible por defecto (§4 paso 4) + test explícito de `opacity`. |
| Siluetas/`pulse` desestabilizan la captura | Ya se usa `animations: "disabled"`; si persiste, congelar como en SPEC 03. |
| Regenerar 12 capturas a ciegas fija una regresión como base | Paso 10 depende del paso 8 (verificación manual primero). |
| Enlace suelto apuntando a `/` en vez de `/biblioteca` | Criterio de aceptación con `grep` explícito. |
| Tipado de rutas de Next falla antes de compilar | Correr `next dev`/`build` una vez tras crear la ruta nueva, antes de `tsc`. |
