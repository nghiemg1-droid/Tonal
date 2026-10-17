// Supabase Edge Function: emails a 6-digit code to a school (.edu) address.
// Needs two secrets (Supabase → Edge Functions → Secrets):
//   SMTP_USER = the Gmail address that sends codes (e.g. tonal.team.app@gmail.com)
//   SMTP_PASS = that Gmail account's App password (never put it in code or chat)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405)

  // Who is asking? (the user's own login token)
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData } = await userClient.auth.getUser()
  const user = userData.user
  if (!user) return reply({ error: 'Please log in again' }, 401)

  let email = ''
  try {
    email = String((await req.json()).email ?? '').trim()
  } catch {
    return reply({ error: 'Bad request' }, 400)
  }
  if (email.length > 254) return reply({ error: 'That email is too long' }, 400)

  // The database checks .edu, "already used" and the rate limit, then makes the code
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: code, error } = await admin.rpc('create_school_code', { uid: user.id, email })
  if (error || !code) return reply({ error: error?.message ?? 'Could not create a code' }, 400)

  const smtpUser = Deno.env.get('SMTP_USER')
  const smtpPass = Deno.env.get('SMTP_PASS')
  if (!smtpUser || !smtpPass) return reply({ error: 'Email sending is not set up yet' }, 500)

  // Port 465 (SSL): Supabase blocks 25 and 587 for Edge Functions
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } })
  try {
    await transport.sendMail({
      from: `Tonal <${smtpUser}>`,
      to: email,
      subject: `${code} is your Tonal school verification code`,
      text: `Your Tonal code is ${code}. It works for 15 minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#1f1b2e">
        <p>Your Tonal school verification code:</p>
        <p style="font-size:32px;font-weight:800;letter-spacing:6px">${code}</p>
        <p>It works for 15 minutes. If you didn't ask for this, you can ignore this email.</p></div>`,
    })
  } catch {
    return reply({ error: 'Could not send the email. Check the address and try again.' }, 502)
  }
  return reply({ ok: true })
})
