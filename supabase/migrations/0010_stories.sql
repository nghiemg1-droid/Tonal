-- =========================================
-- STORIES: photos that disappear after 24 hours
-- =========================================
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  media_path text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index stories_author_expires_idx on public.stories (author_id, expires_at);

-- Nobody can cheat the 24 hours: the database always sets the times itself
create function public.set_story_times()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  return new;
end;
$$;

create trigger before_story_insert
  before insert on public.stories
  for each row execute function public.set_story_times();

alter table public.stories enable row level security;

-- Only stories that haven't expired are visible
create policy "Active stories are viewable by logged-in users"
  on public.stories for select
  to authenticated
  using (expires_at > now());

create policy "Users can post their own stories"
  on public.stories for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

create policy "Users can delete their own stories"
  on public.stories for delete
  to authenticated
  using ((select auth.uid()) = author_id);

-- =========================================
-- STORY FILES: public bucket, max 5 MB, images only (for now)
-- =========================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stories', 'stories', true, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create policy "Users can read their own story files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can upload their own story files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'stories' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete their own story files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = (select auth.uid())::text);