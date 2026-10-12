-- =========================================
-- PROFILES: a short bio
-- =========================================
alter table public.profiles
  add column bio text check (char_length(bio) <= 150);

-- =========================================
-- MUSIC from an open-license library.
-- We only store a link to the song and its credits (title, artist, license),
-- never the file itself.
-- =========================================
alter table public.posts
  add column music_url text check (music_url ~ '^https://'),
  add column music_title text check (char_length(music_title) <= 200),
  add column music_artist text check (char_length(music_artist) <= 200),
  add column music_license text check (char_length(music_license) <= 50),
  add column music_source_url text check (music_source_url ~ '^https://');

alter table public.posts add constraint posts_music_shape check (
  music_url is null
  or (kind = 'image' and audio_path is null and music_title is not null)
);

-- =========================================
-- STORIES: music or a voice recording on top of the photo
-- =========================================
alter table public.stories
  add column audio_path text,
  add column audio_duration_ms int check (audio_duration_ms between 1 and 60000),
  add column music_url text check (music_url ~ '^https://'),
  add column music_title text check (char_length(music_title) <= 200),
  add column music_artist text check (char_length(music_artist) <= 200),
  add column music_license text check (char_length(music_license) <= 50),
  add column music_source_url text check (music_source_url ~ '^https://');

alter table public.stories add constraint stories_sound_shape check (
  ((audio_path is null) = (audio_duration_ms is null))
  and (audio_path is null or music_url is null)
  and (music_url is null or music_title is not null)
);

-- The stories bucket now also accepts voice recordings
update storage.buckets
set allowed_mime_types = array['image/webp', 'image/jpeg', 'audio/webm', 'audio/mp4', 'audio/ogg']
where id = 'stories';

-- =========================================
-- PROFILE PAGES: fast "posts by this person" lookups already use
-- posts_author_created_idx. Count followers quickly too.
-- =========================================
create index if not exists follows_follower_idx on public.follows (follower_id);
