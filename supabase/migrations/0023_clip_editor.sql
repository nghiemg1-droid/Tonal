-- =========================================
-- CLIP EDITOR + "ALSO SHARE TO..." (run after 0022)
--  * posts.video_edit  : simple edits for a short video (trim, filter, text, speed, volume).
--                        The original file is never changed; the app applies the edits while playing.
--  * posts.show_in_feed: false = the clip only shows on the Clips page (and your profile),
--                        not in your followers' Home feed.
--  * videos can now have background music (open-license, same as photos)
--  * stories.post_id   : a story that plays one of your clips
-- =========================================

alter table public.posts add column video_edit jsonb;
alter table public.posts add constraint posts_video_edit_shape check (
  video_edit is null
  or (kind = 'video' and jsonb_typeof(video_edit) = 'object' and pg_column_size(video_edit) <= 2000)
);

alter table public.posts add column show_in_feed boolean not null default true;
-- Only clips can be hidden from the Home feed
alter table public.posts add constraint posts_show_in_feed_shape check (show_in_feed or kind = 'video');

-- Background music: photos AND videos
alter table public.posts drop constraint posts_music_shape;
alter table public.posts add constraint posts_music_shape check (
  music_url is null
  or (kind in ('image', 'video') and audio_path is null and music_title is not null)
);

-- You can change later whether a clip shows in the Home feed
grant update (show_in_feed) on public.posts to authenticated;

-- =========================================
-- STORIES that play a clip
-- =========================================
alter table public.stories add column post_id uuid references public.posts(id) on delete cascade;
create index stories_post_idx on public.stories (post_id) where post_id is not null;

-- A clip story uses the clip's own sound, not extra music or voice
alter table public.stories add constraint stories_clip_shape check (
  post_id is null or (audio_path is null and music_url is null)
);

-- You can only put YOUR OWN clips in your story
drop policy "Users can post their own stories" on public.stories;
create policy "Users can post their own stories"
  on public.stories for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and (
      post_id is null
      or exists (
        select 1 from public.posts p
        where p.id = post_id and p.author_id = (select auth.uid()) and p.kind = 'video'
      )
    )
  );
