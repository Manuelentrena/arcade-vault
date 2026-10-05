-- SPEC 31 — El Advisor de seguridad de Supabase marca ambas como SECURITY
-- DEFINER ejecutables vía RPC por anon/authenticated sin que sea intencional.
--
-- handle_new_user(): trigger-only (dispara en auth.users), nunca se llama
-- directo. Nunca tuvo revoke — a diferencia de la familia de purga de
-- invitados (SPEC 08), que sí sigue el patrón "revoke execute … from
-- public, anon, authenticated" desde que se creó.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- save_score(text, integer, integer, text): la migración que la recreó con
-- el cuarto parámetro (token, SPEC 29) solo hizo "revoke … from public" y
-- "grant … to authenticated". Eso no alcanza a anon: Supabase concede
-- EXECUTE a anon/authenticated por defecto a toda función nueva en public
-- vía ALTER DEFAULT PRIVILEGES, al margen de lo que se revoque a public.
-- El grant a authenticated ya existe (migración 20261002132000) y se deja
-- tal cual — solo se cierra el hueco de anon.
revoke execute on function public.save_score(text, integer, integer, text) from anon;
