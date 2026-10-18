// Push notifications on this device (phone or computer).
// iPhone: only works when Tonal is added to the Home Screen (iOS 16.4+).
import { supabase } from './supabase'
import { base64UrlToBytes, isIos, isStandalone } from './pushUtils'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushState = 'on' | 'off' | 'denied' | 'install' | 'unsupported'

export async function pushState(): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY) return 'unsupported'
  if (isIos() && !isStandalone()) return 'install' // iPhone needs the Home Screen app
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

// Must be called from a tap (browsers only ask for permission after a user action)
export async function enablePush(): Promise<PushState> {
  const state = await pushState()
  if (state === 'unsupported' || state === 'install' || state === 'denied') return state
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY!) }))
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase.rpc('save_push_subscription', {
    endpoint_in: json.endpoint,
    p256dh_in: json.keys.p256dh,
    auth_in: json.keys.auth,
    ua: navigator.userAgent.slice(0, 300),
  })
  if (error) throw new Error(error.message)
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.rpc('delete_push_subscription', { endpoint_in: sub.endpoint })
    await sub.unsubscribe()
  }
  return 'off'
}
