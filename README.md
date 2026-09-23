# Arcade Vault

Plataforma web para jugar a clásicos arcade y competir por la mayor puntuación, con estética CRT de salón recreativo.

## Estado actual

El repo contiene una **maqueta navegable completa**: siete pantallas reales sobre Next.js App Router, con navegación, filtros, formulario de sesión y tablas de puntuaciones funcionando de extremo a extremo. Lo que todavía **no** existe:

- **Los ocho juegos son decorativos.** No hay motor de juego. El reproductor (`/jugar/[id]`) anima una escena CRT y sube la puntuación sola con un temporizador; no se juega nada.
- **Los datos del catálogo siguen siendo estáticos.** Los ocho juegos viven en `lib/games.ts`. En base de datos sólo está lo que sostiene la sesión: `public.profiles`, el esquema `auth` de Supabase y la purga diaria de invitados.
- **La sesión ya es real.** `/auth` habla con Supabase Auth: correo y contraseña con confirmación por correo, y OAuth de Google y GitHub si están dados de alta. La sesión vive en cookies, no en `localStorage`, y `/jugar/[id]` exige estar dentro.
- **Las puntuaciones no se guardan.** Las genera un LCG determinista (`seededScores()` en `lib/scores.ts`) a partir del `id` del juego, así que son siempre las mismas y nadie las escribe.
- **No hay página de cuenta de usuario ni internacionalización.** La interfaz es solo español y solo tema oscuro.

## Requisitos

- **Node.js >= 20.9.0** (lo exige `next@16.3.5`; comprobable en `engines.node` de `node_modules/next/package.json`).
- **npm** (el repo trae `package-lock.json`).
- **Navegador de Playwright**, solo si vas a ejecutar las pruebas:

  ```bash
  npx playwright install chromium
  ```

  Es el único motor que usa la suite: los dos proyectos corren sobre Chromium.

- **Docker**, para levantar el stack local de Supabase. La CLI no hace falta instalarla: se invoca siempre con `npx supabase`.

## Puesta en marcha

```bash
npm install
npx supabase start          # arranca Postgres, Auth, Studio y Mailpit en Docker
npx supabase db reset       # aplica la migración y siembra el usuario de pruebas
npm run dev
```

La aplicación queda en `http://localhost:3000`.

`npx supabase status` imprime los datos del stack local:

| Servicio                   | URL                      |
| -------------------------- | ------------------------ |
| API                        | `http://127.0.0.1:54321` |
| Studio                     | `http://127.0.0.1:54323` |
| Mailpit (buzón de pruebas) | `http://127.0.0.1:54324` |

Para trabajar contra el stack local, pon en `.env.local` la URL de la API y la `PUBLISHABLE_KEY` que imprime ese comando. **`npm test` no las necesita**: `playwright.config.ts` fija las suyas en el `env` del `webServer`, para que la suite no compile nunca contra el proyecto remoto.

`npm test` **exige el stack arrancado**: su `pretest` hace `npx supabase db reset` y espera a que Auth responda. Si Docker no está en marcha, falla ahí.

## Variables de entorno

Las usan `POST /api/contacto` (el formulario de `/acerca`) y Supabase Auth. Copia la plantilla y rellena lo que necesites:

```bash
cp .env.example .env.local
```

| Variable                               | Para qué                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `RESEND_API_KEY`                       | Clave de [Resend](https://resend.com/api-keys). **Vacía = modo simulado.** |
| `CONTACT_TO_EMAIL`                     | Destinatario de los mensajes.                                              |
| `CONTACT_FROM_EMAIL`                   | Remitente. Por defecto el de pruebas, `onboarding@resend.dev`.             |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL del proyecto de Supabase (o `http://127.0.0.1:54321` en local).        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable (`sb_publishable_…`), **no** la `anon` heredada.          |

**Las dos `NEXT_PUBLIC_*` son públicas**: Next las incrusta en el bundle del navegador. Lo que protege los datos es la RLS de `public.profiles`, no el secreto de esas claves. Aun así, `.env.example` lleva marcadores y no los valores reales, porque hay rastreos automáticos que buscan proyectos Supabase sin RLS para abusar de `/auth/v1/signup`. **Ninguna clave de servicio** (`service_role`, `sb_secret_…`) entra en el repo ni llega al cliente.

**Modo simulado.** Sin `RESEND_API_KEY` el formulario sigue funcionando: el endpoint responde `{ ok: true, simulated: true }` y escribe el mensaje en la consola del servidor, sin mandar ningún correo. Es el camino que recorre un clon recién clonado y el que fuerza `npm test`, así que la suite nunca envía correo de verdad.

**Para que salga correo de verdad** hacen falta tres cosas, ninguna de código:

1. Una cuenta de Resend cuyo correo sea el mismo que `CONTACT_TO_EMAIL`. El remitente de pruebas `onboarding@resend.dev` **solo entrega a la dirección de la propia cuenta**; escribir a cualquier otra exige un dominio verificado.
2. Una API key (`re_…`) desde el panel de Resend.
3. Pegarla tras `RESEND_API_KEY=` en `.env.local` y reiniciar el servidor.

El endpoint se defiende con un honeypot, validación en servidor y un rate limit de 3 envíos cada 10 minutos por IP. Ese límite es _best effort_: vive en memoria, se pierde al reiniciar y no se comparte entre instancias.

## Autenticación

`/auth` usa Supabase Auth. Cuatro caminos de entrada:

- **Correo y contraseña.** Al registrarse hace falta además un nombre de jugador: se guarda en `public.profiles.username`, en mayúsculas, único y de 2 a 10 caracteres. Un nombre ocupado se rechaza en el navegador, antes de llamar a Supabase.
- **Confirmación por correo.** El registro no entra hasta pulsar el enlace del mensaje. En local ese correo aterriza en Mailpit (`http://127.0.0.1:54324`), no sale de la máquina. El enlace pasa por `/auth/confirm`, que canjea el token y deja la sesión iniciada.
- **Google y GitHub.** Si el proveedor no está dado de alta, el botón pinta un terminal de error en vez de romperse.
- **Invitado.** `JUGAR COMO INVITADO` abre una sesión anónima de Supabase: usuario real con `is_anonymous = true`, su JWT en cookie y su fila en `profiles`. Juega como cualquiera y el Nav le llama `INVITADO`, pero no guarda nada ni puede convertirse todavía en cuenta permanente — si se registra estando dentro, crea una cuenta nueva y la anónima queda huérfana. El `username` que el trigger le asigna (`INV70A7E1D`) es técnico y no se enseña: lo decide `displayName()` en `lib/supabase/user.ts`.

La sesión vive en cookies, la refresca `proxy.ts` en cada petición y `app/layout.tsx` la resuelve en servidor. `/jugar/[id]` es la única ruta protegida: sin sesión redirige a `/auth?next=/jugar/<id>` y vuelve al juego tras entrar.

### Dar de alta Google y GitHub

Los paneles son manuales; el repo no puede automatizarlos.

1. **GitHub** → Settings → Developer settings → OAuth Apps → New OAuth App.
   **Google** → Google Cloud Console → APIs & Services → Credentials → OAuth client ID.
2. En ambos, la **Authorization callback URL** es `<SUPABASE_URL>/auth/v1/callback`.
3. Pega el _client id_ y el _client secret_ en Supabase → Authentication → Providers.
4. En Supabase → Authentication → URL Configuration, añade a **Redirect URLs** las de tu aplicación (en local, `http://127.0.0.1:3000/**` y `http://127.0.0.1:3100/**`).

### Activar el modo invitado

En local lo enciende `enable_anonymous_sign_ins = true` en `supabase/config.toml`, y **hace falta `npx supabase stop && npx supabase start`**: `db reset` no recoge ese flag. En el proyecto remoto es otro interruptor manual, Authentication → Sign In / Providers → Anonymous. Si se olvida, el botón pinta `EL MODO INVITADO NO ESTÁ DISPONIBLE` en vez de romperse.

Cada clic crea una fila en `auth.users`. El rate limit por IP (`anonymous_users` en `[auth.rate_limit]`) contiene el abuso, y de barrer los caducados se encarga la purga automática de abajo.

### Purga automática de invitados

Un invitado que no vuelve deja su fila en `auth.users` y en `profiles` para siempre: Supabase no recoge nada por su cuenta. Una vez al día, **a las 04:00 UTC**, un job de `pg_cron` llamado `purga-invitados` borra a los invitados que llevan **más de 30 días** sin iniciar sesión, hasta **200 por pasada**. Sólo toca a los anónimos; una cuenta registrada nunca entra en la selección.

El borrado no se hace en SQL. Un `delete from auth.users` salta las cascadas y el estado interno de GoTrue (identidades, sesiones, refresh tokens), así que la cadena es más larga:

```
pg_cron → public.purge_guests_tick() → pg_net (POST) → Edge Function borrar-invitados
        → public.stale_guest_ids() → auth.admin.deleteUser() → profiles por cascada
        → fila en public.guest_cleanup_runs
```

Postgres filtra y dispara; la Edge Function orquesta, porque el Admin API exige clave de servicio. `pg_net` dispara y no espera, de modo que el cron nunca ve el resultado: el rastro de cada pasada queda en `public.guest_cleanup_runs`. **Una pasada sin fila es una pasada que no llegó.** Esa tabla tiene RLS activada y ninguna política, así que no se lee con la clave publicable; tampoco son invocables por `anon` ni `authenticated` las dos funciones.

#### Secretos

`purge_guests_tick()` lee del Vault a dónde llamar y con qué credencial. **Sin esos dos secretos el job sale sin hacer nada** — es la guarda que deja la purga muda tras un `db reset`, para que `npm test` no dispare peticiones HTTP. Hay que crearlos **a mano, una vez por entorno**; un `db reset` en local se los lleva.

El bearer no es la clave de servicio: es un secreto propio, `PURGE_SECRET`, generado al azar. Así la clave potente nunca sale de la Edge Function.

```bash
openssl rand -base64 32     # el mismo valor va en los dos sitios de abajo
```

En la base, para que el cron sepa a dónde mandarlo:

```sql
-- Local: la API vista desde el contenedor de Postgres, no 127.0.0.1.
select vault.create_secret('http://supabase_kong_05-arcade_vault:8000/functions/v1/borrar-invitados', 'guest_purge_url');
-- Remoto: https://<project-ref>.supabase.co/functions/v1/borrar-invitados
select vault.create_secret('<PURGE_SECRET>', 'guest_purge_key');
```

En la función, para que lo compare. En local va en `supabase/functions/.env` (ignorado por git); en remoto:

```bash
npx supabase secrets set PURGE_SECRET=<PURGE_SECRET> GUEST_RETENTION_DAYS=30
```

`GUEST_RETENTION_DAYS` es el plazo en días, 30 por defecto. Cambiarlo no exige migración. Antes de dar un despliegue por bueno, comprobar que `select count(*) from vault.decrypted_secrets` no da error de permisos: si el rol no pudiera leer la vista, la guarda no distinguiría «no hay secreto» de «no puedo leerlo» y la purga callaría para siempre.

#### Ensayo y verificación manual

`?dry_run=1` cuenta lo que se habría borrado sin borrar nada:

```bash
curl -i -X POST 'http://127.0.0.1:54321/functions/v1/borrar-invitados?dry_run=1' \
  -H "Authorization: Bearer $PURGE_SECRET"
# {"dry_run":true,"candidates":12,"deleted":12,"failed":0,"error":null}
```

Sin `Authorization` o con una clave que no cuadra responde `401` y no toca la base. El guion completo de extremo a extremo, con el stack arrancado y `npx supabase functions serve` en otra terminal:

```sql
-- 1. Envejecer a los invitados existentes (abre antes una sesión con JUGAR COMO INVITADO).
update auth.users set last_sign_in_at = now() - interval '60 days' where is_anonymous;
select * from public.stale_guest_ids(30, 200);   -- deben aparecer

-- 2. Disparar la purga como lo haría el cron.
select public.purge_guests_tick();

-- 3. Comprobar. pg_net es asíncrono: la respuesta tarda un instante en aparecer.
select status_code, content from net._http_response order by id desc limit 1;
select count(*) from auth.users where is_anonymous;        -- 0
select * from public.guest_cleanup_runs order by id desc;  -- una fila por pasada
```

Para ver el job: `select jobname, schedule, active from cron.job;`.

### Plantilla del correo de confirmación

Vive en `supabase/templates/confirmation.html` y `supabase/config.toml` la enlaza. **Eso solo vale para el stack local**: en el proyecto remoto hay que copiarla a mano en Authentication → Email Templates. Si se olvida, el enlace del correo va al verificador por defecto de Supabase, `/auth/confirm` nunca se ejecuta y la confirmación no inicia sesión.

## Comandos

| Comando                       | Qué hace                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Servidor de desarrollo. También regenera el bloque `nextjs-agent-rules` de `AGENTS.md`.                                                             |
| `npm run build`               | Compilación de producción.                                                                                                                          |
| `npm run start`               | Sirve la compilación de producción (requiere un `build` previo).                                                                                    |
| `npm run lint`                | ESLint con configuración plana; recorre todo el proyecto, sin argumento `--dir`.                                                                    |
| `npm test`                    | Suite de Playwright completa, proyectos `desktop` y `mobile`. Su `pretest` resetea la base local, así que **exige el stack de Supabase arrancado**. |
| `npm run test:update`         | Igual, pero regenerando las capturas de referencia.                                                                                                 |
| `npx tsc --noEmit`            | Comprobación de tipos. No hay script de npm para esto.                                                                                              |
| `npx supabase start` / `stop` | Levanta o para el stack local (Postgres, Auth, Studio, Mailpit).                                                                                    |
| `npx supabase db reset`       | Recrea la base local: migración de `supabase/migrations/` más `supabase/seed.sql`.                                                                  |

## Pantallas

| Ruta          | Fichero                   | Qué muestra                                                                                                                               |
| ------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/`           | `app/page.tsx`            | Portada: hero, por qué Arcade Vault, avance de seis juegos, cifras, actividad en vivo, precios y llamada final.                           |
| `/biblioteca` | `app/biblioteca/page.tsx` | Biblioteca: hero, buscador, chips de categoría y rejilla con los ocho juegos.                                                             |
| `/juego/[id]` | `app/juego/[id]/page.tsx` | Detalle: portada grande, etiquetas, descripción, estadísticas y las diez mejores puntuaciones. `notFound()` si el `id` no existe.         |
| `/jugar/[id]` | `app/jugar/[id]/page.tsx` | Reproductor: pantalla CRT animada, HUD con puntuación y vidas, pausa, `FIN` y modal de fin de partida. `notFound()` si el `id` no existe. |
| `/auth`       | `app/auth/page.tsx`       | Entrar, crear cuenta o jugar como invitado contra Supabase Auth. Aterriza en `?next=` o, si no lo hay, en la biblioteca.                                                                     |
| `/salon`      | `app/salon/page.tsx`      | Salón de la Fama: podio, tabla de puntuaciones y selector de juego.                                                                       |
| `/acerca`     | `app/acerca/page.tsx`     | Acerca de: misión, destacados y formulario de contacto que envía por Resend.                                                              |
| —             | `app/not-found.tsx`       | Pantalla 404 con el tema arcade.                                                                                                          |
| —             | `app/error.tsx`           | Límite de error de React con botón de reintento.                                                                                          |

Las URL están en español a propósito y coinciden con la maqueta original.

## Estructura

```
app/                      # App Router: rutas, layout raíz y CSS global
  layout.tsx              # fuentes, metadatos, SessionProvider, Nav y Footer
  globals.css             # tema arcade completo (~2.600 líneas) + import de Tailwind
  page.tsx                # portada
  biblioteca/page.tsx     # biblioteca
  juego/[id]/page.tsx     # detalle del juego
  jugar/[id]/page.tsx     # reproductor
  auth/page.tsx           # entrar / crear cuenta
  salon/page.tsx          # salón de la fama
  acerca/page.tsx         # acerca de + contacto
  auth/callback/route.ts  # retorno de OAuth: canjea el code por la sesión
  auth/confirm/route.ts   # destino del enlace del correo de confirmación
  api/contacto/route.ts   # POST del formulario de contacto (Resend)
  not-found.tsx           # 404
  error.tsx               # límite de error

proxy.ts                  # refresca el token en cada petición y protege /jugar/[id]

components/               # componentes de interfaz
  nav.tsx                 # barra, enlaces activos y panel móvil con la sesión dentro
  footer.tsx              # pie (componente de servidor)
  session-provider.tsx    # contexto de sesión sobre Supabase, expone useSession()
  library-browser.tsx     # buscador y filtrado por categoría
  game-card.tsx           # tarjeta con efecto tilt
  leaderboard.tsx         # tabla de puntuaciones del detalle (componente de servidor)
  game-player.tsx         # reproductor CRT, HUD y modal de fin de partida
  auth-form.tsx           # entrar, crear cuenta, OAuth y terminales de estado
  hall-of-fame.tsx        # podio y tabla del salón
  use-reveal.ts           # aparición de las secciones .reveal al hacer scroll
  home/                   # secciones de la portada (hero, features, carril,
                          # cifras, actividad, precios y cierre)
  about/                  # mitades de /acerca y el formulario de contacto

lib/
  games.ts                # los ocho juegos, categorías y getGame() (simulado)
  scores.ts               # generador determinista de puntuaciones (simulado)
  supabase/
    client.ts             # cliente de navegador
    server.ts             # cliente de servidor sobre cookies()
    session.ts            # SessionUser y getServerSession()
    types.ts              # tipos generados del esquema; se regeneran al cambiarlo

supabase/                 # stack local y esquema
  config.toml             # configuración del stack de Docker
  migrations/             # profiles, trigger de alta, RLS y la purga de invitados
  functions/
    borrar-invitados/     # Edge Function que borra invitados por el Admin API
  seed.sql                # usuario de pruebas PX_KAI, confirmado
  templates/              # plantilla del correo de confirmación

tests/                    # suite de Playwright
  screens.spec.ts
  screens.spec.ts-snapshots/   # catorce capturas de referencia

specs/                    # specs del proyecto, una por funcionalidad
references/templates/     # maqueta HTML/JSX original de la que salieron las pantallas
```

## Pruebas

La suite vive entera en `tests/screens.spec.ts` y cubre humo, interacción y comparación visual. Se organiza por bloques: capturas de referencia, portada, biblioteca, detalle, reproductor, auth, salón de la fama, acerca, endpoint de contacto y responsive.

Dos proyectos, ambos sobre Chromium (`playwright.config.ts`):

| Proyecto  | Viewport                      |
| --------- | ----------------------------- |
| `desktop` | 1440 × 900                    |
| `mobile`  | iPhone 13 emulado (390 × 844) |

El `webServer` de Playwright ejecuta `npm run build` y luego `next start -p 3100`, así que la primera ejecución tarda: se prueba contra la compilación de producción, no contra el servidor de desarrollo. Ese `webServer` fija las dos variables `NEXT_PUBLIC_SUPABASE_*` **del stack local**: son `NEXT_PUBLIC_*` y se incrustan en ese `build`, así que sin ellas la suite compilaría contra el proyecto remoto y crearía usuarios de verdad en cada ejecución.

La suite corre con `workers: 2`. Desde que la sesión es real, cada navegación pasa por el stack de Docker —el proxy valida el token y el layout resuelve la sesión—, y con un worker por núcleo Auth agota su pool de conexiones: las peticiones empiezan a morir con 504 sin que nada esté roto.

El bloque `registro por correo` registra una cuenta nueva y lee el mensaje de Mailpit por su API (`http://127.0.0.1:54324/api/v1/search`) para seguir el enlace de confirmación. Busca por destinatario y no "el último mensaje": los dos proyectos pueden estar registrando a la vez.

Las capturas de referencia están en `tests/screens.spec.ts-snapshots/`: siete por proyecto, una por ruta. Regenéralas **solo** cuando un cambio visual sea intencionado, y solo las del proyecto afectado:

```bash
npx playwright test --project=mobile --update-snapshots       # solo móvil
npm run test:update                                            # todas
npx playwright test --project=desktop --update-snapshots=all   # reescribe aunque pasen
```

Antes de regenerar, verifica el cambio a mano en el navegador. Una captura regenerada a ciegas convierte una regresión en la nueva referencia.

La comparación usa `maxDiffPixelRatio: 0.01`, así que un cambio visual pequeño —un enlace más en la barra, por ejemplo— no rompe la suite **ni** actualiza la referencia: `--update-snapshots` sólo reescribe lo que falla. Para poner las capturas al día tras un cambio así hace falta `--update-snapshots=all`.

## Desarrollo guiado por specs

Cada funcionalidad se escribe primero como spec y solo después como código. Dos skills gobiernan el flujo:

- **`/spec`** — hace las preguntas necesarias y deja la spec en `specs/NN-slug.md`, en estado `Borrador`.
- **`/spec-impl NN-slug`** — implementa una spec ya `Aprobado`, paso a paso, en la rama `spec-NN-slug`.

Las skills son las de [Klerith/fernando-skills](https://github.com/Klerith/fernando-skills) y están incluidas en el repo, en `.agents/skills/`, con enlaces simbólicos desde `.claude/skills/` para que Claude Code las vea. Se instalaron con:

```bash
npx skills@latest add Klerith/fernando-skills
```

`specs/.spec-config.yml` controla la creación automática de rama (`AutoCreateBranch`).

### Specs

| Spec                                                                                            | Estado       | Depende de                         |
| ----------------------------------------------------------------------------------------------- | ------------ | ---------------------------------- |
| [01 — MVP visual de las pantallas](specs/01-mvp-pantallas-visuales.md)                          | Implementado | —                                  |
| [02 — Barra móvil: sesión en la hamburguesa](specs/02-nav-movil-sesion-en-hamburguesa.md)       | Implementado | SPEC 01                            |
| [03 — Documentación del repo](specs/03-documentacion-readme-y-claude.md)                        | Implementado | SPEC 01, SPEC 02                   |
| [04 — Portada en `/` y biblioteca en `/biblioteca`](specs/04-home-landing-y-ruta-biblioteca.md) | Implementado | SPEC 01, SPEC 02, SPEC 03          |
| [05 — `/acerca` con contacto por Resend](specs/05-acerca-y-contacto-resend.md)                  | Implementado | SPEC 01, SPEC 02, SPEC 03, SPEC 04 |
| [06 — Autenticación real con Supabase](specs/06-supabase-auth-real.md)                          | Implementado | SPEC 01–05                         |
| [07 — Modo invitado con sesión anónima](specs/07-modo-invitado-supabase.md) | Implementado | SPEC 06 |
| [08 — Purga automática de invitados con pg_cron](specs/08-purga-invitados-cron.md) | Implementado | SPEC 07 |

## Referencias

`references/templates/` guarda la maqueta original de la que salieron las pantallas: HTML con React UMD y Babel en el navegador, más un `styles.css` de 950 líneas. En `references/templates/home-about/` está la maqueta de la portada y de la pantalla «Acerca de». No se compila ni se despliega; sigue en el repo como fuente visual de verdad para comparar cuando un estilo portado no cuadra.
