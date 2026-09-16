# SPEC 02 — Barra móvil: sesión dentro de la hamburguesa y logo en una línea

> **Estado:** Aprovado
> **Depende de:** SPEC 01
> **Fecha:** 2026-09-16
> **Objetivo:** Mover el control de sesión de la barra al panel hamburguesa por debajo de 840 px y dejar el logo `ARCADE VAULT` en una sola línea con el espacio que queda libre.

---

## 1. Por qué existe esta spec

En la captura móvil actual (`tests/screens.spec.ts-snapshots/biblioteca-mobile-darwin.png`, 390 px) la barra tiene tres elementos compitiendo por el ancho: logo, botón `Iniciar Sesión` y hamburguesa. El resultado es que **los dos textos parten en dos líneas**: el logo se lee `ARCADE` / `VAULT` y el botón `Iniciar` / `Sesión`. La barra queda alta, descuadrada y el logo pierde su forma de marca.

El panel hamburguesa ya existe y ya tiene un enlace de sesión, pero es un enlace `Cuenta` que navega a `/auth` y **no cierra sesión**: en móvil hoy no hay forma de hacer `signOut`, mientras que en escritorio el botón `PX_KAI ▾` sí lo hace. Esta spec arregla las dos cosas a la vez, porque son el mismo cambio: sacar la sesión de la barra y darle sitio de verdad dentro del panel.

No se toca ninguna pantalla, ningún dato y ninguna ruta. Es un cambio acotado a `components/nav.tsx`, al bloque de navbar de `app/globals.css` y a `tests/screens.spec.ts`.

---

## 2. Alcance

**Dentro:**

- Ocultar `.av-nav .auth-btn` dentro del `@media (max-width: 840px)` que ya existe, junto a `.links` y `.coin-counter`.
- Bloque de sesión nuevo al pie de `.av-mobile-panel`, por encima de `CRÉDITOS · 03`:
  - Sin sesión: botón `INICIAR SESIÓN` que navega a `/auth` y cierra el panel.
  - Con sesión: el nombre del usuario (`PX_KAI`) como etiqueta y debajo un botón `CERRAR SESIÓN` que hace `signOut()` y cierra el panel.
- Quitar del panel el enlace de sesión actual (`Iniciar Sesión` / `Cuenta`), que queda sustituido por ese bloque.
- `white-space: nowrap` en `.av-nav .logo-text` para que el logo no parta.
- Ajustes de prueba: las tres pruebas del describe `auth` que afirman sobre `.auth-btn` de la barra se saltan en el proyecto `mobile`; se añaden pruebas nuevas del flujo móvil dentro del describe `responsive`.
- Borrado y regeneración de las **cinco** capturas de referencia móviles.
- Verificación manual con el MCP de Playwright antes de regenerar las capturas.

**Fuera de alcance:**

- Las cinco capturas de escritorio. No se borran: se quedan como red de seguridad para demostrar que el cambio no se filtra a escritorio.
- El resto de la barra móvil. `CRÉDITOS · 03` sigue oculto en la barra y visible solo en el panel; el contador no gana lógica.
- Página de cuenta de usuario. Sigue sin existir, igual que en SPEC 01.
- La pantalla `/auth` y `components/auth-form.tsx`. No se tocan.
- Cualquier otra pantalla, componente o CSS fuera del bloque `/* ===== navbar ===== */`.
- Breakpoints nuevos. Se reutiliza el de 840 px que ya rige toda la barra.

---

## 3. Modelo de datos

Esta spec no introduce estructuras nuevas. Reutiliza `SessionUser` y `useSession()` de `components/session-provider.tsx` (SPEC 01) tal cual.

Único cambio de tipos, por limpieza: el tipo local `Section` de `components/nav.tsx` pierde el miembro `"auth"` y `sectionOf()` deja de devolverlo, porque el enlace que lo consumía desaparece del panel.

```ts
// components/nav.tsx — antes
type Section = "biblioteca" | "salon" | "auth";
// después
type Section = "biblioteca" | "salon";
```

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y navegable.

1. **CSS del logo.** Añadir `white-space: nowrap` a `.av-nav .logo-text` en `app/globals.css`. En escritorio el logo ya cabía en una línea, así que la regla no cambia nada allí.

2. **CSS de la barra.** Añadir `.av-nav .auth-btn { display: none; }` dentro del `@media (max-width: 840px)` existente, junto a las reglas de `.links` y `.coin-counter`. A partir de aquí la barra móvil es logo + hamburguesa.

3. **CSS del bloque de sesión del panel.** Añadir bajo las reglas de `.av-mobile-panel` un bloque `.av-mobile-panel .panel-session` con separador superior (`border-top: 1px dashed var(--line-2)`), `padding-top`, y `.panel-session .panel-user` con la fuente `var(--pixel)`, tamaño 11 px y color `var(--cyan)` para el nombre. El botón usa `.btn` y ocupa el ancho completo del panel.

4. **`components/nav.tsx` — barra.** Sin cambios de marcado en la barra: el botón de sesión sigue renderizándose igual y es el CSS quien lo oculta. Así el mismo componente sirve para los dos anchos y no hay salto de hidratación.

5. **`components/nav.tsx` — panel.** Quitar el `<Link>` de sesión de la lista de enlaces del panel. Antes del `div` de `CRÉDITOS · 03`, insertar el bloque de sesión:
   - Sin `user`: `<Link className="btn" href="/auth" onClick={close}>INICIAR SESIÓN</Link>`.
   - Con `user`: `<div className="panel-user">{user.name}</div>` más `<button className="btn ghost" onClick={() => { signOut(); close(); }}>CERRAR SESIÓN</button>`.
   El `div` flexible (`style={{ flex: 1 }}`) se mantiene por encima del bloque para que sesión y créditos queden pegados al pie.

6. **Limpiar `Section`.** Quitar `"auth"` del tipo y la rama `if (pathname.startsWith("/auth"))` de `sectionOf()`. `npx tsc --noEmit` y `npm run lint` limpios.

7. **Verificar con el MCP de Playwright.** Con `npm run dev` levantado, viewport 390×844:
   - `/` — el logo se lee `ARCADE VAULT` en una sola línea y la barra no muestra el botón de sesión.
   - Abrir la hamburguesa sin sesión: aparece `INICIAR SESIÓN`, pulsarlo navega a `/auth` y el panel se cierra.
   - Recorrer las cinco rutas comprobando que `document.documentElement.scrollWidth - window.innerWidth <= 0`.
   Si algo falla aquí, corregir antes de tocar las capturas.

8. **Ajustar `tests/screens.spec.ts`.** En el describe `auth`, añadir `test.skip(isMobile, "el control de sesión vive en el panel, ver responsive")` a las tres pruebas que leen `.auth-btn` de la barra (`entrar deja la sesión en el Nav...`, `cerrar sesión borra av_user`, y la que consulta el `Nav` tras `signIn`). El helper `signIn()` no cambia: opera sobre el formulario de `/auth`, no sobre la barra.

9. **Añadir las pruebas móviles** al describe `responsive`, todas con `test.skip(!isMobile, "solo aplica al proyecto mobile")`:
   - la barra móvil no muestra `.av-nav .auth-btn` y sí la hamburguesa;
   - el logo ocupa una sola línea (altura de `.logo-text` menor que el doble de su `line-height` computado, o comprobación equivalente sobre `getClientRects().length === 1`);
   - sin sesión, el panel muestra `INICIAR SESIÓN` y pulsarlo lleva a `/auth`;
   - con sesión (`signIn()` primero), el panel muestra `PX_KAI` y `CERRAR SESIÓN`, y pulsarlo deja `localStorage.av_user` a `null`.

10. **Borrar las capturas móviles.** Eliminar los cinco ficheros `tests/screens.spec.ts-snapshots/{biblioteca,detalle,reproductor,auth,salon}-mobile-darwin.png`. No tocar los `-desktop-darwin.png`.

11. **Regenerar y validar.** `npx playwright test --project=mobile --update-snapshots` para crear las cinco capturas nuevas, y después `npx playwright test` completo para confirmar que los dos proyectos pasan y que las capturas de escritorio siguen coincidiendo sin regenerarse.

---

## 5. Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings nuevos.
- [ ] `npm run lint` sale limpio.
- [ ] `npx tsc --noEmit` sale limpio.
- [ ] `npx playwright test` pasa en los proyectos `desktop` y `mobile`.
- [ ] A 390 px de ancho, `.av-nav .auth-btn` no es visible en ninguna de las cinco rutas.
- [ ] A 390 px de ancho, `.av-nav .logo-text` ocupa una sola línea (un único rectángulo de cliente).
- [ ] A 841 px de ancho, `.av-nav .auth-btn` sigue visible y la hamburguesa oculta.
- [ ] A 390 px sin sesión, abrir la hamburguesa muestra un botón `INICIAR SESIÓN`; pulsarlo navega a `/auth` y cierra el panel.
- [ ] A 390 px con sesión `PX_KAI`, abrir la hamburguesa muestra el nombre `PX_KAI` y un botón `CERRAR SESIÓN`.
- [ ] Pulsar `CERRAR SESIÓN` en el panel deja `localStorage.av_user` a `null`, cierra el panel y el siguiente abrir del panel ya muestra `INICIAR SESIÓN`.
- [ ] El panel ya no contiene el enlace `Cuenta`.
- [ ] El panel sigue mostrando `Biblioteca`, `Salón de la Fama` y `CRÉDITOS · 03`.
- [ ] A 390 px de ancho ninguna de las cinco rutas produce scroll horizontal.
- [ ] Existen exactamente cinco ficheros `*-mobile-darwin.png` en `tests/screens.spec.ts-snapshots/`, todos regenerados en este cambio.
- [ ] Los cinco ficheros `*-desktop-darwin.png` siguen siendo los de SPEC 01, sin modificar (`git status` no los marca).
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/` a 390 px, con y sin sesión.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** mismo breakpoint de 840 px que `.links`, `.coin-counter` y `.hamburger`. La barra tiene dos estados, escritorio o hamburguesa, y no un tercero intermedio que testear aparte.
- **No:** breakpoint nuevo a ~560 px dejando el botón de sesión visible entre 840 y 560 px. Aprovecharía el ancho de tablet a cambio de un tercer estado visual, más media queries y más capturas.
- **Sí:** nombre del usuario como etiqueta más botón `CERRAR SESIÓN` explícito en el panel. Es la paridad real con el `signOut` de escritorio, y en un panel desplegado sobra sitio para escribir la acción entera.
- **No:** copiar literal el botón `PX_KAI ▾` de escritorio dentro del panel. El `▾` promete un desplegable que no existe; en la barra se tolera por espacio, en el panel no hace falta mentir.
- **No:** mantener el enlace `Cuenta` hacia `/auth`. Era el cambio mínimo, pero dejaba móvil sin forma de cerrar sesión y la página de cuenta sigue fuera de alcance desde SPEC 01.
- **Sí:** `white-space: nowrap` a secas en `.logo-text`, sin tocar el tamaño. Con el botón de sesión fuera de la barra sobra ancho a 390 px, así que el logo entra completo y se ve idéntico a escritorio.
- **No:** reducir la fuente del logo en móvil, ni `clamp()` fluido. Lo primero achica la marca sin necesidad; lo segundo hace que el tamaño dependa del viewport exacto y vuelve frágiles las capturas.
- **Sí:** ocultar el botón por CSS dejando el marcado igual en los dos anchos. Renderizar condicionalmente según el ancho exigiría medir en cliente y reintroduciría el riesgo de desajuste de hidratación que SPEC 01 ya evitó en el `SessionProvider`.
- **Sí:** saltar en `mobile` las tres pruebas de sesión que leen la barra y escribir pruebas móviles nuevas en `responsive`. Cada prueba queda lineal y legible, y el flujo móvil se afirma donde ya viven las demás aserciones responsive.
- **No:** un helper `authControl(page, isMobile)` que abra el panel antes de leer el control. Ahorra líneas, pero mete una rama por viewport dentro de pruebas que hoy se leen de un tirón.
- **No:** reutilizar la clase `.auth-btn` dentro del panel para que los selectores actuales sigan valiendo. No ahorra nada real —habría que abrir el panel igualmente— y crea dos elementos distintos con la misma clase.
- **Sí:** borrar solo las cinco capturas móviles. Las de escritorio sin regenerar son la prueba de que el cambio no se ha filtrado; regenerarlas todas destruiría esa señal.
- **No:** ampliar el alcance sacando `CRÉDITOS · 03` a la barra móvil con el espacio liberado. El objetivo era descongestionar la barra, no rellenarla otra vez.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
| --- | --- |
| `white-space: nowrap` desborda el logo en pantallas más estrechas que 390 px (por ejemplo 320 px) | El criterio de "sin scroll horizontal" se comprueba a 390 px, que es el viewport del proyecto `mobile` (iPhone 13). Si aparece un ancho objetivo menor, se resuelve en otra spec con una media query específica, no con `clamp()`. |
| Las capturas móviles regeneradas esconden una regresión real de layout | El paso 7 verifica a mano con el MCP de Playwright **antes** de regenerar. Las capturas se aceptan solo después de que la comprobación manual pase. |
| Alguna prueba de escritorio se apoya sin querer en el enlace `Cuenta` del panel | El panel está oculto en escritorio y ninguna prueba actual lo consulta fuera del describe `responsive`; la suite completa del paso 11 lo confirma. |
| `signOut()` seguido de `close()` deja el panel con el estado anterior un frame | Ambos son `setState` de React en el mismo manejador, así que se agrupan en un único render. Cubierto por la prueba de `CERRAR SESIÓN`. |
| Ocultar `.auth-btn` por CSS lo deja accesible por teclado aunque sea invisible | `display: none` lo saca del orden de tabulación y del árbol de accesibilidad; no hace falta `inert` extra. Basta comprobarlo con la aserción `toBeHidden()` de Playwright, que ya distingue `display: none`. |

---

## 8. Lo que **no** entra en esta spec

- Página de cuenta de usuario.
- Lógica real del contador de créditos.
- Cambios en `/auth` o en el formulario de autenticación.
- Regeneración de las capturas de escritorio.
- Breakpoints o comportamiento responsive fuera de la barra de navegación.
