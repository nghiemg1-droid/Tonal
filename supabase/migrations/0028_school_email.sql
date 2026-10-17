-- =========================================
-- SCHOOL EMAIL (.edu) INSTEAD OF PHONE (run after 0027)
-- Invites and gifts now need a verified school email ending in .edu (any school).
-- One school email can verify only ONE account, so clone accounts can't farm rewards
-- (clones are still allowed, they just don't count).
-- We never store the school email itself: only a fingerprint (hash) and the domain.
-- The code is emailed by the "school-email" Edge Function.
-- =========================================

create table public.school_verifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_hash text not null unique,
  domain text not null,
  verified_at timestamptz not null default now()
);
alter table public.school_verifications enable row level security; -- only through functions

create table public.school_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_hash text not null,
  domain text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sends int not null default 1,
  window_start timestamptz not null default now()
);
alter table public.school_codes enable row level security;

-- "Jane.Doe+tonal@Denison.EDU " -> "jane.doe@denison.edu"
create function public.normalize_school_email(email text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(trim(email)), '\+[^@]*@', '@');
$$;

create function public.school_hash(value text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest('tonal-school:' || value, 'sha256'), 'hex');
$$;

create function public.school_verified(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.school_verifications where user_id = uid);
$$;
revoke execute on function public.school_verified(uuid) from public, anon, authenticated;

-- Called ONLY by the Edge Function (service role): makes a 6-digit code to email
create function public.create_school_code(uid uuid, email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  clean text := public.normalize_school_email(email);
  h text;
  code text := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0'); -- secure random
  rec public.school_codes%rowtype;
begin
  if clean !~ '^[a-z0-9._%-]+@([a-z0-9-]+\.)+edu$' then
    raise exception 'Please use a school email that ends in .edu';
  end if;
  h := public.school_hash(clean);
  if exists (select 1 from public.school_verifications where email_hash = h and user_id <> uid) then
    raise exception 'This school email is already linked to another Tonal account';
  end if;
  select * into rec from public.school_codes where user_id = uid;
  if rec.user_id is not null and rec.window_start > now() - interval '1 hour' and rec.sends >= 5 then
    raise exception 'Too many codes. Try again in an hour.';
  end if;
  insert into public.school_codes (user_id, email_hash, domain, code_hash, expires_at)
  values (uid, h, split_part(clean, '@', 2), public.school_hash(code), now() + interval '15 minutes')
  on conflict (user_id) do update set
    email_hash = excluded.email_hash,
    domain = excluded.domain,
    code_hash = excluded.code_hash,
    expires_at = excluded.expires_at,
    attempts = 0,
    sends = case when public.school_codes.window_start > now() - interval '1 hour' then public.school_codes.sends + 1 else 1 end,
    window_start = case when public.school_codes.window_start > now() - interval '1 hour' then public.school_codes.window_start else now() end;
  return code;
end;
$$;
revoke execute on function public.create_school_code(uuid, text) from public, anon, authenticated;
grant execute on function public.create_school_code(uuid, text) to service_role;

-- The user types the code from their school inbox
create function public.verify_school_code(code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  rec public.school_codes%rowtype;
begin
  select * into rec from public.school_codes where user_id = me for update;
  if rec.user_id is null or rec.expires_at < now() then
    raise exception 'That code expired. Send a new one.';
  end if;
  if rec.attempts >= 5 then
    raise exception 'Too many wrong codes. Send a new one.';
  end if;
  if rec.code_hash <> public.school_hash(trim(code)) then
    update public.school_codes set attempts = attempts + 1 where user_id = me;
    return false;
  end if;
  if exists (select 1 from public.school_verifications where email_hash = rec.email_hash and user_id <> me) then
    raise exception 'This school email is already linked to another Tonal account';
  end if;
  insert into public.school_verifications (user_id, email_hash, domain)
  values (me, rec.email_hash, rec.domain)
  on conflict (user_id) do update set email_hash = excluded.email_hash, domain = excluded.domain, verified_at = now();
  delete from public.school_codes where user_id = me;
  return true;
end;
$$;
revoke execute on function public.verify_school_code(text) from public, anon;
grant execute on function public.verify_school_code(text) to authenticated;

create function public.my_school_status()
returns table (verified boolean, domain text)
language sql stable security definer set search_path = '' as $$
  select v.user_id is not null, v.domain
  from (select 1) one
  left join public.school_verifications v on v.user_id = (select auth.uid());
$$;
revoke execute on function public.my_school_status() from public, anon;
grant execute on function public.my_school_status() to authenticated;

-- =========================================
-- Invites and gifts now check the school email instead of the phone
-- =========================================
drop function public.claim_reward(text, text, text, text);
drop function public.my_rewards();
drop function public.my_invites();
drop function public.qualified_invite_count(uuid);
drop function public.phone_verified(uuid);

create function public.qualified_invite_count(uid uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.profiles p
  where p.referred_by = uid
    and public.school_verified(p.id)
    and (select count(*) from public.activity_days a where a.user_id = p.id) >= 3;
$$;
revoke execute on function public.qualified_invite_count(uuid) from public, anon, authenticated;

create function public.my_invites()
returns table (username text, avatar_url text, verified boolean, active_days int, qualified boolean)
language sql stable security definer set search_path = '' as $$
  select p.username, p.avatar_url,
    public.school_verified(p.id),
    least(3, (select count(*) from public.activity_days a where a.user_id = p.id))::int,
    public.school_verified(p.id) and (select count(*) from public.activity_days a where a.user_id = p.id) >= 3
  from public.profiles p
  where p.referred_by = (select auth.uid())
  order by p.username;
$$;
revoke execute on function public.my_invites() from public, anon;
grant execute on function public.my_invites() to authenticated;

create function public.my_rewards()
returns table (reward text, kind text, needed int, progress int, stock_left int, verified boolean, claimed boolean, status text)
language sql stable security definer set search_path = '' as $$
  with me as (
    select (select auth.uid()) as id,
      public.qualified_invite_count((select auth.uid())) as invites,
      (select s.best_streak from public.streak_stats((select auth.uid())) s) as best
  )
  select r.reward, r.kind, r.needed,
    case when r.kind = 'invites' then me.invites else me.best end,
    case when r.stock is null then null else greatest(0, r.stock - r.claimed) end,
    public.school_verified(me.id),
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
  if not r.verified then raise exception 'Verify your school email first'; end if;
  if r.claimed then raise exception 'You already claimed this gift'; end if;
  if r.progress < r.needed then raise exception 'Not unlocked yet'; end if;
  if r.stock_left is not null and r.stock_left <= 0 then raise exception 'Sorry, this gift is all gone'; end if;
  if gift = 'shirt' and size is null then raise exception 'Pick a shirt size'; end if;
  perform pg_advisory_xact_lock(hashtext('reward_' || gift));
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
