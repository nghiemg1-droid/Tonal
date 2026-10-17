import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'
import { makePostImage } from '../lib/image'
import { timeAgo } from '../lib/time'
import { track } from '../lib/analytics'
import { PLACES, STATUSES, agoLabel, statusInfo, summarize } from '../lib/lineCheck'
import type { LineStatus } from '../lib/lineCheck'
import Avatar from '../components/Avatar'
import VoicePlayer from '../components/VoicePlayer'
import VoiceRecorder from '../components/VoiceRecorder'
import type { Recording } from '../components/VoiceRecorder'

const VOICE_MAX_MS = 15_000

type Row = {
  id: string
  place: string
  status: LineStatus
  note: string | null
  photo_path: string | null
  voice_path: string | null
  voice_duration_ms: number | null
  created_at: string
  author: { id: string; username: string; display_name: string | null; avatar_url: string | null }
}

function fileUrl(path: string) {
  return supabase.storage.from('stories').getPublicUrl(path).data.publicUrl
}

function audioExt(mime: string) {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

// "How long is the line right now?" — reports from students, gone after 1 hour
export default function LineCheckPage({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('line_checks')
      .select('id, place, status, note, photo_path, voice_path, voice_duration_ms, created_at, author:profiles!line_checks_author_id_fkey(id, username, display_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(100)
    setRows((data ?? []) as unknown as Row[])
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 60_000) // lines change fast: refresh every minute
    // Tidy up my old reports and their files
    supabase.rpc('cleanup_my_expired_line_checks').then(({ data }) => {
      const paths = (data ?? []) as string[]
      if (paths.length) supabase.storage.from('stories').remove(paths)
    })
    return () => window.clearInterval(timer)
  }, [load])

  async function remove(row: Row) {
    if (!window.confirm('Delete this report?')) return
    const { error } = await supabase.from('line_checks').delete().eq('id', row.id)
    if (error) return
    const files = [row.photo_path, row.voice_path].filter((p): p is string => !!p)
    if (files.length) await supabase.storage.from('stories').remove(files)
    setRows((prev) => prev.filter((r) => r.id !== row.id))
  }

  const summary = summarize(rows)
  const shown = filter ? rows.filter((r) => r.place === filter) : rows

  return (
    <div className="flex w-full flex-col gap-4 animate-fade-up">
      <div>
        <h2 className="text-2xl font-bold text-ink">🍽️ Line Check</h2>
        <p className="text-sm text-muted">How long is the line right now? Reports disappear after 1 hour.</p>
      </div>

      {/* One card per place */}
      <div className="grid grid-cols-2 gap-2">
        {summary.map((s) => {
          const info = s.status ? statusInfo(s.status) : null
          const active = filter === s.place
          return (
            <button
              key={s.place}
              onClick={() => setFilter(active ? null : s.place)}
              className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition active:scale-95 ${active ? 'border-brand bg-brand/10' : 'border-line bg-card'}`}
            >
              <span className="text-sm font-semibold text-ink">{s.place}</span>
              <span className="text-lg font-bold" style={{ color: info?.color }}>
                {info ? `${info.emoji} ${info.label}` : '⚪ Unknown'}
              </span>
              <span className="text-xs text-muted">
                {agoLabel(s.minutesAgo)}
                {s.reports > 1 ? ` · ${s.reports} reports` : ''}
              </span>
            </button>
          )
        })}
      </div>

      <button
        onClick={() => setReporting(true)}
        className="rounded-full bg-brand py-3 text-lg font-bold text-white shadow-sm hover:bg-brand-dark active:scale-95 transition"
      >
        📣 I'm here — report the line
      </button>

      {/* Latest reports */}
      <div className="flex flex-col gap-3">
        {filter && (
          <button onClick={() => setFilter(null)} className="self-start text-sm text-brand">
            ← All places
          </button>
        )}
        {shown.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            No reports {filter ? `for ${filter} ` : ''}in the last hour. Be the first! 🙌
          </p>
        )}
        {shown.map((r) => {
          const info = statusInfo(r.status)
          const name = r.author.display_name || r.author.username
          return (
            <div key={r.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-3">
              <div className="flex items-center gap-2">
                <Avatar name={name} url={r.author.avatar_url} className="h-8 w-8 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">
                    <span className="font-semibold">{r.author.username}</span> at <span className="font-semibold">{r.place}</span>
                  </p>
                  <p className="text-xs text-muted">{timeAgo(r.created_at)}</p>
                </div>
                <span className="rounded-full px-2.5 py-1 text-sm font-bold text-white" style={{ background: info.color }}>
                  {info.label}
                </span>
                {r.author.id === userId && (
                  <button onClick={() => remove(r)} aria-label="Delete report" className="px-1 text-muted hover:text-red-500">
                    ✕
                  </button>
                )}
              </div>
              {r.note && <p className="text-sm text-ink">{r.note}</p>}
              {r.photo_path && (
                <img src={fileUrl(r.photo_path)} alt={`Line at ${r.place}`} loading="lazy" className="max-h-80 w-full rounded-xl object-cover" />
              )}
              {r.voice_path && r.voice_duration_ms && <VoicePlayer src={fileUrl(r.voice_path)} durationMs={r.voice_duration_ms} />}
            </div>
          )
        })}
      </div>

      {reporting && (
        <ReportSheet
          userId={userId}
          defaultPlace={filter}
          onClose={() => setReporting(false)}
          onDone={() => {
            setReporting(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function ReportSheet({
  userId,
  defaultPlace,
  onClose,
  onDone,
}: {
  userId: string
  defaultPlace: string | null
  onClose: () => void
  onDone: () => void
}) {
  const [place, setPlace] = useState<string>(defaultPlace ?? PLACES[0])
  const [status, setStatus] = useState<LineStatus | null>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [voice, setVoice] = useState<Recording | null>(null)
  const [showVoice, setShowVoice] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!photo) return
    const url = URL.createObjectURL(photo)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Please choose a photo')
    setError(null)
    setPhoto(file)
  }

  async function send() {
    if (!status) return
    if (voice && voice.durationMs > VOICE_MAX_MS) return setError('Keep the voice note under 15 seconds')
    setSending(true)
    setError(null)
    const uploaded: string[] = []
    try {
      let photoPath: string | null = null
      let voicePath: string | null = null
      if (photo) {
        const blob = await makePostImage(photo, 1080)
        photoPath = `${userId}/lc-${crypto.randomUUID()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`
        const { error } = await supabase.storage.from('stories').upload(photoPath, blob, { contentType: blob.type })
        if (error) throw new Error(error.message)
        uploaded.push(photoPath)
      }
      if (voice) {
        const type = voice.blob.type.split(';')[0] || 'audio/webm'
        voicePath = `${userId}/lc-${crypto.randomUUID()}.${audioExt(type)}`
        const { error } = await supabase.storage.from('stories').upload(voicePath, voice.blob, { contentType: type })
        if (error) throw new Error(error.message)
        uploaded.push(voicePath)
      }
      const { error } = await supabase.from('line_checks').insert({
        author_id: userId,
        place,
        status,
        note: note.trim() || null,
        photo_path: photoPath,
        voice_path: voicePath,
        voice_duration_ms: voice ? voice.durationMs : null,
      })
      if (error) throw new Error(error.message)
      track('line_check', { place, status, photo: !!photo, voice: !!voice })
      onDone()
    } catch (err) {
      if (uploaded.length) await supabase.storage.from('stories').remove(uploaded)
      setError(err instanceof Error ? err.message : 'Could not send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[90dvh] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-t-2xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl animate-fade-up sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">Report the line</h3>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-muted">
            ×
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PLACES.map((p) => (
            <button
              key={p}
              onClick={() => setPlace(p)}
              className={`rounded-full px-3 py-1.5 text-sm transition ${place === p ? 'bg-brand font-medium text-white' : 'bg-page text-ink'}`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStatus(s.id)}
              className={`rounded-2xl border-2 py-4 text-lg font-bold transition active:scale-95 ${status === s.id ? 'text-white' : 'bg-page text-ink'}`}
              style={{ borderColor: s.color, background: status === s.id ? s.color : undefined }}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={80}
          placeholder='Add a note (optional) — "pasta bar is open!"'
          className="rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />

        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer rounded-full border border-line py-2 text-center text-sm text-ink hover:bg-page">
            📷 {photo ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" capture="environment" onChange={pickPhoto} className="sr-only" />
          </label>
          <button
            onClick={() => setShowVoice((v) => !v)}
            className={`flex-1 rounded-full border py-2 text-sm ${showVoice ? 'border-brand text-brand' : 'border-line text-ink'}`}
          >
            🎙️ Voice (15 s)
          </button>
        </div>
        {photoUrl && <img src={photoUrl} alt="Your photo" className="max-h-48 w-full rounded-xl object-cover" />}
        {showVoice && <VoiceRecorder onChange={setVoice} />}
        <p className="text-xs text-muted">🙏 Please don't show people's faces. Just the line or the food.</p>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          onClick={send}
          disabled={!status || sending}
          className="rounded-full bg-brand py-2.5 font-bold text-white hover:bg-brand-dark active:scale-95 disabled:opacity-40 transition"
        >
          {sending ? 'Sending…' : 'Send report'}
        </button>
      </div>
    </div>
  )
}
