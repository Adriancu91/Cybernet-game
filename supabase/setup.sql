-- ============================================================
-- CyberNet: AI Academy — cloud accounts (ID + PIN, no e-mail)
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run again (it only creates what is missing).
--
-- Security model:
--   * tables have Row Level Security ON and NO policies, so the
--     public key can never read them directly;
--   * the game only calls the cn_* functions below, which check
--     the PIN (stored as a bcrypt hash, never in clear);
--   * 5 wrong PINs lock the account for 15 minutes.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.cn_players (
  username      text primary key,
  username_low  text unique not null,
  pin_hash      text not null,
  save          jsonb,
  save_version  integer not null default 0,
  save_size     integer not null default 0,
  failed        integer not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.cn_players enable row level security;

create table if not exists public.cn_ai_answers (
  id          bigserial primary key,
  username    text not null,
  qid         text,
  kind        text,
  question    text,
  answer      text,
  useful      boolean,
  created_at  timestamptz not null default now()
);
alter table public.cn_ai_answers enable row level security;
create index if not exists cn_ai_answers_qid on public.cn_ai_answers (qid);

-- ---------- internal: check ID + PIN with lockout ----------
create or replace function public.cn_verify(p_user text, p_pin text)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare r public.cn_players;
begin
  select * into r from public.cn_players where username_low = lower(p_user) for update;
  if not found then return 'nouser'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;
  if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
    update public.cn_players set failed = 0, locked_until = null where username = r.username;
    return 'ok';
  end if;
  update public.cn_players
     set failed = r.failed + 1,
         locked_until = case when r.failed + 1 >= 5 then now() + interval '15 minutes' else null end
   where username = r.username;
  return case when r.failed + 1 >= 5 then 'locked' else 'badpin' end;
end $$;
revoke all on function public.cn_verify(text, text) from public, anon, authenticated;

-- ---------- create an account ----------
create or replace function public.cn_register(p_user text, p_pin text)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_user is null or p_user !~ '^[A-Za-z0-9_.-]{3,20}$' then
    return json_build_object('ok', false, 'error', 'bad_id');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    return json_build_object('ok', false, 'error', 'bad_pin');
  end if;
  if exists (select 1 from public.cn_players where username_low = lower(p_user)) then
    return json_build_object('ok', false, 'error', 'taken');
  end if;
  insert into public.cn_players (username, username_low, pin_hash)
  values (p_user, lower(p_user), crypt(p_pin, gen_salt('bf', 8)));
  return json_build_object('ok', true, 'version', 0);
end $$;

-- ---------- log in: returns the cloud save (or null) ----------
create or replace function public.cn_load(p_user text, p_pin text)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare v text; r public.cn_players;
begin
  v := public.cn_verify(p_user, p_pin);
  if v <> 'ok' then return json_build_object('ok', false, 'error', v); end if;
  select * into r from public.cn_players where username_low = lower(p_user);
  return json_build_object('ok', true, 'username', r.username, 'version', r.save_version, 'save', r.save, 'updated', r.updated_at);
end $$;

-- ---------- save: refuses to overwrite newer progress from another device ----------
create or replace function public.cn_save(p_user text, p_pin text, p_save jsonb, p_base integer, p_force boolean default false)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare v text; r public.cn_players; sz integer;
begin
  v := public.cn_verify(p_user, p_pin);
  if v <> 'ok' then return json_build_object('ok', false, 'error', v); end if;
  sz := length(p_save::text);
  if sz > 2000000 then return json_build_object('ok', false, 'error', 'too_big'); end if;
  select * into r from public.cn_players where username_low = lower(p_user) for update;
  if not coalesce(p_force, false) and coalesce(p_base, 0) < r.save_version then
    return json_build_object('ok', false, 'error', 'conflict', 'version', r.save_version, 'updated', r.updated_at);
  end if;
  update public.cn_players
     set save = p_save, save_version = r.save_version + 1, save_size = sz, updated_at = now()
   where username = r.username;
  return json_build_object('ok', true, 'version', r.save_version + 1);
end $$;

-- ---------- AI Lab answers from every player (for the AI to learn from) ----------
create or replace function public.cn_ai_answers_add(p_user text, p_pin text, p_answers jsonb)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare v text; a jsonb; n integer := 0; uname text;
begin
  v := public.cn_verify(p_user, p_pin);
  if v <> 'ok' then return json_build_object('ok', false, 'error', v); end if;
  select username into uname from public.cn_players where username_low = lower(p_user);
  for a in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) limit 20 loop
    insert into public.cn_ai_answers (username, qid, kind, question, answer, useful)
    values (uname, left(a->>'id', 80), left(a->>'kind', 20), left(a->>'q', 400), left(a->>'a', 600), (a->>'ok')::boolean);
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'stored', n);
end $$;

-- ---------- change PIN ----------
create or replace function public.cn_change_pin(p_user text, p_pin text, p_new text)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare v text;
begin
  if p_new is null or p_new !~ '^[0-9]{4,8}$' then return json_build_object('ok', false, 'error', 'bad_pin'); end if;
  v := public.cn_verify(p_user, p_pin);
  if v <> 'ok' then return json_build_object('ok', false, 'error', v); end if;
  update public.cn_players set pin_hash = crypt(p_new, gen_salt('bf', 8)) where username_low = lower(p_user);
  return json_build_object('ok', true);
end $$;

-- ---------- delete account (and its AI Lab answers) ----------
create or replace function public.cn_delete(p_user text, p_pin text)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare v text; uname text;
begin
  v := public.cn_verify(p_user, p_pin);
  if v <> 'ok' then return json_build_object('ok', false, 'error', v); end if;
  select username into uname from public.cn_players where username_low = lower(p_user);
  delete from public.cn_ai_answers where username = uname;
  delete from public.cn_players where username = uname;
  return json_build_object('ok', true);
end $$;

grant execute on function public.cn_register(text, text) to anon;
grant execute on function public.cn_load(text, text) to anon;
grant execute on function public.cn_save(text, text, jsonb, integer, boolean) to anon;
grant execute on function public.cn_ai_answers_add(text, text, jsonb) to anon;
grant execute on function public.cn_change_pin(text, text, text) to anon;
grant execute on function public.cn_delete(text, text) to anon;

-- ============================================================
-- Top realizări umane (Quiz Rapid, Supraviețuire, Adevărat/Fals,
-- răspunsuri corecte, dueluri, teritoriu) — js/top.js
-- Recordurile se trimit cu ID + PIN; topul se citește public
-- (doar numele contului și valoarea, nimic altceva).
-- ============================================================
create table if not exists public.cn_records (
  username    text primary key references public.cn_players(username) on delete cascade,
  surv        integer not null default 0,
  quick       integer not null default 0,
  tf          integer not null default 0,
  correct     integer not null default 0,
  duels       integer not null default 0,
  territory   integer not null default 0,
  updated_at  timestamptz not null default now()
);
alter table public.cn_records enable row level security;

-- ---------- trimite recordurile (verifică PIN-ul; valorile absurde sunt plafonate) ----------
create or replace function public.cn_records_submit(p_user text, p_pin text, p_rec jsonb)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare v text; uname text;
  c_surv integer; c_quick integer; c_tf integer; c_correct integer; c_duels integer; c_terr integer;
begin
  v := public.cn_verify(p_user, p_pin);
  if v <> 'ok' then return json_build_object('ok', false, 'error', v); end if;
  select username into uname from public.cn_players where username_low = lower(p_user);
  c_surv    := least(greatest(coalesce((p_rec->>'surv')::numeric, 0), 0), 1000)::integer;
  c_quick   := least(greatest(coalesce((p_rec->>'quick')::numeric, 0), 0), 10000)::integer;
  c_tf      := least(greatest(coalesce((p_rec->>'tf')::numeric, 0), 0), 100000)::integer;
  c_correct := least(greatest(coalesce((p_rec->>'correct')::numeric, 0), 0), 10000000)::integer;
  c_duels   := least(greatest(coalesce((p_rec->>'duels')::numeric, 0), 0), 1000000)::integer;
  c_terr    := least(greatest(coalesce((p_rec->>'territory')::numeric, 0), 0), 10000)::integer;
  insert into public.cn_records as r (username, surv, quick, tf, correct, duels, territory, updated_at)
  values (uname, c_surv, c_quick, c_tf, c_correct, c_duels, c_terr, now())
  on conflict (username) do update set
    surv = greatest(r.surv, excluded.surv),          -- recordurile nu scad niciodată
    quick = greatest(r.quick, excluded.quick),
    tf = greatest(r.tf, excluded.tf),
    correct = greatest(r.correct, excluded.correct),
    duels = greatest(r.duels, excluded.duels),
    territory = excluded.territory,                  -- teritoriul se poate și pierde
    updated_at = now();
  return json_build_object('ok', true);
exception when others then
  return json_build_object('ok', false, 'error', 'bad_records');
end $$;

-- ---------- topul global pe o categorie ----------
create or replace function public.cn_top(p_kind text, p_limit integer default 50)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare lim integer := least(greatest(coalesce(p_limit, 50), 1), 100); res json;
begin
  if p_kind not in ('surv', 'quick', 'tf', 'correct', 'duels', 'territory') then
    return json_build_object('ok', false, 'error', 'bad_kind');
  end if;
  execute format(
    'select coalesce(json_agg(t), ''[]''::json) from (select username as u, %1$I as v from public.cn_records where %1$I > 0 order by %1$I desc, updated_at asc limit %2$s) t',
    p_kind, lim) into res;
  return json_build_object('ok', true, 'rows', res);
end $$;

grant execute on function public.cn_records_submit(text, text, jsonb) to anon;
grant execute on function public.cn_top(text, integer) to anon;
