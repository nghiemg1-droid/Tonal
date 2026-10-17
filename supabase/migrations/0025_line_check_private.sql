-- =========================================
-- LINE CHECK PRIVACY (run after 0024)
--  * Reports are anonymous: other people can no longer read who wrote them
--    (the author is kept only so you can delete your own and so admins can act on abuse).
--  * No photos or voice notes: a photo of a line almost always shows strangers' faces,
--    and a voice gives away who you are. Just a status and a short note.
-- =========================================

-- Photos/voice go away (reports only last an hour anyway)
drop function if exists public.cleanup_my_expired_line_checks();
delete from public.line_checks where photo_path is not null or voice_path is not null;
alter table public.line_checks drop constraint if exists line_checks_voice_shape;
drop policy "Users can post their own line checks" on public.line_checks;
alter table public.line_checks
  drop column photo_path,
  drop column voice_path,
  drop column voice_duration_ms;

create policy "Users can post their own line checks"
  on public.line_checks for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

-- Anonymous reading: every column except author_id
revoke select on public.line_checks from anon, authenticated;
grant select (id, place, status, note, created_at, expires_at) on public.line_checks to authenticated;

-- Everyone sees every active report (anonymous now, so private accounts and blocks
-- don't reveal anything), except reports from people you blocked / who blocked you
drop policy "Active line checks are viewable by logged-in users" on public.line_checks;
create policy "Active line checks are viewable by logged-in users"
  on public.line_checks for select
  to authenticated
  using (expires_at > now() and not public.is_blocked_between((select auth.uid()), author_id));

-- Which of the active reports are mine (so the app can show a delete button)
create function public.my_line_check_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from public.line_checks
  where author_id = (select auth.uid()) and expires_at > now();
$$;
revoke execute on function public.my_line_check_ids() from public, anon;
grant execute on function public.my_line_check_ids() to authenticated;

-- Old reports are deleted for good after a day (anyone opening Line Check tidies up)
create function public.cleanup_old_line_checks()
returns void language sql security definer set search_path = '' as $$
  delete from public.line_checks where expires_at < now() - interval '1 day';
$$;
revoke execute on function public.cleanup_old_line_checks() from public, anon;
grant execute on function public.cleanup_old_line_checks() to authenticated;
