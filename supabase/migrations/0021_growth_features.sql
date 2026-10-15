-- =========================================
-- GROWTH FEATURES: founding members, private accounts + follow requests,
-- text captions on voice posts, voice transcripts, chat streaks
-- =========================================

-- =========================================
-- PROFILES: which columns people may change themselves
-- (so nobody can give themselves a badge)
-- =========================================
alter table public.profiles
  add column founding_member boolean not null default false,
  add column is_private boolean not null default false;

revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, bio, is_private) on public.profiles to authenticated;

-- =========================================
-- FOUNDING MEMBERS: the first 100 people get a badge
-- =========================================
update public.profiles set founding_member = true
where id in (select id from public.profiles order by created_at limit 100);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, founding_member)
  values (
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 1, 8),
    (select count(*) < 100 from public.profiles)
  );
  return new;
end;
$$;

-- =========================================
-- PRIVATE ACCOUNTS: only followers see posts and stories
-- =========================================
create function public.can_see_author(author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select author = (select auth.uid())
    or not exists (select 1 from public.profiles where id = author and is_private)
    or exists (
      select 1 from public.follows
      where follower_id = (select auth.uid()) and following_id = author
    );
$$;

drop policy "Posts are viewable by logged-in users" on public.posts;
create policy "Posts are viewable by logged-in users"
  on public.posts for select
  to authenticated
  using (
    not public.is_blocked_between((select auth.uid()), author_id)
    and public.can_see_author(author_id)
  );

drop policy "Active stories are viewable by logged-in users" on public.stories;
create policy "Active stories are viewable by logged-in users"
  on public.stories for select
  to authenticated
  using (
    expires_at > now()
    and not public.is_blocked_between((select auth.uid()), author_id)
    and public.can_see_author(author_id)
  );

-- Following a private account needs their approval (a follow request)
drop policy "Users can follow others" on public.follows;
create policy "Users can follow others"
  on public.follows for insert
  to authenticated
  with check (
    (select auth.uid()) = follower_id
    and not public.is_blocked_between(follower_id, following_id)
    and not exists (select 1 from public.profiles where id = following_id and is_private)
  );

create table public.follow_requests (
  requester_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);

create index follow_requests_target_idx on public.follow_requests (target_id, created_at desc);

alter table public.follow_requests enable row level security;

create policy "People in a request can see it"
  on public.follow_requests for select
  to authenticated
  using ((select auth.uid()) in (requester_id, target_id));

create policy "Users can ask to follow private accounts"
  on public.follow_requests for insert
  to authenticated
  with check (
    (select auth.uid()) = requester_id
    and exists (select 1 from public.profiles where id = target_id and is_private)
    and not public.is_blocked_between(requester_id, target_id)
  );

create policy "Either side can cancel or decline"
  on public.follow_requests for delete
  to authenticated
  using ((select auth.uid()) in (requester_id, target_id));

create function public.accept_follow_request(requester uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follow_requests where requester_id = requester and target_id = auth.uid();
  if not found then
    raise exception 'Request not found';
  end if;
  insert into public.follows (follower_id, following_id)
  values (requester, auth.uid())
  on conflict do nothing;
end;
$$;

-- Notify about new requests (and clean up when a request goes away)
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'mention', 'follow_request'));

create function public.on_follow_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.target_id, new.requester_id, 'follow_request');
    return new;
  end if;
  delete from public.notifications
  where type = 'follow_request' and recipient_id = old.target_id and actor_id = old.requester_id;
  return old;
end;
$$;

create trigger on_follow_request
  after insert or delete on public.follow_requests
  for each row execute function public.on_follow_request();

-- =========================================
-- TEXT CAPTIONS ON VOICE POSTS (used to answer "Question of the day")
-- =========================================
alter table public.posts drop constraint posts_caption_shape;
alter table public.posts add constraint posts_caption_shape check (
  (caption_kind is null and caption_text is null and caption_path is null and caption_duration_ms is null)
  or (kind in ('image', 'video', 'voice') and caption_kind = 'text'
      and caption_text is not null and caption_path is null and caption_duration_ms is null)
  or (kind = 'image' and caption_kind = 'drawing'
      and caption_path is not null and caption_text is null and caption_duration_ms is null)
  or (kind = 'image' and caption_kind = 'voice'
      and caption_path is not null and caption_duration_ms is not null and caption_text is null)
);

-- =========================================
-- TRANSCRIPTS: words of a voice clip, written by the browser while recording
-- =========================================
alter table public.posts add column transcript text check (char_length(transcript) <= 2000);
alter table public.comments add column transcript text check (char_length(transcript) <= 2000);
alter table public.messages add column transcript text check (char_length(transcript) <= 2000);

create or replace function public.unsend_message(msg_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  msg public.messages;
begin
  select * into msg from public.messages
  where id = msg_id and sender_id = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'Message not found';
  end if;

  update public.messages
  set deleted_at = now(), body = null, media_path = null, duration_ms = null,
      file_size = null, post_id = null, story_id = null, transcript = null
  where id = msg_id;

  delete from public.message_reactions where message_id = msg_id;

  update public.conversations set last_message_preview = 'Message unsent'
  where id = msg.conversation_id and last_message_at = msg.created_at;

  return msg.media_path;
end;
$$;

-- =========================================
-- STREAKS 🔥: days in a row that BOTH people in a 1-to-1 chat sent something
-- (days follow Ohio time; the streak survives until the end of the next day)
-- =========================================
create function public.my_dm_streaks()
returns table (conversation_id uuid, streak int)
language sql stable security definer set search_path = '' as $$
  with my_dms as (
    select c.id
    from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id
    where m.user_id = (select auth.uid()) and not c.is_group
  ),
  days as (
    select msg.conversation_id, (msg.created_at at time zone 'America/New_York')::date as d
    from public.messages msg
    join my_dms on my_dms.id = msg.conversation_id
    where msg.created_at > now() - interval '400 days'
    group by 1, 2
    having count(distinct msg.sender_id) >= 2
  ),
  runs as (
    select conversation_id, d,
      d - (row_number() over (partition by conversation_id order by d))::int as grp
    from days
  ),
  streaks as (
    select conversation_id, max(d) as last_day, count(*)::int as len
    from runs
    group by conversation_id, grp
  )
  select conversation_id, len
  from streaks
  where last_day >= (now() at time zone 'America/New_York')::date - 1
    and len >= 2;
$$;
