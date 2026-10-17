// Invites & Tonal gifts. The rules themselves live in the database (reward_rules).

export type GiftId = 'sticker' | 'keychain' | 'shirt' | 'plush'

export const GIFTS: Record<GiftId, { emoji: string; name: string; how: (n: number) => string }> = {
  sticker: { emoji: '🫘', name: 'Tonal bean sticker', how: (n) => `Invite ${n} friends who join and post` },
  keychain: { emoji: '🔑', name: 'Bean keychain + sticker', how: (n) => `Reach a ${n}-day posting streak` },
  shirt: { emoji: '👕', name: 'Tonal T-shirt', how: (n) => `Invite ${n} friends who join and post` },
  plush: { emoji: '🧸', name: 'Bean plushie', how: (n) => `Reach a ${n}-day posting streak` },
}

// Quick check before asking the server (the database does the real check)
export function looksLikeSchoolEmail(email: string): boolean {
  return /^[^@\s]+@([a-z0-9-]+\.)+edu$/i.test(email.trim())
}

export const SHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const

export function inviteLink(username: string, origin = typeof window !== 'undefined' ? window.location.origin : 'https://tonal-six.vercel.app') {
  return `${origin}/join?ref=${encodeURIComponent(username)}`
}

// Remember who invited you between opening the link and signing up
const REF_KEY = 'tonal-ref'

export function cleanRef(value: string | null): string | null {
  const v = (value ?? '').trim().replace(/^@/, '')
  return /^[a-zA-Z0-9_.]{2,30}$/.test(v) ? v : null
}

export function saveRefFromUrl(search: string) {
  const ref = cleanRef(new URLSearchParams(search).get('ref'))
  if (!ref) return
  try {
    localStorage.setItem(REF_KEY, ref)
  } catch {
    // private mode: the invite just won't be counted
  }
}

export function peekRef(): string | null {
  try {
    return cleanRef(localStorage.getItem(REF_KEY))
  } catch {
    return null
  }
}

export function takeRef(): string | null {
  const ref = peekRef()
  try {
    localStorage.removeItem(REF_KEY)
  } catch {
    // ignore
  }
  return ref
}
