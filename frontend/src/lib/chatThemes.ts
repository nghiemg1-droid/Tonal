// Chat backgrounds. The id is saved in the database (conversations.theme).

export type ChatTheme = {
  id: string
  name: string
  background: string | null // CSS background; null = the normal page color
  bubble: string | null // color of my messages; null = brand color
  unlock?: number // best posting streak needed (days)
}

export const CHAT_THEMES: ChatTheme[] = [
  { id: 'default', name: 'Classic', background: null, bubble: null },
  { id: 'sunset', name: 'Sunset', background: 'linear-gradient(160deg, #fde68a 0%, #fca5a5 55%, #f472b6 100%)', bubble: '#db2777' },
  { id: 'ocean', name: 'Ocean', background: 'linear-gradient(160deg, #a5f3fc 0%, #60a5fa 55%, #6366f1 100%)', bubble: '#2563eb' },
  { id: 'forest', name: 'Forest', background: 'linear-gradient(160deg, #d9f99d 0%, #4ade80 55%, #15803d 100%)', bubble: '#15803d' },
  { id: 'lavender', name: 'Lavender', background: 'linear-gradient(160deg, #f5d0fe 0%, #c4b5fd 60%, #a78bfa 100%)', bubble: '#7c3aed' },
  { id: 'candy', name: 'Candy', background: 'linear-gradient(160deg, #fbcfe8 0%, #e9d5ff 50%, #bfdbfe 100%)', bubble: '#ec4899' },
  { id: 'peach', name: 'Peach', background: 'linear-gradient(160deg, #ffedd5 0%, #fed7aa 50%, #fdba74 100%)', bubble: '#ea580c' },
  { id: 'mint', name: 'Mint', background: 'linear-gradient(160deg, #ccfbf1 0%, #99f6e4 50%, #5eead4 100%)', bubble: '#0d9488' },
  { id: 'night', name: 'Night', background: 'linear-gradient(160deg, #1e1b4b 0%, #0f172a 60%, #020617 100%)', bubble: '#6366f1' },
  { id: 'mono', name: 'Mono', background: 'linear-gradient(160deg, #f3f4f6 0%, #d1d5db 60%, #9ca3af 100%)', bubble: '#111827' },
  { id: 'aurora', name: 'Aurora', background: 'linear-gradient(160deg, #0f172a 0%, #134e4a 35%, #22d3ee 70%, #a78bfa 100%)', bubble: '#14b8a6', unlock: 7 },
  { id: 'golden', name: 'Golden', background: 'linear-gradient(160deg, #fef9c3 0%, #fde047 45%, #f59e0b 100%)', bubble: '#b45309', unlock: 100 },
]

export function getChatTheme(id: string | null | undefined): ChatTheme {
  return CHAT_THEMES.find((t) => t.id === id) ?? CHAT_THEMES[0]
}
