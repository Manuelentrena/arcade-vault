# SPEC 10 — Despliegue en Vercel: producción desde `main`

> **Estado:** Implementado
> **Depende de:** SPEC 09
> **Fecha:** 2026-09-24
> **Objetivo:** Publicar la aplicación en Vercel con un único entorno remoto —producción, desplegada desde `main` contra el proyecto de Supabase que ya existe— y dejar escrito el circuito que toda spec futura seguirá para llegar a esa URL.

---

## 1. Punto de partida

Nueve specs implementadas y la aplicación nunca ha salido de `localhost`. La propia SPEC 09 puso el captcha «antes de publicar una URL»: la URL es lo que falta.

El backend es Supabase y nada más: auth, base, RLS, Edge Function y cron. Next no guarda estado propio, así que desplegar no exige provisionar nada nuevo — solo decidir a qué proyecto de Supabase apunta cada build.

**Solo habrá dos entornos: el local y producción.** Las pruebas se hacen contra el stack de Docker, que es donde ya se hacen: `npm run dev` para mirar, `npm test` para las diez capturas de referencia. Lo remoto es únicamente la URL en vivo.

Verificado en el repositorio, no hace falta reinvestigarlo:

- `origin` es `git@github.com:Manuelentrena/arcade-vault.git`. No existe `.github/`, ni `vercel.json`, ni `.vercel/` — este último ya está en `.gitignore`.
- `next.config.ts` está vacío: ni `output`, ni región, ni cabeceras.
- `proxy.ts` corre en cada petición y las siete rutas son dinámicas porque `app/layout.tsx` resuelve la sesión en servidor. Esto **no** es un sitio estático: necesita servidor, y el preset de Next en Vercel lo da sin configuración.
- `components/auth-form.tsx:235` y `:277` construyen `emailRedirectTo` y `redirectTo` con `window.location.origin`. `app/auth/callback/route.ts` y `app/auth/confirm/route.ts` resuelven el destino contra la cabecera `Host`, no contra `request.url`. **El código ya es portable entre dominios**: no hace falta ninguna variable con la URL del sitio.
- `playwright.config.ts` fija los `NEXT_PUBLIC_SUPABASE_*` del stack local en el `env` de su `webServer`. La suite compila siempre contra Docker y no se entera de que existe un despliegue.
- Variables que la aplicación consume hoy: `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

El proyecto remoto de Supabase que ya existe —con Google y GitHub dados de alta, el captcha configurado y las migraciones aplicadas— es producción, y el único remoto que habrá.

---

## 2. Alcance

**Dentro:** alta del proyecto en Vercel importando el repositorio · despliegue limitado a `main`, sin builds de rama · variables de entorno del entorno _Production_ · _redirect URL_ y hostname de Turnstile con el dominio de producción · workflow `.github/workflows/ci.yml` con `build`, `tsc --noEmit` y `lint` · checklist de despliegue por spec en `README.md` · `.env.example` y `CLAUDE.md` actualizados.

**Fuera (para futuras specs):** entorno de pruebas remoto, _staging_ o segundo proyecto de Supabase · despliegues de preview por rama · dominio propio y DNS · SMTP propio, plantillas de correo y alta por email sin límites · Playwright en CI · Supabase Branching · monitorización, analítica, alertas y drenaje de logs · promoción manual de deployments.

---

## 3. Contrato

### 3.1 Mapa de entornos

|                      | Local                              | Producción                        |
| -------------------- | ---------------------------------- | --------------------------------- |
| URL de la aplicación | `http://localhost:3000`            | `https://arcade-vault.vercel.app` |
| Rama                 | la que sea                         | `main`, y solo `main`             |
| Supabase             | stack de Docker (`supabase start`) | el proyecto remoto actual         |
| Captcha (SPEC 09)    | apagado                            | activo                            |
| Resend (SPEC 05)     | modo simulado                      | clave real                        |
| Purga (SPEC 08)      | manual, tras crear los secretos    | activa, `0 4 * * *` UTC           |
| Quién lo mira        | tú, con `npm run dev` y `npm test` | cualquiera                        |

El nombre exacto del proyecto de Vercel decide el dominio. `arcade-vault` da `arcade-vault.vercel.app` si está libre; si no, Vercel sufija, y **ese** es el valor que va a la _redirect URL_ de §3.4 y al hostname de Turnstile.

### 3.2 Proyecto de Vercel

Importar el repositorio de GitHub. Preset **Next.js** detectado solo: _Root Directory_ la raíz, _Build Command_ `next build`, _Install Command_ `npm ci`. **No se añade `vercel.json`**: no hay nada que configurar que el preset no resuelva, y un fichero que solo repite los valores por defecto es una copia más que mantener.

- _Production Branch_: `main`.
- **Sin despliegues de rama.** En _Settings → Git_, limitar los despliegues a la rama de producción. Si esa opción no estuviera disponible en el plan, el equivalente es un _Ignored Build Step_ que cancela todo lo que no sea producción:

  ```bash
  # exit 0 cancela el build; exit 1 lo deja continuar
  [ "$VERCEL_ENV" = "production" ] && exit 1 || exit 0
  ```

  Ojo con los códigos, que son al revés de lo que parece: **0 cancela, 1 construye**.

Una rama `spec-NN-slug` empujada a GitHub no debe producir ningún deployment ni consumir minutos de build. La revisión de esa rama es local.

### 3.3 Variables de entorno en Vercel

_Project Settings → Environment Variables_, todas marcadas **solo** para _Production_:

| Variable                               | Valor                                  |
| -------------------------------------- | -------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<ref>.supabase.co`            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la clave publicable del proyecto       |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`       | la _site key_ de Turnstile             |
| `RESEND_API_KEY`                       | la clave real de Resend                |
| `CONTACT_TO_EMAIL`                     | el correo de destino                   |
| `CONTACT_FROM_EMAIL`                   | `Arcade Vault <onboarding@resend.dev>` |

Tres reglas:

- **Ninguna clave de servicio entra en Vercel.** `PURGE_SECRET` y la clave de servicio viven en Supabase —secretos de la Edge Function y Vault de la base—, no en el hosting de Next. La _secret key_ de Turnstile tampoco: esa la guarda el panel de Supabase.
- **`NEXT_PUBLIC_*` se incrusta en el build.** Cambiar una en el panel no toca lo ya desplegado: hay que redesplegar. Es el mismo motivo por el que `playwright.config.ts` las pone en el `env` de su `webServer`.
- **Nada marcado como _Preview_ ni _Development_.** No hay más entornos; una variable suelta ahí solo puede confundir más adelante.

### 3.4 Supabase y Cloudflare: lo que hay que repasar

El proyecto remoto ya está configurado desde las SPEC 06 a 09. Solo cambia el dominio desde el que se le habla:

- _Authentication → URL Configuration_: _Site URL_ `https://arcade-vault.vercel.app` y _Redirect URLs_ `https://arcade-vault.vercel.app/**`. Sin esto, `/auth/callback` canjea el código y redirige a `localhost`, y el jugador acaba en una pantalla sin sesión. **Sin comodines**: un comodín sobre `*.vercel.app` convertiría `/auth/callback` en un redirector abierto hacia cualquier despliegue de cualquier cuenta.
- El origen de `localhost` puede quedarse en la lista: es lo que permite seguir probando OAuth en local contra el proyecto remoto.
- Google y GitHub no cambian: su retorno apunta a `https://<ref>.supabase.co/auth/v1/callback`, que no depende del dominio de la aplicación.
- Cloudflare → Turnstile: añadir `arcade-vault.vercel.app` a los hostnames del widget. El hostname exacto vale; un comodín sobre `vercel.app` no, porque es un sufijo público.
- La purga de invitados ya está viva en este proyecto, con sus secretos del Vault. No se toca.

### 3.5 `.github/workflows/ci.yml`

Sin preview que enseñe los fallos, CI es la única red antes de `main`. Un solo job, en `pull_request` y en `push` a `main`:

1. `actions/checkout`.
2. `actions/setup-node` con Node 22 y caché de npm.
3. `npm ci`.
4. `npm run build`.
5. `npx tsc --noEmit`.
6. `npm run lint`.

**El orden no es negociable:** `tsc` necesita los tipos que Next genera en `.next/types` (`PageProps<"/juego/[id]">`, `LayoutProps<"/">`), así que el build va primero o la comprobación de tipos falla por rutas que están perfectamente bien.

El paso de build recibe los mismos valores de demo que ya usa `playwright.config.ts`:

```yaml
env:
  NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
  RESEND_API_KEY: ""
```

Son las claves del stack local, iguales en cualquier máquina y ya presentes en el repositorio: no son secretos, y con ellas el runner no compila jamás contra el proyecto real. El workflow no usa ningún secreto de GitHub Actions; si algún día necesita uno, es señal de que se le está pidiendo algo que no le toca.

Playwright queda fuera: levanta Docker con Supabase, compila un build de producción y compara capturas `-darwin.png` que un runner Linux no reproduce.

### 3.6 Circuito de despliegue por spec

Esto es lo que se repite en cada spec a partir de ahora, y lo que va copiado en el `README.md`:

1. `/spec-impl NN-slug` crea la rama `spec-NN-slug` y se implementa ahí.
2. **La revisión es local, y es el paso que sustituye a la preview:** `npm run dev` para recorrer a mano las pantallas que la spec toca, `npx tsc --noEmit`, `npm run lint` y `npm test` con el stack de Docker levantado. Si la spec es visual, regenerar solo las capturas del proyecto afectado.
3. `git push -u origin spec-NN-slug` y abrir el pull request. CI tiene que quedar verde. **Vercel no despliega nada** en este paso.
4. Si la spec trae migraciones o Edge Functions, aplicarlas al proyecto remoto **antes de mergear**:

   ```bash
   npx supabase link --project-ref <ref-prod>
   npx supabase db push
   npx supabase functions deploy <nombre>   # solo si la spec toca funciones
   ```

   El orden es ese: **la base primero, el código después**. Al revés hay una ventana en la que el código nuevo pega contra un esquema viejo y la aplicación en vivo se rompe.

   Con un solo remoto, entre este paso y el merge **el código que está en producción es el viejo corriendo contra el esquema nuevo**. Por eso la migración tiene que ser compatible hacia atrás: añadir tablas, columnas o funciones, nunca renombrar ni borrar lo que el código en vivo usa. Retirar algo es una segunda spec, posterior al despliegue de la primera.

5. Merge a `main`. Vercel despliega a producción solo.
6. Comprobación en la URL de producción: las pantallas tocadas, `/auth` con OAuth y con invitado. Si algo va mal, _Instant Rollback_ al deployment anterior desde el panel, en segundos. **El rollback no deshace migraciones** — de ahí la regla del paso 4.
7. Cambiar el estado de la spec a `Implementado` en su cabecera y en el índice del `README.md`.
8. Borrar la rama y devolver el CLI a local: `npx supabase link` deja el `project_ref` en `supabase/.temp/`, y olvidarse de eso es lo que convierte el siguiente `db reset` en un susto.

### 3.7 Documentación

- `README.md`: sección **Despliegue** con el mapa de §3.1, el guion de alta de §3.2–§3.4 y el checklist de §3.6 entero; nota de la limitación de correo (§7); fila de la SPEC 10 en el índice de specs.
- `.env.example`: bloque que recuerde qué variables van al entorno _Production_ de Vercel, cuáles no salen nunca del panel de Supabase, y que `NEXT_PUBLIC_*` exige redesplegar para surtir efecto.
- `CLAUDE.md`: párrafo corto con los dos entornos, la regla de «base primero, código después» y la de migraciones compatibles hacia atrás.

### 3.8 Guion manual (no lo hace la implementación)

Los pasos de §3.2, §3.3 y §3.4 tocan Vercel, Supabase y Cloudflare. Se entregan escritos en el `README.md` y los ejecuta el usuario, igual que en SPEC 08 y SPEC 09. Lo único que la implementación escribe en el repositorio es el workflow de CI y la documentación.

---

## 4. Plan de implementación

1. `.github/workflows/ci.yml` con el job de §3.5. Comprobación: reproducir la secuencia en un árbol limpio (`npm ci && npm run build && npx tsc --noEmit && npm run lint`) y, tras el push, ver el check en verde en el pull request.
2. Sección **Despliegue** del `README.md`: mapa de entornos, alta del proyecto en Vercel, cómo dejar los despliegues limitados a `main` y tabla de variables (§3.1–§3.3). Comprobación: alguien que no conozca el proyecto puede dar de alta el despliegue siguiendo solo ese texto.
3. Repaso de Supabase y Turnstile en el `README.md`: _Site URL_, _Redirect URLs_ sin comodines y hostname del widget (§3.4).
4. Checklist de despliegue por spec (§3.6) en el `README.md`, párrafo en `CLAUDE.md` y bloque nuevo en `.env.example`.
5. Fila de la SPEC 10 en el índice de specs del `README.md` y estado de la cabecera.

---

## 5. Criterios de aceptación

- [ ] `https://arcade-vault.vercel.app` responde y sirve las siete rutas: `/`, `/biblioteca`, `/juego/[id]`, `/jugar/[id]`, `/auth`, `/salon`, `/acerca`.
- [ ] `/jugar/[id]` sin sesión redirige a `/auth?next=/jugar/[id]` en producción: `proxy.ts` se ejecuta en Vercel.
- [ ] Entrar con Google y con GitHub en producción deja sesión, aterriza en `/biblioteca` y pinta el nombre en la barra.
- [ ] `JUGAR COMO INVITADO` funciona en producción con el captcha activo, y el nombre pintado no es el técnico (`INV…`).
- [ ] El formulario de `/acerca` envía de verdad por Resend en producción.
- [ ] Un push a una rama `spec-NN-*` **no** produce ningún deployment en Vercel.
- [ ] Un pull request con un error de tipos o de lint deja el check de CI en rojo; uno limpio, en verde.
- [ ] El workflow de CI no usa ningún secreto de GitHub Actions.
- [ ] Merge a `main` produce un deployment de producción sin intervención manual.
- [ ] `npm test` sigue verde en local y las diez capturas de referencia no se regeneran.
- [ ] `npx tsc --noEmit` y `npm run lint` limpios.
- [ ] No existe `vercel.json` y `package.json` no tiene dependencias nuevas.
- [ ] Ningún fichero versionado contiene claves de servicio, `PURGE_SECRET`, la _secret key_ de Turnstile ni la contraseña de la base.

---

## 6. Decisiones

- **Sí:** Vercel. Preset de Next sin configurar, `proxy.ts` funcionando sin adaptador y _Instant Rollback_ de serie.
- **Sí:** un solo entorno remoto. El proyecto de Supabase que ya tiene OAuth, captcha, migraciones y purga es producción, y no hay segundo.
- **No:** segundo proyecto de Supabase para pruebas. Duplicaría el alta de Google y GitHub —el retorno de OAuth apunta a `<ref>.supabase.co`, distinto por proyecto, y GitHub admite una sola callback por aplicación—, obligaría a aplicar cada migración dos veces y añadiría un proyecto más que despausar. Docker ya cubre las pruebas.
- **No:** despliegues de preview por rama. Sin proyecto de pruebas remoto solo podrían apuntar a la base real: usuarios de prueba en `auth.users` de producción, contados como usuarios activos. Se prefiere no tener la URL a tenerla ensuciando la base.
- **No:** Supabase Branching. Resuelve lo mismo con una base efímera por rama, pero exige plan Pro más coste por rama.
- **Sí:** revisión local como sustituto de la preview. Es donde ya se revisa hoy, con `npm run dev` y las diez capturas de `npm test`.
- **Sí:** dominio de Vercel por ahora. El dominio propio arrastra DNS, hostname de Turnstile y SMTP: es otra spec.
- **Sí:** migraciones a mano con `db push`, antes del merge. Una migración contra producción es irreversible; la dispara una persona mirando el diff, no un push a `main`.
- **Sí:** migraciones compatibles hacia atrás, siempre. Con un solo remoto, entre el `db push` y el merge el código viejo corre contra el esquema nuevo. Retirar algo es una spec posterior.
- **No:** `supabase db push` desde GitHub Actions. Metería el token de acceso en los secretos del repositorio y dejaría que un merge distraído reescriba el esquema en vivo.
- **Sí:** CI con `build` + `tsc` + `lint`. Sin preview, es lo único que mira el código antes de `main`, y cuesta dos minutos por pull request.
- **No:** Playwright en CI. Levanta Docker con Supabase, compila un build de producción y compara capturas `-darwin.png` que un runner Linux no reproduce; un segundo juego de capturas Linux es mantenimiento doble para la misma señal.
- **Sí:** merge a `main` despliega solo. El freno está antes —revisión local, CI y migraciones aplicadas—, y el rollback tarda segundos.
- **No:** promoción manual de deployments. Un paso más en cada spec para frenar algo que ya frenaron los tres anteriores.
- **No:** `vercel.json`. El preset de Next detecta todo lo que hace falta.
- **No:** `NEXT_PUBLIC_SITE_URL`. `auth-form.tsx` usa `window.location.origin` y las dos rutas de retorno resuelven por cabecera `Host`: el código ya es portable, y una variable con la URL del sitio solo puede desincronizarse.
- **No:** comodines en las _redirect URLs_ del proyecto. Convertirían `/auth/callback` en un redirector abierto hacia cualquier despliegue de `vercel.app`.
- **Sí:** limitación de correo asumida y documentada. Sin dominio propio, Resend no deja enviar los correos de Supabase y su SMTP por defecto solo escribe a direcciones del equipo: en producción se entra por OAuth o como invitado.
- **No:** tocar Vercel ni Supabase desde la implementación. Se entregan los guiones, los ejecuta el usuario — misma convención que SPEC 08 y SPEC 09.

---

## 7. Riesgos

| Riesgo                                                                                          | Mitigación                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin preview, un fallo visual o de sesión se estrena en producción                               | La revisión local del paso 2 del checklist es obligatoria, no opcional: `npm run dev` a mano más las diez capturas de `npm test`. Y el rollback es inmediato. |
| Migración aplicada a producción después del merge: el código nuevo pega contra un esquema viejo | Paso 4 del checklist, explícito y antes del merge: base primero, código después.                                                                              |
| Entre el `db push` y el merge, el código viejo corre contra el esquema nuevo                    | Solo migraciones compatibles hacia atrás. Retirar una columna o una función es una spec posterior al despliegue de la que la deja de usar.                    |
| _Instant Rollback_ devuelve el código, no el esquema                                            | La misma regla: nada de migraciones destructivas en el mismo paso que las introduce.                                                                          |
| Alta por correo casi inservible en producción                                                   | Documentada como limitación conocida. OAuth y modo invitado cubren el acceso; se levanta cuando haya dominio propio y SMTP.                                   |
| `NEXT_PUBLIC_*` cambiada en el panel sin redesplegar: el cambio no aparece                      | Regla escrita en §3.3 y en `.env.example`; se resuelve con un _Redeploy_ del último deployment.                                                               |
| Pruebas hechas en local contra el proyecto remoto por despiste: usuarios de verdad              | `.env.local` apunta al stack de Docker y `playwright.config.ts` lo fija en su `webServer`. El despiste solo es posible editando `.env.local` a mano.          |
| El plan gratuito de Supabase pausa un proyecto tras unos días sin actividad                     | Producción con visitas no se pausa. Si el sitio queda muerto una semana, se despausa desde el panel antes de anunciarlo.                                      |
| `supabase link` apuntando a producción olvidado en la sesión                                    | Último punto del checklist: devolver el CLI a local al terminar.                                                                                              |
| Límites del plan Hobby de Vercel (uso comercial, horas de función, ancho de banda)              | Aceptado para un proyecto de portfolio. Si el uso crece, el salto de plan no cambia nada de lo escrito aquí.                                                  |
