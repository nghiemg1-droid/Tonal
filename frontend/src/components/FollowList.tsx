import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { PERSON_FIELDS, personName } from '../lib/chat'
import type { Person } from '../lib/chat'
import Avatar from './Avatar'

type Props = {
  userId: string // whose list
  kind: 'followers' | 'following'
  onClose: () => void
}

export default function FollowList({ userId, kind, onClose }: Props) {
  const [people, setPeople] = useState<Person[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const query =
      kind === 'followers'
        ? supabase
            .from('follows')
            .select(`person:profiles!follows_follower_id_fkey(${PERSON_FIELDS})`)
            .eq('following_id', userId)
        : supabase
            .from('follows')
            .select(`person:profiles!follows_following_id_fkey(${PERSON_FIELDS})`)
            .eq('follower_id', userId)
    query.limit(500).then(({ data }) => {
      if (cancelled) return
      setPeople(((data ?? []) as unknown as { person: Person }[]).map((r) => r.person).filter(Boolean))
    })
    return () => {
      cancelled = true
    }
  }, [userId, kind])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[75dvh] w-full max-w-sm flex-col rounded-t-2xl bg-card p-4 shadow-xl animate-fade-up sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold capitalize text-ink">{kind}</h3>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-muted">
            ×
          </button>
        </div>
        <ul className="flex flex-col gap-3 overflow-y-auto">
          {people === null && <li className="text-sm text-muted">Loading…</li>}
          {people?.length === 0 && <li className="text-sm text-muted">No one yet.</li>}
          {people?.map((p) => (
            <li key={p.id}>
              <Link to={`/u/${p.username}`} onClick={onClose} className="flex items-center gap-3">
                <Avatar name={personName(p)} url={p.avatar_url} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{p.username}</p>
                  <p className="truncate text-xs text-muted">{personName(p)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
