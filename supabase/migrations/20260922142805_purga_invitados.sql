-- SPEC 08 — Purga automática de invitados.
--
-- SPEC 07 dejó permanente cada pulsación de JUGAR COMO INVITADO: una fila en
-- `auth.users` y otra en `public.profiles` que nadie recoge. Aquí se programa
-- la recogida: un `cron.schedule` diario que, vía `pg_net`, dispara una Edge
-- Function con clave de servicio para borrarlos por el Admin API.
--
-- El borrado no se hace en SQL a propósito. `delete from auth.users` salta las
-- cascadas y el estado interno de GoTrue (identidades, sesiones, refresh
-- tokens); la vía soportada es `auth.admin.deleteUser()`, y eso exige una
-- Edge Function. Postgres sólo filtra y dispara.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------------
-- `pg_net` dispara y no espera, así que el cron nunca sabe si la purga llegó a
-- correr. La fila la escribe la función al terminar: pasada sin fila es una
-- pasada que no llegó.

create table public.guest_cleanup_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  dry_run boolean not null default false,
  deleted int not null default 0,
  failed int not null default 0,
  error text
);

-- RLS activada y sin ninguna política: nadie la lee por la API. La Edge
-- Function escribe con clave de servicio, que se salta la RLS.
alter table public.guest_cleanup_runs enable row level security;

-- ---------------------------------------------------------------------------
-- Selección
-- ---------------------------------------------------------------------------
-- El filtro vive aquí y no en TypeScript: `auth.admin.listUsers()` obligaría a
-- pasear toda la tabla por la función para descartarla en memoria.

create function public.stale_guest_ids(p_days int, p_limit int)
returns setof uuid
language sql security definer set search_path = '' as $$
  select id from auth.users
  where is_anonymous
    -- `coalesce` y no `last_sign_in_at` a secas: una fila anónima que nunca
    -- registró un inicio de sesión sería inmortal.
    and coalesce(last_sign_in_at, created_at) < now() - make_interval(days => p_days)
  order by coalesce(last_sign_in_at, created_at)
  limit p_limit;
$$;

-- `security definer` sobre `auth.users` en el esquema `public` es una RPC que
-- PostgREST publica. Sólo la clave de servicio.
revoke execute on function public.stale_guest_ids(int, int) from public, anon, authenticated;
grant execute on function public.stale_guest_ids(int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Disparador
-- ---------------------------------------------------------------------------
-- Lo único que corre dentro de Postgres. Lee del Vault a dónde llamar y con qué
-- bearer, y suelta el POST por `pg_net`. No espera respuesta: la bitácora la
-- escribe la función al otro lado.
--
-- `net.http_post` y no `extensions.http_post`: `pg_net` se instala en el
-- esquema `extensions` pero planta sus funciones en `net`, y con
-- `search_path = ''` hay que cualificarlas. Igual para `vault.decrypted_secrets`.

create function public.purge_guests_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'guest_purge_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'guest_purge_key';

  -- Guarda por secreto ausente. Es lo que deja el job mudo tras un `db reset`,
  -- para que `npm test` no dispare peticiones HTTP contra nada.
  if v_url is null or v_key is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000);
end $$;

-- Sin esto, PostgREST la publica en /rest/v1/rpc/purge_guests_tick y, siendo
-- `security definer`, cualquiera con la clave publicable —que viaja en el
-- bundle del navegador— podría dispararla en bucle. La ejecuta el planificador
-- de `pg_cron`, que corre como `postgres`, y nadie más.
revoke execute on function public.purge_guests_tick() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Programación
-- ---------------------------------------------------------------------------
-- Desprogramar por `jobid` y no por nombre: `cron.unschedule('purga-invitados')`
-- con un job que todavía no existe aborta con `could not find valid entry for
-- job`, que es justo lo que pasa la primera vez que se aplica esta migración.
-- La forma con `select ... from cron.job` no encuentra filas y no hace nada.
--
-- `cron.timezone` es GMT: las 04:00 son UTC.
select cron.unschedule(jobid) from cron.job where jobname = 'purga-invitados';
select cron.schedule('purga-invitados', '0 4 * * *', $$select public.purge_guests_tick()$$);
