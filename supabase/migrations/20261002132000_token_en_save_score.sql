-- SPEC 29 (hallazgo #2) — `save_score` dejaba de confiar solo en "¿supera la
-- mejor marca?" y empieza a confiar también en: ¿hubo de verdad una sesión de
-- partida reciente para este usuario y este juego (token de
-- `start_game_session`), y el valor que manda el cliente es, al menos,
-- plausible (techo global, nivel dentro del rango real del juego)?
--
-- Firma distinta a la anterior (un parámetro más): hay que retirar la de 3
-- parámetros a mano, o quedaría un atajo vivo que no exige token.
drop function if exists public.save_score(text, integer, integer);

create or replace function public.save_score(
  p_slug text,
  p_score integer,
  p_level integer,
  p_token text
)
returns table (is_new_record boolean, previous_best integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_niveles integer;
  v_is_anonymous boolean;
  v_previous_best integer;
  v_secret text;
  v_dot_pos integer;
  v_payload_b64 text;
  v_sig_hex text;
  v_pad integer;
  v_payload_bytes bytea;
  v_payload_json jsonb;
  v_expected_sig text;
  v_token_uid text;
  v_token_gid text;
  v_token_exp bigint;
begin
  select is_anonymous into v_is_anonymous
  from auth.users
  where id = auth.uid();

  if v_is_anonymous is not false then
    raise exception 'guardado no disponible para invitados';
  end if;

  select id, niveles into v_game_id, v_niveles
  from public.games
  where slug = p_slug;

  if v_game_id is null then
    raise exception 'juego % no encontrado', p_slug;
  end if;

  select max(score) into v_previous_best
  from public.scores
  where user_id = auth.uid() and game_id = v_game_id;

  -- Verificación del token: firma, caducidad, mismo usuario, mismo juego.
  -- Cualquier fallo —token ausente, mal formado, firma que no cuadra,
  -- caducado, emitido para otro usuario u otro juego— se trata igual: nunca
  -- una excepción visible, la misma forma de respuesta que "no es récord".
  begin
    v_dot_pos := position('.' in p_token);
    if v_dot_pos = 0 then
      raise exception 'token malformado';
    end if;

    v_payload_b64 := substring(p_token from 1 for v_dot_pos - 1);
    v_sig_hex := substring(p_token from v_dot_pos + 1);

    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'game_session_secret';

    if v_secret is null then
      raise exception 'secreto de sesión no disponible';
    end if;

    -- Deshacer el base64url: alfabeto estándar y relleno repuesto hasta
    -- múltiplo de 4, que es lo que `start_game_session` quitó al emitirlo.
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
    v_token_uid := v_payload_json ->> 'uid';
    v_token_gid := v_payload_json ->> 'gid';
    v_token_exp := (v_payload_json ->> 'exp')::bigint;

    if v_token_uid is distinct from auth.uid()::text
       or v_token_gid is distinct from v_game_id::text
       or v_token_exp < extract(epoch from now())::bigint
    then
      raise exception 'token inválido';
    end if;
  exception when others then
    return query select false, v_previous_best;
    return;
  end;

  -- Techo global: cubre el ataque concreto del informe (un valor disparatado
  -- vía `?puntuacion=`) sin inventar un máximo plausible por juego.
  if p_score > 10000000 then
    return query select false, v_previous_best;
    return;
  end if;

  -- Tope de nivel: el rango real del juego (`games.niveles`) cuando existe;
  -- si no (asteroides/arkanoid/buscaminas/serpiente no tienen tope), solo se
  -- exige un nivel positivo.
  if (v_niveles is not null and (p_level < 1 or p_level > v_niveles))
     or (v_niveles is null and p_level < 1)
  then
    return query select false, v_previous_best;
    return;
  end if;

  if v_previous_best is not null and p_score <= v_previous_best then
    return query select false, v_previous_best;
    return;
  end if;

  insert into public.scores (user_id, game_id, score, level)
  values (auth.uid(), v_game_id, p_score, p_level);

  return query select true, v_previous_best;
end;
$$;

revoke execute on function public.save_score(text, integer, integer, text) from public;
grant execute on function public.save_score(text, integer, integer, text) to authenticated;
