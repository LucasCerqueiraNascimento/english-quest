-- Picture Challenge: lesson content and server-authoritative attempts.
create table public.picture_games (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.lessons(id) on delete cascade,
  title text not null default 'Picture Challenge' check (char_length(title) between 2 and 80),
  created_at timestamptz not null default now()
);
create table public.picture_items (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.picture_games(id) on delete cascade,
  position integer not null check (position between 0 and 30),
  image_url text not null check (char_length(image_url) between 2 and 500),
  answer text not null check (char_length(answer) between 2 and 60),
  choices text[] not null check (cardinality(choices) = 4),
  unique(game_id,position), unique(id,game_id)
);
create table public.picture_attempts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.picture_games(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attempt_number integer not null check (attempt_number between 1 and 3),
  score integer not null default 0 check (score >= 0),
  streak integer not null default 0 check (streak >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(student_id,game_id,attempt_number)
);
create index on public.picture_attempts(game_id,student_id);
create table public.picture_answers (
  attempt_id uuid not null references public.picture_attempts(id) on delete cascade,
  item_id uuid not null references public.picture_items(id) on delete cascade,
  mistakes integer not null default 0 check (mistakes between 0 and 3),
  correct boolean not null default false,
  resolved boolean not null default false,
  points integer not null default 0 check (points >= 0),
  primary key(attempt_id,item_id)
);
alter table public.picture_games enable row level security;
alter table public.picture_items enable row level security;
alter table public.picture_attempts enable row level security;
alter table public.picture_answers enable row level security;
revoke all on public.picture_games,public.picture_items,public.picture_attempts,public.picture_answers from anon,authenticated;
grant all on public.picture_games,public.picture_items,public.picture_attempts,public.picture_answers to service_role;

-- Invoked only after school-api has authenticated a live, approved student.
create function public.eq_picture_step(p_student uuid,p_game uuid,p_item uuid default null,p_choice text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.picture_attempts%rowtype; q public.picture_items%rowtype;
 v_count integer; v_resolved integer; v_mistakes integer; v_correct boolean; v_done boolean; v_points integer; v_bonus integer:=0;
begin
  select count(*) into v_count from public.picture_items where game_id=p_game;
  if v_count<4 then raise exception 'game_empty'; end if;
  if not exists (
    select 1 from public.picture_games g join public.lessons l on l.id=g.lesson_id
    join public.students s on s.class_id=l.class_id
    join public.classes c on c.id=s.class_id
    where g.id=p_game and s.id=p_student and s.status='approved' and not c.archived
      and (l.status='published' or (l.status='scheduled' and l.opens_at <= now()))
  ) then raise exception 'game_unavailable'; end if;
  -- Serializes concurrent requests and attempts per student/game.
  perform pg_advisory_xact_lock(hashtextextended(p_student::text || p_game::text,0));
  select * into a from public.picture_attempts where student_id=p_student and game_id=p_game
    order by attempt_number desc limit 1;
  if p_item is null then
    if a.id is null or a.completed_at is not null then
      if a.id is not null and a.attempt_number>=3 then raise exception 'attempt_limit'; end if;
      insert into public.picture_attempts(student_id,game_id,attempt_number)
      values(p_student,p_game,coalesce(a.attempt_number,0)+1) returning * into a;
    end if;
    return jsonb_build_object('attempt_id',a.id,'attempt_number',a.attempt_number,'score',a.score,'completed',a.completed_at is not null);
  end if;
  if a.id is null or a.completed_at is not null then raise exception 'attempt_unavailable'; end if;
  select * into q from public.picture_items where id=p_item and game_id=p_game;
  if q.id is null or p_choice is null or not(p_choice=any(q.choices)) then raise exception 'choice_invalid'; end if;
  select count(*) into v_resolved from public.picture_answers where attempt_id=a.id and resolved;
  if q.position <> (select position from public.picture_items where game_id=p_game order by position offset v_resolved limit 1)
  then raise exception 'item_order'; end if;
  select mistakes into v_mistakes from public.picture_answers where attempt_id=a.id and item_id=q.id;
  v_mistakes:=coalesce(v_mistakes,0);
  v_correct:=p_choice=q.answer;
  v_done:=v_correct or v_mistakes=2;
  v_points:=case when v_correct then (case v_mistakes when 0 then 100 when 1 then 70 else 50 end) else 0 end;
  insert into public.picture_answers(attempt_id,item_id,mistakes,correct,resolved,points)
    values(a.id,q.id,v_mistakes+(not v_correct)::integer,v_correct,v_done,v_points)
    on conflict(attempt_id,item_id) do update set mistakes=excluded.mistakes,correct=excluded.correct,resolved=excluded.resolved,points=excluded.points;
  if v_done then
    if v_correct and a.streak+1=3 then v_bonus:=50; end if;
    if v_resolved+1=v_count then v_bonus:=v_bonus+100; end if;
    update public.picture_attempts set score=score+v_points+v_bonus,
      streak=case when v_correct and a.streak+1<3 then a.streak+1 else 0 end,
      completed_at=case when v_resolved+1=v_count then now() else null end
      where id=a.id returning * into a;
  end if;
  return jsonb_build_object('correct',v_correct,'resolved',v_done,'answer',case when v_done then q.answer else null end,
    'mistakes',v_mistakes+(not v_correct)::integer,'points',v_points+v_bonus,'score',a.score,
    'completed',a.completed_at is not null);
end;
$$;
revoke all on function public.eq_picture_step(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.eq_picture_step(uuid,uuid,uuid,text) to service_role;
