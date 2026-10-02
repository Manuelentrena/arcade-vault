-- SPEC 29 — token de sesión de partida.
--
-- Antes de esta spec, `save_score` confiaba a ciegas en el score y el nivel
-- que mandaba el cliente. `start_game_session` certifica, con una firma que
-- el cliente no puede fabricar, que hubo una carga reciente de /jugar/[id]
-- para este usuario y este juego: `save_score` (siguiente migración) exige
-- ese token antes de insertar.
--
-- Sin tabla de sesiones: el token lleva su propio payload (usuario, juego,
-- caducidad) y `save_score` verifica recalculando el HMAC, igual que un JWT
-- casero. No hace falta persistir nada para poder revocar nada, porque
-- caduca solo a los 60 minutos.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.start_game_session(p_slug text)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_secret text;
  v_expires_at timestamptz;
  v_exp_epoch bigint;
  v_payload text;
  v_payload_b64 text;
  v_sig_hex text;
begin
  select id into v_game_id from public.games where slug = p_slug;
  if v_game_id is null then
    raise exception 'juego % no encontrado', p_slug;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'game_session_secret';

  if v_secret is null then
    raise exception 'sesión de partida no disponible';
  end if;

  v_expires_at := now() + interval '60 minutes';
  v_exp_epoch := extract(epoch from v_expires_at)::bigint;

  -- Payload JSON compacto: usuario, juego (uuid) y caducidad (epoch).
  v_payload := jsonb_build_object(
    'uid', auth.uid(),
    'gid', v_game_id,
    'exp', v_exp_epoch
  )::text;

  -- base64url sin relleno: encode() mete salto de línea cada 76 caracteres y
  -- usa '+'/'/', que no viajan limpios en una query string ni en un header.
  v_payload_b64 := regexp_replace(encode(v_payload::bytea, 'base64'), '\s', '', 'g');
  v_payload_b64 := translate(v_payload_b64, '+/', '-_');
  v_payload_b64 := regexp_replace(v_payload_b64, '=+$', '');

  -- La firma va sobre el JSON crudo, no sobre su versión en base64 — así lo
  -- fija el modelo de datos de la spec.
  v_sig_hex := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');

  return query select v_payload_b64 || '.' || v_sig_hex, v_expires_at;
end;
$$;

-- Como las demás RPCs de este estilo: nunca a `anon` (no hay sesión de
-- partida sin usuario), concedida solo a `authenticated` (incluye al
-- invitado real: puede jugar y el motor sigue necesitando un token aunque
-- `save_score` acabe rechazándolo por ser invitado).
revoke execute on function public.start_game_session(text) from public, anon;
grant execute on function public.start_game_session(text) to authenticated;
