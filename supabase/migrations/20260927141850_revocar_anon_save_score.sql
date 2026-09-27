-- save_score quedó ejecutable por `anon` en la migración anterior: Supabase
-- concede EXECUTE a anon/authenticated/service_role por defecto a toda
-- función nueva en `public` (ALTER DEFAULT PRIVILEGES a nivel de esquema), y
-- `revoke execute ... from public` solo retira el pseudo-rol PUBLIC, no esas
-- concesiones ya adjuntas por rol. No es explotable hoy — auth.uid() es null
-- para una llamada anon de verdad, y `is_anonymous is not false` la rechaza
-- igual que a un invitado — pero no coincide con el diseño documentado
-- ("solo se concede a authenticated, nunca a anon") y lo marca el linter de
-- seguridad de Supabase (anon_security_definer_function_executable).
revoke execute on function public.save_score(text, integer, integer) from anon;
