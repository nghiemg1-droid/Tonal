// @ts-nocheck -- runs on Supabase (Deno), not in the React app; VS Code can't check Deno code
// Supabase Edge Function: emails people when they unlock a Tonal gift or when it's sent.
// Started by a database trigger (migration 0030, via pg_net) on INSERT into public.reward_emails.
// In this function's Settings, turn OFF "Verify JWT" (the trigger sends no login token).
// Uses the same secrets as school-email: SMTP_USER and SMTP_PASS.
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const APP_URL = 'https://tonal-six.vercel.app'
const GIFTS: Record<string, string> = {
  sticker: 'Tonal bean sticker',
  keychain: 'bean keychain + sticker',
  shirt: 'Tonal T-shirt',
  plush: 'bean plushie',
}

type Payload = { type?: string; table?: string; record?: { user_id?: string; kind?: string; reward?: string } }

Deno.serve(async (req) => {
  const payload = (await req.json().catch(() => ({}))) as Payload
  const id = (payload.record as { id?: string } | undefined)?.id
  if (payload.type !== 'INSERT' || payload.table !== 'reward_emails' || !id) return new Response('ignored')

  // Safe without a secret: we only send for a row that is really waiting in the database,
  // and we mark it as sent first, so each email goes out at most once.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: row } = await admin
    .from('reward_emails')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', id)
    .is('sent_at', null)
    .select('user_id, kind, reward')
    .maybeSingle()
  if (!row) return new Response('already handled')

  // Their login email (people who log in with a phone may not have one: then the in-app notification is enough)
  const { data } = await admin.auth.admin.getUserById(row.user_id)
  const to = data.user?.email
  if (!to) return new Response('no email')

  const gift = GIFTS[row.reward] ?? 'Tonal gift'
  const unlocked = row.kind === 'unlocked'
  const subject = unlocked ? `🎁 You unlocked a Tonal gift: ${gift}` : `📬 Your ${gift} is on its way`
  const lines = unlocked
    ? [
        `Nice work — you unlocked a free ${gift}!`,
        `Open Tonal, go to 🎁 Invite & Rewards and tap "Claim". You'll pick your size there (for shirts) and tell us your campus mailbox.`,
        `(If you haven't yet, verify your school .edu email on that page first.)`,
      ]
    : [`Your ${gift} has been sent to your campus mailbox. Check your mailbox in the next few days! 💌`]

  const smtpUser = Deno.env.get('SMTP_USER')
  const smtpPass = Deno.env.get('SMTP_PASS')
  if (!smtpUser || !smtpPass) return new Response('email not set up', { status: 500 })
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } })
  await transport.sendMail({
    from: `Tonal <${smtpUser}>`,
    to,
    subject,
    text: `${lines.join('\n\n')}\n\n${APP_URL}/invite\n\nYou're getting this because you earned a gift on Tonal.`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#1f1b2e;line-height:1.5">
      ${lines.map((l) => `<p>${l}</p>`).join('')}
      <p><a href="${APP_URL}/invite" style="display:inline-block;background:#f87171;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700">Open Invite & Rewards</a></p>
      <p style="font-size:12px;color:#888">You're getting this because you earned a gift on Tonal.</p></div>`,
  })
  return new Response('sent')
})
