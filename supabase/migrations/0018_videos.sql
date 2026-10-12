-- =========================================
-- SHORT VIDEOS (up to 60 seconds) as a new kind of post.
-- Videos reuse likes, comments and notifications from posts.
-- =========================================
alter table public.posts drop constraint posts_kind_check;
alter table public.posts add constraint posts_kind_check
  check (kind in ('voice', 'image', 'video'));

-- The still picture shown before a video plays (made in the browser)
alter table public.posts add column poster_path text;

alter table public.posts drop constraint posts_media_shape;
alter table public.posts add constraint posts_media_shape check (
  (kind = 'voice' and duration_ms is not null and audio_path is null and poster_path is null)
  or (kind = 'image' and (audio_path is null) = (duration_ms is null) and poster_path is null)
  or (kind = 'video' and duration_ms is not null and poster_path is not null and audio_path is null)
);

-- Videos can have a text caption (drawing and voice captions stay photo-only)
alter table public.posts drop constraint posts_caption_shape;
alter table public.posts add constraint posts_caption_shape check (
  (caption_kind is null and caption_text is null and caption_path is null and caption_duration_ms is null)
  or (kind in ('image', 'video') and caption_kind = 'text'
      and caption_text is not null and caption_path is null and caption_duration_ms is null)
  or (kind = 'image' and caption_kind = 'drawing'
      and caption_path is not null and caption_text is null and caption_duration_ms is null)
  or (kind = 'image' and caption_kind = 'voice'
      and caption_path is not null and caption_duration_ms is not null and caption_text is null)
);

-- Fast "newest videos" for the Clips page
create index posts_video_created_idx on public.posts (created_at desc) where kind = 'video';

-- The posts bucket now takes videos (max 50 MB per file, the free-plan limit).
-- Photos are still shrunk in the browser, so they stay small.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'audio/webm', 'audio/mp4', 'audio/ogg',
      'image/webp', 'image/jpeg',
      'video/mp4', 'video/webm', 'video/quicktime'
    ]
where id = 'posts';
