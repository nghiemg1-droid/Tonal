-- =========================================
-- VIEW-ONCE PHOTOS
-- A photo message can be "keep in chat" (normal) or "view once".
-- Each person can open a view-once photo one time; the sender can't reopen it.
-- =========================================
alter table public.messages
  add column view_once boolean not null default false;

alter table public.messages add constraint messages_view_once_image
  check (not view_once or kind = 'image');

-- fast lookup "is this file a view-once photo?"
create index messages_view_once_path_idx on public.messages (media_path) where view_once;

-- Who opened which view-once photo, and when
create table public.message_views (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_views enable row level security;

create policy "Members can see who opened photos"
  on public.message_views for select
  to authenticated
  using (public.is_conversation_member(conversation_id));
-- No insert policy: opening goes through open_view_once below

alter publication supabase_realtime add table public.message_views;

-- =========================================
-- OPEN: records the view and returns the file path.
-- The file is readable for 1 minute after this, then never again.
-- =========================================
create function public.open_view_once(msg_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  msg public.messages;
begin
  select * into msg from public.messages where id = msg_id;
  if not found or not public.is_conversation_member(msg.conversation_id) then
    raise exception 'Message not found';
  end if;
  if not msg.view_once or msg.deleted_at is not null or msg.media_path is null then
    raise exception 'This photo is no longer available';
  end if;
  if msg.sender_id = me then
    raise exception 'You cannot open your own view-once photo';
  end if;

  insert into public.message_views (message_id, user_id, conversation_id)
  values (msg.id, me, msg.conversation_id)
  on conflict do nothing;
  if not found then
    raise exception 'You already opened this photo';
  end if;

  return msg.media_path;
end;
$$;

-- =========================================
-- FILE ACCESS
-- Normal files: any member can read.
-- View-once files: only someone who opened it in the last minute.
-- =========================================
create function public.can_read_message_file(file text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  once_id uuid;
begin
  if not public.is_conversation_folder_member(split_part(file, '/', 1)) then
    return false;
  end if;

  select id into once_id from public.messages
  where media_path = file and view_once
  limit 1;

  if once_id is null then
    return true;
  end if;

  return exists (
    select 1 from public.message_views
    where message_id = once_id
      and user_id = (select auth.uid())
      and viewed_at > now() - interval '1 minute'
  );
end;
$$;

drop policy "Members can read message files" on storage.objects;

create policy "Members can read message files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'messages' and public.can_read_message_file(name));

-- Once everyone (except the sender) has opened it, any member may delete the file
create function public.view_once_used_up(file text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.messages m
    where m.media_path = file
      and m.view_once
      and public.is_conversation_member(m.conversation_id)
      and (select count(*) from public.message_views v where v.message_id = m.id)
        >= (select count(*) from public.conversation_members cm
            where cm.conversation_id = m.conversation_id and cm.user_id <> m.sender_id)
  );
$$;

create policy "Members can delete used-up view-once photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'messages' and public.view_once_used_up(name));

-- =========================================
-- INBOX PREVIEW knows about view-once photos
-- =========================================
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_sender_id = new.sender_id,
      last_message_preview = case
        when new.kind = 'text' then left(new.body, 80)
        when new.kind = 'sticker' then new.body
        when new.kind = 'voice' then '🎙️ Voice message'
        when new.view_once then '📸 View-once photo'
        else '📷 Photo'
      end
  where id = new.conversation_id;
  return new;
end;
$$;
