-- =========================================
-- (run after 0030)
-- 1. MODERATION: admins review reports, remove content, suspend accounts
-- 2. ONBOARDING: remember who has seen the welcome screens
-- 3. PRIVATE MEDIA: post & story files are no longer public links. They are opened with
--    short-lived signed links, only by people allowed to see the author.
-- 4. PUBLIC PREVIEW: a shared link to a public account's post can be previewed without logging in
-- =========================================

-- ---------- 1. MODERATION ----------
alter table public.profiles add column banned_at timestamptz; -- only admins can set it (not in the update grant)

-- Suspended accounts' posts and stories disappear for everyone else
create or replace function public.can_see_author(author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select author = (select auth.uid())
    or (
      not exists (select 1 from public.profiles where id = author and banned_at is not null)
      and (
        not exists (select 1 from public.profiles where id = author and is_private)
        or exists (select 1 from public.follows where follower_id = (select auth.uid()) and following_id = author)
      )
    );
$$;

-- Suspended accounts can't post, comment, message, like or follow
create function public.block_suspended()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and banned_at is not null) then
    raise exception 'Your account is suspended';
  end if;
  return new;
end;
$$;
create trigger posts_block_suspended before insert on public.posts for each row execute function public.block_suspended();
create trigger comments_block_suspended before insert on public.comments for each row execute function public.block_suspended();
create trigger stories_block_suspended before insert on public.stories for each row execute function public.block_suspended();
create trigger messages_block_suspended before insert on public.messages for each row execute function public.block_suspended();
create trigger likes_block_suspended before insert on public.likes for each row execute function public.block_suspended();
create trigger follows_block_suspended before insert on public.follows for each row execute function public.block_suspended();
create trigger line_checks_block_suspended before insert on public.line_checks for each row execute function public.block_suspended();

-- Open reports, newest first, with what was reported
create function public.admin_reports()
returns table (id uuid, created_at timestamptz, reason text, details text, target_type text, target_id uuid,
               reporter text, open_count int, target jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  select r.id, r.created_at, r.reason, r.details, r.target_type, r.target_id, rp.username,
    (select count(*)::int from public.reports r2 where r2.target_type = r.target_type and r2.target_id = r.target_id and r2.status = 'open'),
    case r.target_type
      when 'post' then (select jsonb_build_object('author', a.username, 'author_id', a.id, 'banned', a.banned_at is not null,
          'kind', p.kind, 'media_path', p.media_path, 'poster_path', p.poster_path, 'caption', p.caption_text)
        from public.posts p join public.profiles a on a.id = p.author_id where p.id = r.target_id)
      when 'comment' then (select jsonb_build_object('author', a.username, 'author_id', a.id, 'banned', a.banned_at is not null,
          'kind', c.kind, 'text', c.body, 'media_path', c.media_path, 'post_id', c.post_id)
        from public.comments c join public.profiles a on a.id = c.author_id where c.id = r.target_id)
      when 'story' then (select jsonb_build_object('author', a.username, 'author_id', a.id, 'banned', a.banned_at is not null,
          'story_path', s.media_path)
        from public.stories s join public.profiles a on a.id = s.author_id where s.id = r.target_id)
      when 'message' then (select jsonb_build_object('author', a.username, 'author_id', a.id, 'banned', a.banned_at is not null,
          'kind', m.kind, 'text', m.body)
        from public.messages m join public.profiles a on a.id = m.sender_id where m.id = r.target_id)
      when 'user' then (select jsonb_build_object('author', a.username, 'author_id', a.id, 'banned', a.banned_at is not null,
          'bio', a.bio)
        from public.profiles a where a.id = r.target_id)
    end
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  where r.status = 'open'
  order by r.created_at desc
  limit 200;
end;
$$;
grant execute on function public.admin_reports() to authenticated;

-- dismiss | remove (delete the content) | suspend (the account that made it)
-- Returns files to delete from storage after a removal.
create function public.admin_resolve_report(report uuid, action text)
returns setof text language plpgsql security definer set search_path = '' as $$
declare
  r public.reports%rowtype;
  owner uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into r from public.reports where id = report;
  if r.id is null then raise exception 'Report not found'; end if;

  if action = 'dismiss' then
    update public.reports set status = 'dismissed' where target_type = r.target_type and target_id = r.target_id and status = 'open';
    return;
  end if;

  owner := case r.target_type
    when 'post' then (select author_id from public.posts where id = r.target_id)
    when 'comment' then (select author_id from public.comments where id = r.target_id)
    when 'story' then (select author_id from public.stories where id = r.target_id)
    when 'message' then (select sender_id from public.messages where id = r.target_id)
    when 'user' then r.target_id
  end;

  if action = 'remove' then
    if r.target_type = 'post' then
      return query select f from public.posts p, unnest(array[p.media_path, p.poster_path, p.audio_path, p.caption_path]) f where p.id = r.target_id and f is not null;
      delete from public.posts where id = r.target_id;
    elsif r.target_type = 'comment' then
      return query select c.media_path from public.comments c where c.id = r.target_id and c.media_path is not null;
      delete from public.comments where id = r.target_id;
    elsif r.target_type = 'story' then
      return query select f from public.stories s, unnest(array[s.media_path, s.audio_path]) f where s.id = r.target_id and f is not null;
      delete from public.stories where id = r.target_id;
    elsif r.target_type = 'message' then
      delete from public.messages where id = r.target_id;
    end if;
  elsif action = 'suspend' then
    if owner is null then raise exception 'That account no longer exists'; end if;
    if exists (select 1 from public.admins where user_id = owner) then raise exception 'You can''t suspend an admin'; end if;
    update public.profiles set banned_at = now() where id = owner;
  else
    raise exception 'Unknown action';
  end if;
  update public.reports set status = 'reviewed' where target_type = r.target_type and target_id = r.target_id and status = 'open';
end;
$$;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;

create function public.admin_unsuspend(username_in text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.profiles set banned_at = null where lower(username) = lower(username_in);
end;
$$;
grant execute on function public.admin_unsuspend(text) to authenticated;

-- Admins can open and delete reported files
create policy "Admins can read media" on storage.objects for select to authenticated
  using (bucket_id in ('posts', 'stories') and public.is_admin());
create policy "Admins can delete media" on storage.objects for delete to authenticated
  using (bucket_id in ('posts', 'stories') and public.is_admin());

-- ---------- 2. ONBOARDING ----------
alter table public.profiles add column onboarded_at timestamptz;
update public.profiles set onboarded_at = now(); -- people who are already here skip it
grant update (onboarded_at) on public.profiles to authenticated;

-- ---------- 3. PRIVATE MEDIA ----------
-- Who may open a file in posts/stories: the owner, or anyone allowed to see the owner's posts.
-- (Files live in "<owner id>/<file>".)
create function public.can_see_media(name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  folder text := split_part(name, '/', 1);
  owner uuid;
begin
  if folder !~ '^[0-9a-f-]{36}$' then return false; end if;
  owner := folder::uuid;
  return owner = auth.uid()
    or (public.can_see_author(owner) and not public.is_blocked_between(auth.uid(), owner));
end;
$$;
grant execute on function public.can_see_media(text) to anon, authenticated;

create policy "Media is visible to people who can see the author" on storage.objects for select to anon, authenticated
  using (bucket_id in ('posts', 'stories') and public.can_see_media(name));

update storage.buckets set public = false where id in ('posts', 'stories');

-- ---------- 4. PUBLIC PREVIEW OF A SHARED POST ----------
create function public.public_post(pid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'media_path', p.media_path, 'poster_path', p.poster_path,
    'audio_path', p.audio_path, 'duration_ms', p.duration_ms,
    'caption', case when p.caption_kind = 'text' then p.caption_text end,
    'music_url', p.music_url, 'music_title', p.music_title, 'music_artist', p.music_artist,
    'music_license', p.music_license, 'music_source_url', p.music_source_url,
    'video_edit', p.video_edit, 'created_at', p.created_at,
    'username', a.username, 'display_name', a.display_name, 'avatar_url', a.avatar_url,
    'likes', (select count(*) from public.likes l where l.post_id = p.id),
    'comments', (select count(*) from public.comments c where c.post_id = p.id)
  )
  from public.posts p join public.profiles a on a.id = p.author_id
  where p.id = pid and not a.is_private and a.banned_at is null;
$$;
grant execute on function public.public_post(uuid) to anon, authenticated;
