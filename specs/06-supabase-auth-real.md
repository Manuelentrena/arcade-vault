# SPEC 06 — Autenticación real con Supabase

> **Estado:** Implementado
> **Depende de:** SPEC 01–05
> **Fecha:** 2026-09-21
> **Objetivo:** Sustituir la sesión falsa de `localStorage` por Supabase Auth (correo+contraseña, OAuth Google/GitHub) con tabla `profiles` y RLS, cookies servidas desde `proxy.ts`, verificado contra un stack Supabase local.

---

## 1. Alcance

**Dentro:** deps `@supabase/supabase-js` + `@supabase/ssr` · `lib/supabase/` · `proxy.ts` en raíz (refresco de token + guarda `/jugar/[id]`) · migración `profiles` + trigger + RLS · `session-provider.tsx` y `auth-form.tsx` reescritos · `app/auth/callback/route.ts` y `app/auth/confirm/route.ts` · borrar `lib/session.ts` y clave `av_user` · stack local (`supabase/config.toml`, `supabase/seed.sql`, `pretest`) · tests reescritos + test de registro contra Mailpit · 14 capturas · `.env.example` · `README.md`.

**Fuera:** tabla `scores` y leaderboards desde Postgres (= SPEC 07) · recuperar contraseña · perfil editable · avatares · Storage · Realtime · despliegue · motor de juego · `lib/games.ts` · i18n · migrar CSS a Tailwind.

**Fuera también:** alta de apps OAuth en Google Cloud/GitHub (manual del usuario). Proveedor inactivo → el botón muestra terminal de error (§3.2), no revienta.

Juegos decorativos y leaderboards LCG siguen simulados; solo cambia la sesión.

---

## 2. Contrato

### 2.1 Migración `supabase/migrations/<timestamp>_profiles.sql`

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username = upper(username) and char_length(username) between 2 and 10),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "perfiles visibles para todos"
  on public.profiles for select using (true);

create policy "cada cual edita el suyo"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
```

Sin política `insert`/`delete`: la fila la crea el trigger (`security definer`) y cae en cascada con el usuario. El `check` sustituye a `normalizeName` y añade unicidad. `select using (true)` hace públicos los nombres (deliberado: Salón de la Fama); los correos viven en `auth.users`, no expuestos.

### 2.2 Trigger

```sql
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  -- Formulario: username en options.data. OAuth: derivado del local-part del correo.
  base := upper(regexp_replace(
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    '[^a-zA-Z0-9_]', '', 'g'));
  base := left(nullif(base, ''), 10);
  if base is null then base := 'PLAYER'; end if;

  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := left(base, 10 - length(n::text)) || n::text;
  end loop;

  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Desambiguación **solo para OAuth**. En el formulario, un `username` ocupado se rechaza antes de `signUp` (§3.2).

### 2.3 TypeScript

`lib/supabase/types.ts`: generado con `npx supabase gen types typescript --local`, se commitea, se regenera al cambiar esquema.

```ts
// lib/supabase/session.ts
export type SessionUser = {
  id: string;
  /** profiles.username: mayúsculas, 2-10 caracteres, único. */
  name: string;
  email: string | null;
};

/** Sesión leída en servidor desde las cookies. null si no hay. */
export async function getServerSession(): Promise<SessionUser | null>;
```

`SessionUser.name` conserva nombre y forma del tipo actual → `nav.tsx`, `game-player.tsx`, `hall-of-fame.tsx` **no cambian**. Desaparece `signIn` del contexto: `auth-form.tsx` habla con Supabase directamente.

### 2.4 Entorno

`.env.example` (repo **público**) solo con marcadores:

```bash
# Panel de Supabase → Project Settings → API. Ambas son públicas: Next las
# incrusta en el bundle del navegador. Lo que protege los datos es la RLS
# de §2.1, no el secreto de estas claves.
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Valores reales solo en `.env.local` (ignorado) y en el hosting. Motivo de no publicarlas: rastreos automáticos de GitHub que buscan proyectos Supabase sin RLS y abusan de `/auth/v1/signup`. Clave publicable, **no** la `anon` legacy. Ninguna clave de servicio (`service_role`, `sb_secret_…`) en repo ni cliente.

**`.env.local` apunta al stack local, no al remoto.** `npm run dev` desarrolla contra Docker: registro, confirmación por Mailpit y perfiles se prueban ahí, y lo que se crea se ve en Studio (`:54323`). Los valores los da `npx supabase status` y son fijos en cualquier máquina, así que no son secretos:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…   # el de `npx supabase status`
```

Los del proyecto remoto se dejan comentados en el mismo fichero, para poder volver a ellos. **Apuntar el servidor de desarrollo al remoto antes de hacer `db push` es un error silencioso**: `public.profiles` y el trigger no existen allí, la comprobación de nombre no los encuentra, `signUp` crea igualmente la fila en `auth.users` y queda una cuenta sin perfil — sesión válida que el nav nunca reconoce.

El `webServer` de `playwright.config.ts` fija esas mismas dos variables locales en su bloque `env` (paso 12). No es redundante: `next build` las incrusta en el bundle, y ese `build` no lee `.env.local` cuando Playwright le pasa las suyas. Los tests **nunca** apuntan al remoto, con `.env.local` en el estado que esté.

---

## 3. Componentes

| Fichero | Tipo | Contenido |
| --- | --- | --- |
| `lib/supabase/client.ts` | navegador | `createBrowserClient` con las dos variables públicas |
| `lib/supabase/server.ts` | servidor | `createServerClient` sobre `await cookies()`, con `getAll`/`setAll` y `try/catch` |
| `lib/supabase/session.ts` | servidor | `SessionUser` y `getServerSession()`: `getClaims()` + consulta `profiles.username` |
| `proxy.ts` (raíz) | borde | Refresca token; redirige `/jugar/[id]` sin sesión |
| `app/auth/callback/route.ts` | servidor | `exchangeCodeForSession(code)`; redirige a `next` o `/biblioteca` |
| `app/auth/confirm/route.ts` | servidor | `verifyOtp({ token_hash, type })`; mismo destino |
| `components/session-provider.tsx` | cliente | `initialUser` del layout, `onAuthStateChange`, expone `{ user, signOut }` |
| `components/auth-form.tsx` | cliente | Máquina de estados §3.2, OAuth, validación previa de `username` |

`app/auth/page.tsx` no cambia. `app/layout.tsx` gana `const initialUser = await getServerSession()` y se lo pasa a `<SessionProvider>`.

### 3.1 `proxy.ts`, no `middleware.ts`

**Next 16 deprecó `middleware.ts` → `proxy.ts`** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Toda la doc de Supabase dice `middleware.ts` / `export async function middleware`. Aquí: fichero `proxy.ts` en raíz, `export function proxy`. Copiar el snippet de Supabase tal cual compila pero Next no lo ejecuta: la sesión caduca sin error ni aviso.

```ts
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)",
  ],
};
```

Orden dentro:
1. Crear cliente de servidor sobre `request.cookies` y devolver **siempre** la `NextResponse` con las cookies reescritas. Entre `createServerClient` y `getClaims()` no va nada, y la respuesta no se sustituye por otra (si no, cliente y servidor se desincronizan).
2. `const { data } = await supabase.auth.getClaims()`.
3. Ruta que empieza por `/jugar/` y sin sesión → `NextResponse.redirect` a `/auth?next=<ruta>`.

### 3.2 Estados de `/auth`

Un solo `<form>` dentro de la `.auth-card` existente. `INICIAR SESIÓN`: Correo + Contraseña. `CREAR CUENTA`: Usuario + Correo + Contraseña. El campo Usuario no aparece en el login: `signInWithPassword` necesita correo, y resolver nombre→correo obligaría a exponer correos.

| Estado | Qué se ve |
| --- | --- |
| `idle` | Campos de la pestaña activa, `ENTRAR AL VAULT` / `CREAR Y JUGAR`, dos botones sociales, `JUGAR COMO INVITADO` |
| `idle` + validación fallida | `.auth-card.shake` 400ms, sin petición. Cubre correo vacío/mal formado, contraseña < 6, `username` fuera de 2-10 |
| `sending` | Botón deshabilitado, `VERIFICANDO…` / `CREANDO…` |
| `check-email` | `.terminal-success` verde: `[OK] CUENTA CREADA`, `REVISA TU CORREO`, correo en mayúsculas, `VOLVER A INICIAR SESIÓN`. Solo tras `signUp` |
| `error` | `.terminal-success.error`: `[ERR]`, mensaje traducido, `REINTENTAR` que vuelve al formulario **con los campos intactos** |

`.terminal-success` y `.terminal-success.error` ya existen en `globals.css` (SPEC 05, líneas 2790 y 2853) — no re-portar. `@keyframes shake` existe; solo añadir `.auth-card.shake { animation: shake 0.4s; }` si falta.

Éxito de `signInWithPassword` y retorno de OAuth → `/biblioteca`, o al `next` de la URL si lo hay.

Errores traducidos (español, mayúsculas, los pinta el terminal):
- `Invalid login credentials` → `CORREO O CONTRASEÑA INCORRECTOS`
- `User already registered` → `ESE CORREO YA TIENE CUENTA`
- `Email not confirmed` → `CONFIRMA TU CORREO ANTES DE ENTRAR`
- proveedor OAuth inactivo → `ESE ACCESO NO ESTÁ DISPONIBLE AÚN`
- resto → `ERROR DE CONEXIÓN CON EL VAULT`

Detalle crudo a `console.error`, nunca a pantalla.

Antes de `signUp`: consultar `profiles` por `username`; ocupado → estado `error` con `ESE NOMBRE YA ESTÁ PILLADO`, sin llamar a Supabase. `username` normalizado en `options.data.username`; `options.emailRedirectTo` → `/auth/confirm`.

`JUGAR COMO INVITADO` = `signOut()` + `router.push("/biblioteca")`.

---

## 4. Plan

Cada paso deja la app compilando y navegable.

1. **Deps y stack local.** `npm i @supabase/supabase-js @supabase/ssr`. `npx supabase init` (CLI no instalado; Docker sí, 29.1.3 — siempre `npx`). `npx supabase start`. Anotar de `npx supabase status`: URL API (`54321`), clave publicable, Mailpit (`54324`). Poner esos dos valores en `.env.local` (§2.4) y dejar comentados los del remoto. `supabase/.temp` y `supabase/.branches` a `.gitignore`.

2. **Migración** de §2.1+§2.2. Local: `npx supabase db reset`. Remoto `<TU-PROJECT-REF>`: `npx supabase db push` (o `mcp__supabase__apply_migration`). Verificar en Studio `profiles` con RLS activa.

3. **Confirmación de correo.** `enable_confirmations = true` en `[auth.email]` de `supabase/config.toml` y plantilla propia:
   ```toml
   [auth.email.template.confirmation]
   content_path = "./supabase/templates/confirmation.html"
   ```
   con enlace a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Repetir a mano en el panel remoto (Authentication → Email Templates) y añadir `http://127.0.0.1:3000/**` y `http://127.0.0.1:3100/**` a Redirect URLs. Sin esto, el enlace va al verificador por defecto y `/auth/confirm` nunca corre.

4. **`supabase/seed.sql` determinista** — usuario confirmado para tests y capturas:
   ```sql
   insert into auth.users (
     instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
     created_at, updated_at
   ) values (
     '00000000-0000-0000-0000-000000000000',
     '00000000-0000-4000-8000-000000000001',
     'authenticated', 'authenticated',
     'px_kai@vault.test', crypt('arcade-vault-test', gen_salt('bf')),
     now(), '{"provider":"email","providers":["email"]}',
     '{"username":"PX_KAI"}', now(), now()
   );
   ```
   El trigger le crea `profiles.username = 'PX_KAI'` (mismo nombre que usan hoy los tests). Insertar también su fila en `auth.identities`, o `signInWithPassword` no lo encuentra.

5. **Clientes.** `lib/supabase/{client,server,session}.ts` según §3. `npx supabase gen types typescript --local > lib/supabase/types.ts`. Sustituir en `.env.example` los valores reales por los marcadores de §2.4 antes del primer commit.

6. **`proxy.ts`** según §3.1, **solo refresco de token**, sin guarda. Verificar que Next carga el fichero (`console.log` temporal en `next dev`).

7. **`session-provider.tsx`** real: prop `initialUser`, `onAuthStateChange`, `signOut` que llama a Supabase + `router.refresh()`. `app/layout.tsx` pasa `await getServerSession()`. **Borrar `lib/session.ts`.** Compila pero nadie entra todavía.

8. **`auth-form.tsx`** según §3.2, más `.auth-card.shake` en `globals.css` si hace falta.

9. **Route handlers** `app/auth/callback/route.ts` y `app/auth/confirm/route.ts`. `◆ GOOGLE` y `▣ GITHUB` llaman a `signInWithOAuth` con `redirectTo` al callback.

10. **Guarda de `/jugar/[id]`** en `proxy.ts`; `auth-form.tsx` honra el `next` de la URL.

11. **Verificación manual** (`npm run dev`, 1440×900 y 390×844): registro con nombre libre → terminal verde, mensaje en Mailpit, enlace deja dentro, nav pinta el nombre; registro con `PX_KAI` → terminal rojo sin tocar Supabase; contraseña mala → terminal rojo; `REINTENTAR` conserva lo escrito; recarga conserva sesión; `CERRAR SESIÓN` desde barra y panel móvil; `/jugar/bloque-buster` en ventana privada → `/auth` y vuelta al juego tras entrar; `JUGAR COMO INVITADO` → `/biblioteca` sin sesión.

12. **Tests** (`tests/screens.spec.ts`):
    - `pretest` en `package.json`: `npx supabase db reset` (exige stack arrancado; documentado en README).
    - `playwright.config.ts`: añadir `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **locales** al `env` del `webServer`. Son `NEXT_PUBLIC_*`: se incrustan en el `next build` que ese `webServer` ejecuta; sin esto `npm test` compila contra el remoto y crea usuarios reales (mismo motivo que `RESEND_API_KEY: ""` en SPEC 05).
    - Helper `signIn(page)`: rellena `/auth` con `px_kai@vault.test` / `arcade-vault-test`, espera `/biblioteca`. Sus llamadas actuales siguen valiendo.
    - Las tres aserciones sobre `localStorage.getItem("av_user")` (≈383, ≈405, ≈615) pasan a comprobar que el nav vuelve a `Iniciar Sesión` y que una recarga no resucita la sesión.
    - La captura de `/jugar/[id]` se autentica antes (ruta protegida).
    - `describe("auth")` nuevo: nombre ocupado → `.terminal-success.error` y **ninguna** petición a `/auth/v1/signup`; credenciales malas → terminal rojo; `/jugar/bloque-buster` sin sesión → `/auth`.
    - `describe("registro por correo")`: registra correo único, comprueba terminal «revisa tu correo», pide el mensaje a `http://127.0.0.1:54324/api/v1/message/latest`, extrae el enlace, lo visita, verifica el nombre en el nav.

13. **Capturas**, solo tras el paso 11: `npx playwright test --project=desktop --update-snapshots=all`, luego `--project=mobile`. Siguen siendo 14; en la práctica solo cambian `jugar-*` (ahora con sesión).

14. **Docs.** `README.md`: fila en el índice de specs; puesta en marcha (Docker, `npx supabase start`, `db reset`, las dos variables, aviso de que `npm test` necesita el stack vivo); subsección OAuth (alta en Google Cloud y GitHub, Callback URL `<SUPABASE_URL>/auth/v1/callback`, Redirect URLs del paso 3); nota de que la sesión ya no vive en `localStorage`. `CLAUDE.md`: corregir la frase «la sesión es falsa y vive en `localStorage` bajo `av_user`».

15. **Verificar** en orden, en verde: `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm test`. (`tsc` necesita `.next/types`: hacer `next build` tras crear las rutas nuevas.)

---

## 5. Criterios de aceptación

- [ ] `grep -rn "av_user\|lib/session" app components lib tests` no devuelve nada; `lib/session.ts` no existe.
- [ ] Existe `proxy.ts` en raíz con `export function proxy`; **no** existe `middleware.ts`.
- [ ] `public.profiles` con `rowsecurity = true` y las dos políticas de §2.1.
- [ ] Registro con correo nuevo crea exactamente una fila en `auth.users` y una en `profiles`, `username` en mayúsculas y ≤ 10 caracteres.
- [ ] Registro con `username` existente muestra `.terminal-success.error` y **no** genera petición a `/auth/v1/signup`.
- [ ] Tras `signUp` sale el terminal «revisa tu correo»; el enlace de Mailpit pasa por `/auth/confirm` y deja la sesión iniciada.
- [ ] `px_kai@vault.test` / `arcade-vault-test` entra, nav pinta `PX_KAI ▾`, recarga lo conserva.
- [ ] `/jugar/bloque-buster` sin sesión → `/auth?next=/jugar/bloque-buster`, y al entrar vuelve al juego. Las otras 6 rutas siguen abiertas.
- [ ] `JUGAR COMO INVITADO` deja en `/biblioteca` sin sesión.
- [ ] Un usuario autenticado no puede hacer `update` sobre el `profiles` de otro (consulta que devuelve 0 filas afectadas).
- [ ] `git ls-files | grep "^\.env"` devuelve solo `.env.example`, sin URL real, sin clave `sb_publishable_` real, sin contraseña de BD.
- [ ] `git grep -n "service_role\|sb_secret" -- ':!specs'` no encuentra nada.
- [ ] `playwright.config.ts` fija las dos variables **locales** en el `env` del `webServer`.
- [ ] `.env.local` apunta al stack local: registrarse con `npm run dev` crea el usuario en Docker y se ve en Studio (`:54323`), no en el proyecto remoto.
- [ ] 14 ficheros en `tests/screens.spec.ts-snapshots/`, regenerados **después** del paso 11.
- [ ] `describe("auth")` y `describe("registro por correo")` pasan en los dos proyectos.
- [ ] `lint`, `tsc --noEmit`, `build`, `test` en verde.
- [ ] Sin cambios en `lib/games.ts`, `lib/scores.ts`, `components/leaderboard.tsx`, `components/footer.tsx`, `components/home/`, `components/about/`.
- [ ] `README.md` y `CLAUDE.md` reflejan la sesión real y cómo levantar el stack local.

---

## 6. Decisiones no obvias

| Decisión | Alternativa | Por qué |
| --- | --- | --- |
| Auth ahora, puntuaciones en SPEC 07 | Todo de golpe | Auth+OAuth+esquema+entorno de tests ya son 4 dominios; con `scores` no habría punto intermedio verificable |
| `proxy.ts` con `export function proxy` | `middleware.ts` de la doc de Supabase | Next 16 lo deprecó; el snippet compila, no se ejecuta y falla en silencio |
| `@supabase/ssr` con cookies | Solo `createBrowserClient` | Sin sesión en servidor no hay guarda en el borde ni datos de usuario en componentes de servidor (lo que pide SPEC 07) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave `anon` legacy | Es la documentada hoy y ya emitida; la legacy quedará obsoleta |
| Tabla `profiles` | `raw_user_meta_data` | Único sitio donde `username` puede ser único y consultable desde un leaderboard |
| Confirmación de correo activa | Desactivarla | Decisión explícita del usuario; cuesta una pantalla y un test, da el flujo real |
| Correo en las dos pestañas | Aceptar usuario o correo | Resolver nombre→correo exigiría exponer correos o una RPC |
| Desambiguar `username` solo en OAuth | Desambiguar siempre | En el formulario el jugador elige; convertirlo en `PX_KAI1` a su espalda es peor que un error claro |
| Solo `/jugar/[id]` protegida | Nada / todo protegido | Única ruta que en SPEC 07 escribirá datos del usuario; invalida una sola captura |
| Borrar `lib/session.ts`, sin modo degradado | Fallback a sesión falsa | CLAUDE.md prohíbe dos fuentes de verdad; precio: un clon sin `.env.local` no puede iniciar sesión, el resto navega |
| Supabase local para tests | Remoto / mocks | El remoto exigiría secretos por clon y crearía usuarios reales en cada `npm test` |
| `pretest` hace `db reset`, no `start` | `globalSetup` que arranca el stack | Arrancar Docker añade minutos y deja contenedores vivos; `db reset` da datos limpios y falla rápido |
| `npx supabase` | CLI global | No está instalado y el repo no debe exigir otra herramienta global |
| `seed.sql` determinista | Crear el usuario desde el test | Las capturas necesitan estado idéntico y `/jugar` ahora se captura con sesión |
| `SessionUser.name` conserva el nombre | Renombrar a `username` | `nav.tsx`, `game-player.tsx`, `hall-of-fame.tsx` no se tocan |
| Apps OAuth fuera del alcance | Automatizar el alta | Google Cloud y GitHub son paneles manuales |
| `.env.local` apuntando al stack local | Dejarlo en el proyecto remoto | Desarrollar contra el remoto sin `db push` crea cuentas sin perfil sin avisar, y Mailpit no existe allí: el flujo de confirmación no se puede probar |

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `getServerSession()` usa `cookies()` en `app/layout.tsx` → toda la app dinámica, sin prerender estático de las 7 rutas | Precio aceptado para que el nav no parpadee. Alternativa: `initialUser = null`; no se hace aquí |
| Plantillas de correo hay que cambiarlas dos veces (`config.toml` local + panel remoto); olvidar la segunda rompe la confirmación en remoto | Paso 3 del plan y línea en el README |
| SMTP por defecto de Supabase con límite bajo de correos/hora en remoto | Tests contra Mailpit local (sin límite); en remoto solo afecta a registros manuales |
| `npm test` ya lento (hace `next build`); ahora además Docker + `db reset` | `pretest` falla con mensaje claro si el stack no responde |
| Repo público + registro abierto (`disable_signup: false`): con URL y clave publicable cualquiera llama a `/auth/v1/signup` → usuarios basura y cuota de correo quemada | `.env.example` con marcadores (§2.4) para no salir en rastreos. Si hay abuso: captcha (Authentication → Attack Protection) o SMTP propio — no en esta spec, un captcha rompería el test de registro |
| Trigger con `security definer`: un fallo suyo revienta **todo** registro, OAuth incluido | `set search_path = ''`, nombres cualificados, y el test de Mailpit lo cubre de punta a punta |

---

## 8. Revisiones posteriores

| Fecha | Cambio |
| --- | --- |
| 2026-09-22 | §2.4: `.env.local` apunta al stack local de Docker, no al proyecto remoto. La redacción anterior decía que los valores locales «no van a ningún `.env`» refiriéndose a que no se publican en `.env.example`, y se leyó como que el servidor de desarrollo debía seguir apuntando al remoto. Con `db push` pendiente, eso deja cuentas creadas en `auth.users` sin fila en `profiles`: sesión válida que el nav nunca reconoce, y sin aviso porque la consulta de nombre se traga el error. Añadidos criterio de aceptación y decisión. |
