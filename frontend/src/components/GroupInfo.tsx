import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { personName, searchPeople } from '../lib/chat'
import type { Person } from '../lib/chat'
import Avatar from './Avatar'

export type Member = {
  user_id: string
  role: 'admin' | 'member'
  profile: Person
}

type Props = {
  conversationId: string
  userId: string
  name: string
  members: Member[]
  onChanged: () => void
  onClose: () => void
}

export default function GroupInfo({ conversationId, userId, name, members, onChanged, onClose }: Props) {
  const navigate = useNavigate()
  const [newName, setNewName] = useState(name)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error } = await fn()
    setBusy(false)
    if (error) setError(error.message)
    return !error
  }

  async function rename(e: FormEvent) {
    e.preventDefault()
    const ok = await run(() =>
      supabase.rpc('rename_group', { conv: conversationId, new_name: newName }),
    )
    if (ok) onChanged()
  }

  async function search(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      setResults(await searchPeople(query, members.map((m) => m.user_id)))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function add(person: Person) {
    const ok = await run(() =>
      supabase.rpc('add_group_members', { conv: conversationId, member_ids: [person.id] }),
    )
    if (ok) {
      setResults((prev) => prev.filter((p) => p.id !== person.id))
      onChanged()
    }
  }

  async function leave() {
    if (!window.confirm('Leave this group?')) return
    const ok = await run(() => supabase.rpc('leave_group', { conv: conversationId }))
    if (ok) navigate('/messages', { replace: true })
  }

  const inputClass =
    'min-w-0 flex-1 rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand'

  return (
    <div className="flex w-full flex-col gap-4 rounded-2xl border border-line bg-card p-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-ink">Group info</h3>
        <button onClick={onClose} aria-label="Close" className="text-xl text-muted hover:text-ink">
          ×
        </button>
      </div>

      <form onSubmit={rename} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={50}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={busy || !newName.trim() || newName.trim() === name}
          className="rounded-full bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-40 transition"
        >
          Rename
        </button>
      </form>

      <div>
        <p className="mb-2 text-sm font-medium text-muted">{members.length} members</p>
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3">
              <Avatar name={personName(m.profile)} url={m.profile.avatar_url} className="h-8 w-8 text-sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {personName(m.profile)}
                {m.user_id === userId && <span className="text-muted"> (you)</span>}
              </span>
              {m.role === 'admin' && <span className="text-xs text-muted">Admin</span>}
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add people by username"
          className={inputClass}
        />
        <button
          type="submit"
          className="rounded-full border border-line px-4 text-sm text-ink hover:bg-page transition"
        >
          Search
        </button>
      </form>

      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <Avatar name={personName(p)} url={p.avatar_url} className="h-8 w-8 text-sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">@{p.username}</span>
              <button
                onClick={() => add(p)}
                disabled={busy}
                className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-40 transition"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={leave}
        disabled={busy}
        className="rounded-full border border-red-400 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-40 transition"
      >
        Leave group
      </button>
    </div>
  )
}
