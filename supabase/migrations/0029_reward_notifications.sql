-- =========================================
-- GIFT NOTIFICATIONS (run after 0028)
-- * In-app notification + email when you unlock a gift, and when your gift is sent.
-- * Emails go through the "notify-email" Edge Function, started by a Database Webhook
--   on the reward_emails table (set up once in the Supabase dashboard).
-- =========================================

alter table public.notifications add column reward text check (reward in ('sticker', 'keychain', 'shirt', 'plush'));
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'mention', 'follow_request', 'reward_unlocked', 'reward_shipped'));

-- Which gifts each person has already been told about (so it's only once)
create table public.reward_unlocks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, reward)
);
alter table public.reward_unlocks enable row level security;

-- Emails waiting to be sent (the webhook fires on each new row)
create table public.reward_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('unlocked', 'shipped')),
  reward text not null,
  created_at timestamptz not null default now()
);
alter table public.reward_emails enable row level security;

create function public.reward_notify(uid uuid, what text, gift text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  team uuid;
begin
  select id into team from public.profiles where username = 'tonal';
  insert into public.notifications (recipient_id, actor_id, type, reward)
  values (uid, coalesce(team, uid), what, gift);
  insert into public.reward_emails (user_id, kind, reward)
  values (uid, case when what = 'reward_unlocked' then 'unlocked' else 'shipped' end, gift);
end;
$$;
revoke execute on function public.reward_notify(uuid, text, text) from public, anon, authenticated;

-- Did this person just reach a gift? Tell them once (only while that gift is still in stock)
create function public.check_reward_unlocks(uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  invites int := public.qualified_invite_count(uid);
  best int;
  r record;
  added int;
begin
  select s.best_streak into best from public.streak_stats(uid) s;
  for r in select * from public.reward_rules() loop
    if (case when r.kind = 'invites' then invites else best end) >= r.needed
       and (r.stock is null or r.claimed < r.stock) then
      insert into public.reward_unlocks (user_id, reward) values (uid, r.reward) on conflict do nothing;
      get diagnostics added = row_count;
      if added > 0 then
        perform public.reward_notify(uid, 'reward_unlocked', r.reward);
      end if;
    end if;
  end loop;
end;
$$;
revoke execute on function public.check_reward_unlocks(uuid) from public, anon, authenticated;

-- Check after a new active day (for me, and for whoever invited me)
create or replace function public.record_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  added int;
  inviter uuid;
begin
  insert into public.activity_days (user_id, day)
  values (new.author_id, public.ohio_today())
  on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    perform public.check_reward_unlocks(new.author_id);
    select referred_by into inviter from public.profiles where id = new.author_id;
    if inviter is not null then perform public.check_reward_unlocks(inviter); end if;
  end if;
  return new;
end;
$$;

-- ...and after verifying a school email (that can complete a friend's invite)
create or replace function public.verify_school_code(code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  rec public.school_codes%rowtype;
  inviter uuid;
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
  perform public.check_reward_unlocks(me);
  select referred_by into inviter from public.profiles where id = me;
  if inviter is not null then perform public.check_reward_unlocks(inviter); end if;
  return true;
end;
$$;

-- Sending a gift also tells the person
create or replace function public.admin_mark_shipped(claim uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  gift text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.reward_claims
  set status = 'shipped', shipped_at = now(), full_name = null, mailbox = null
  where id = claim and status = 'pending'
  returning user_id, reward into uid, gift;
  if uid is not null then
    perform public.reward_notify(uid, 'reward_shipped', gift);
  end if;
end;
$$;
