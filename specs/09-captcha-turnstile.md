# SPEC 09 — Captcha con Cloudflare Turnstile en `/auth`

> **Estado:** Implementado
> **Depende de:** SPEC 07
> **Fecha:** 2026-09-22
> **Objetivo:** Añadir un widget de Cloudflare Turnstile a la tarjeta de `/auth` y pasar su token a `signInAnonymously`, `signUp` y `signInWithPassword`, para que activar el captcha en el proyecto de Supabase no deje el formulario muerto.

---

## 1. Punto de partida

Desde SPEC 07, cualquiera puede crear un usuario con un clic en `JUGAR COMO INVITADO`. El propio panel de Supabase lo advierte al activar las sesiones anónimas: sin captcha, un bot infla `auth.users` y los usuarios activos mensuales, que es lo que se factura.

SPEC 08 recorta el bulto de la base, no la factura: los invitados que un bot cree este mes ya están contados aunque se borren a los 30 días. El captcha es la pieza que falta, y va **antes** de publicar una URL.

Verificado en el código, no hace falta reinvestigarlo:

- Cuatro llamadas a Supabase Auth en `components/auth-form.tsx`: `signInWithPassword` (:91), `signUp` (:122), `signInWithOAuth` (:164) y `signInAnonymously` (:198).
- `translate()` (`components/auth-form.tsx:19`) ya convierte los mensajes de Supabase en castellano mayúscula y alimenta el terminal rojo de error.
- `supabase/config.toml:234` tiene el bloque `[auth.captcha]` comentado, con `provider = "hcaptcha"` de ejemplo.
- El proyecto no tiene ninguna dependencia de UI de terceros.

El captcha de Supabase se activa **por proyecto**, no por endpoint: encenderlo obliga a mandar token en los tres formularios de contraseña e invitado. `signInWithOAuth` queda fuera porque es una redirección y Supabase no lo aplica ahí.

---

## 2. Alcance

**Dentro:** carga del script de Turnstile con `next/script` · render y ciclo de vida del widget en `components/auth-form.tsx` · `options.captchaToken` en las tres llamadas · reinicio del token tras cada intento · rama de `translate()` para el error de captcha · `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en `.env.example` · bloque `[auth.captcha]` documentado y **apagado** en `supabase/config.toml` · guion manual de alta en Cloudflare y activación en el panel de Supabase · `README.md`.

**Fuera (para futuras specs):** captcha en el formulario de contacto de SPEC 05 · captcha en `signInWithOAuth` · validación del token en una ruta propia del servidor · hCaptcha como alternativa · modo de widget visible permanente · tests de Playwright que resuelvan un captcha real.

---

## 3. Contrato

### 3.1 Variables

| Clave                            | Dónde vive                                   | Quién la usa                        |
| -------------------------------- | -------------------------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | entorno de la app (`.env.local`, hosting)    | el navegador, para pintar el widget |
| _Secret key_ de Turnstile        | panel de Supabase → Auth → Attack Protection | Supabase, para verificar el token   |

La clave secreta **nunca** entra en el repositorio ni en el entorno de la app: la guarda Supabase y la verifica contra Cloudflare. En `.env.example` va solo la pública, con su explicación.

### 3.2 `components/auth-form.tsx`

**Clave ausente = captcha ausente.** Todo el bloque cuelga de `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Sin clave no se carga el script, no se pinta nada y `captchaToken` viaja como `undefined`. Eso es lo que mantiene intactos el stack local, `npm test` y las diez capturas de referencia.

**Script.** `next/script` con `strategy="lazyOnload"` y `src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"`. Render explícito: el widget se monta cuando el componente decide, no cuando el script aterriza.

**Render.** En un `useEffect`, sobre un `div` con `ref`:

```ts
window.turnstile.render(el, {
  sitekey,
  theme: "dark",
  appearance: "interaction-only",
  callback: (token: string) => setCaptcha(token),
  "expired-callback": () => setCaptcha(""),
  "error-callback": () => setCaptcha(""),
});
```

`interaction-only`: invisible mientras Cloudflare resuelve solo, y solo se pinta si hace falta un humano. El contenedor reserva su hueco con una altura mínima para que la tarjeta CRT no salte cuando aparece. Al desmontar, `window.turnstile.remove(widgetId)`.

**Estado.** Un `const [captcha, setCaptcha] = useState("")` junto a los que ya hay (`components/auth-form.tsx:63-69`). El identificador del widget vive en un `useRef`.

**Envío.** Las tres llamadas reciben el token dentro de `options`:

```ts
await supabase.auth.signInAnonymously({ options: { captchaToken: captcha } });
await supabase.auth.signInWithPassword({
  email,
  password: pass,
  options: { captchaToken: captcha },
});
await supabase.auth.signUp({
  email,
  password: pass,
  options: { data: { username }, emailRedirectTo, captchaToken: captcha },
});
```

**Un token, un intento.** El token de Turnstile es de un solo uso y caduca a los cinco minutos. Tras cada intento — salga bien o mal — `window.turnstile.reset(widgetId)` y `setCaptcha("")`. Sin esto, el segundo envío tras un error falla siempre con un mensaje que no tiene nada que ver con lo que el jugador escribió.

**Botones siempre activos.** No se deshabilita nada esperando token. Si el script no carga (bloqueador, red), el envío sale sin token, Supabase lo rechaza y el error cae en el terminal rojo que ya existe. Un bloqueador no deja tres botones muertos sin explicación.

### 3.3 `translate()`

Rama nueva, con el resto (`components/auth-form.tsx:19`):

```ts
if (m.includes("captcha"))
  return "VERIFICACIÓN ANTI-BOT FALLIDA, INTÉNTALO DE NUEVO";
```

Cubre tanto el token ausente como el rechazado: Supabase devuelve `captcha protection: request disallowed (...)` en ambos casos.

### 3.4 `supabase/config.toml`

El bloque sigue comentado, pero documentado para Turnstile en vez de hCaptcha:

```toml
# Captcha del proyecto remoto. Apagado en local a propósito: encenderlo aquí
# obliga a la suite de Playwright a resolver un captcha real en cada prueba
# de /auth. La clave secreta vive en el panel de Supabase, nunca aquí.
# [auth.captcha]
# enabled = true
# provider = "turnstile"
# secret = ""
```

### 3.5 Guion manual (no lo hace la implementación)

1. Cloudflare → Turnstile → Add site. Dominio de producción y, si se quiere probar en local, `localhost`. Widget mode _Managed_.
2. Copiar la _site key_ al entorno de la app como `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
3. Panel de Supabase → Authentication → Attack Protection → Enable Captcha protection, proveedor **Turnstile**, pegar la _secret key_.
4. Desplegar la app con la variable puesta **antes** de activar el flag del paso 3. Al revés, el formulario queda inservible en el hueco entre ambos.

---

## 4. Plan de implementación

1. `.env.example` con `NEXT_PUBLIC_TURNSTILE_SITE_KEY` comentada y explicada, y el bloque `[auth.captcha]` de `config.toml` reescrito para Turnstile. Comprobación: `npm run dev` arranca igual y `/auth` no cambia.
2. Script, `div` contenedor, estado y render del widget en `auth-form.tsx`, sin tocar todavía las llamadas de envío. Comprobación: sin clave, `/auth` idéntico y sin peticiones a `challenges.cloudflare.com`; con clave de prueba en `.env.local`, el script carga y el token llega al estado.
3. `captchaToken` en las tres llamadas, reinicio del widget tras cada intento, y la rama de `translate()`. Comprobación: con el captcha activo en un proyecto de pruebas, entrar falla sin token y funciona con él; dos intentos seguidos con contraseña mala dan el mismo error de contraseña, no uno de captcha.
4. Estilo del contenedor en `app/globals.css` bajo las clases `.av-*` que ya usa la tarjeta: altura mínima reservada y centrado sobre el botón de envío. Comprobación: al aparecer el widget, ningún elemento de la tarjeta se desplaza.
5. Documentar en `README.md` el guion de §3.5 y la regla de orden (variable antes que flag).

---

## 5. Criterios de aceptación

- [ ] Sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `/auth` no carga ningún recurso de `challenges.cloudflare.com`.
- [ ] Sin la variable, `npm test` sigue verde y las diez capturas de referencia no necesitan regenerarse.
- [ ] Con la variable puesta, `/auth` obtiene un token de Turnstile y lo guarda en el estado del componente.
- [ ] Las tres llamadas (`signInAnonymously`, `signUp`, `signInWithPassword`) envían `options.captchaToken`.
- [ ] `signInWithOAuth` no envía token y los botones de Google y GitHub siguen funcionando.
- [ ] Con el captcha activo en el proyecto y sin token, el terminal rojo dice `VERIFICACIÓN ANTI-BOT FALLIDA, INTÉNTALO DE NUEVO` y no un mensaje en inglés.
- [ ] Dos envíos seguidos con contraseña incorrecta devuelven las dos veces `CORREO O CONTRASEÑA INCORRECTOS`, no un error de captcha en el segundo.
- [ ] Con el script bloqueado por un bloqueador de anuncios, los tres botones siguen pulsables y el fallo sale por el terminal.
- [ ] Cuando el widget se pinta, ningún elemento de la tarjeta se desplaza.
- [ ] `package.json` no tiene ninguna dependencia nueva.
- [ ] Ningún fichero versionado contiene la _secret key_ de Turnstile.
- [ ] `npx tsc --noEmit` y `npm run lint` limpios.

---

## 6. Decisiones

- **Sí:** Turnstile. Gratis y sin cupo, y en el caso normal el jugador no ve nada.
- **No:** hCaptcha. Plan gratuito con límites y más puzzle visible, en una pantalla que es media estética.
- **Sí:** los tres formularios de contraseña e invitado. El flag de Supabase es por proyecto: cubrirlos no es opcional.
- **No:** validar el token en una ruta propia. Supabase ya lo verifica contra Cloudflare; duplicarlo es superficie extra sin ganancia.
- **Sí:** `next/script` y la API global. Cero dependencias nuevas y control del ciclo de vida del token.
- **No:** `@marsidev/react-turnstile`. Una dependencia de UI de terceros en un proyecto que no tiene ninguna.
- **Sí:** todo condicionado a la clave pública. Es lo que deja el stack local, la suite y las capturas sin tocar.
- **No:** las claves de prueba de Turnstile en local. Meterían una carga de script de Cloudflare en cada prueba de `/auth` y obligarían a regenerar las capturas.
- **Sí:** `appearance: "interaction-only"`. La tarjeta CRT se queda como está en el caso normal.
- **Sí:** botones siempre activos y fallo por el terminal existente. Un bloqueador no debe dejar la pantalla muerta y sin explicación.
- **Sí:** reinicio del widget tras cada intento. El token es de un solo uso; sin esto el segundo envío miente sobre la causa del error.
- **No:** captcha en el formulario de contacto de SPEC 05. Otro formulario, otro riesgo, otra spec.
- **No:** activar el flag en producción desde la implementación. Se entrega el guion, lo ejecuta el usuario.

---

## 7. Riesgos

| Riesgo                                                                       | Mitigación                                                                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Flag activado en Supabase antes de desplegar la variable: `/auth` inservible | Orden explícito en §3.5 y en `README.md`: variable y despliegue primero, flag después.                                 |
| Token caducado en una pestaña abierta mucho rato                             | `expired-callback` limpia el estado y Turnstile renueva solo; el peor caso es un envío fallido con mensaje correcto.   |
| `interaction-only` no se ve nunca y nadie detecta que dejó de funcionar      | El criterio de aceptación se verifica con el captcha activo en un proyecto de pruebas, no fiándose de que no aparezca. |
| Turnstile caído: nadie entra ni juega como invitado                          | Aceptado. El flag se apaga desde el panel de Supabase en segundos, sin desplegar nada.                                 |
