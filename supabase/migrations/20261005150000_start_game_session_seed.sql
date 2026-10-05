-- SPEC 32 — semilla de partida en `start_game_session`.
--
-- El replay en servidor de TETRIX necesita regenerar exactamente la misma
-- secuencia de piezas que vio el cliente. La semilla se emite aquí, junto
-- al token, y viaja firmada dentro del mismo payload para que el cliente
-- no pueda sustituirla por otra. El payload gana también un campo `typ`
-- ("session") para que este token no pueda colarse donde se espera una
-- prueba de score (`issue_score_proof`, siguiente migración).
drop function if exists public.start_game_session(text);

create or replace function public.start_game_session(p_slug text)
returns table (token text, expires_at timestamptz, seed text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_secret text;
  v_expires_at timestamptz;
  v_exp_epoch bigint;
  v_seed text;
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
  v_seed := encode(extensions.gen_random_bytes(16), 'hex');

  -- Payload JSON compacto: tipo, usuario, juego (uuid), caducidad (epoch) y
  -- la semilla de piezas.
  v_payload := jsonb_build_object(
    'typ', 'session',
    'uid', auth.uid(),
    'gid', v_game_id,
    'exp', v_exp_epoch,
    'seed', v_seed
  )::text;

  -- base64url sin relleno: encode() mete salto de línea cada 76 caracteres y
  -- usa '+'/'/', que no viajan limpios en una query string ni en un header.
  v_payload_b64 := regexp_replace(encode(v_payload::bytea, 'base64'), '\s', '', 'g');
  v_payload_b64 := translate(v_payload_b64, '+/', '-_');
  v_payload_b64 := regexp_replace(v_payload_b64, '=+$', '');

  -- La firma va sobre el JSON crudo, no sobre su versión en base64 — así lo
  -- fija el modelo de datos de la spec.
  v_sig_hex := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');

  return query select v_payload_b64 || '.' || v_sig_hex, v_expires_at, v_seed;
end;
$$;

revoke execute on function public.start_game_session(text) from public, anon;
grant execute on function public.start_game_session(text) to authenticated;
