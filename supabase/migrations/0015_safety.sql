-- =========================================
-- SAFETY: block, report, delete account
-- =========================================

-- =========================================
-- BLOCKS
-- =========================================
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

-- You only see the people YOU blocked (nobody can find out who blocked them)
create policy "Users can see who they blocked"
  on public.blocks for select
  to authenticated
  using ((select auth.uid()) = blocker_id);

create policy "Users can block others"
  on public.blocks for insert
  to authenticated
  with check ((select auth.uid()) = blocker_id);

create policy "Users can unblock"
  on public.blocks for delete
  to authenticated
  using ((select auth.uid()) = blocker_id);

-- Has either person blocked the other?
create function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- Is the logged-in user blocked with the author of this post?
create function public.blocked_with_post_author(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p
    where p.id = pid and public.is_blocked_between((select auth.uid()), p.author_id)
  );
$$;

-- Is this a 1-to-1 chat with someone you blocked (or who blocked you)?
create function public.dm_blocked(conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where c.id = conv
      and not c.is_group
      and cm.user_id <> (select auth.uid())
      and public.is_blocked_between((select auth.uid()), cm.user_id)
  );
$$;

-- Blocking removes follows both ways and the notifications between you
create function public.on_block_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);

  delete from public.notifications
  where (recipient_id = new.blocker_id and actor_id = new.blocked_id)
     or (recipient_id = new.blocked_id and actor_id = new.blocker_id);

  return new;
end;
$$;

create trigger on_block_created
  after insert on public.blocks
  for each row execute function public.on_block_created();

-- ---------- Hide posts, comments and stories between blocked people ----------
drop policy "Posts are viewable by logged-in users" on public.posts;
create policy "Posts are viewable by logged-in users"
  on public.posts for select
  to authenticated
  using (not public.is_blocked_between((select auth.uid()), author_id));

drop policy "Comments are viewable by logged-in users" on public.comments;
create policy "Comments are viewable by logged-in users"
  on public.comments for select
  to authenticated
  using (not public.is_blocked_between((select auth.uid()), author_id));

drop policy "Active stories are viewable by logged-in users" on public.stories;
create policy "Active stories are viewable by logged-in users"
  on public.stories for select
  to authenticated
  using (expires_at > now() and not public.is_blocked_between((select auth.uid()), author_id));

-- ---------- No following, liking or commenting across a block ----------
drop policy "Users can follow others" on public.follows;
create policy "Users can follow others"
  on public.follows for insert
  to authenticated
  with check (
    (select auth.uid()) = follower_id
    and not public.is_blocked_between(follower_id, following_id)
  );

drop policy "Users can like as themselves" on public.likes;
create policy "Users can like as themselves"
  on public.likes for insert
  to authenticated
  with check ((select auth.uid()) = user_id and not public.blocked_with_post_author(post_id));

drop policy "Users can comment as themselves" on public.comments;
create policy "Users can comment as themselves"
  on public.comments for insert
  to authenticated
  with check ((select auth.uid()) = author_id and not public.blocked_with_post_author(post_id));

-- ---------- No 1-to-1 messages across a block (groups still work) ----------
drop policy "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves"
  on public.messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and public.is_conversation_member(conversation_id)
    and not public.dm_blocked(conversation_id)
    and (
      media_path is null
      or (split_part(media_path, '/', 1) = conversation_id::text
        and split_part(media_path, '/', 2) = (select auth.uid())::text)
    )
  );

create or replace function public.get_or_create_dm(other_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null then
    raise exception 'Not logged in';
  end if;
  if other_id = me then
    raise exception 'You cannot message yourself';
  end if;
  if not exists (select 1 from public.profiles where id = other_id) then
    raise exception 'User not found';
  end if;
  if public.is_blocked_between(me, other_id) then
    raise exception 'You can''t message this account';
  end if;

  select a.conversation_id into conv
  from public.conversation_members a
  join public.conversation_members b on b.conversation_id = a.conversation_id
  join public.conversations c on c.id = a.conversation_id and not c.is_group
  where a.user_id = me and b.user_id = other_id
  limit 1;

  if conv is null then
    insert into public.conversations default values returning id into conv;
    insert into public.conversation_members (conversation_id, user_id)
    values (conv, me), (conv, other_id);
  end if;

  return conv;
end;
$$;

-- =========================================
-- REPORTS: reviewed by you in the Supabase dashboard (Table Editor -> reports)
-- =========================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'post', 'comment', 'story', 'message')),
  target_id uuid not null,
  reason text not null check (reason in (
    'spam', 'harassment', 'hate', 'nudity', 'violence', 'self_harm', 'scam', 'other'
  )),
  details text check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index reports_open_idx on public.reports (created_at desc) where status = 'open';

alter table public.reports enable row level security;

create policy "Users can report as themselves"
  on public.reports for insert
  to authenticated
  with check ((select auth.uid()) = reporter_id);

create policy "Users can see their own reports"
  on public.reports for select
  to authenticated
  using ((select auth.uid()) = reporter_id);

-- Reporters can't set the status themselves
revoke insert on public.reports from authenticated;
grant insert (reporter_id, target_type, target_id, reason, details) on public.reports to authenticated;

-- =========================================
-- DELETE MY ACCOUNT
-- Deleting the login removes the profile, and through "on delete cascade"
-- every post, comment, like, follow, story, message and block of that user.
-- (The app deletes the user's files from Storage first.)
-- =========================================
create function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not logged in';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from anon, public;
grant execute on function public.delete_my_account() to authenticated;
