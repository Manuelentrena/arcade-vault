# SPEC 11 — Captcha visible en `/auth`

> **Estado:** Implementado
> **Depende de:** SPEC 09
> **Fecha:** 2026-09-24
> **Objetivo:** Cambiar el widget de Turnstile de `interaction-only` a `always` para que el captcha se vea en la tarjeta de `/auth`, y ajustar el hueco reservado a la altura real del widget.

---

## 1. Punto de partida

La SPEC 09 eligió `appearance: "interaction-only"`: invisible mientras Cloudflare resuelve solo, pintado únicamente si hace falta un humano. La razón era buena — no cobrarle un clic a cada jugador legítimo — y sigue siendo cierta.

Lo que esa spec no previó lo escribió ella misma en su tabla de riesgos:

> `interaction-only` no se ve nunca y nadie detecta que dejó de funcionar

Eso se materializó el día del despliegue a producción (SPEC 10). Con el captcha **correctamente configurado de extremo a extremo**, la pantalla era indistinguible de una rota:

- la _site key_ estaba inlineada en el bundle que sirve Vercel,
- el flag de _Attack Protection_ de Supabase estaba activo y rechazaba con `captcha_failed` cualquier petición sin token,
- Cloudflare tenía registrado el hostname correcto (`arcade-vault.vercel.app` y un dominio de control daban `110200`; el hostname real no).

Y aun así, lo que se veía en la tarjeta era un hueco vacío de 65px entre CONTRASEÑA y ENTRAR AL VAULT. Hicieron falta cuatro sondas externas —el HTML servido, el bundle, una petición sin token contra Supabase y un comparador de hostnames contra Cloudflare— para concluir que no pasaba nada.

**El problema no es de seguridad, es de observabilidad.** Un sistema que funciona y uno que está roto pintan exactamente lo mismo, y eso convierte cualquier duda futura en una investigación de veinte minutos.

Verificado midiendo el widget en un navegador real con la clave de pruebas pública de Cloudflare (`1x00000000000000000000AA`):

| `size`                                         | Tamaño real     |
| ---------------------------------------------- | --------------- |
| `normal` (el que usa el proyecto, por defecto) | **300 × 71 px** |
| `compact`                                      | 150 × 144 px    |
| `flexible`                                     | 300 × 71 px     |

`app/globals.css:1597` reserva `min-height: 65px`. **Faltan 6px**, así que hoy la tarjeta da un salto de 6px las raras veces que Cloudflare sí pinta el desafío. Nadie lo ha visto porque casi nunca ocurre.

`components/auth-form.tsx` no pasa `size` al `render()`, así que ya está en `normal`: este cambio no lo toca.

---

## 2. Alcance

**Dentro:** `appearance: "always"` en el `turnstile.render()` de `components/auth-form.tsx` · `min-height` de `.av-captcha` ajustado a la altura real del widget · actualización de la frase del `README.md` que promete que el jugador no ve nada · fila de la SPEC 11 en el índice de specs.

**Fuera (para futuras specs):** cambiar el `size` del widget · cubrir el widget en la suite de Playwright · tocar la _secret key_, el flag de Supabase o la configuración de Cloudflare · añadir un estado visual propio de error del captcha · captcha en `signInWithOAuth` (sigue sin aplicar: es una redirección) · cualquier cambio en la lógica de envío, el reinicio del widget tras cada intento o la traducción de errores.

---

## 3. Contrato

### 3.1 Modelo de datos

**Ninguno.** Esta spec no introduce estructuras nuevas, ni en base de datos ni en el cliente. `captcha`, `scriptReady` y `widgetId` siguen siendo exactamente los mismos estados que dejó la SPEC 09.

### 3.2 El cambio

Una línea en `components/auth-form.tsx`, dentro del `turnstile.render()`:

```diff
-      // Invisible mientras Cloudflare resuelve solo; sólo se pinta si hace
-      // falta un humano. La tarjeta CRT se queda como está en el caso normal.
-      appearance: "interaction-only",
+      // Visible siempre: en el caso normal Cloudflare resuelve solo y la caja
+      // se queda en verde sin pedir nada. Se pinta para que un captcha que
+      // funciona y uno roto no se vean igual — ver SPEC 11 §1.
+      appearance: "always",
```

**`always` no fuerza una interacción.** Renderiza la caja siempre; la dificultad del desafío la sigue decidiendo Cloudflare con el widget en modo **Managed**. En el caso normal la caja se resuelve sola y se queda en «Success!» sin que nadie la toque. Solo pide un gesto cuando ya lo habría pedido con `interaction-only`.

`theme: "dark"` no cambia: es lo que mantiene la caja dentro de la paleta CRT.

### 3.3 El hueco

```diff
 .av-captcha {
   display: flex;
   justify-content: center;
-  min-height: 65px;
+  min-height: 71px;
   margin-top: 16px;
 }
```

El centrado se queda: con `size: normal` el widget mide 300px y la tarjeta 382px, así que va centrado sobre el botón de envío.

El `min-height` deja de ser un hueco reservado que casi siempre está vacío y pasa a ser la altura exacta de lo que va a haber ahí. Se mantiene como `min-height` y no como `height` por la misma razón de la SPEC 09: si Cloudflare decide pintar un desafío más alto, el contenedor crece en vez de recortarlo.

### 3.4 Lo que no cambia, y conviene dejarlo escrito

**La seguridad es idéntica.** `appearance` es un parámetro de presentación: controla si se pinta la caja, no qué hace el desafío. Son iguales en los dos modos la recogida de señales de Cloudflare, la dificultad, el token emitido, su validez (~300s, un solo uso, atado a la _site key_ y al hostname) y la verificación con `siteverify` que hace Supabase con la _secret key_. Lo que le cuesta a un bot pasar es exactamente lo mismo.

**Tampoco revela nada.** El navegador descarga `challenges.cloudflare.com/turnstile/v0/api.js` en los dos modos y se ve en la pestaña de red sin esfuerzo: la presencia de Turnstile ya era pública.

**Nada de configuración nueva.** `appearance` queda fijo en el código. No hay variable de entorno para esto: es una decisión de diseño, y al ser `NEXT_PUBLIC_*` una variable exigiría un redeploy igual que un cambio de código, así que no ahorraría nada.

**La suite no se entera.** Ni `playwright.config.ts` ni `.env.local` definen `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, así que en pruebas `TURNSTILE_SITE_KEY` es `""` y no se renderiza ni el `<Script>` ni el contenedor. **Las 14 capturas de referencia no se tocan**, y que sigan intactas es parte de los criterios de aceptación.

### 3.5 Documentación

- `README.md:112` promete lo contrario de lo que hará el widget y hay que reescribirlo:

  > En el caso normal el jugador no ve nada — el widget va en modo `interaction-only` y sólo se pinta si Cloudflare necesita a un humano.

  El texto nuevo dice que la caja se pinta siempre, que en el caso normal se resuelve sola sin pedir nada, y por qué se prefiere verla: un captcha invisible que deja de funcionar no avisa.

- Fila de la SPEC 11 en el índice de specs del `README.md`.

- **La SPEC 09 no se reescribe.** Su decisión fue correcta con lo que se sabía entonces; esta spec la revierte y deja constancia de por qué. Las specs son un registro de lo que se decidió, no un documento vivo.

- `CLAUDE.md` no menciona `appearance` en ningún sitio: no hay nada que actualizar ahí.

---

## 4. Plan de implementación

1. `appearance: "always"` y comentario nuevo en `components/auth-form.tsx` (§3.2). Comprobación: con la clave de pruebas de Cloudflare en `.env.local` y `npm run dev`, `/auth` pinta la caja en las dos pestañas y sobre `JUGAR COMO INVITADO`. Sin la variable, la pantalla queda idéntica a hoy.
2. `min-height: 71px` en `.av-captcha` (§3.3). Comprobación: con el widget pintado, medir que la caja ocupa 300×71 y que ENTRAR AL VAULT no se desplaza verticalmente entre el instante previo y el posterior al render.
3. Frase del `README.md` reescrita y fila de la SPEC 11 en el índice (§3.5).
4. Verificación final: `npm test` verde con las 14 capturas intactas, `npx tsc --noEmit` y `npm run lint` limpios.

---

## 5. Criterios de aceptación

- [ ] Con `NEXT_PUBLIC_TURNSTILE_SITE_KEY` puesta, `/auth` pinta la caja de Turnstile en las pestañas INICIAR SESIÓN y CREAR CUENTA, y sobre `JUGAR COMO INVITADO`.
- [ ] La caja mide 300 × 71 px y queda centrada en la tarjeta.
- [ ] Al pintarse el widget, ningún elemento de la tarjeta se desplaza verticalmente.
- [ ] Sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `/auth` queda exactamente como hoy: ni `<Script>`, ni contenedor, ni hueco, ni peticiones a `challenges.cloudflare.com`.
- [ ] `npm test` sigue verde y **ninguna** de las 14 capturas de referencia se regenera.
- [ ] `npx tsc --noEmit` y `npm run lint` limpios.
- [ ] En producción, con el flag de Supabase activo, siguen funcionando entrar, crear cuenta y `JUGAR COMO INVITADO`.
- [ ] No hay variables de entorno nuevas ni dependencias nuevas en `package.json`.
- [ ] `components/auth-form.tsx` no pasa `size` al `render()` — sigue en el `normal` por defecto.

---

## 6. Decisiones

- **Sí:** `appearance: "always"`. Un captcha que nunca se ve no se distingue de uno roto, y eso ya costó una investigación de cuatro sondas el día del despliegue. La observabilidad vale el clic que Cloudflare pedirá en el caso raro.
- **Sí:** revertir una decisión de la SPEC 09. Aquella eligió bien con lo que sabía; lo que cambió es que ahora hay una URL pública y un incidente real que demuestra el coste de la invisibilidad.
- **No:** ningún cambio de seguridad. `appearance` es presentación. Queda escrito en §3.4 para que nadie lo «endurezca» de vuelta creyendo que gana algo.
- **Sí:** `size` en `normal` (300 × 71), centrado. Es el que ya usa el proyecto por defecto, cabe de sobra en los 382px de la tarjeta y en el viewport móvil de 390px, y es el único de los tres medido en el layout real.
- **No:** `compact` (150 × 144). Ocupa menos ancho pero más del doble de alto: la tarjeta crecería 75px y en móvil empujaría los botones de OAuth fuera de la primera pantalla.
- **No:** `flexible` a ancho completo. Encajaría mejor con los controles de la tarjeta, pero obliga a quitar el `justify-content: center` de `.av-captcha` y su comportamiento en ese layout concreto no está verificado. Si se quiere, es un cambio posterior con una medición delante.
- **No:** cubrir el widget en la suite de Playwright con la clave de pruebas de Cloudflare. Permitiría afirmar que se pinta, pero metería un iframe de un tercero dentro de capturas comparadas píxel a píxel y obligaría a regenerar las de `/auth`. Es una fábrica de fallos intermitentes a cambio de poca señal.
- **No:** variable de entorno para `appearance`. Al ser `NEXT_PUBLIC_*` necesitaría un redeploy igual que el cambio de código, así que solo añadiría una variable que mantener y una rama más.
- **No:** estado visual propio para el fallo del captcha. Con la caja visible, el widget de Cloudflare pinta su propio error, y el terminal rojo `VERIFICACIÓN ANTI-BOT FALLIDA` de la SPEC 09 sigue cubriendo el envío. Añadir un tercer canal sería ruido.
- **No:** reescribir la SPEC 09. Las specs registran lo que se decidió en su momento; corregirlas a posteriori borra el motivo por el que se decidió mal.

---

## 7. Riesgos

| Riesgo                                                                            | Mitigación                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La caja de Cloudflare desentona con la estética CRT de la tarjeta                 | `theme: "dark"` ya está puesto desde la SPEC 09. Ahora mismo ese espacio son 65px de vacío sin explicación: la caja difícilmente queda peor.                                      |
| Cloudflare pide interacción más a menudo de lo esperado y molesta a los jugadores | La frecuencia la decide el modo **Managed** del widget, que no cambia con esta spec. `always` pinta la caja, no sube la dificultad.                                               |
| Alguien revierte el cambio creyendo que `interaction-only` es más seguro          | §3.4 lo deja escrito y esta tabla lo repite: `appearance` es presentación, la seguridad es idéntica.                                                                              |
| El widget mide algo distinto de 300 × 71 en el navegador del jugador              | `min-height` (no `height`) permite que el contenedor crezca. El salto solo sería posible hacia abajo, y el criterio de aceptación mide el desplazamiento con el widget pintado.   |
| La suite empieza a fallar por el widget                                           | No puede: sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no se renderiza nada, y ni `playwright.config.ts` ni `.env.local` la definen. El criterio de las 14 capturas intactas lo verifica. |
