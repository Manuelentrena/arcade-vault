-- SPEC 32 — `issue_score_proof`: firma el score/nivel que calculó el replay
-- en servidor como una prueba de corta vida (5 minutos — solo necesita
-- sobrevivir el viaje de vuelta de la ruta de validación a `save_score`).
-- Reverifica el token de sesión con `verify_game_session`: solo se puede
-- emitir una prueba para una sesión de partida real y vigente.
create or replace function public.issue_score_proof(
  p_token text,
  p_score integer,
  p_level integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_uid uuid;
  v_gid uuid;
  v_exp_epoch bigint;
  v_payload text;
  v_payload_b64 text;
  v_sig_hex text;
begin
  select uid, gid into v_uid, v_gid
  from public.verify_game_session(p_token);

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'game_session_secret';

  if v_secret is null then
    raise exception 'sesión de partida no disponible';
  end if;

  v_exp_epoch := extract(epoch from (now() + interval '5 minutes'))::bigint;

  -- Mismo campo `typ` que `start_game_session`, valor distinto ("proof"),
  -- para que un token no pueda colarse donde se espera el otro.
  v_payload := jsonb_build_object(
    'typ', 'proof',
    'uid', v_uid,
    'gid', v_gid,
    'score', p_score,
    'level', p_level,
    'exp', v_exp_epoch
  )::text;

  v_payload_b64 := regexp_replace(encode(v_payload::bytea, 'base64'), '\s', '', 'g');
  v_payload_b64 := translate(v_payload_b64, '+/', '-_');
  v_payload_b64 := regexp_replace(v_payload_b64, '=+$', '');

  v_sig_hex := encode(extensions.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');

  return v_payload_b64 || '.' || v_sig_hex;
end;
$$;

revoke execute on function public.issue_score_proof(text, integer, integer) from public, anon;
grant execute on function public.issue_score_proof(text, integer, integer) to authenticated;
