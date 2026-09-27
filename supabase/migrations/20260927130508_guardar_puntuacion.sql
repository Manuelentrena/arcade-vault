-- save_score: guarda de verdad una partida jugada, pero solo si supera la
-- mejor marca anterior del usuario en ese juego. security definer porque
-- resuelve slug -> game_id, calcula esa marca anterior y valida al llamante
-- antes de insertar; solo se concede a authenticated (nunca a anon) y además
-- rechaza a un invitado real (is_anonymous = true), que sigue teniendo que
-- iniciar sesión de verdad.
create or replace function public.save_score(
  p_slug text,
  p_score integer,
  p_level integer
)
returns table (is_new_record boolean, previous_best integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_is_anonymous boolean;
  v_previous_best integer;
begin
  select is_anonymous into v_is_anonymous
  from auth.users
  where id = auth.uid();

  if v_is_anonymous is not false then
    raise exception 'guardado no disponible para invitados';
  end if;

  select id into v_game_id
  from public.games
  where slug = p_slug;

  if v_game_id is null then
    raise exception 'juego % no encontrado', p_slug;
  end if;

  select max(score) into v_previous_best
  from public.scores
  where user_id = auth.uid() and game_id = v_game_id;

  if v_previous_best is not null and p_score <= v_previous_best then
    return query select false, v_previous_best;
    return;
  end if;

  insert into public.scores (user_id, game_id, score, level)
  values (auth.uid(), v_game_id, p_score, p_level);

  return query select true, v_previous_best;
end;
$$;

revoke execute on function public.save_score(text, integer, integer) from public;
grant execute on function public.save_score(text, integer, integer) to authenticated;
