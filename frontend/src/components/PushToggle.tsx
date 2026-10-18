import { useEffect, useState } from 'react'
import { disablePush, enablePush, pushState } from '../lib/push'
import type { PushState } from '../lib/push'

// "Notifications on this device" switch, with help for iPhone and blocked permissions
export default function PushToggle({ compact = false, onChange }: { compact?: boolean; onChange?: (s: PushState) => void }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'))
  }, [])

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      const next = state === 'on' ? await disablePush() : await enablePush()
      setState(next)
      onChange?.(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn on notifications')
    } finally {
      setBusy(false)
    }
  }

  if (state === null) return null
  if (state === 'unsupported') return compact ? null : <p className="text-sm text-muted">Notifications aren't available in this browser.</p>
  if (state === 'install')
    return (
      <p className="text-sm text-muted">
        📲 On iPhone, notifications work in the Tonal app on your Home Screen: tap <b>Share</b> → <b>Add to Home Screen</b>, then open Tonal from there.
      </p>
    )

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={toggle}
        disabled={busy || state === 'denied'}
        className={`rounded-full py-2.5 text-sm font-bold transition active:scale-95 disabled:opacity-60 ${
          state === 'on' ? 'border border-line bg-card text-ink' : 'bg-brand text-white'
        }`}
      >
        {busy ? '…' : state === 'on' ? '🔔 Notifications are on (tap to turn off)' : '🔔 Turn on notifications'}
      </button>
      {state === 'denied' && (
        <p className="text-xs text-muted">Notifications are blocked. Allow them for Tonal in your browser or phone settings.</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
