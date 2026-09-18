# SPEC 05 — Página `/acerca` con formulario de contacto por Resend

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 03, SPEC 04
> **Fecha:** 2026-09-18
> **Objetivo:** Añadir la séptima pantalla, portada de `references/templates/home-about/about.jsx`, con su entrada `Acerca de` en el nav y un formulario de contacto que envía correo por Resend desde un Route Handler propio.

---

## 1. Alcance

Primer endpoint del proyecto y primera llamada saliente. Sin base de datos ni sesión real; el resto de fronteras simuladas no se toca.

**Dentro:** ruta `/acerca` portada de `about.jsx` (hero + misión + 3 destacados, separador de píxeles, contacto con 3 avisos + formulario) · componentes en `components/about/` (§3) · CSS del bloque `ABOUT PAGE` portado a `globals.css` (§4.2) + estado de error nuevo · endpoint `app/api/contacto/route.ts` · `.env.example` commiteado y `!.env.example` en `.gitignore` · entrada `Acerca de` en nav de escritorio y panel móvil + sección `acerca` en `sectionOf` · `useReveal` movido a `components/use-reveal.ts` · tests de página y de contrato del endpoint · 12 capturas regeneradas + 2 nuevas (el nav cambia en las 6 pantallas) · `README.md`.

**Fuera:** dominio verificado en Resend (se usa `onboarding@resend.dev`, que **solo entrega al correo de la cuenta**) · persistir mensajes · auto-respuesta, HTML del correo (se envía `text`), adjuntos · captcha · cambios en las 6 rutas existentes más allá del enlace del nav · `lib/*`, `AGENTS.md` · migrar CSS a Tailwind · i18n.

---

## 2. Contrato

Sin tipos nuevos en `lib/`. En `app/api/contacto/route.ts`:

```ts
type ContactPayload = {
  name: string;
  email: string;
  msg: string;
  website: string; // honeypot: siempre vacío en un envío humano
};

type ContactResponse =
  | { ok: true; simulated?: boolean }
  | { ok: false; error: string };
```

`200` enviado o simulado · `400` validación · `429` rate limit · `502` Resend respondió mal.

Los 3 destacados (`HEART` / `BROWSER` / `PLANT`) y los 3 avisos (`RESPUESTA EN 24-48H`, `SUGERENCIAS BIENVENIDAS`, `SIN SPAM, JAMÁS`) van como literales en el componente que los pinta, copiados de `about.jsx` — regla de SPEC 04 §2.

---

## 3. Componentes

`app/acerca/page.tsx`: componente de servidor fino, compone las secciones dentro de `<div className="about fade-in">`. Sin `"use client"` ni marcado propio.

| Fichero | Tipo | Contenido |
| --- | --- | --- |
| `components/about/about-hero.tsx` | servidor | `.about-hero`: kicker, `.about-title`, `.about-mission`, `.highlight-row` con los 3 destacados y su `transitionDelay` escalonado |
| `components/about/highlight-icon.tsx` | servidor | los 3 SVG de `HighlightIcon`, `aria-hidden` |
| `components/about/about-divider.tsx` | servidor | `.about-divider`: 2 `.div-bar` + 24 `span` con `animationDelay`, `aria-hidden` |
| `components/about/contact-section.tsx` | servidor | `.about-contact` + `.contact-grid`: `.contact-intro` con los 3 `.tip`, monta `<ContactForm />` |
| `components/about/contact-form.tsx` | **cliente** | estado, envío al endpoint, terminales de éxito y error, y la llamada a `useReveal()` |

`contact-form.tsx` es el único cliente de la página, y por eso el que llama a `useReveal()`. El hook de SPEC 04 sirve tal cual (incluido `prefers-reduced-motion`): se **mueve** a `components/use-reveal.ts` y se actualiza su único import. `.reveal`, `.reveal.armed` y `.reveal.armed.in` ya están en `globals.css` y **no se vuelven a portar**.

Estados, todos en el mismo `<form className="contact-form">`:

| Estado | Qué se ve |
| --- | --- |
| `idle` | Los 3 campos y `▶ ENVIAR MENSAJE` |
| `idle` + validación fallida | `.contact-form.shake` 400ms, como la maqueta. Sin petición al servidor |
| `sending` | Botón deshabilitado, texto `ENVIANDO…` |
| `sent` | `.terminal-success` verde de la maqueta, nombre en mayúsculas, `ENVIAR OTRO MENSAJE` |
| `error` | `.terminal-success.error`: mismo terminal en rojo, líneas `[ERR]`, el mensaje del endpoint y `REINTENTAR`, que vuelve al formulario **con los campos intactos**. No existe en la maqueta: hay que inventarlo |

---

## 4. Plan

Cada paso deja la aplicación compilando y navegable.

1. Mover `components/home/use-reveal.ts` a `components/use-reveal.ts` y corregir el import del home. Sin cambio visual.

2. **CSS.** Portar a `globals.css`, en sección nueva comentada, el bloque `/* ===== ABOUT PAGE ===== */` de `references/templates/home-about/styles.css` (líneas 1072-1146), más `@keyframes pxblink`, `@keyframes shake`, `.btn.press:active` y sus media queries (`820px` para `.highlight-row`, `900px` para `.contact-grid`).

   **Conflicto** (regla de SPEC 04): si una regla ya existe, gana la existente y no se copia. Afecta al menos a `.field` e hijos, `.btn` y variantes, `.kicker`, `.pixel`, `.neon-*`, `.fade-in`, `@keyframes blink` y todo `.reveal*`. `.contact-form textarea` se descarta: `.field textarea` ya lo cubre.

   Regla nueva:

   ```css
   .terminal-success.error { border-color: var(--magenta); box-shadow: 0 0 22px rgba(255,0,200,0.25); }
   .terminal-success.error .term-body .line { color: var(--magenta); }
   .terminal-success.error .term-body .success { color: var(--magenta); text-shadow: 0 0 6px rgba(255,0,200,0.45); }
   ```

3. **Endpoint** `app/api/contacto/route.ts`, `export async function POST`, en este orden exacto:

   1. Parsear cuerpo. JSON inválido → `400`.
   2. **Honeypot:** `website` con contenido → `200 { ok: true }` sin enviar ni registrar nada.
   3. **Rate limit:** `Map<string, number[]>` de módulo, clave = primera IP de `x-forwarded-for` (`"desconocida"` si falta). Máx. 3 envíos / 10 min → `429`. Comentar en el código que es *best effort*: se pierde al reiniciar, no cubre varias instancias.
   4. **Validación:** `name` 2-80 tras `trim`; `email` ≤254 y con formato; `msg` 10-2000. Al primer fallo, `400 { ok: false, error }` en español y mayúsculas, para que el terminal lo pinte tal cual.
   5. **Sin `process.env.RESEND_API_KEY`** → `console.info` con remitente, destinatario y mensaje, y `200 { ok: true, simulated: true }`. Camino que corre en un clon limpio y en `npm test`.
   6. **Con clave** → `POST https://api.resend.com/emails`, `Authorization: Bearer`, cuerpo `{ from: CONTACT_FROM_EMAIL, to: CONTACT_TO_EMAIL, reply_to: <email del formulario>, subject: "[Arcade Vault] Mensaje de <name>", text }`. Respuesta no-OK → `502`, detalle a `console.error`, nunca al cliente.

   `fetch` nativo, no el SDK `resend`: sin dependencia nueva.

4. **Entorno.** `!.env.example` en `.gitignore` justo bajo el `.env*` existente. `.env.example` (commiteado) y `.env.local` (ignorado) con las mismas tres claves:

   ```bash
   # Clave de https://resend.com/api-keys. Vacía = modo simulado: el formulario
   # responde OK y escribe el mensaje en la consola del servidor, sin enviar nada.
   RESEND_API_KEY=
   CONTACT_TO_EMAIL=manuel.entrena@gmail.com
   CONTACT_FROM_EMAIL=Arcade Vault <onboarding@resend.dev>
   ```

   Para enviar de verdad: cuenta en [resend.com](https://resend.com) **con el correo `manuel.entrena@gmail.com`** (el remitente de pruebas solo entrega a la dirección de la cuenta; otra exige dominio verificado), API key `re_…` en `.env.local`, reiniciar `npm run dev`. Sin cambios de código.

5. **Componentes** de `components/about/` según §3. Honeypot = `input name="website"` oculto por CSS, `tabIndex={-1}`, `autoComplete="off"`, `aria-hidden`. Ningún componente navega con `router.push`.

6. `app/acerca/page.tsx` según §3.

7. **Nav.** `type Section` gana `"acerca"`; `sectionOf` devuelve `acerca` para `/acerca`. Enlace `Acerca de` **después** de `Salón de la Fama`, en `.links` y en el panel móvil, con `cls("acerca")`. `footer.tsx` no se toca.

8. **Verificación manual** (`npm run dev`, 1440×900 y 390×844): las dos mitades pintan y los destacados responden al hover; al bajar, el reveal no deja nada invisible; campos vacíos → `shake` y ninguna petición; envío válido sin clave → terminal verde y mensaje en la consola del servidor; fallo forzado del endpoint → terminal rojo y `REINTENTAR` conserva lo escrito; el nav marca activo solo en `/acerca`.

9. **Tests** (`tests/screens.spec.ts`):
   - `ROUTES` gana `{ name: "acerca", path: "/acerca" }`; su captura llama a `disarmReveal` igual que la del home, o sale en negro por el `.reveal` (SPEC 04 §6).
   - `describe("acerca")`: 3 `.highlight`; formulario visible; envío vacío → `.contact-form.shake`; envío válido → `.terminal-success`; honeypot no enfocable con `Tab`.
   - `describe("endpoint de contacto")` con `request.post`: `400` sin campos, `200` con honeypot relleno, `200 simulated: true` con datos válidos.

10. **Capturas**, solo tras el paso 8: `npx playwright test --project=desktop --update-snapshots=all`, luego `--project=mobile`. Quedan **14 ficheros** (12 actualizados + `acerca-desktop-darwin.png` + `acerca-mobile-darwin.png`). El `=all` es obligatorio: con `maxDiffPixelRatio: 0.01` un enlace más en el nav no alcanza el umbral y el modo `changed` no reescribe nada (SPEC 04).

11. **README:** fila `/acerca`; «doce capturas»/«seis por proyecto» → «catorce»/«siete»; fila de esta spec; sección nueva de variables de entorno con el modo simulado, cómo conseguir la clave, el límite del remitente de pruebas y el rate limit *best effort*.

12. **Verificar:** `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm test`, en ese orden, en verde. (`tsc` necesita `.next/types`: un `next build` tras crear la ruta y el endpoint, antes de typechequear.)

---

## 5. Criterios de aceptación

- [ ] `/acerca` pinta `.about-hero` con exactamente 3 `.highlight`, `.about-divider` con 24 píxeles y `.contact-grid` con los 3 `.tip` y el formulario.
- [ ] `app/acerca/page.tsx` sin `"use client"` ni marcado propio; `contact-form.tsx` único cliente de `components/about/`.
- [ ] `components/use-reveal.ts` existe, `components/home/use-reveal.ts` no, y el home sigue revelando sus secciones.
- [ ] `POST /api/contacto`: `400` sin campos o fuera de rango, `200 { ok: true }` con honeypot relleno, `429` al cuarto envío en 10 min desde la misma IP, `200 { ok: true, simulated: true }` con datos válidos y sin `RESEND_API_KEY`.
- [ ] `.terminal-success` al enviar bien, `.terminal-success.error` al fallar; `REINTENTAR` no vacía los campos.
- [ ] Envío con campos vacíos: ninguna petición de red.
- [ ] `grep -rn "RESEND_API_KEY" app components lib` solo da `app/api/contacto/route.ts`.
- [ ] `git ls-files | grep "^\.env"` devuelve solo `.env.example`, con `RESEND_API_KEY` vacía.
- [ ] `globals.css` tiene `.about-hero`, `.highlight`, `.about-divider`, `.contact-grid`, `.terminal-success` y `.terminal-success.error`, sin duplicar `.field*`, `.btn*`, `.reveal*` ni `@keyframes blink`.
- [ ] Nav con `Inicio`, `Biblioteca`, `Salón de la Fama`, `Acerca de` en ese orden, en barra y panel móvil; el último activo solo en `/acerca`.
- [ ] 14 ficheros en `tests/screens.spec.ts-snapshots/`, regenerados **después** del paso 8.
- [ ] `describe("acerca")` y `describe("endpoint de contacto")` pasan.
- [ ] `lint`, `tsc --noEmit`, `build`, `test` en verde.
- [ ] `README.md` refleja `/acerca`, catorce capturas, la fila de esta spec y la sección de entorno.
- [ ] Sin cambios en `lib/games.ts`, `lib/scores.ts`, `lib/session.ts`.

---

## 6. Decisiones no obvias

| Decisión | Alternativa | Por qué |
| --- | --- | --- |
| Ruta `/acerca` | `/about` del mockup | Las 6 rutas existentes están en español. |
| Route Handler `POST /api/contacto` | Server Action | Elección explícita del usuario. A cambio de superficie pública —cubierta por honeypot, rate limit y validación— el contrato se testea con `request.post` sin montar la página. |
| `fetch` a la API REST | SDK `resend` | Solo se depende de `next`/`react`/`react-dom`; un POST de 3 campos no paga una dependencia. |
| Modo simulado sin clave | Fallar con 503 | Sin fallback, ni la implementación ni `npm test` (hace `next build`) recorren el camino feliz, y un clon sin secretos tendría el formulario roto. |
| `onboarding@resend.dev` | Dominio verificado | No hay dominio; evita registros DNS. |
| No persistir mensajes | JSON o base de datos | El proyecto no tiene almacenamiento y esta spec no lo introduce. |
| `useReveal` en `components/` | Dejarlo en `components/home/` | Con 2 consumidores, una carpeta de página quedaría como dependencia de otra. |
| Terminal de error con la estética del éxito | Texto plano bajo el botón | Romper el lenguaje visual se nota justo ahí. |
| Clave nunca commiteada | — | `.env*` ya ignorado; solo se abre `!.env.example`, vacía. Verificado con `git ls-files`. |
