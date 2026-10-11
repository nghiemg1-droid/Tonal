-- =========================================
-- NOTIFICATIONS: created automatically by the database
-- =========================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('like', 'comment', 'follow')),
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

-- You only see your own notifications
create policy "Users can see their own notifications"
  on public.notifications for select
  to authenticated
  using ((select auth.uid()) = recipient_id);

-- You can mark your own notifications as read...
create policy "Users can mark their own notifications as read"
  on public.notifications for update
  to authenticated
  using ((select auth.uid()) = recipient_id)
  with check ((select auth.uid()) = recipient_id);

-- ...but the only column you may change is read_at
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- No insert policy: only the triggers below can create notifications

-- ---------- Likes ----------
create function public.notify_like()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  post_owner uuid;
begin
  select author_id into post_owner from public.posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (post_owner, new.user_id, 'like', new.post_id);
  end if;
  return new;
end;
$$;

create trigger on_like_created
  after insert on public.likes
  for each row execute function public.notify_like();

create function public.unnotify_like()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications
  where type = 'like' and actor_id = old.user_id and post_id = old.post_id;
  return old;
end;
$$;

create trigger on_like_deleted
  after delete on public.likes
  for each row execute function public.unnotify_like();

-- ---------- Comments ----------
create function public.notify_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  post_owner uuid;
begin
  select author_id into post_owner from public.posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    values (post_owner, new.author_id, 'comment', new.post_id, new.id);
  end if;
  return new;
end;
$$;

create trigger on_comment_created
  after insert on public.comments
  for each row execute function public.notify_comment();
-- (deleting a comment removes its notification through comment_id ... on delete cascade)

-- ---------- Follows ----------
create function public.notify_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (recipient_id, actor_id, type)
  values (new.following_id, new.follower_id, 'follow');
  return new;
end;
$$;

create trigger on_follow_created
  after insert on public.follows
  for each row execute function public.notify_follow();

create function public.unnotify_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications
  where type = 'follow' and actor_id = old.follower_id and recipient_id = old.following_id;
  return old;
end;
$$;

create trigger on_follow_deleted
  after delete on public.follows
  for each row execute function public.unnotify_follow();

-- ---------- Realtime: send new notifications to the app instantly ----------
alter publication supabase_realtime add table public.notifications;