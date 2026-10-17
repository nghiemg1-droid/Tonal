// Line Check: quick reports of how busy a dining spot is right now.

// Denison's places to eat (from denison.edu/campus/dining/places-to-eat)
export const PLACES = ['Curtis', 'Huffman', 'Slayter Market', 'Bandersnatch', 'The Nest'] as const

export type LineStatus = 'empty' | 'short' | 'long' | 'wild'

export const STATUSES: { id: LineStatus; emoji: string; label: string; color: string }[] = [
  { id: 'empty', emoji: '🟢', label: 'No line', color: '#22c55e' },
  { id: 'short', emoji: '🟡', label: 'Short', color: '#eab308' },
  { id: 'long', emoji: '🟠', label: 'Long', color: '#f97316' },
  { id: 'wild', emoji: '🔴', label: 'Chaos', color: '#ef4444' },
]

export function statusInfo(id: string) {
  return STATUSES.find((s) => s.id === id) ?? STATUSES[1]
}

export type LineReport = {
  id: string
  place: string
  status: LineStatus
  created_at: string
}

export type PlaceSummary = {
  place: string
  status: LineStatus | null // null = nobody reported in the last hour
  minutesAgo: number | null
  reports: number
}

// For each place: the newest report wins (lines change fast), plus how many reports
export function summarize(reports: LineReport[], now = Date.now()): PlaceSummary[] {
  return PLACES.map((place) => {
    const mine = reports
      .filter((r) => r.place === place)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    const latest = mine[0]
    return {
      place,
      status: latest ? latest.status : null,
      minutesAgo: latest ? Math.max(0, Math.round((now - new Date(latest.created_at).getTime()) / 60000)) : null,
      reports: mine.length,
    }
  })
}

export function agoLabel(minutes: number | null): string {
  if (minutes === null) return 'no reports yet'
  if (minutes < 1) return 'just now'
  return `${minutes} min ago`
}
