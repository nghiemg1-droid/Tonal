-- =========================================
-- POSTS: a voice clip or an image (no text, that's the Tonal rule)
-- =========================================
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('voice', 'image')),
  media_path text not null,
  duration_ms int check (duration_ms between 1 and 60000),
  created_at timestamptz not null default now(),
  -- voice posts must have a length, image posts must not
  check ((kind = 'voice') = (duration_ms is not null))
);

create index posts_created_idx on public.posts (created_at desc);
create index posts_author_created_idx on public.posts (author_id, created_at desc);

alter table public.posts enable row level security;

create policy "Posts are viewable by logged-in users"
  on public.posts for select
  to authenticated
  using (true);

create policy "Users can create their own posts"
  on public.posts for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

create policy "Users can delete their own posts"
  on public.posts for delete
  to authenticated
  using ((select auth.uid()) = author_id);

-- =========================================
-- POST FILES: public bucket, max 5 MB, voice and images only
-- =========================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'posts', 'posts', true, 5242880,
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'image/webp', 'image/jpeg']
)
on conflict (id) do nothing;

create policy "Users can read their own post files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can upload their own post files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'posts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete their own post files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = (select auth.uid())::text);