-- =========================================
-- GIFT EMAILS: call the notify-email Edge Function on each new reward_emails row
-- (run after 0029). Uses pg_net directly, so the dashboard "Database Webhooks"
-- feature doesn't need to be turned on. The function only sends emails for rows
-- that are really waiting (sent_at is empty) and marks them sent, so no secret is needed.
-- =========================================
create extension if not exists pg_net;

alter table public.reward_emails add column if not exists sent_at timestamptz;

create or replace function public.reward_email_webhook()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://juqelpvnlkrygmozomrd.supabase.co/functions/v1/notify-email',
    body := jsonb_build_object('type', 'INSERT', 'table', 'reward_emails', 'schema', 'public', 'record', to_jsonb(new)),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
revoke execute on function public.reward_email_webhook() from public, anon, authenticated;

drop trigger if exists reward_emails_webhook on public.reward_emails;
create trigger reward_emails_webhook
  after insert on public.reward_emails
  for each row execute function public.reward_email_webhook();
