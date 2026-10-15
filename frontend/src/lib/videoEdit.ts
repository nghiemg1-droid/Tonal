// Simple, non-destructive edits for short videos.
// The uploaded file is never changed: we save these settings with the post
// and the player applies them (trim, filter, text, speed, sound levels).

export type FilterId = 'none' | 'warm' | 'cool' | 'bw' | 'vintage' | 'vivid' | 'fade'

export const FILTERS: { id: FilterId; label: string; css: string }[] = [
  { id: 'none', label: 'Normal', css: 'none' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.25) saturate(1.3) hue-rotate(-8deg)' },
  { id: 'cool', label: 'Cool', css: 'saturate(1.1) hue-rotate(12deg) brightness(1.05)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.6) contrast(1.1)' },
  { id: 'bw', label: 'B&W', css: 'grayscale(1) contrast(1.1)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.5) contrast(0.9) brightness(1.05)' },
  { id: 'fade', label: 'Fade', css: 'contrast(0.85) brightness(1.1) saturate(0.8)' },
]

export const SPEEDS = [0.5, 1, 1.5, 2] as const
export const TEXT_COLORS = ['#ffffff', '#111827', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc']
export const TEXT_MAX = 80
export const MAX_CLIP_SECONDS = 60
export const MIN_CLIP_SECONDS = 1

export type VideoText = { value: string; color: string; y: number } // y: 0 = top, 1 = bottom

export type VideoEdit = {
  start: number // seconds into the original video
  end: number | null // null = until the end
  filter: FilterId
  speed: number
  volume: number // original sound, 0..1
  musicVolume: number // background music, 0..1
  text: VideoText | null
}

export const DEFAULT_EDIT: VideoEdit = {
  start: 0,
  end: null,
  filter: 'none',
  speed: 1,
  volume: 1,
  musicVolume: 0.6,
  text: null,
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

// Anything read from the database goes through here, so bad data can't break the player
export function sanitizeEdit(raw: unknown): VideoEdit {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_EDIT }
  const r = raw as Record<string, unknown>
  const start = num(r.start, 0, 3600, 0)
  const endRaw = num(r.end, 0, 3600, -1)
  const filter = FILTERS.some((f) => f.id === r.filter) ? (r.filter as FilterId) : 'none'
  const speed = SPEEDS.includes(r.speed as (typeof SPEEDS)[number]) ? (r.speed as number) : 1

  let text: VideoText | null = null
  const t = r.text as Record<string, unknown> | null | undefined
  if (t && typeof t === 'object' && typeof t.value === 'string' && t.value.trim()) {
    text = {
      value: t.value.slice(0, TEXT_MAX),
      color: typeof t.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : '#ffffff',
      y: num(t.y, 0.05, 0.95, 0.5),
    }
  }

  return {
    start,
    end: endRaw > start ? endRaw : null,
    filter,
    speed,
    volume: num(r.volume, 0, 1, 1),
    musicVolume: num(r.musicVolume, 0, 1, 0.6),
    text,
  }
}

export function filterCss(id: FilterId): string {
  return FILTERS.find((f) => f.id === id)?.css ?? 'none'
}

// How long the clip lasts for viewers (after trimming and speed), in seconds
export function editedSeconds(edit: VideoEdit, sourceSeconds: number): number {
  const end = edit.end === null ? sourceSeconds : Math.min(edit.end, sourceSeconds)
  return Math.max(0, end - edit.start) / edit.speed
}

// Only save what differs from "no edits" (keeps the database row small)
export function compactEdit(edit: VideoEdit, sourceSeconds: number): Partial<VideoEdit> | null {
  const out: Partial<VideoEdit> = {}
  if (edit.start > 0.05) out.start = Math.round(edit.start * 100) / 100
  if (edit.end !== null && edit.end < sourceSeconds - 0.05) out.end = Math.round(edit.end * 100) / 100
  if (edit.filter !== 'none') out.filter = edit.filter
  if (edit.speed !== 1) out.speed = edit.speed
  if (edit.volume !== 1) out.volume = Math.round(edit.volume * 100) / 100
  if (edit.musicVolume !== DEFAULT_EDIT.musicVolume) out.musicVolume = Math.round(edit.musicVolume * 100) / 100
  if (edit.text && edit.text.value.trim()) out.text = { ...edit.text, value: edit.text.value.trim().slice(0, TEXT_MAX) }
  return Object.keys(out).length ? out : null
}

// 75.4 -> "1:15"
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
