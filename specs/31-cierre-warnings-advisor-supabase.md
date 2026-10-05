# SPEC 31 — Cierre de warnings del Advisor de seguridad de Supabase

> **Estado:** Implementado
> **Depende de:** SPEC 08 (patrón `revoke execute … from public, anon, authenticated`), SPEC 16 (RLS de `games`/`scores`/`categorias`), SPEC 29 (cierre del bypass de `scores`, token de sesión de partida), SPEC 30 (checklist de seguridad — leaked password protection ya documentado ahí)
> **Versión:** Fix
> **Fecha:** 2026-10-05
> **Objetivo:** Cierra los warnings de SECURITY DEFINER sin `revoke execute` y versiona `rls_auto_enable()` que el Advisor de seguridad de Supabase señaló, documentando como aceptados por diseño los de acceso anónimo a tablas públicas y a `cron.job`/`cron.job_run_details`.

## Por qué existe esta spec

El usuario trajo una lista de warnings del Advisor de Supabase. Auditar el proyecto remoto (`mcp__supabase__get_advisors`, `pg_proc`, `pg_event_trigger`, `pg_policies`) antes de preguntar separa los warnings en tres grupos:

- **Reales y corregibles con una migración:** `handle_new_user()` nunca tuvo `revoke execute` (a diferencia de las funciones de la familia de purga de invitados, SPEC 08) y sigue siendo ejecutable por `anon`/`authenticated` vía `/rest/v1/rpc/handle_new_user` aunque solo debería dispararse como trigger de `auth.users`. `save_score` sí tiene un `revoke execute … from public` (SPEC 29), pero ese revoke no alcanza a `anon`: Supabase concede `EXECUTE` a `anon` y `authenticated` por defecto a toda función nueva en `public` vía `ALTER DEFAULT PRIVILEGES`, independientemente de lo que se revoque a `public`. El resultado: `anon` —una petición sin sesión, ni siquiera invitada— puede llamar a `save_score` hoy.
- **Un hallazgo nuevo que no estaba en `SECURITY.md`:** `rls_auto_enable()` existe en remoto —función más el event trigger `ensure_rls`, que fuerza `ENABLE ROW LEVEL SECURITY` en toda tabla nueva de `public`— pero no aparece en ninguna migración. Alguien lo creó a mano (SQL editor o Studio) fuera del flujo de este repo. Es una red de seguridad útil, pero hoy vive sin versionar y, por la misma razón que `save_score`, es ejecutable por `anon`/`authenticated` vía RPC aunque solo debería dispararse como event trigger.
- **Ya aceptados por diseño, solo falta decirlo donde quede constancia:** `increment_game_plays` (concede a propósito a `anon`+`authenticated`, comentario explícito en la migración — SPEC 16/17) y `start_game_session` (solo `authenticated`, correcto: tanto cuentas reales como invitados juegan). Los warnings de "RLS permite acceso anónimo" en `public.categorias`/`public.games`/`public.profiles`/`public.scores` son el catálogo y el leaderboard públicos por diseño — cada política lo dice en su propio nombre (`"… visible para todos"`). Los de `cron.job`/`cron.job_run_details` son del propio `pg_cron`: la política `username = CURRENT_USER` ya restringe el acceso real a la fila cuyo dueño coincide con el rol conectado — `anon` no pasa ese filtro aunque el advisor liste el rol `public` en la policy — y no son tablas de esta app, tocarlas está fuera de lo que una migración de este repo debería hacer.
- **Ya cerrado en otra spec:** "Leaked password protection" es un toggle exclusivo del panel del proyecto remoto que SPEC 30 ya documentó como paso manual en `README.md`. Repetirlo aquí sería duplicar esa instrucción; esta spec remite a SPEC 30 en vez de volver a escribirla.

## Scope

**Dentro:**

- Nueva migración que revoca `EXECUTE` de `public.handle_new_user()` para `public`, `anon` y `authenticated` — es trigger-only, nunca debe llamarse por RPC.
- La misma migración revoca `EXECUTE` de `public.save_score(text, integer, integer, text)` para `anon` explícitamente (ya estaba revocado para `public`; se mantiene el `grant … to authenticated` existente).
- Nueva migración que versiona `rls_auto_enable()` y el event trigger `ensure_rls`: recrea ambos de forma idempotente (`drop … if exists` seguido de `create`) con la definición ya vigente en remoto, y revoca `EXECUTE` de `public`, `anon` y `authenticated` sobre la función.
- Actualizar `SECURITY.md` con una sección fechada 2026-10-05 (SPEC 31) que documente: los dos hallazgos corregidos (grants de `handle_new_user`/`save_score`, versionado de `rls_auto_enable`) y los aceptados por diseño (`increment_game_plays`, `start_game_session`, RLS pública en `categorias`/`games`/`profiles`/`scores`, `cron.job`/`cron.job_run_details`).
- Verificar con `mcp__supabase__get_advisors` tras aplicar las migraciones que los warnings de SECURITY DEFINER para `handle_new_user`, `rls_auto_enable` y `save_score` (vía `anon`) desaparecen.
- Paso de cierre estándar: bump `Fix` de versión, sin post de changelog.

**Fuera de alcance (para otra spec, si llega):**

- Activar "Leaked password protection" en el panel remoto — ya documentado como paso manual en SPEC 30; esta spec no lo repite ni lo automatiza (no hay herramienta MCP para alternar ese toggle).
- Tocar las políticas RLS de `categorias`/`games`/`profiles`/`scores` que permiten lectura anónima — son el catálogo y el leaderboard públicos por diseño; el warning se documenta como aceptado, no se cierra con un cambio de política.
- Tocar `cron.job`/`cron.job_run_details` — son tablas internas de la extensión `pg_cron`, no de esta app; su política ya filtra por `username = CURRENT_USER`.
- Revocar o modificar los grants de `increment_game_plays` o `start_game_session` — ambos están concedidos a propósito a los roles que los necesitan (comentario explícito en la migración de `increment_game_plays`; `start_game_session` solo a `authenticated`, correcto porque invitados también juegan).
- Cualquier cambio a la lógica interna de `save_score`, `start_game_session` o `handle_new_user` — esta spec solo toca grants y versionado, no las reglas de negocio que SPEC 29 ya cerró.

## Modelo de datos

Esta spec no introduce estructuras de datos nuevas. Sincroniza con el repositorio un objeto (`rls_auto_enable()` + event trigger `ensure_rls`) que ya existe en remoto fuera de control de versiones, y ajusta `GRANT`/`REVOKE` sobre funciones existentes — ninguna tabla, columna ni tipo cambia.

## Plan de implementación

1. Nueva migración `supabase/migrations/<timestamp>_revoca_execute_handle_new_user_y_save_score.sql`: `revoke execute on function public.handle_new_user() from public, anon, authenticated;` y `revoke execute on function public.save_score(text, integer, integer, text) from anon;`. Verificar manualmente tras `npx supabase db reset` que un alta nueva (registro por correo o `signInAnonymously`) sigue creando su fila en `profiles` — el trigger no depende de que el rol de sesión tenga `EXECUTE`.
2. Nueva migración `supabase/migrations/<timestamp>_versiona_rls_auto_enable.sql`: `drop event trigger if exists ensure_rls;` y `drop function if exists public.rls_auto_enable();`, recrear ambos con la definición vigente en remoto (capturada en esta spec vía `pg_get_functiondef`), y `revoke execute on function public.rls_auto_enable() from public, anon, authenticated;`. Verificar manualmente tras `npx supabase db reset` que una tabla nueva creada en `public` queda con RLS activado automáticamente (crear una tabla de prueba en `psql` local y comprobar `relrowsecurity`).
3. `npx supabase db push` contra el proyecto remoto — antes del merge a `main`, según la regla de "base de datos primero" del proyecto.
4. `mcp__supabase__get_advisors` (tipo `security`) contra el proyecto remoto para confirmar que los warnings de `handle_new_user`, `rls_auto_enable` y `save_score` (para `anon`) ya no aparecen.
5. `SECURITY.md`: añadir sección "Actualización 2026-10-05 (SPEC 31)" documentando los dos hallazgos cerrados y los cuatro aceptados por diseño, con el mismo formato (dónde, hallazgo, corrección o justificación de por qué no se toca) que usa el resto del archivo.
6. Cierre: bump `Fix` en `package.json`, `components/footer.tsx` y el `logo-version` de `components/nav.tsx`. Sin post nuevo en `/blog`.

## Criterios de aceptación

- [x] `handle_new_user()` ya no es ejecutable vía `/rest/v1/rpc/handle_new_user` por `anon` ni `authenticated` (confirmable con `mcp__supabase__get_advisors`).
- [x] `save_score` ya no es ejecutable vía `/rest/v1/rpc/save_score` por `anon` (sigue siéndolo por `authenticated`).
- [x] `rls_auto_enable()` y el event trigger `ensure_rls` existen como migración versionada en `supabase/migrations/`, reproducibles con `npx supabase db reset`.
- [x] `rls_auto_enable()` ya no es ejecutable vía `/rest/v1/rpc/rls_auto_enable` por `anon` ni `authenticated`.
- [x] Una tabla nueva creada en `public` tras `npx supabase db reset` queda con `ENABLE ROW LEVEL SECURITY` activado automáticamente (el event trigger sigue funcionando tras la migración).
- [x] Un alta nueva (registro por correo, OAuth o invitado) sigue creando su fila en `profiles` tras el `revoke` sobre `handle_new_user` — `npm test` sigue en verde.
- [x] `SECURITY.md` documenta los hallazgos cerrados por esta spec y los aceptados por diseño, fechados 2026-10-05.
- [x] La versión sube como `Fix` en `package.json`, `components/footer.tsx` y `components/nav.tsx` (`logo-version`), sin post nuevo en `/blog`.

## Decisiones

- **Sí:** revocar `EXECUTE` de `handle_new_user` para los tres roles (`public`, `anon`, `authenticated`) — es trigger-only, el mismo patrón que `purge_guests_tick`/`stale_guest_ids` de SPEC 08.
- **Sí:** revocar `EXECUTE` de `save_score` específicamente de `anon` — el `revoke … from public` de SPEC 29 no alcanzaba el grant explícito que Supabase concede por defecto a `anon` en toda función nueva.
- **Sí:** versionar `rls_auto_enable()` y `ensure_rls` en vez de solo revocarles el `EXECUTE`. Dejarlo sin versionar perpetuaría un objeto de seguridad real (fuerza RLS en toda tabla nueva) fuera del control de versiones del repo — exactamente el tipo de deriva que esta spec existe para cerrar.
- **No:** tocar las políticas de `select` público en `categorias`/`games`/`profiles`/`scores`. El catálogo y el leaderboard son públicos por diseño; el warning del advisor es esperado, no un bug.
- **No:** tocar `cron.job`/`cron.job_run_details`. Son tablas de la extensión `pg_cron`, no de esta app, y su política ya filtra por `username = CURRENT_USER` — `anon` no ve filas reales pese a que el advisor liste el rol `public` en la policy.
- **No:** repetir "leaked password protection" en esta spec. Ya documentado como paso manual en SPEC 30; duplicarlo no cierra nada nuevo.
- **No:** tocar los grants de `increment_game_plays` (comentario explícito en su migración: `anon`+`authenticated` a propósito, cualquier visitante puede empezar partida) ni de `start_game_session` (solo `authenticated`, correcto porque invitados también juegan).

## Riesgos

| Riesgo                                                                                                                | Mitigación                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Revocar `EXECUTE` de `handle_new_user` rompe la creación de perfiles al dar de alta                                   | El trigger corre con los permisos de quien lo creó (`security definer`), no con los del rol de sesión — revocar `EXECUTE` no afecta su disparo. Verificado en el paso 1 del plan con `npm test`. |
| `CREATE EVENT TRIGGER` requiere privilegios que el rol `postgres` de Supabase remoto podría no tener                  | El event trigger `ensure_rls` ya existe hoy en ese mismo proyecto remoto, creado con ese mismo rol — la capacidad ya está probada; `db push` solo lo reemplaza.                                  |
| El `drop … if exists` dentro de la migración de `rls_auto_enable` no encuentra el objeto en local (nunca existió ahí) | Es exactamente el caso esperado — `drop … if exists` no falla, y el `create` que sigue lo deja igual en local y en remoto.                                                                       |

## Qué **no** entra en esta spec

- Activar "Leaked password protection" — ya cubierto por SPEC 30.
- Cambios a las políticas RLS de lectura pública en `categorias`/`games`/`profiles`/`scores`.
- Cambios a `cron.job`/`cron.job_run_details` o a la configuración de `pg_cron`.
- Cambios a los grants de `increment_game_plays` o `start_game_session`.
- Cualquier cambio a la lógica de negocio de `save_score`, `start_game_session` o `handle_new_user`.

Cada uno de estos, si llega, va en su propia spec.
