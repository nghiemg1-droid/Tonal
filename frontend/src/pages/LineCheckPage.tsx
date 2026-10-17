import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import { track } from '../lib/analytics'
import { PLACES, STATUSES, agoLabel, statusInfo, summarize } from '../lib/lineCheck'
import type { LineStatus } from '../lib/lineCheck'

// Reports are anonymous: we never load who wrote them (the database doesn't allow it)
type Row = {
  id: string
  place: string
  status: LineStatus
  note: string | null
  created_at: string
}

// "How long is the line right now?" — anonymous reports from students, gone after 1 hour
export default function LineCheckPage({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [mine, setMine] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('line_checks')
      .select('id, place, status, note, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
    setRows((data ?? []) as Row[])
    const { data: ids } = await supabase.rpc('my_line_check_ids')
    setMine(new Set((ids ?? []) as string[]))
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 60_000) // lines change fast: refresh every minute
    supabase.rpc('cleanup_old_line_checks').then(() => {}) // delete day-old reports for good
    return () => window.clearInterval(timer)
  }, [load])

  async function remove(row: Row) {
    if (!window.confirm('Delete this report?')) return
    const { error } = await supabase.from('line_checks').delete().eq('id', row.id)
    if (error) return
    setRows((prev) => prev.filter((r) => r.id !== row.id))
  }

  const summary = summarize(rows)
  const shown = filter ? rows.filter((r) => r.place === filter) : rows

  return (
    <div className="flex w-full flex-col gap-4 animate-fade-up">
      <div>
        <h2 className="text-2xl font-bold text-ink">🍽️ Line Check</h2>
        <p className="text-sm text-muted">How long is the line right now? Reports are anonymous and disappear after 1 hour.</p>
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
          return (
            <div key={r.id} className="flex flex-col gap-1 rounded-2xl border border-line bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full px-2.5 py-1 text-sm font-bold text-white" style={{ background: info.color }}>
                  {info.emoji} {info.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{r.place}</span>
                <span className="text-xs text-muted">
                  {mine.has(r.id) ? 'you · ' : ''}
                  {timeAgo(r.created_at)}
                </span>
                {mine.has(r.id) && (
                  <button onClick={() => remove(r)} aria-label="Delete report" className="px-1 text-muted hover:text-red-500">
                    ✕
                  </button>
                )}
              </div>
              {r.note && <p className="text-sm text-ink">{r.note}</p>}
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
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!status) return
    setSending(true)
    setError(null)
    const { error } = await supabase.from('line_checks').insert({
      author_id: userId,
      place,
      status,
      note: note.trim() || null,
    })
    setSending(false)
    if (error) return setError(error.message)
    track('line_check', { place, status })
    onDone()
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
        <p className="text-xs text-muted">🕶️ Your report is anonymous — nobody sees your name. Please don't mention other people.</p>

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
