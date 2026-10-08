-- =========================================
-- Image posts can now have an optional sound
-- =========================================
alter table public.posts add column audio_path text;

-- Replace the old rule ("only voice posts have a length")
alter table public.posts drop constraint if exists posts_check;

-- New rule:
--   voice post: must have a length, no extra audio
--   image post: sound and length come together (both or neither)
alter table public.posts add constraint posts_media_shape check (
  (kind = 'voice' and duration_ms is not null and audio_path is null)
  or (kind = 'image' and (audio_path is null) = (duration_ms is null))
);