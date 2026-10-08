-- =========================================
-- PROFILES: one public profile per user
-- =========================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 50),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Logged-in users can see profiles
create policy "Profiles are viewable by logged-in users"
  on public.profiles for select
  to authenticated
  using (true);

-- Users can only edit their own profile
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Automatically create a profile when someone signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 8));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Create profiles for users who signed up before this table existed
insert into public.profiles (id, username)
select id, 'user_' || substr(replace(id::text, '-', ''), 1, 8)
from auth.users
on conflict (id) do nothing;

-- =========================================
-- FOLLOWS: who follows whom
-- =========================================
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

create policy "Follows are viewable by logged-in users"
  on public.follows for select
  to authenticated
  using (true);

-- You can only follow as yourself
create policy "Users can follow others"
  on public.follows for insert
  to authenticated
  with check ((select auth.uid()) = follower_id);

-- You can only remove your own follows
create policy "Users can unfollow"
  on public.follows for delete
  to authenticated
  using ((select auth.uid()) = follower_id);