// Pure helpers for chat messages (no Supabase here, so they're easy to test)

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  kind: 'text' | 'voice' | 'image' | 'sticker' | 'drawing' | 'file'
  body: string | null
  media_path: string | null
  duration_ms: number | null
  file_size: number | null
  reply_to_id: string | null
  deleted_at: string | null
  view_once: boolean
  created_at: string
}

export type View = {
  message_id: string
  user_id: string
}

export type Reaction = {
  message_id: string
  user_id: string
  emoji: string | null
}

// message id -> (user id -> emoji)
export type ReactionMap = Record<string, Record<string, string>>

export const MAX_FILE = 10 * 1024 * 1024

export const FILE_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

// Returns an error message, or null when the file is OK to send
export function checkFile(file: { type: string; size: number }): string | null {
  if (file.size > MAX_FILE) return 'Files can be up to 10 MB.'
  if (!FILE_TYPES.includes(file.type)) {
    return 'This file type is not supported. Try PDF, Word, Excel, PowerPoint, TXT, CSV or ZIP.'
  }
  return null
}

// "report.final.PDF" -> "pdf" (letters and numbers only, max 8 characters)
export function fileExtension(name: string): string {
  const parts = name.split('.')
  if (parts.length < 2) return 'bin'
  const ext = (parts.pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
  return ext || 'bin'
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function audioExtension(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

// One line describing a message (reply quotes, inbox)
export function preview(m: Message): string {
  if (m.deleted_at) return 'Message unsent'
  if (m.kind === 'text' || m.kind === 'sticker') return m.body ?? ''
  if (m.kind === 'voice') return '🎙️ Voice message'
  if (m.kind === 'drawing') return '✏️ Drawing'
  if (m.kind === 'file') return `📎 ${m.body ?? 'File'}`
  return m.view_once ? '📸 View-once photo' : '📷 Photo'
}

// Files we can show right away (view-once photos are only fetched when opened)
export function normalPaths(list: Message[]): string[] {
  return list.flatMap((m) => (m.media_path && !m.view_once ? [m.media_path] : []))
}

export function addView(map: Record<string, string[]>, v: View): Record<string, string[]> {
  const list = map[v.message_id] ?? []
  return list.includes(v.user_id) ? map : { ...map, [v.message_id]: [...list, v.user_id] }
}

// emoji = null means the reaction was removed
export function applyReaction(map: ReactionMap, r: Reaction): ReactionMap {
  const forMessage = { ...(map[r.message_id] ?? {}) }
  if (r.emoji) forMessage[r.user_id] = r.emoji
  else delete forMessage[r.user_id]
  return { ...map, [r.message_id]: forMessage }
}

// { userA: '❤️', userB: '❤️', userC: '😂' } -> { '❤️': 2, '😂': 1 }
export function countReactions(forMessage: Record<string, string> | undefined): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const emoji of Object.values(forMessage ?? {})) counts[emoji] = (counts[emoji] ?? 0) + 1
  return counts
}
