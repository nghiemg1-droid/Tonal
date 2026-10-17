// Campus Drop: once a day, at a surprise time, everyone posts what they're doing right now.
// The time is worked out from the date (same for everyone, no server needed):
// sometime between 10:00 and 21:00 Denison time, lasting DROP_MINUTES.

export const DROP_TZ = 'America/New_York'
export const DROP_MINUTES = 5
const FIRST_MINUTE = 10 * 60 // 10:00
const LAST_START = 21 * 60 // 21:00

// "2026-10-17" for a moment, in Denison time
export function localDateKey(at: Date, timeZone = DROP_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

// Small stable hash (FNV-1a) so every phone picks the same time
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

// How far a time zone is from UTC at a given moment, in minutes
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(at)
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'))
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000)
}

export type DropWindow = { dateKey: string; start: Date; end: Date }

export function dropWindow(dateKey: string, timeZone = DROP_TZ): DropWindow {
  const [y, m, d] = dateKey.split('-').map(Number)
  const minute = FIRST_MINUTE + (hash(`tonal-drop-${dateKey}`) % (LAST_START - FIRST_MINUTE))
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minute / 60), minute % 60))
  const start = new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60000)
  return { dateKey, start, end: new Date(start.getTime() + DROP_MINUTES * 60000) }
}

export type DropState =
  | { phase: 'before'; window: DropWindow }
  | { phase: 'live'; window: DropWindow; secondsLeft: number }
  | { phase: 'after'; window: DropWindow }

export function dropState(now = new Date()): DropState {
  const window = dropWindow(localDateKey(now))
  if (now < window.start) return { phase: 'before', window }
  if (now < window.end) return { phase: 'live', window, secondsLeft: Math.ceil((window.end.getTime() - now.getTime()) / 1000) }
  return { phase: 'after', window }
}

export function formatClock(at: Date, timeZone = DROP_TZ): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(at)
}
