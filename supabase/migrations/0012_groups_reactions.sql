-- =========================================
-- GROUPS
-- =========================================
alter table public.conversations
  add column is_group boolean not null default false,
  add column name text check (char_length(name) between 1 and 50),
  add column created_by uuid references public.profiles(id) on delete set null;

alter table public.conversation_members
  add column role text not null default 'member' check (role in ('admin', 'member')),
  add column joined_at timestamptz not null default now();

-- =========================================
-- MESSAGES: stickers, replies, unsend
-- =========================================
alter table public.messages
  add column reply_to_id uuid references public.messages(id) on delete set null,
  add column deleted_at timestamptz;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages drop constraint if exists messages_shape;

alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'voice', 'image', 'sticker'));

alter table public.messages add constraint messages_shape check (
  -- an unsent message keeps nothing
  (deleted_at is not null and body is null and media_path is null and duration_ms is null)
  or (deleted_at is null and (
    (kind = 'text' and body is not null and char_length(btrim(body)) > 0
      and media_path is null and duration_ms is null)
    or (kind = 'sticker' and body is not null and char_length(body) <= 16
      and media_path is null and duration_ms is null)
    or (kind = 'voice' and media_path is not null and duration_ms is not null and body is null)
    or (kind = 'image' and media_path is not null and duration_ms is null and body is null)
  ))
);

-- Inbox preview now knows about stickers
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_sender_id = new.sender_id,
      last_message_preview = case new.kind
        when 'text' then left(new.body, 80)
        when 'sticker' then new.body
        when 'voice' then '🎙️ Voice message'
        else '📷 Photo'
      end
  where id = new.conversation_id;
  return new;
end;
$$;

-- 1-to-1 chats must never reuse a group
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
-- REACTIONS (emoji = null means "removed", so realtime always sees an update)
-- =========================================
create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  emoji text check (char_length(emoji) <= 16),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_reactions enable row level security;

create policy "Members can see reactions"
  on public.message_reactions for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "Members can react as themselves"
  on public.message_reactions for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.is_conversation_member(conversation_id)
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and m.conversation_id = message_reactions.conversation_id
        and m.deleted_at is null
    )
  );

create policy "Members can change their own reaction"
  on public.message_reactions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and public.is_conversation_member(conversation_id)
  );

alter publication supabase_realtime add table public.message_reactions;

-- =========================================
-- GROUP FUNCTIONS (security definer: they check permissions themselves)
-- =========================================
create function public.create_group(group_name text, member_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  clean_name text := btrim(group_name);
  others uuid[];
  conv uuid;
begin
  if me is null then
    raise exception 'Not logged in';
  end if;
  if clean_name is null or char_length(clean_name) not between 1 and 50 then
    raise exception 'Group name must be 1 to 50 characters';
  end if;

  -- only real people, no duplicates, not yourself
  select coalesce(array_agg(distinct p.id), '{}') into others
  from public.profiles p
  where p.id = any(member_ids) and p.id <> me;

  if cardinality(others) < 2 then
    raise exception 'Pick at least 2 people for a group';
  end if;
  if cardinality(others) > 31 then
    raise exception 'A group can have at most 32 people';
  end if;

  insert into public.conversations
    (is_group, name, created_by, last_message_at, last_sender_id, last_message_preview)
  values (true, clean_name, me, now(), me, 'Group created')
  returning id into conv;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (conv, me, 'admin');

  insert into public.conversation_members (conversation_id, user_id)
  select conv, unnest(others);

  return conv;
end;
$$;

create function public.add_group_members(conv uuid, member_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare
  added int;
begin
  if not exists (select 1 from public.conversations where id = conv and is_group) then
    raise exception 'Group not found';
  end if;
  if not public.is_conversation_member(conv) then
    raise exception 'You are not in this group';
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  select conv, p.id
  from public.profiles p
  where p.id = any(member_ids)
  on conflict do nothing;
  get diagnostics added = row_count;

  if (select count(*) from public.conversation_members where conversation_id = conv) > 32 then
    raise exception 'A group can have at most 32 people';
  end if;

  return added;
end;
$$;

create function public.rename_group(conv uuid, new_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  clean_name text := btrim(new_name);
begin
  if not public.is_conversation_member(conv) then
    raise exception 'You are not in this group';
  end if;
  if clean_name is null or char_length(clean_name) not between 1 and 50 then
    raise exception 'Group name must be 1 to 50 characters';
  end if;

  update public.conversations set name = clean_name where id = conv and is_group;
  if not found then
    raise exception 'Group not found';
  end if;
end;
$$;

create function public.leave_group(conv uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.conversations where id = conv and is_group) then
    raise exception 'Group not found';
  end if;

  delete from public.conversation_members where conversation_id = conv and user_id = me;
  if not found then
    raise exception 'You are not in this group';
  end if;

  if not exists (select 1 from public.conversation_members where conversation_id = conv) then
    -- last person out: remove the whole group
    delete from public.conversations where id = conv;
  elsif not exists (
    select 1 from public.conversation_members where conversation_id = conv and role = 'admin'
  ) then
    -- the group always keeps an admin: promote whoever joined first
    update public.conversation_members set role = 'admin'
    where (conversation_id, user_id) = (
      select conversation_id, user_id from public.conversation_members
      where conversation_id = conv
      order by joined_at
      limit 1
    );
  end if;
end;
$$;

-- =========================================
-- UNSEND: wipe the content, keep a "Message unsent" placeholder.
-- Returns the old file path so the app can delete the file.
-- =========================================
create function public.unsend_message(msg_id uuid)
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
  set deleted_at = now(), body = null, media_path = null, duration_ms = null
  where id = msg_id;

  delete from public.message_reactions where message_id = msg_id;

  update public.conversations set last_message_preview = 'Message unsent'
  where id = msg.conversation_id and last_message_at = msg.created_at;

  return msg.media_path;
end;
$$;

-- You can delete your own message files (used after unsending)
create policy "Users can delete their own message files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'messages'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
