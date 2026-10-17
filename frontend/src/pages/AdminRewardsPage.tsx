import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { GIFTS } from '../lib/rewards'
import type { GiftId } from '../lib/rewards'
import { timeAgo } from '../lib/time'

type Claim = { id: string; username: string; reward: GiftId; full_name: string; mailbox: string; shirt_size: string | null; created_at: string }

// Tonal team only: gifts to send. "Mark as sent" deletes the name and mailbox.
export default function AdminRewardsPage() {
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [claims, setClaims] = useState<Claim[]>([])

  const load = useCallback(async () => {
    const { data: ok } = await supabase.rpc('is_admin')
    setAdmin(!!ok)
    if (!ok) return
    const { data } = await supabase.rpc('admin_pending_claims')
    setClaims((data ?? []) as Claim[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (admin === null) return <p className="pt-10 text-muted animate-pulse">Loading…</p>
  if (!admin) return <p className="pt-10 text-muted">This page is for the Tonal team.</p>

  return (
    <div className="flex w-full max-w-sm flex-col gap-3 animate-fade-up">
      <h2 className="text-2xl font-bold text-ink">📦 Gifts to send</h2>
      {claims.length === 0 && <p className="text-sm text-muted">Nothing to send right now.</p>}
      {claims.map((c) => (
        <div key={c.id} className="flex flex-col gap-1 rounded-2xl border border-line bg-card p-3 text-sm">
          <p className="font-bold text-ink">
            {GIFTS[c.reward].emoji} {GIFTS[c.reward].name}
            {c.shirt_size ? ` · size ${c.shirt_size}` : ''}
          </p>
          <p className="text-ink">{c.full_name}</p>
          <p className="text-ink">{c.mailbox}</p>
          <p className="text-xs text-muted">
            @{c.username} · {timeAgo(c.created_at)}
          </p>
          <button
            onClick={async () => {
              if (!window.confirm('Mark as sent? The name and mailbox will be deleted.')) return
              await supabase.rpc('admin_mark_shipped', { claim: c.id })
              load()
            }}
            className="mt-1 self-start rounded-full bg-brand px-3 py-1 text-xs font-bold text-white"
          >
            Mark as sent
          </button>
        </div>
      ))}
    </div>
  )
}
