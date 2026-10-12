-- =========================================
-- SOCIAL EXTRAS: hashtags, @mentions, saved posts, editing captions,
-- replying to stories, sharing posts in chats, cleaning up old stories
-- =========================================

-- =========================================
-- HASHTAGS: worked out from the caption by the database
-- =========================================
create function public.extract_hashtags(t text)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct lower(m[1])), '{}')
  -- letters (including Vietnamese accents), numbers and _
  from regexp_matches(coalesce(t, ''), '#([0-9A-Za-z_\u00C0-\u024F\u1E00-\u1EFF]{1,50})', 'g') as m;
$$;

alter table public.posts
  add column tags text[] generated always as (public.extract_hashtags(caption_text)) stored;

create index posts_tags_idx on public.posts using gin (tags);

-- =========================================
-- EDIT CAPTION: authors can change (or add / remove) a text caption.
-- Nothing else about a post can be changed.
-- =========================================
create policy "Users can edit their own captions"
  on public.posts for update
  to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

revoke update on public.posts from authenticated;
grant update (caption_kind, caption_text) on public.posts to authenticated;

-- =========================================
-- SAVED POSTS (only you can see what you saved)
-- =========================================
create table public.saved_posts (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.saved_posts enable row level security;

create policy "Users manage their own saved posts"
  on public.saved_posts for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- =========================================
-- @MENTIONS: notify people named in a caption or a comment
-- =========================================
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'mention'));

create function public.extract_mentions(t text)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct lower(m[1])), '{}')
  from regexp_matches(coalesce(t, ''), '@([a-z0-9_]{3,20})', 'gi') as m;
$$;

create function public.notify_mentions(
  actor uuid, body text, target_post uuid, target_comment uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
  select p.id, actor, 'mention', target_post, target_comment
  from public.profiles p
  where p.username = any(public.extract_mentions(body))
    and p.id <> actor
    and not public.is_blocked_between(p.id, actor)
    -- don't notify twice for the same post/comment (e.g. after editing a caption)
    and not exists (
      select 1 from public.notifications n
      where n.type = 'mention' and n.recipient_id = p.id and n.actor_id = actor
        and n.post_id is not distinct from target_post
        and n.comment_id is not distinct from target_comment
    );
end;
$$;

create function public.on_post_caption()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.caption_text is not null then
    perform public.notify_mentions(new.author_id, new.caption_text, new.id, null);
  end if;
  return new;
end;
$$;

create trigger on_post_caption
  after insert or update of caption_text on public.posts
  for each row execute function public.on_post_caption();

create function public.on_comment_mentions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.body is not null then
    perform public.notify_mentions(new.author_id, new.body, new.post_id, new.id);
  end if;
  return new;
end;
$$;

create trigger on_comment_mentions
  after insert on public.comments
  for each row execute function public.on_comment_mentions();

-- =========================================
-- CHATS: reply to a story, share a post
-- =========================================
alter table public.messages
  add column story_id uuid references public.stories(id) on delete set null,
  add column post_id uuid references public.posts(id) on delete set null;

alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'voice', 'image', 'sticker', 'drawing', 'file', 'share'));

alter table public.messages drop constraint messages_shape;
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
    -- shared post: the post link, plus an optional note
    or (kind = 'share' and post_id is not null and media_path is null
      and duration_ms is null and file_size is null)
  ))
);

create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_sender_id = new.sender_id,
      last_message_preview = case
        when new.kind = 'share' then '📤 Shared a post'
        when new.story_id is not null then '↩ Replied to a story: ' || left(new.body, 60)
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
      file_size = null, post_id = null, story_id = null
  where id = msg_id;

  delete from public.message_reactions where message_id = msg_id;

  update public.conversations set last_message_preview = 'Message unsent'
  where id = msg.conversation_id and last_message_at = msg.created_at;

  return msg.media_path;
end;
$$;

-- =========================================
-- OLD STORIES: remove my stories that ended more than an hour ago.
-- Returns their file paths so the app can delete the files from Storage.
-- =========================================
create function public.cleanup_my_expired_stories()
returns setof text language plpgsql security definer set search_path = '' as $$
begin
  return query
  with gone as (
    delete from public.stories
    where author_id = auth.uid() and expires_at < now() - interval '1 hour'
    returning media_path, audio_path
  )
  select media_path from gone
  union all
  select audio_path from gone where audio_path is not null;
end;
$$;
