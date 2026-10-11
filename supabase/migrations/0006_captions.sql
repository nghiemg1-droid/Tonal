-- =========================================
-- Optional caption on image posts: text, drawing or voice
-- =========================================
alter table public.posts
  add column caption_kind text check (caption_kind in ('text', 'drawing', 'voice')),
  add column caption_text text check (char_length(caption_text) <= 300),
  add column caption_path text,
  add column caption_duration_ms int check (caption_duration_ms between 1 and 60000);

-- Each caption kind has exactly the fields it needs, and only image posts get captions
alter table public.posts add constraint posts_caption_shape check (
  (caption_kind is null and caption_text is null and caption_path is null and caption_duration_ms is null)
  or (kind = 'image' and caption_kind = 'text'
      and caption_text is not null and caption_path is null and caption_duration_ms is null)
  or (kind = 'image' and caption_kind = 'drawing'
      and caption_path is not null and caption_text is null and caption_duration_ms is null)
  or (kind = 'image' and caption_kind = 'voice'
      and caption_path is not null and caption_duration_ms is not null and caption_text is null)
);