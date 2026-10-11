-- =========================================
-- Comments can now also be short text (max 300 characters)
-- =========================================
alter table public.comments add column body text check (char_length(body) <= 300);

-- Text comments have no file
alter table public.comments alter column media_path drop not null;

-- Replace the old rules with ones that include 'text'
alter table public.comments drop constraint if exists comments_kind_check;
alter table public.comments drop constraint if exists comments_check;

alter table public.comments add constraint comments_kind_check
  check (kind in ('text', 'voice', 'image', 'drawing'));

-- Each kind has exactly the fields it needs
alter table public.comments add constraint comments_shape check (
  (kind = 'text' and body is not null and char_length(btrim(body)) > 0
    and media_path is null and duration_ms is null)
  or (kind = 'voice' and media_path is not null and duration_ms is not null and body is null)
  or (kind in ('image', 'drawing') and media_path is not null and duration_ms is null and body is null)
);