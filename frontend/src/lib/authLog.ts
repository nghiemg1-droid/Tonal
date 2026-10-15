// A tiny "black box" for logins: remembers the last few login events on this device,
// so when someone gets logged out we can see WHY (token problem vs. phone wiping storage).
// Only short text is kept here — never tokens, emails or other personal data.

const KEY = 'tonal-auth-log'
const MAX_LINES = 40

export function readAuthLog(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((l): l is string => typeof l === 'string') : []
  } catch {
    return []
  }
}

export function logAuth(text: string) {
  try {
    const time = new Date().toISOString().slice(5, 19).replace('T', ' ')
    const lines = [...readAuthLog(), `${time} ${text}`.slice(0, 200)]
    localStorage.setItem(KEY, JSON.stringify(lines.slice(-MAX_LINES)))
  } catch {
    // storage full or blocked: nothing to do
  }
}

// Supabase's debug messages: keep only the ones about refreshing / losing the session.
// Objects (which can contain tokens) are never stored — only plain text and error messages.
const INTERESTING = /refresh|removeSession|not valid|SIGNED_OUT|error|expired/i
const NOISY = /lock|begin$|end$/i

export function supabaseDebugLogger(_prefix: string, ...args: unknown[]) {
  const parts: string[] = []
  for (const arg of args) {
    if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') parts.push(String(arg))
    else if (arg instanceof Error) parts.push(`${arg.name}: ${arg.message}`)
  }
  const text = parts.join(' ')
  if (!INTERESTING.test(text) || NOISY.test(text)) return
  if (/session from storage$/.test(text)) return
  logAuth(text)
}

// Is the app running as an installed app (home screen) or in a browser tab?
export function displayMode(): string {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return standalone ? 'app' : 'browser'
}
