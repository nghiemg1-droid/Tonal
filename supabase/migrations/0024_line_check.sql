-- =========================================
-- LINE CHECK: "how long is the line right now?" (run after 0023)
-- A quick report about a dining spot: a status, plus an optional photo or
-- a short voice note. Reports disappear from the app after 1 hour.
-- Photos/voice go in the existing "stories" bucket under your own folder.
-- =========================================
create table public.line_checks (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  place text not null check (char_length(place) between 1 and 40),
  status text not null check (status in ('empty', 'short', 'long', 'wild')),
  note text check (char_length(note) <= 80),
  photo_path text,
  voice_path text,
  voice_duration_ms int check (voice_duration_ms between 1 and 15000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  constraint line_checks_voice_shape check ((voice_path is null) = (voice_duration_ms is null))
);
create index line_checks_place_idx on public.line_checks (place, created_at desc);
create index line_checks_expires_idx on public.line_checks (expires_at);

-- The database sets the times (nobody can make a report last longer),
-- and the same person can report the same place at most once every 5 minutes.
create function public.set_line_check_times()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.line_checks
    where author_id = new.author_id and place = new.place
      and created_at > now() - interval '5 minutes'
  ) then
    raise exception 'You just reported this place. Try again in a few minutes.';
  end if;
  new.created_at := now();
  new.expires_at := now() + interval '1 hour';
  return new;
end;
$$;
create trigger before_line_check_insert
  before insert on public.line_checks
  for each row execute function public.set_line_check_times();

alter table public.line_checks enable row level security;

create policy "Active line checks are viewable by logged-in users"
  on public.line_checks for select
  to authenticated
  using (
    expires_at > now()
    and not public.is_blocked_between((select auth.uid()), author_id)
    and public.can_see_author(author_id)
  );

create policy "Users can post their own line checks"
  on public.line_checks for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and (photo_path is null or split_part(photo_path, '/', 1) = (select auth.uid())::text)
    and (voice_path is null or split_part(voice_path, '/', 1) = (select auth.uid())::text)
  );

create policy "Users can delete their own line checks"
  on public.line_checks for delete
  to authenticated
  using ((select auth.uid()) = author_id);

-- Remove my reports (and say which files to delete) that ended over an hour ago
create function public.cleanup_my_expired_line_checks()
returns setof text language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.line_checks
    where author_id = (select auth.uid()) and expires_at < now() - interval '1 hour'
    returning photo_path, voice_path
  )
  select p from gone, unnest(array[photo_path, voice_path]) as p where p is not null;
$$;
revoke execute on function public.cleanup_my_expired_line_checks() from public, anon;
grant execute on function public.cleanup_my_expired_line_checks() to authenticated;
