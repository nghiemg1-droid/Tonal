-- =========================================
-- MESSAGES: private 1-to-1 chats (groups come in 0012)
-- =========================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- kept up to date by a trigger so the inbox loads in one query
  last_message_at timestamptz,
  last_sender_id uuid references public.profiles(id) on delete set null,
  last_message_preview text
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  body text check (char_length(body) <= 1000),
  media_path text,
  duration_ms int check (duration_ms between 1 and 60000),
  created_at timestamptz not null default now(),
  constraint messages_kind_check check (kind in ('text', 'voice', 'image')),
  constraint messages_shape check (
    (kind = 'text' and body is not null and char_length(btrim(body)) > 0
      and media_path is null and duration_ms is null)
    or (kind = 'voice' and media_path is not null and duration_ms is not null and body is null)
    or (kind = 'image' and media_path is not null and duration_ms is null and body is null)
  )
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

-- =========================================
-- WHO IS IN A CONVERSATION
-- security definer so policies can call it without looping on themselves
-- =========================================
create function public.is_conversation_member(conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv and user_id = (select auth.uid())
  );
$$;

-- Same check for a storage folder name (text), safe for names that are not uuids
create function public.is_conversation_folder_member(folder text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if folder is null
    or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_conversation_member(folder::uuid);
end;
$$;

-- =========================================
-- ROW LEVEL SECURITY
-- =========================================
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "Members can see their conversations"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_member(id));
-- No insert/update policy: conversations are made by get_or_create_dm below

create policy "Members can see who is in their conversations"
  on public.conversation_members for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "Users can mark their own conversations as read"
  on public.conversation_members for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The only column you may change yourself is last_read_at
revoke update on public.conversation_members from authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

create policy "Members can read messages"
  on public.messages for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "Members can send messages as themselves"
  on public.messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and public.is_conversation_member(conversation_id)
    -- files must live in this conversation's folder, under your own id
    and (
      media_path is null
      or (split_part(media_path, '/', 1) = conversation_id::text
        and split_part(media_path, '/', 2) = (select auth.uid())::text)
    )
  );
-- No update/delete policy: unsending goes through a function (0012)

-- =========================================
-- INBOX PREVIEW: update the conversation on every new message
-- =========================================
create function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_sender_id = new.sender_id,
      last_message_preview = case new.kind
        when 'text' then left(new.body, 80)
        when 'voice' then '🎙️ Voice message'
        else '📷 Photo'
      end
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger on_message_created
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- =========================================
-- START A CHAT: find the 1-to-1 conversation or create it
-- =========================================
create function public.get_or_create_dm(other_id uuid)
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
-- MESSAGE FILES: PRIVATE bucket, max 5 MB, path = conversation_id/user_id/file
-- Only members can read them (the app uses signed links that expire)
-- =========================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'messages', 'messages', false, 5242880,
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'image/webp', 'image/jpeg']
)
on conflict (id) do nothing;

create policy "Members can read message files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'messages'
    and public.is_conversation_folder_member((storage.foldername(name))[1])
  );

create policy "Members can upload their own message files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'messages'
    and public.is_conversation_folder_member((storage.foldername(name))[1])
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- =========================================
-- REALTIME: new messages and inbox updates arrive instantly
-- =========================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
