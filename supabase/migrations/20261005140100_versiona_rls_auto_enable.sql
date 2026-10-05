-- SPEC 31 — rls_auto_enable() y el event trigger ensure_rls existían en el
-- proyecto remoto (fuerzan ENABLE ROW LEVEL SECURITY en toda tabla nueva de
-- public) pero no en ninguna migración: alguien los creó a mano, fuera del
-- flujo de este repo. Esta migración los trae al repositorio como fuente de
-- verdad — definición capturada de pg_get_functiondef/pg_event_trigger en
-- remoto el 2026-10-05 — y cierra el mismo hueco que save_score: una
-- función SECURITY DEFINER nueva hereda EXECUTE de anon/authenticated por
-- defecto y PostgREST la publica como RPC pública.
--
-- drop … if exists: no existe en local (nunca se creó ahí), así que es un
-- no-op en npx supabase db reset; en remoto reemplaza limpiamente el objeto
-- ya vigente sin duplicar el event trigger.
drop event trigger if exists ensure_rls;
drop function if exists public.rls_auto_enable();

create function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();
