-- =========================================
-- COMMENTS: voice, image or drawing (no text)
-- =========================================
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('voice', 'image', 'drawing')),
  media_path text not null,
  duration_ms int check (duration_ms between 1 and 60000),
  created_at timestamptz not null default now(),
  -- voice comments must have a length, the others must not
  check ((kind = 'voice') = (duration_ms is not null))
);

create index comments_post_created_idx on public.comments (post_id, created_at);

alter table public.comments enable row level security;

create policy "Comments are viewable by logged-in users"
  on public.comments for select
  to authenticated
  using (true);

create policy "Users can comment as themselves"
  on public.comments for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

-- You can delete your own comments, and any comment on your own posts
create policy "Users can delete their comments or comments on their posts"
  on public.comments for delete
  to authenticated
  using (
    (select auth.uid()) = author_id
    or exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = (select auth.uid())
    )
  );