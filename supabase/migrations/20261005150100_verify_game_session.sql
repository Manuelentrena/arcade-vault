-- SPEC 32 — `verify_game_session`: decodifica y verifica el token de
-- `start_game_session` fuera del propio `save_score`, para que la ruta de
-- validación de replay (`app/api/validar-partida-tetrix`) pueda resolver
-- usuario, juego y semilla sin reimplementar la verificación HMAC en
-- TypeScript. Misma lógica de decodificación que ya usa `save_score`, pero
-- aquí un token inválido se trata como un error real (la ruta responde
-- 4xx), no como "silencio" — eso solo aplica a `save_score`.
create or replace function public.verify_game_session(p_token text)
returns table (uid uuid, gid uuid, seed text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_dot_pos integer;
  v_payload_b64 text;
  v_sig_hex text;
  v_pad integer;
  v_payload_bytes bytea;
  v_payload_json jsonb;
  v_expected_sig text;
  v_typ text;
  v_exp bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'game_session_secret';

  if v_secret is null then
    raise exception 'sesión de partida no disponible';
  end if;

  v_dot_pos := position('.' in p_token);
  if v_dot_pos = 0 then
    raise exception 'token malformado';
  end if;

  v_payload_b64 := substring(p_token from 1 for v_dot_pos - 1);
  v_sig_hex := substring(p_token from v_dot_pos + 1);

  v_pad := (4 - length(v_payload_b64) % 4) % 4;
  v_payload_bytes := decode(
    translate(v_payload_b64, '-_', '+/') || repeat('=', v_pad),
    'base64'
  );

  v_expected_sig := encode(
    extensions.hmac(v_payload_bytes, v_secret::bytea, 'sha256'),
    'hex'
  );
  if v_expected_sig is distinct from lower(v_sig_hex) then
    raise exception 'firma inválida';
  end if;

  v_payload_json := convert_from(v_payload_bytes, 'UTF8')::jsonb;
  v_typ := v_payload_json ->> 'typ';
  v_exp := (v_payload_json ->> 'exp')::bigint;

  if v_typ is distinct from 'session' or v_exp < extract(epoch from now())::bigint then
    raise exception 'token inválido';
  end if;

  return query select
    (v_payload_json ->> 'uid')::uuid,
    (v_payload_json ->> 'gid')::uuid,
    v_payload_json ->> 'seed';
end;
$$;

revoke execute on function public.verify_game_session(text) from public, anon;
grant execute on function public.verify_game_session(text) to authenticated;
