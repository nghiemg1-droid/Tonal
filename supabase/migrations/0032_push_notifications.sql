-- =========================================
-- PUSH NOTIFICATIONS (run after 0031)
-- Phone/computer notifications for likes, comments, follows, messages, gifts,
-- Campus Drop (the moment it starts) and the evening streak reminder.
-- Each queued push calls the "send-push" Edge Function (via pg_net), which sends it with web-push.
-- A once-a-minute job (pg_cron) handles Campus Drop and streak reminders.
-- =========================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- One row per device that turned notifications on
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "Users can see their own devices" on public.push_subscriptions for select
  to authenticated using ((select auth.uid()) = user_id);

-- Save / remove this device (a shared device moves to whoever is logged in)
create function public.save_push_subscription(endpoint_in text, p256dh_in text, auth_in text, ua text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), endpoint_in, p256dh_in, auth_in, left(ua, 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
$$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create function public.delete_push_subscription(endpoint_in text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = endpoint_in and user_id = (select auth.uid());
$$;
revoke execute on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- Pushes waiting to be sent
create table public.push_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  url text not null default '/',
  tag text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.push_queue enable row level security;

create function public.enqueue_push(uid uuid, title_in text, body_in text, url_in text, tag_in text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.push_subscriptions where user_id = uid) then
    insert into public.push_queue (user_id, title, body, url, tag)
    values (uid, left(title_in, 100), left(body_in, 200), url_in, tag_in);
  end if;
end;
$$;
revoke execute on function public.enqueue_push(uuid, text, text, text, text) from public, anon, authenticated;

create function public.push_queue_webhook()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://juqelpvnlkrygmozomrd.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('type', 'INSERT', 'table', 'push_queue', 'record', jsonb_build_object('id', new.id)),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
revoke execute on function public.push_queue_webhook() from public, anon, authenticated;
create trigger push_queue_send after insert on public.push_queue
  for each row execute function public.push_queue_webhook();

-- In-app notifications → push
create function public.push_for_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who text;
  title_out text;
  url_out text := '/notifications';
begin
  select username into who from public.profiles where id = new.actor_id;
  title_out := case new.type
    when 'like' then '❤️ ' || who || ' liked your post'
    when 'comment' then '💬 ' || who || ' commented on your post'
    when 'mention' then '📣 ' || who || ' mentioned you'
    when 'follow' then '👋 ' || who || ' started following you'
    when 'follow_request' then '👋 ' || who || ' wants to follow you'
    when 'reward_unlocked' then '🎁 You unlocked a free Tonal gift!'
    when 'reward_shipped' then '📬 Your Tonal gift is on its way'
  end;
  if title_out is null then return new; end if;
  url_out := case
    when new.type in ('reward_unlocked', 'reward_shipped') then '/invite'
    when new.post_id is not null then '/p/' || new.post_id
    when new.type = 'follow' then '/u/' || who
    else '/notifications'
  end;
  perform public.enqueue_push(new.recipient_id, title_out,
    case when new.type = 'reward_unlocked' then 'Open Tonal to claim it 🎉' else null end,
    url_out, new.type || ':' || coalesce(new.post_id::text, new.actor_id::text));
  return new;
end;
$$;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.push_for_notification();

-- New messages → push to everyone else in the chat
create function public.push_for_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  sender text;
  chat record;
  preview text;
  m record;
begin
  select username into sender from public.profiles where id = new.sender_id;
  select is_group, name into chat from public.conversations where id = new.conversation_id;
  preview := case new.kind
    when 'text' then new.body
    when 'voice' then '🎙️ Voice message'
    when 'image' then '📷 Photo'
    when 'share' then '↗ Shared a post'
    else 'New message'
  end;
  for m in select user_id from public.conversation_members
           where conversation_id = new.conversation_id and user_id <> new.sender_id loop
    perform public.enqueue_push(m.user_id,
      case when chat.is_group then coalesce(chat.name, 'Group') else sender end,
      case when chat.is_group then sender || ': ' || coalesce(preview, '') else preview end,
      '/messages/' || new.conversation_id, 'chat:' || new.conversation_id);
  end loop;
  return new;
end;
$$;
create trigger messages_push after insert on public.messages
  for each row execute function public.push_for_message();

-- =========================================
-- CAMPUS DROP + STREAK REMINDER (checked every minute)
-- =========================================
-- Same surprise time as the app (lib/campusDrop.ts): FNV-1a hash of the date
create function public.fnv1a(t text)
returns bigint language plpgsql immutable set search_path = '' as $$
declare
  h bigint := 2166136261;
  i int;
begin
  for i in 1..length(t) loop
    h := ((h # ascii(substr(t, i, 1))) * 16777619) % 4294967296;
  end loop;
  return h;
end;
$$;

create function public.drop_start(day date)
returns timestamptz language sql immutable set search_path = '' as $$
  select (day::timestamp + make_interval(mins => (600 + public.fnv1a('tonal-drop-' || to_char(day, 'YYYY-MM-DD')) % 660)::int))
         at time zone 'America/New_York';
$$;

create table public.push_daily (kind text not null, day date not null, primary key (kind, day));
alter table public.push_daily enable row level security;

create function public.push_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  today date := public.ohio_today();
  u record;
  s record;
begin
  -- ⚡ Campus Drop just started
  if now() >= public.drop_start(today) and now() < public.drop_start(today) + interval '5 minutes' then
    insert into public.push_daily values ('drop', today) on conflict do nothing;
    if found then
      for u in select distinct user_id from public.push_subscriptions loop
        perform public.enqueue_push(u.user_id, '⚡ Campus Drop is LIVE!', 'You have 5 minutes: show what you''re doing right now 📸', '/new?drop=1', 'drop');
      end loop;
    end if;
  end if;

  -- 🫘 7 PM: streak ends at midnight
  if extract(hour from now() at time zone 'America/New_York') = 19 then
    insert into public.push_daily values ('streak', today) on conflict do nothing;
    if found then
      for u in select distinct user_id from public.push_subscriptions loop
        select * into s from public.streak_stats(u.user_id);
        if s.current_streak > 0 and not s.today_done then
          perform public.enqueue_push(u.user_id, '🫘 Your ' || s.current_streak || '-day streak ends at midnight',
            'Post anything to keep it going', '/new', 'streak');
        end if;
      end loop;
    end if;
  end if;
end;
$$;
revoke execute on function public.push_tick() from public, anon, authenticated;

select cron.schedule('tonal-push-tick', '* * * * *', 'select public.push_tick()');
