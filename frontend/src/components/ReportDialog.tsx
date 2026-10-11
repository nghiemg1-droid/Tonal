import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { REPORT_REASONS } from '../lib/safety'
import type { ReportTarget } from '../lib/safety'

type Props = {
  userId: string
  targetType: ReportTarget
  targetId: string
  label: string // e.g. "post", "message", "@minh"
  onClose: () => void
}

export default function ReportDialog({ userId, targetType, targetId, label, onClose }: Props) {
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!reason) return
    setStatus('sending')
    setError(null)
    const { error } = await supabase.from('reports').insert({
      reporter_id: userId,
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details.trim() || null,
    })
    // 23505 = you already reported this, treat it as done
    if (error && error.code !== '23505') {
      setError(error.message)
      setStatus('idle')
      return
    }
    setStatus('done')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        {status === 'done' ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="text-4xl">✅</span>
            <p className="font-bold text-ink">Thanks for letting us know</p>
            <p className="text-sm text-muted">
              We'll review it. The person won't know who reported them.
            </p>
            <button
              onClick={onClose}
              className="mt-2 w-full rounded-full bg-brand py-2 font-medium text-white hover:bg-brand-dark transition"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <h3 className="text-center font-bold text-ink">Report {label}</h3>
            <p className="text-center text-sm text-muted">Why are you reporting this?</p>

            <div className="flex flex-col">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className="flex items-center justify-between border-b border-line py-2.5 text-left text-sm text-ink last:border-b-0"
                >
                  {r.label}
                  <span
                    className={`h-4 w-4 rounded-full border-2 ${
                      reason === r.value ? 'border-brand bg-brand' : 'border-line'
                    }`}
                  />
                </button>
              ))}
            </div>

            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="More details (optional)"
              className="resize-none rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
            />

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-full border border-line py-2 text-sm text-ink hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!reason || status === 'sending'}
                className="flex-1 rounded-full bg-red-500 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40 transition"
              >
                {status === 'sending' ? 'Sending…' : 'Report'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
