-- =========================================
-- POSTING STREAKS (run after 0025)
-- A day counts when you post anything: a post, clip, story or Line Check
-- (days follow Ohio time). Every 7 days in a row earns a Streak Freeze (max 2);
-- a missed day uses one automatically so the streak survives.
-- Rewards are in-app only (badges, looks, features) — never money or prizes.
-- =========================================

-- 1. Which days each person was active (kept even after stories/Line Checks are gone)
create table public.activity_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
alter table public.activity_days enable row level security; -- read only through the functions below

create function public.ohio_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/New_York')::date;
$$;

create function public.record_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_days (user_id, day)
  values (new.author_id, public.ohio_today())
  on conflict do nothing;
  return new;
end;
$$;
create trigger posts_record_activity after insert on public.posts
  for each row execute function public.record_activity();
create trigger stories_record_activity after insert on public.stories
  for each row execute function public.record_activity();
create trigger line_checks_record_activity after insert on public.line_checks
  for each row execute function public.record_activity();

-- Past posts and stories count too
insert into public.activity_days (user_id, day)
select author_id, (created_at at time zone 'America/New_York')::date from public.posts
union
select author_id, (created_at at time zone 'America/New_York')::date from public.stories
on conflict do nothing;

-- 2. Profile settings that streaks unlock
alter table public.profiles
  add column hide_streak boolean not null default false,
  add column accent text check (accent in ('#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#818cf8', '#e879f9')),
  add column pinned_post_id uuid references public.posts(id) on delete set null;
grant update (hide_streak, accent, pinned_post_id) on public.profiles to authenticated;

-- 3. The streak maths (one place, used by everything below)
create function public.streak_stats(uid uuid)
returns table (current_streak int, best_streak int, freezes int, today_done boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  first_day date;
  today date := public.ohio_today();
  d date;
  active boolean;
  cur int := 0;
  best int := 0;
  frz int := 0;
begin
  select min(a.day) into first_day from public.activity_days a where a.user_id = uid;
  if first_day is null then
    return query select 0, 0, 0, false;
    return;
  end if;
  d := first_day;
  while d <= today loop
    active := exists (select 1 from public.activity_days a where a.user_id = uid and a.day = d);
    if active then
      cur := cur + 1;
      if cur % 7 = 0 and frz < 2 then frz := frz + 1; end if;
    elsif d < today then           -- today isn't over yet: no penalty
      if cur > 0 and frz > 0 then frz := frz - 1;  -- a freeze saves the streak
      else cur := 0;
      end if;
    end if;
    best := greatest(best, cur);
    d := d + 1;
  end loop;
  return query select cur, best, frz,
    exists (select 1 from public.activity_days a where a.user_id = uid and a.day = today);
end;
$$;
revoke execute on function public.streak_stats(uuid) from public, anon, authenticated;

-- My own streak
create function public.my_streak()
returns table (current_streak int, best_streak int, freezes int, today_done boolean)
language sql stable security definer set search_path = '' as $$
  select * from public.streak_stats((select auth.uid()));
$$;
revoke execute on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated;

-- Streaks of several people (for profiles, story rings). Hidden streaks come back empty.
create function public.streak_levels(uids uuid[])
returns table (user_id uuid, current_streak int, best_streak int)
language sql stable security definer set search_path = '' as $$
  select p.id, s.current_streak, s.best_streak
  from public.profiles p
  cross join lateral public.streak_stats(p.id) s
  where p.id = any (uids[1:100])
    and (not p.hide_streak or p.id = (select auth.uid()))
    and not public.is_blocked_between((select auth.uid()), p.id);
$$;
revoke execute on function public.streak_levels(uuid[]) from public, anon;
grant execute on function public.streak_levels(uuid[]) to authenticated;

-- Hall of Fame: 100-day "Centurions" and today's longest streaks (public, non-hidden accounts)
create function public.hall_of_fame()
returns table (user_id uuid, username text, display_name text, avatar_url text, current_streak int, best_streak int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_url, s.current_streak, s.best_streak
  from public.profiles p
  cross join lateral public.streak_stats(p.id) s
  where not p.hide_streak and not p.is_private
    and not public.is_blocked_between((select auth.uid()), p.id)
    and (s.current_streak >= 3 or s.best_streak >= 100)
  order by s.best_streak >= 100 desc, s.current_streak desc, s.best_streak desc
  limit 50;
$$;
revoke execute on function public.hall_of_fame() from public, anon;
grant execute on function public.hall_of_fame() to authenticated;

-- 4. Rewards are checked by the database, not just the app
create function public.check_streak_rewards()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  best int;
begin
  select s.best_streak into best from public.streak_stats(new.id) s;
  if new.accent is distinct from old.accent and new.accent is not null and best < 7 then
    raise exception 'Profile colors unlock at a 7-day streak';
  end if;
  if new.pinned_post_id is distinct from old.pinned_post_id and new.pinned_post_id is not null then
    if best < 50 then
      raise exception 'Pinning a post unlocks at a 50-day streak';
    end if;
    if not exists (select 1 from public.posts where id = new.pinned_post_id and author_id = new.id) then
      raise exception 'You can only pin your own post';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_check_streak_rewards
  before update of accent, pinned_post_id on public.profiles
  for each row execute function public.check_streak_rewards();

-- Two chat backgrounds you earn: Aurora (7 days) and Golden (100 days)
alter table public.conversations drop constraint if exists conversations_theme_check;
alter table public.conversations add constraint conversations_theme_check
  check (theme in ('default', 'sunset', 'ocean', 'forest', 'lavender', 'candy', 'night', 'mono', 'peach', 'mint', 'aurora', 'golden'));

create or replace function public.set_conversation_theme(conv uuid, new_theme text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  best int;
begin
  if not public.is_conversation_member(conv) then
    raise exception 'You are not in this chat';
  end if;
  if new_theme in ('aurora', 'golden') then
    select s.best_streak into best from public.streak_stats(auth.uid()) s;
    if (new_theme = 'aurora' and best < 7) or (new_theme = 'golden' and best < 100) then
      raise exception 'This background unlocks with a longer streak';
    end if;
  end if;
  update public.conversations set theme = new_theme where id = conv;
end;
$$;
