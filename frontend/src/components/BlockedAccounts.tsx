import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { unblockUser } from '../lib/safety'
import { PERSON_FIELDS, personName } from '../lib/chat'
import type { Person } from '../lib/chat'
import Avatar from './Avatar'

export default function BlockedAccounts({ userId }: { userId: string }) {
  const [people, setPeople] = useState<Person[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    supabase
      .from('blocks')
      .select(`blocked:profiles!blocks_blocked_id_fkey(${PERSON_FIELDS})`)
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setPeople(((data ?? []) as unknown as { blocked: Person }[]).map((row) => row.blocked))
      })
    return () => {
      cancelled = true
    }
  }, [open, userId])

  async function unblock(person: Person) {
    try {
      await unblockUser(userId, person.id)
      setPeople((prev) => prev.filter((p) => p.id !== person.id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-semibold text-ink"
      >
        Blocked accounts
        <span className="text-muted">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {people.length === 0 && <p className="text-sm text-muted">You haven't blocked anyone.</p>}
          {people.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <Avatar name={personName(p)} url={p.avatar_url} className="h-9 w-9 text-sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">@{p.username}</span>
              <button
                onClick={() => unblock(p)}
                className="rounded-full border border-line px-3 py-1 text-sm text-ink hover:bg-page transition"
              >
                Unblock
              </button>
            </div>
          ))}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}
    </div>
  )
}
