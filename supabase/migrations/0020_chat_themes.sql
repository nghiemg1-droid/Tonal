-- =========================================
-- CHAT THEMES: every chat can have its own background.
-- Everyone in the chat sees the same theme.
-- =========================================
alter table public.conversations
  add column theme text not null default 'default'
  check (theme in ('default', 'sunset', 'ocean', 'forest', 'lavender', 'candy', 'night', 'mono', 'peach', 'mint'));

create function public.set_conversation_theme(conv uuid, new_theme text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_conversation_member(conv) then
    raise exception 'You are not in this chat';
  end if;
  update public.conversations set theme = new_theme where id = conv;
end;
$$;
