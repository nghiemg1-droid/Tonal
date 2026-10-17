-- =========================================
-- INVITES + TONAL GIFTS (run after 0026)
-- * A friend counts as a "qualified invite" when their phone number is verified
--   and they have posted on at least 3 different days (real people, not bots).
-- * Gifts (Tonal-branded, mailed to a campus mailbox) need a verified phone too.
-- * Everyone who qualifies gets the gift (no luck involved), while stock lasts.
-- * Mailbox details are visible only to admins and are wiped once the gift ships.
-- =========================================

-- Who invited me (set once, by me, in my first 7 days)
alter table public.profiles add column referred_by uuid references public.profiles(id) on delete set null;

create function public.phone_verified(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = uid and u.phone_confirmed_at is not null and u.phone is not null and u.phone <> '');
$$;
revoke execute on function public.phone_verified(uuid) from public, anon, authenticated;

create function public.set_referrer(code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  inviter uuid;
begin
  select id into inviter from public.profiles where lower(username) = lower(trim(code));
  if inviter is null or inviter = me then return false; end if;
  update public.profiles p set referred_by = inviter
  where p.id = me and p.referred_by is null
    and exists (select 1 from auth.users u where u.id = me and u.created_at > now() - interval '7 days')
    -- no loops: the inviter wasn't invited by me
    and not exists (select 1 from public.profiles q where q.id = inviter and q.referred_by = me);
  return found;
end;
$$;
revoke execute on function public.set_referrer(text) from public, anon;
grant execute on function public.set_referrer(text) to authenticated;

create function public.qualified_invite_count(uid uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.profiles p
  where p.referred_by = uid
    and public.phone_verified(p.id)
    and (select count(*) from public.activity_days a where a.user_id = p.id) >= 3;
$$;
revoke execute on function public.qualified_invite_count(uuid) from public, anon, authenticated;

-- My invites: each friend's progress (no private info: just username and progress)
create function public.my_invites()
returns table (username text, avatar_url text, phone_ok boolean, active_days int, qualified boolean)
language sql stable security definer set search_path = '' as $$
  select p.username, p.avatar_url,
    public.phone_verified(p.id),
    least(3, (select count(*) from public.activity_days a where a.user_id = p.id))::int,
    public.phone_verified(p.id) and (select count(*) from public.activity_days a where a.user_id = p.id) >= 3
  from public.profiles p
  where p.referred_by = (select auth.uid())
  order by p.username;
$$;
revoke execute on function public.my_invites() from public, anon;
grant execute on function public.my_invites() to authenticated;

-- =========================================
-- GIFTS
-- =========================================
create table public.admins (user_id uuid primary key references public.profiles(id) on delete cascade);
alter table public.admins enable row level security; -- managed only in the SQL editor

create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
grant execute on function public.is_admin() to authenticated;

create table public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward text not null check (reward in ('sticker', 'keychain', 'shirt', 'plush')),
  full_name text check (char_length(full_name) between 1 and 80),
  mailbox text check (char_length(mailbox) between 1 and 60),
  shirt_size text check (shirt_size in ('S', 'M', 'L', 'XL', 'XXL')),
  status text not null default 'pending' check (status in ('pending', 'shipped')),
  created_at timestamptz not null default now(),
  shipped_at timestamptz,
  unique (user_id, reward)
);
alter table public.reward_claims enable row level security;
-- You can see the status of your own claims; everything else goes through functions
create policy "Users can see their own claims" on public.reward_claims for select
  to authenticated using ((select auth.uid()) = user_id);

-- Rules live here (the app shows the same numbers)
create function public.reward_rules()
returns table (reward text, kind text, needed int, stock int, claimed int)
language sql stable security definer set search_path = '' as $$
  select r.reward, r.kind, r.needed, r.stock,
    (select count(*)::int from public.reward_claims c where c.reward = r.reward)
  from (values
    ('sticker', 'invites', 3, null::int),
    ('keychain', 'streak', 30, null::int),
    ('shirt', 'invites', 10, 20),
    ('plush', 'streak', 100, 20)
  ) as r(reward, kind, needed, stock);
$$;
grant execute on function public.reward_rules() to authenticated;

-- My progress toward each gift
create function public.my_rewards()
returns table (reward text, kind text, needed int, progress int, stock_left int, phone_ok boolean, claimed boolean, status text)
language sql stable security definer set search_path = '' as $$
  with me as (
    select (select auth.uid()) as id,
      public.qualified_invite_count((select auth.uid())) as invites,
      (select s.best_streak from public.streak_stats((select auth.uid())) s) as best
  )
  select r.reward, r.kind, r.needed,
    case when r.kind = 'invites' then me.invites else me.best end,
    case when r.stock is null then null else greatest(0, r.stock - r.claimed) end,
    public.phone_verified(me.id),
    c.id is not null, c.status
  from public.reward_rules() r
  cross join me
  left join public.reward_claims c on c.user_id = me.id and c.reward = r.reward;
$$;
revoke execute on function public.my_rewards() from public, anon;
grant execute on function public.my_rewards() to authenticated;

create function public.claim_reward(gift text, name text, box text, size text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  select * into r from public.my_rewards() m where m.reward = gift;
  if r is null then raise exception 'Unknown gift'; end if;
  if not r.phone_ok then raise exception 'Verify your phone number first'; end if;
  if r.claimed then raise exception 'You already claimed this gift'; end if;
  if r.progress < r.needed then raise exception 'Not unlocked yet'; end if;
  if r.stock_left is not null and r.stock_left <= 0 then raise exception 'Sorry, this gift is all gone'; end if;
  if gift = 'shirt' and size is null then raise exception 'Pick a shirt size'; end if;
  perform pg_advisory_xact_lock(hashtext('reward_' || gift)); -- no overselling when two people claim at once
  if r.stock_left is not null and (select count(*) from public.reward_claims where reward = gift)
       >= (select stock from public.reward_rules() where reward = gift) then
    raise exception 'Sorry, this gift is all gone';
  end if;
  insert into public.reward_claims (user_id, reward, full_name, mailbox, shirt_size)
  values ((select auth.uid()), gift, trim(name), trim(box), case when gift = 'shirt' then size end);
end;
$$;
revoke execute on function public.claim_reward(text, text, text, text) from public, anon;
grant execute on function public.claim_reward(text, text, text, text) to authenticated;

-- Admin: what to send, and "mark as shipped" (which deletes the name and mailbox)
create function public.admin_pending_claims()
returns table (id uuid, username text, reward text, full_name text, mailbox text, shirt_size text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select c.id, p.username, c.reward, c.full_name, c.mailbox, c.shirt_size, c.created_at
    from public.reward_claims c join public.profiles p on p.id = c.user_id
    where c.status = 'pending' order by c.created_at;
end;
$$;
grant execute on function public.admin_pending_claims() to authenticated;

create function public.admin_mark_shipped(claim uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.reward_claims
  set status = 'shipped', shipped_at = now(), full_name = null, mailbox = null
  where id = claim;
end;
$$;
grant execute on function public.admin_mark_shipped(uuid) to authenticated;

-- Make yourself an admin (replace the usernames, then run these two lines):
-- insert into public.admins (user_id) select id from public.profiles where username in ('tonal');
