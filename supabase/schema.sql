-- English Quest foundation. All application data is accessed through the
-- authenticated school-api Edge Function. No direct browser table access.
create extension if not exists pgcrypto with schema extensions;

create table public.staff_access (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  join_code text unique not null default upper(encode(extensions.gen_random_bytes(4),'hex')),
  meeting_days text[] not null default array['Segunda','Quarta'],
  archived boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  display_name text not null check (char_length(display_name) between 2 and 40),
  nickname text not null check (nickname ~ '^[a-z0-9_]{3,20}$'),
  avatar text not null check (avatar in ('rocket','cat','star','planet','book','bolt')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','disabled')),
  created_at timestamptz not null default now(),
  unique(class_id,nickname)
);
create table public.student_credentials (
  student_id uuid primary key references public.students(id) on delete cascade,
  pin_hash text not null,
  salt text not null
);
create table public.student_sessions (
  token_hash text primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  expires_at timestamptz not null
);
create index on public.student_sessions(student_id);
create index on public.student_sessions(expires_at);
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  title text not null check (char_length(title) between 2 and 120),
  topic text not null default '' check (char_length(topic) <= 120),
  objective text not null default '' check (char_length(objective) <= 1000),
  lesson_date date not null,
  status text not null default 'draft' check (status in ('draft','scheduled','published','closed','archived')),
  opens_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'scheduled' or opens_at is not null)
);
create index on public.lessons(class_id,lesson_date);
create table public.auth_rate_limits (
  key text primary key,
  count integer not null,
  expires_at timestamptz not null
);
create index on public.auth_rate_limits(expires_at);

alter table public.staff_access enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.student_credentials enable row level security;
alter table public.student_sessions enable row level security;
alter table public.lessons enable row level security;
alter table public.auth_rate_limits enable row level security;
revoke all on public.staff_access, public.classes, public.students,
  public.student_credentials, public.student_sessions, public.lessons,
  public.auth_rate_limits from anon, authenticated;
grant all on public.staff_access, public.classes, public.students,
  public.student_credentials, public.student_sessions, public.lessons,
  public.auth_rate_limits to service_role;

-- Atomic rate limiter, callable only by the backend service role.
create function public.eq_rate_limit(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  delete from public.auth_rate_limits where expires_at < now() - interval '1 day';
  insert into public.auth_rate_limits as r(key,count,expires_at)
  values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set
    count=case when r.expires_at <= now() then 1 else r.count+1 end,
    expires_at=case when r.expires_at <= now() then now()+make_interval(secs=>p_seconds) else r.expires_at end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

create function public.eq_register_student(p_class uuid,p_name text,p_nick text,p_avatar text,p_hash text,p_salt text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.classes where id=p_class and not archived) then
    raise exception 'Class unavailable';
  end if;
  insert into public.students(class_id,display_name,nickname,avatar)
    values(p_class,p_name,p_nick,p_avatar) returning id into v_id;
  insert into public.student_credentials(student_id,pin_hash,salt) values(v_id,p_hash,p_salt);
  return v_id;
end;
$$;

create function public.eq_reset_pin(p_student uuid,p_hash text,p_salt text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.student_credentials set pin_hash=p_hash,salt=p_salt where student_id=p_student;
  delete from public.student_sessions where student_id=p_student;
end;
$$;
revoke all on function public.eq_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.eq_register_student(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.eq_reset_pin(uuid,text,text) from public,anon,authenticated;
grant execute on function public.eq_rate_limit(text,integer,integer) to service_role;
grant execute on function public.eq_register_student(uuid,text,text,text,text,text) to service_role;
grant execute on function public.eq_reset_pin(uuid,text,text) to service_role;
