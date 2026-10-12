-- =========================================
-- STORY VIEWS: who saw which story
-- Used for the gray ring (you've seen it all) and "Seen by" on your own stories
-- =========================================
create table public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index story_views_viewer_idx on public.story_views (viewer_id);

alter table public.story_views enable row level security;

-- You see your own views, and who viewed YOUR stories
create policy "Viewers and story authors can see views"
  on public.story_views for select
  to authenticated
  using (
    (select auth.uid()) = viewer_id
    or exists (
      select 1 from public.stories s
      where s.id = story_id and s.author_id = (select auth.uid())
    )
  );

-- You can mark a story as seen only for yourself, and not your own story
create policy "Users can mark stories as seen"
  on public.story_views for insert
  to authenticated
  with check (
    (select auth.uid()) = viewer_id
    and exists (
      select 1 from public.stories s
      where s.id = story_id and s.author_id <> (select auth.uid())
    )
  );
