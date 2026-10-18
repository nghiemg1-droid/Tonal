import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import MediaImg from '../components/MediaImg'

type Report = {
  id: string
  created_at: string
  reason: string
  details: string | null
  target_type: 'user' | 'post' | 'comment' | 'story' | 'message'
  target_id: string
  reporter: string
  open_count: number
  target: {
    author?: string
    banned?: boolean
    kind?: string
    media_path?: string | null
    poster_path?: string | null
    story_path?: string | null
    caption?: string | null
    text?: string | null
    bio?: string | null
    post_id?: string
  } | null
}

const REASONS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  hate: 'Hate',
  nudity: 'Nudity',
  violence: 'Violence',
  self_harm: 'Self-harm',
  scam: 'Scam',
  other: 'Other',
}

// Tonal team only: reported content, with remove / suspend / dismiss
export default function AdminPage() {
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [unsuspend, setUnsuspend] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: ok } = await supabase.rpc('is_admin')
    setAdmin(!!ok)
    if (!ok) return
    const { data } = await supabase.rpc('admin_reports')
    setReports((data ?? []) as Report[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function act(r: Report, action: 'dismiss' | 'remove' | 'suspend') {
    const label = action === 'remove' ? 'Delete this content for everyone?' : action === 'suspend' ? `Suspend @${r.target?.author}? They won't be able to post and their content will be hidden.` : null
    if (label && !window.confirm(label)) return
    setBusy(r.id)
    setMessage(null)
    const { data, error } = await supabase.rpc('admin_resolve_report', { report: r.id, action })
    if (error) setMessage(error.message)
    else {
      const files = (data ?? []) as string[]
      const bucket = r.target_type === 'story' ? 'stories' : 'posts'
      if (files.length) await supabase.storage.from(bucket).remove(files)
      setMessage(action === 'dismiss' ? 'Dismissed.' : action === 'remove' ? 'Content removed.' : `@${r.target?.author} suspended.`)
    }
    setBusy(null)
    load()
  }

  if (admin === null) return <p className="pt-10 text-muted animate-pulse">Loading…</p>
  if (!admin) return <p className="pt-10 text-muted">This page is for the Tonal team.</p>

  return (
    <div className="flex w-full max-w-lg flex-col gap-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-ink">🛡️ Admin</h2>
        <Link to="/admin/rewards" className="rounded-full border border-line px-3 py-1.5 text-sm text-ink">
          📦 Gifts to send
        </Link>
      </div>

      {message && <p className="rounded-xl bg-card px-3 py-2 text-sm text-ink">{message}</p>}

      <p className="font-semibold text-ink">Open reports · {reports.length}</p>
      {reports.length === 0 && <p className="text-sm text-muted">Nothing to review. 🎉</p>}

      {reports.map((r) => {
        const t = r.target
        const thumb = t?.poster_path ?? (t?.kind === 'image' || t?.kind === 'drawing' ? t?.media_path : null)
        return (
          <div key={r.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">{REASONS[r.reason] ?? r.reason}</span>
              <span className="text-ink">
                {r.target_type} by <b>@{t?.author ?? '?'}</b>
                {t?.banned && <span className="ml-1 text-red-500">(suspended)</span>}
              </span>
              {r.open_count > 1 && <span className="text-xs font-semibold text-red-500">{r.open_count} reports</span>}
              <span className="ml-auto text-xs text-muted">
                @{r.reporter} · {timeAgo(r.created_at)}
              </span>
            </div>
            {r.details && <p className="text-sm text-muted">“{r.details}”</p>}

            {!t ? (
              <p className="text-sm italic text-muted">Already deleted.</p>
            ) : (
              <div className="flex gap-3 rounded-xl bg-page p-2 text-sm text-ink">
                {thumb && <MediaImg path={thumb} className="h-20 w-20 shrink-0 rounded-lg object-cover" />}
                {t.story_path && <MediaImg bucket="stories" path={t.story_path} className="h-24 w-14 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0">
                  {t.kind && <p className="text-xs text-muted">{t.kind}</p>}
                  {(t.caption || t.text || t.bio) && <p className="whitespace-pre-wrap break-words">{t.caption || t.text || t.bio}</p>}
                  {r.target_type === 'post' && (
                    <Link to={`/p/${r.target_id}`} className="text-xs text-brand">
                      Open post →
                    </Link>
                  )}
                  {r.target_type === 'comment' && t.post_id && (
                    <Link to={`/p/${t.post_id}`} className="text-xs text-brand">
                      Open post →
                    </Link>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {r.target_type !== 'user' && t && (
                <button disabled={busy === r.id} onClick={() => act(r, 'remove')} className="rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
                  Remove content
                </button>
              )}
              {t && !t.banned && (
                <button disabled={busy === r.id} onClick={() => act(r, 'suspend')} className="rounded-full border border-red-400 px-3 py-1 text-xs font-bold text-red-500 disabled:opacity-50">
                  Suspend account
                </button>
              )}
              <button disabled={busy === r.id} onClick={() => act(r, 'dismiss')} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink disabled:opacity-50">
                Dismiss
              </button>
            </div>
          </div>
        )
      })}

      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const { error } = await supabase.rpc('admin_unsuspend', { username_in: unsuspend.trim().replace(/^@/, '') })
          setMessage(error ? error.message : `@${unsuspend.replace(/^@/, '')} can use Tonal again.`)
          setUnsuspend('')
        }}
        className="flex gap-2 rounded-2xl border border-line bg-card p-3"
      >
        <input
          value={unsuspend}
          onChange={(e) => setUnsuspend(e.target.value)}
          placeholder="Unsuspend @username"
          className="min-w-0 flex-1 rounded-lg border border-line bg-page px-3 py-1.5 text-sm text-ink"
        />
        <button disabled={!unsuspend.trim()} className="rounded-full bg-brand px-3 text-sm font-semibold text-white disabled:opacity-40">
          Unsuspend
        </button>
      </form>
    </div>
  )
}
