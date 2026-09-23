# SPEC 08 — Purga automática de invitados con pg_cron

> **Estado:** Implementado
> **Depende de:** SPEC 07
> **Fecha:** 2026-09-22
> **Objetivo:** Programar un `cron.schedule` diario que, vía `pg_net`, invoque una Edge Function con clave de servicio para borrar por el Admin API los usuarios anónimos inactivos más de 30 días.

---

## 1. Punto de partida

SPEC 07 hizo real el modo invitado: cada pulsación de `JUGAR COMO INVITADO` deja fila permanente en `auth.users` y en `public.profiles`. Supabase no purga nada por su cuenta.

`delete from auth.users` está descartado: salta las cascadas y el estado interno de GoTrue (identidades, sesiones, refresh tokens). La vía soportada es `auth.admin.deleteUser()`, y eso exige clave de servicio, es decir, una Edge Function.

Verificado contra el stack local, no hace falta reinvestigarlo:

- Hoy no hay cron: `pg_cron` sin instalar, esquema `cron` inexistente, ni una Edge Function.
- `pg_cron` 1.6.4 y `pg_net` 0.20.4 disponibles; `supabase_vault` 0.3.1 ya instalado, con `vault.create_secret()` y `vault.decrypted_secrets`.
- `cron.timezone` es `GMT`: las expresiones se leen en UTC.
- Desde el contenedor de Postgres la API local es `http://supabase_kong_05-arcade_vault:8000`, no `127.0.0.1`.
- `.gitignore` ya ignora `.env*` a cualquier nivel.

---

## 2. Alcance

**Dentro:** extensiones `pg_cron` y `pg_net` · migración con bitácora, RPC de selección, función disparadora y `cron.schedule` · Edge Function `borrar-invitados` · bloque `[functions.borrar-invitados]` en `supabase/config.toml` · secretos del Vault creados a mano y documentados · guion manual de verificación · `README.md`, `CLAUDE.md`, `.env.example`.

**Fuera (para futuras specs):** avisar al invitado antes de borrarlo · convertir invitado en cuenta permanente (`linkIdentity`) · pantalla de administración sobre la bitácora · alertas cuando una pasada falla · tests automáticos de la purga · ejecutar migraciones o desplegar la función contra el proyecto remoto.

---

## 3. Contrato

### 3.1 Migración `supabase/migrations/<timestamp>_purga_invitados.sql`

`create extension if not exists pg_cron;` y `create extension if not exists pg_net with schema extensions;`

**Bitácora.**

```sql
create table public.guest_cleanup_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  dry_run boolean not null default false,
  deleted int not null default 0,
  failed int not null default 0,
  error text
);

alter table public.guest_cleanup_runs enable row level security;
```

RLS activada y **sin políticas**: nadie la lee por la API. La función escribe con clave de servicio, que se salta la RLS.

**Selección.** `public.stale_guest_ids(p_days int, p_limit int) returns setof uuid`, `security definer`, `set search_path = ''`:

```sql
select id from auth.users
where is_anonymous
  and coalesce(last_sign_in_at, created_at) < now() - make_interval(days => p_days)
order by coalesce(last_sign_in_at, created_at)
limit p_limit;
```

`coalesce` y no `last_sign_in_at` a secas: una fila anónima sin `last_sign_in_at` sería inmortal. Después, `revoke execute from public, anon, authenticated` y `grant execute to service_role`.

**Disparador.** `public.purge_guests_tick() returns void`, `security definer`, `set search_path = ''`. Lee de `vault.decrypted_secrets` los secretos `guest_purge_url` y `guest_purge_key`. **Falta cualquiera de los dos → sale sin hacer nada**: esa guarda es lo que deja el job mudo tras `db reset`, para que `npm test` no dispare peticiones HTTP. Con ambos:

```sql
perform net.http_post(
  url := v_url,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_key),
  body := '{}'::jsonb,
  timeout_milliseconds := 5000);
```

`net.http_post` y no `extensions.http_post`: `pg_net` se instala en `extensions` pero planta sus funciones en el esquema `net`, y con `search_path = ''` hay que cualificarlas. Lo mismo vale para `vault.decrypted_secrets`.

**Permisos del disparador.** `revoke execute on function public.purge_guests_tick() from public, anon, authenticated`. Sin esto, PostgREST la publica en `/rest/v1/rpc/purge_guests_tick` y, siendo `security definer`, cualquiera con la clave publicable —que viaja en el bundle del navegador— podría dispararla en bucle. La ejecuta el planificador de `pg_cron`, que corre como `postgres`, y nadie más.

**Programación.** Desprogramar primero, pero por `jobid`: `cron.unschedule('purga-invitados')` con un nombre que todavía no existe aborta con `could not find valid entry for job`, y eso es exactamente lo que pasa la primera vez que se aplica la migración.

```sql
select cron.unschedule(jobid) from cron.job where jobname = 'purga-invitados';
select cron.schedule('purga-invitados', '0 4 * * *', $$select public.purge_guests_tick()$$);
```

### 3.2 Edge Function `supabase/functions/borrar-invitados/index.ts`

Un `Deno.serve`, en este orden:

1. **Autorización.** Bearer contra `PURGE_SECRET` (§3.4), comparado en tiempo constante. No coincide o falta → `401`, sin tocar la base. La clave de servicio que la función usa después para el Admin API es la que la plataforma le inyecta, y nunca viaja en la petición.
2. **Parámetros.** `GUEST_RETENTION_DAYS` del entorno, 30 por defecto. Tope fijo de 200 por pasada. `?dry_run=1` activa el ensayo.
3. **Selección.** Cliente de servicio → `rpc('stale_guest_ids', { p_days, p_limit: 200 })`.
4. **Borrado.** En ensayo no borra. Si no, recorre los uuid con `auth.admin.deleteUser(id)`, contando aciertos y fallos; un fallo suelto no aborta la pasada. La fila de `public.profiles` cae por `on delete cascade` desde SPEC 06.
5. **Bitácora.** Una fila en `public.guest_cleanup_runs` por pasada, también cuando falla.
6. **Respuesta.** `200` con `{ "dry_run": false, "candidates": 12, "deleted": 12, "failed": 0 }`.

El cron no ve esta respuesta: `pg_net` dispara y no espera. Por eso la bitácora la escribe la función.

### 3.3 `supabase/config.toml`

```toml
[functions.borrar-invitados]
verify_jwt = false
```

`PURGE_SECRET` es una cadena aleatoria, no un JWT, así que la plataforma la rechazaría antes de que la función la viera. La autorización la hace la función (§3.2).

### 3.4 Secretos

El bearer **no** es la clave de servicio: es un secreto propio, `PURGE_SECRET`, generado al azar (`openssl rand -base64 32`). Así la comparación no depende de qué formato de clave tenga el proyecto —el stack local reparte a la vez una `sb_secret_…` y un JWT `service_role`, y no son la misma cadena—, y la clave potente nunca sale de la Edge Function.

El mismo valor se escribe en dos sitios, a mano una vez por entorno:

```sql
-- En la base, para que el cron lo mande:
select vault.create_secret('http://supabase_kong_05-arcade_vault:8000/functions/v1/borrar-invitados', 'guest_purge_url');
select vault.create_secret('<PURGE_SECRET>', 'guest_purge_key');
```

```bash
# En la función, para que lo compare:
npx supabase secrets set PURGE_SECRET=<PURGE_SECRET> GUEST_RETENTION_DAYS=30
```

En remoto, la misma pareja de secretos del Vault con `https://<ref>.supabase.co/functions/v1/borrar-invitados`. En local, `PURGE_SECRET` y `GUEST_RETENTION_DAYS` van en `supabase/functions/.env`, ya ignorado por git.

Antes de dar el despliegue por bueno, comprobar en el entorno que `select count(*) from vault.decrypted_secrets` no da error de permisos: si `postgres` no pudiera leer la vista, la guarda del §3.1 no distinguiría «no hay secreto» de «no puedo leerlo» y la purga callaría para siempre.

---

## 4. Plan de implementación

1. Migración con extensiones, `guest_cleanup_runs` y `stale_guest_ids`, sin cron todavía. Comprobación: `npx supabase db reset` limpio y `select * from public.stale_guest_ids(0, 10)` lista los invitados existentes.
2. Edge Function y su bloque en `config.toml`, con `PURGE_SECRET` en `supabase/functions/.env`. Comprobación: con `npx supabase functions serve`, `curl` con el secreto correcto y `?dry_run=1` da `200`; con uno falso, `401`.
3. Añadir `purge_guests_tick()`, su `revoke execute` y el `cron.schedule`. Comprobación: la migración se aplica sobre una base sin el job (`db reset`) sin abortar en el `unschedule`, `select * from cron.job` muestra `purga-invitados`, y `select public.purge_guests_tick()` sin secretos no crea nada en `net._http_response`.
4. Guion de extremo a extremo en local: crear los secretos, abrir sesión de invitado, `update auth.users set last_sign_in_at = now() - interval '60 days' where is_anonymous`, `select public.purge_guests_tick()`, comprobar borrado y bitácora.
5. Documentar en `README.md` (qué borra, cada cuánto, secretos, ensayo con `dry_run`), `CLAUDE.md` y `.env.example`.

---

## 5. Criterios de aceptación

- [ ] `npx supabase db reset` termina sin errores y deja `pg_cron` y `pg_net` instalados.
- [ ] `select jobname, schedule from cron.job` devuelve una sola fila: `purga-invitados` con `0 4 * * *`.
- [ ] Sin secretos en el Vault, `select public.purge_guests_tick()` no da error y no genera ninguna fila en `net._http_response`.
- [ ] `stale_guest_ids(30, 200)` nunca devuelve un usuario con `is_anonymous = false`.
- [ ] Un invitado creado hoy no aparece en `stale_guest_ids(30, 200)`; con `last_sign_in_at` retrasado 60 días, sí.
- [ ] Llamada sin `Authorization` o con clave incorrecta → `401` y ninguna fila en `guest_cleanup_runs`.
- [ ] Con `?dry_run=1`, `deleted` iguala a `candidates` y ningún usuario desaparece de `auth.users`.
- [ ] Con secretos puestos y un invitado envejecido, `purge_guests_tick()` borra ese usuario de `auth.users` y su fila de `public.profiles`.
- [ ] Cada invocación deja exactamente una fila en `guest_cleanup_runs`, también cuando falla.
- [ ] `guest_cleanup_runs` no es legible con la clave publicable; ni `stale_guest_ids` ni `purge_guests_tick` son ejecutables por `anon` ni `authenticated`.
- [ ] `POST /rest/v1/rpc/purge_guests_tick` con la clave publicable responde con error de permisos y no genera ninguna fila en `net._http_response`.
- [ ] Aplicar la migración sobre una base donde el job no existe no aborta en el `cron.unschedule`.
- [ ] `npm test` sigue verde y `npx tsc --noEmit` no reporta nada nuevo.
- [ ] Ningún fichero versionado contiene `PURGE_SECRET` ni una clave de servicio.

---

## 6. Decisiones

- **Sí:** Edge Function con Admin API. El `delete` en SQL salta cascadas y estado interno de GoTrue.
- **Sí:** el cron solo dispara; filtro en `stale_guest_ids`, orquestación en la función.
- **No:** paginar `auth.admin.listUsers()`. Recorrería toda la tabla en cada pasada para filtrar en memoria.
- **No:** mandar los uuid en el cuerpo del POST. Partiría el filtro entre SQL y TypeScript.
- **Sí:** secretos en el Vault. El repositorio es público.
- **Sí:** secreto propio `PURGE_SECRET` como bearer, no la clave de servicio. El stack reparte a la vez una `sb_secret_…` y un JWT `service_role`, y comparar contra «la clave de servicio» es ambiguo; además, así la clave potente no sale de la función.
- **No:** `alter database ... set app.settings.service_role_key`. Deja el valor en claro en `pg_settings`.
- **Sí:** guarda por secreto ausente, para que `pretest` no dispare HTTP durante `npm test`.
- **Sí:** `verify_jwt = false` más comprobación propia del bearer. `PURGE_SECRET` es una cadena aleatoria, no un JWT.
- **Sí:** `revoke execute` sobre `purge_guests_tick`. Una función `security definer` en `public` es una RPC abierta a quien tenga la clave publicable.
- **Sí:** desprogramar por `jobid`. `cron.unschedule(nombre)` aborta si el job no existe, que es el caso de la primera aplicación.
- **Sí:** `coalesce(last_sign_in_at, created_at)`, o las filas sin `last_sign_in_at` no se borrarían nunca.
- **Sí:** `GUEST_RETENTION_DAYS` como variable de entorno. Cambiar el plazo no debería exigir una migración.
- **No:** tabla `app_settings` para el plazo. RLS, migración y tipos para un número.
- **Sí:** tope de 200 por pasada. Un histórico grande agotaría el tiempo de la función.
- **Sí:** bitácora propia. `cron.job_run_details` solo sabe que el SQL terminó, y `pg_net` es asíncrono.
- **No:** test de Playwright. `npm test` compila un build de producción y no sirve Edge Functions.
- **No:** tocar el proyecto remoto desde la implementación. Se entregan los comandos, los ejecuta el usuario.

---

## 7. Riesgos

| Riesgo                                                             | Mitigación                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `pg_net` dispara y no espera: el cron no sabe si la purga funcionó | La bitácora la escribe la función. Pasada sin fila = pasada que no llegó.                  |
| Secretos no creados en un entorno: la purga calla                  | Paso de puesta en marcha en `README.md`; se detecta por bitácora vacía.                    |
| Histórico grande: 200 por pasada tarda días en drenar              | Aceptado. Si urge, bajar `GUEST_RETENTION_DAYS` o invocar la función a mano.               |
| `db reset` borra los secretos del Vault en local                   | Esperado: el job queda mudo. Recrearlos es un `select vault.create_secret(...)` del guion. |
