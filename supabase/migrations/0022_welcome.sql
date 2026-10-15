-- =========================================
-- WELCOME: every new account follows @tonal and gets a hello message from it,
-- so the feed and inbox are never empty on day one.
-- (If the @tonal account doesn't exist, nothing happens.)
-- =========================================
create function public.welcome_new_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  team uuid;
  conv uuid;
begin
  select id into team from public.profiles where username = 'tonal';
  if team is null or team = new.id then
    return new;
  end if;

  -- 1. Follow @tonal
  insert into public.follows (follower_id, following_id)
  values (new.id, team)
  on conflict do nothing;

  -- 2. A 1-to-1 chat with a welcome message from @tonal
  insert into public.conversations default values returning id into conv;
  insert into public.conversation_members (conversation_id, user_id)
  values (conv, new.id), (conv, team);
  insert into public.messages (conversation_id, sender_id, kind, body)
  values (
    conv, team, 'text',
    'Hey, welcome to Tonal! 🎙️ Post a voice clip, a photo with music or a short video, '
    || 'and answer the Question of the day on Home. Tap your profile to set a photo and username. '
    || 'Questions or ideas? Just reply here. 💬'
  );

  return new;
end;
$$;

create trigger on_profile_welcome
  after insert on public.profiles
  for each row execute function public.welcome_new_profile();

-- Everyone who is already here follows @tonal too (no message)
insert into public.follows (follower_id, following_id)
select p.id, t.id
from public.profiles p
cross join (select id from public.profiles where username = 'tonal') t
where p.id <> t.id
on conflict do nothing;
