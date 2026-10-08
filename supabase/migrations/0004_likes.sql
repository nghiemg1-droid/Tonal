-- =========================================
-- LIKES: one like per user per post
-- =========================================
create table public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index likes_user_idx on public.likes (user_id);

alter table public.likes enable row level security;

create policy "Likes are viewable by logged-in users"
  on public.likes for select
  to authenticated
  using (true);

create policy "Users can like as themselves"
  on public.likes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can remove their own likes"
  on public.likes for delete
  to authenticated
  using ((select auth.uid()) = user_id);