-- =========================================
-- CHAT EXTRAS: seen status, drawings, files up to 10 MB
-- =========================================

-- "Seen": the app listens for changes to last_read_at
alter publication supabase_realtime add table public.conversation_members;

-- =========================================
-- FILES: bigger limit + documents.
-- No HTML/SVG/scripts: those could run code when opened from the link.
-- =========================================
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      -- voice and photos (as before)
      'audio/webm', 'audio/mp4', 'audio/ogg', 'image/webp', 'image/jpeg',
      -- documents
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/zip',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
where id = 'messages';

alter table public.messages
  add column file_size int check (file_size between 1 and 10485760);

-- =========================================
-- New kinds: 'drawing' (like a photo) and 'file' (body = file name)
-- =========================================
alter table public.messages drop constraint messages_kind_check;
alter table public.messages drop constraint messages_shape;

alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'voice', 'image', 'sticker', 'drawing', 'file'));

alter table public.messages add constraint messages_shape check (
  (deleted_at is not null and body is null and media_path is null
    and duration_ms is null and file_size is null)
  or (deleted_at is null and (
    (kind = 'text' and body is not null and char_length(btrim(body)) > 0
      and media_path is null and duration_ms is null and file_size is null)
    or (kind = 'sticker' and body is not null and char_length(body) <= 16
      and media_path is null and duration_ms is null and file_size is null)
    or (kind = 'voice' and media_path is not null and duration_ms is not null
      and body is null and file_size is null)
    or (kind in ('image', 'drawing') and media_path is not null and duration_ms is null
      and body is null and file_size is null)
    or (kind = 'file' and media_path is not null and file_size is not null
      and body is not null and char_length(body) between 1 and 200 and duration_ms is null)
  ))
);

-- Inbox preview
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
        when new.kind = 'drawing' then '✏️ Drawing'
        when new.kind = 'file' then '📎 ' || left(new.body, 60)
        when new.view_once then '📸 View-once photo'
        else '📷 Photo'
      end
  where id = new.conversation_id;
  return new;
end;
$$;

-- Unsend also clears the file size
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
  set deleted_at = now(), body = null, media_path = null, duration_ms = null, file_size = null
  where id = msg_id;

  delete from public.message_reactions where message_id = msg_id;

  update public.conversations set last_message_preview = 'Message unsent'
  where id = msg.conversation_id and last_message_at = msg.created_at;

  return msg.media_path;
end;
$$;

-- =========================================
-- MARK AS READ with the server's clock (so "Seen" works even if a phone's clock is off)
-- =========================================
create function public.mark_conversation_read(conv uuid)
returns void language sql security definer set search_path = '' as $$
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = conv and user_id = (select auth.uid());
$$;
