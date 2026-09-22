# SPEC 07 — Modo invitado con sesión anónima de Supabase

> **Estado:** Implementado
> **Depende de:** SPEC 06
> **Fecha:** 2026-09-22
> **Objetivo:** Convertir `JUGAR COMO INVITADO` en una sesión anónima real de Supabase (`signInAnonymously()`), de modo que el invitado tenga JWT, perfil y acceso a `/jugar/[id]` sin registrarse.

---

## 1. Punto de partida

`playAsGuest` (`components/auth-form.tsx:189`) hace `signOut()` y empuja a `/biblioteca`: lo contrario de jugar, porque `proxy.ts` protege `/jugar/[id]` desde SPEC 06. La FAQ de la portada (`components/home/home-pricing.tsx:19`) ya promete modo invitado; esta spec lo hace cierto.

Verificado al redactar la spec, no hace falta reinvestigarlo:

- `signInAnonymously()` existe en el SDK instalado — `node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts:278`.
- El claim `is_anonymous` viaja en el access token; `session.user.is_anonymous` está tipado en `lib/types.d.ts` del mismo paquete.
- La columna `auth.users.is_anonymous` existe en la base local.
- `proxy.ts:44` sólo comprueba `data?.claims`: una sesión anónima pasa la guarda sin tocar el fichero.
- El trigger vigente (`supabase/migrations/20260922075054_profiles.sql`) cae a `'PLAYER'` cuando no hay `email` ni `raw_user_meta_data->>'username'`. De ahí la rama del §2.2.

---

## 2. Contrato

### 2.1 `supabase/config.toml`

`enable_anonymous_sign_ins = true`. En `[auth.rate_limit]`, `anonymous_users` de 30 a 1000 (mismo motivo ya escrito ahí para `email_sent` y `sign_in_sign_ups`: dos proyectos Playwright en paralelo contra la misma IP).

El flag **no** lo recoge `db reset`: hace falta `npx supabase stop && npx supabase start`.

### 2.2 Migración `supabase/migrations/<timestamp>_invitados.sql`

`create or replace function public.handle_new_user()` — mismo cuerpo, bifurcando al calcular `base`:

```sql
if new.is_anonymous then
  base := 'INV' || upper(substr(replace(new.id::text, '-', ''), 1, 7));
else
  -- rama actual, intacta:
  -- coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
end if;
```

Diez caracteres y ya en mayúsculas: cumple el `check` de `profiles.username` sin tocar la tabla. El bucle de desambiguación se queda detrás. `create or replace` basta: el trigger `on_auth_user_created` no se recrea.

`INV3A9F21C` es identificador técnico y **no se enseña en ninguna pantalla** (§2.5).

### 2.3 `lib/supabase/user.ts`

> **Desvío respecto a lo planeado.** La spec situaba esto en `lib/supabase/session.ts`, y ahí no cabe: ese módulo importa `server.ts`, que importa `next/headers`. `SessionUser` es un tipo y se borra al compilar, pero `displayName()` es un valor en tiempo de ejecución, así que importarlo desde `nav.tsx` o `game-player.tsx` arrastraba el cliente de servidor al bundle del navegador y el build moría con «You're importing a module that depends on "next/headers"». Tipo y función viven en `lib/supabase/user.ts`, sin nada de servidor dentro; `session.ts` reexporta el tipo y se queda con `getServerSession()`.

```ts
export type SessionUser = {
  id: string;
  /** profiles.username: mayúsculas, 2-10 caracteres, único. */
  name: string;
  email: string | null;
  /** Sesión anónima: el claim is_anonymous del JWT. */
  isGuest: boolean;
};

/** Nombre que se pinta. El username técnico de un invitado no se enseña. */
export function displayName(user: SessionUser): string;
```

`getServerSession()` lee `is_anonymous` de los claims que `getClaims()` ya verificó. `displayName()` → `"INVITADO"` si `isGuest`, si no `user.name`.

### 2.4 `components/session-provider.tsx`

En `onAuthStateChange`: `isGuest: session.user.is_anonymous ?? false`.

### 2.5 Nombre visible

`components/nav.tsx:76` (barra), `components/nav.tsx:143` (panel móvil) y `components/game-player.tsx:29` pasan por `displayName(user)`, importado de `@/lib/supabase/user`. Fuera el `?? "INVITADO"` del reproductor: ahora el nombre siempre existe.

### 2.6 `components/auth-form.tsx`

`playAsGuest` pasa a `signInAnonymously()`. Éxito: `router.push(next)` + `router.refresh()` — **`next`, no `HOME`**, para que un invitado rebotado desde `/jugar/bloque-buster` vuelva a ese juego. Error: `fail(translate(...))`, con un caso nuevo en `translate()`:

| Error crudo                       | En pantalla                           |
| --------------------------------- | ------------------------------------- |
| `anonymous sign-ins are disabled` | `EL MODO INVITADO NO ESTÁ DISPONIBLE` |

El botón, su texto y su posición no se mueven.

---

## 3. Plan

1. **§2.1** + `npx supabase stop && npx supabase start`. Comprobar: `curl -s -X POST "$API_URL/auth/v1/signup" -H "apikey: $PUBLISHABLE_KEY" -H 'Content-Type: application/json' -d '{}'` devuelve sesión, no «Anonymous sign-ins are disabled».
2. **§2.2** + `npx supabase db reset`. Repetir el `curl` y verificar en Studio la fila de `profiles` con `INV…`.
3. **§2.3 y §2.4.** Compila aunque `displayName()` todavía no se use.
4. **§2.5.**
5. **§2.6.** Aquí la función ya sirve de extremo a extremo.
6. **Verificación manual** (`npm run dev`, 1440×900 y 390×844): recorrer los criterios de §6.
7. **Pruebas** (§4).
8. **Documentación** (§5).

---

## 4. Pruebas (`tests/screens.spec.ts`)

Helper `playAsGuest(page)` junto a `signIn()`, con `authReady(page)` delante como el resto del bloque de auth.

- **Reescribir** `"JUGAR COMO INVITADO vuelve a la biblioteca sin sesión"` (línea 535), que hoy afirma lo contrario de lo que queremos → `"JUGAR COMO INVITADO abre sesión anónima"`: clic, aterriza en `/biblioteca`, `.auth-btn` dice `INVITADO ▾`.
- **Nueva:** `/jugar/bloque-buster` sin sesión → `/auth?next=%2Fjugar%2Fbloque-buster` → botón de invitado → aterriza en `/jugar/bloque-buster`, no en `/biblioteca`.
- **Nueva:** la sesión de invitado sobrevive a `page.reload()`; `CERRAR SESIÓN` la termina y `.auth-btn` vuelve a `Iniciar Sesión`.

**Ninguna captura cambia:** `/auth` se pinta igual, la FAQ ya decía la verdad y el reproductor de referencia entra por `signIn()` como `PX_KAI`. Una captura distinta es una regresión, no una baseline que actualizar.

---

## 5. Documentación

**`README.md`:** el invitado como cuarto camino de entrada (juega y tiene nombre; no guarda nada ni se convierte en cuenta todavía) · el interruptor del panel remoto junto a los pasos manuales de OAuth y la plantilla de correo · el borrado periódico de anónimos (§8) · corregir `README.md:126`, que aún describe `/auth` como «Crea la sesión falsa» · SPEC 07 al índice.

**`CLAUDE.md`:** el modo invitado en el párrafo de autenticación; la regla de sesión añade que el nombre visible sale de `displayName()`, no de `user.name` a pelo.

---

## 6. Criterios de aceptación

- [x] `JUGAR COMO INVITADO` crea sesión: cookie de Supabase y fila en `auth.users` con `is_anonymous = true`.
- [x] Esa fila tiene perfil `INV…`, y ese literal no aparece en ninguna pantalla.
- [x] Barra, panel móvil y campo de nombre del reproductor pintan `INVITADO`.
- [x] Un invitado juega `/jugar/[id]` sin rebotar a `/auth`.
- [x] Rebotado desde `/jugar/bloque-buster`, entrar como invitado devuelve a ese juego.
- [x] La sesión aguanta una recarga; `CERRAR SESIÓN` la cierra y el nav vuelve a `Iniciar Sesión`.
- [x] Con `enable_anonymous_sign_ins = false`, el botón muestra `EL MODO INVITADO NO ESTÁ DISPONIBLE` y la pantalla sigue usable.
- [x] `npm test` verde **sin** `--update-snapshots`; `npm run lint` y `npx tsc --noEmit` limpios.

---

## 7. Fuera de alcance

Convertir un invitado en cuenta permanente (`updateUser({ email })`, spec aparte) · `linkIdentity` y `enable_manual_linking` · CAPTCHA · cron con `pg_cron` · tabla `scores` y leaderboards desde Postgres · motor de juego · `lib/games.ts` · i18n.

Activar el interruptor de anónimos en el panel del proyecto remoto es manual del usuario, como las apps OAuth de SPEC 06.

---

## 8. Decisiones y riesgos

**Sesión anónima, no cookie `av_guest` ni abrir `/jugar/[id]` a todos.** Una bandera en cookie reintroduce la segunda fuente de verdad que SPEC 06 eliminó; quitar la guarda deja `?next=` sin propósito. Ninguna de las dos deja identidad que enganchar a la futura tabla `scores`, y la anónima sí: `updateUser({ email })` conserva el `id`.

**Username técnico, no `INVITADO1`, `INVITADO2`…** El sondeo lineal del trigger crece con cada invitado y a partir de 99 trunca raro (`INVITA100`). El hex del uuid no colisiona y no se enseña.

**`displayName()` en `lib/`, no un ternario en cada componente.** Tres sitios pintan el nombre; la regla vive en uno.

**Acumulación de anónimos en `auth.users`.** Cada clic crea una fila. Rate limit de §2.1, y el README documenta el borrado periódico: `delete from auth.users where is_anonymous is true and created_at < now() - interval '30 days'` (la cascada se lleva el perfil). CAPTCHA y `pg_cron` descartados: el primero mete proveedor externo y un widget que cambiaría las capturas, el segundo enreda `db reset`.

**El flag del panel remoto se olvida.** Mismo fallo que la plantilla de correo de SPEC 06: en local funciona y en producción el botón da error. Por eso §2.6 traduce ese error concreto.

**RLS.** Un anónimo tiene rol `authenticated`, así que «cada cual edita el suyo» le deja renombrar su perfil. Inocuo hoy. Cuando llegue `scores`, decidir si entra en el Salón de la Fama, probablemente con `(auth.jwt() ->> 'is_anonymous')::boolean is false`.
