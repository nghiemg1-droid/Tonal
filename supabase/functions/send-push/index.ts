// @ts-nocheck -- runs on Supabase (Deno), not in the React app; VS Code can't check Deno code
// Supabase Edge Function: sends one queued push notification to every device of that person.
// Started by a database trigger (migration 0032, via pg_net) on INSERT into public.push_queue.
// In this function's Settings, turn OFF "Verify JWT" (the trigger sends no login token).
// Secrets needed (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:tonal.team.app@gmail.com)
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

Deno.serve(async (req) => {
  const payload = await req.json().catch(() => ({}))
  const id = payload?.record?.id
  if (payload?.table !== 'push_queue' || !id) return new Response('ignored')

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return new Response('push not set up', { status: 500 })
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:tonal.team.app@gmail.com', publicKey, privateKey)

  // Safe without a secret: only rows really waiting in the queue are sent, and each only once
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: row } = await admin
    .from('push_queue')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', id)
    .is('sent_at', null)
    .select('user_id, title, body, url, tag')
    .maybeSingle()
  if (!row) return new Response('already handled')

  const { data: devices } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', row.user_id)
  const message = JSON.stringify({ title: row.title, body: row.body ?? '', url: row.url, tag: row.tag ?? undefined })
  let sent = 0
  for (const d of devices ?? []) {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, message, { TTL: 60 * 60 * 12 })
      sent++
    } catch (err) {
      // 404/410 = the device turned notifications off or the app was removed
      const code = err?.statusCode
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', d.id)
    }
  }
  return new Response(`sent ${sent}`)
})
