import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { personName, searchPeople } from '../lib/chat'
import type { Person } from '../lib/chat'
import Avatar from '../components/Avatar'

export default function NewGroupPage({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [picked, setPicked] = useState<Person[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      setResults(await searchPeople(query, [userId]))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function toggle(person: Person) {
    setPicked((prev) =>
      prev.some((p) => p.id === person.id)
        ? prev.filter((p) => p.id !== person.id)
        : [...prev, person],
    )
  }

  async function create() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_group', {
      group_name: name,
      member_ids: picked.map((p) => p.id),
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/messages/${data as string}`, { replace: true })
  }

  const canCreate = name.trim().length > 0 && picked.length >= 2 && !busy

  return (
    <div className="flex w-full flex-col gap-4 rounded-2xl border border-line bg-card p-6 shadow-sm animate-fade-up">
      <div className="flex items-center gap-3">
        <Link to="/messages" aria-label="Back" className="text-2xl text-muted hover:text-ink">
          ‹
        </Link>
        <h2 className="text-xl font-bold text-ink">New group</h2>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={50}
        placeholder="Group name"
        className="rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
      />

      {picked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {picked.map((p) => (
            <button
              key={p.id}
              onClick={() => toggle(p)}
              className="flex items-center gap-1.5 rounded-full bg-page py-1 pr-3 pl-1 text-sm text-ink hover:bg-line transition"
            >
              <Avatar name={personName(p)} url={p.avatar_url} className="h-6 w-6 text-xs" />
              {p.username}
              <span className="text-muted">×</span>
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add people by username"
          className="min-w-0 flex-1 rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="submit"
          className="rounded-full border border-line px-4 py-2 text-sm text-ink hover:bg-page active:scale-95 transition"
        >
          Search
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {results.map((person) => {
          const isPicked = picked.some((p) => p.id === person.id)
          return (
            <li key={person.id}>
              <button
                onClick={() => toggle(person)}
                className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left hover:bg-page transition"
              >
                <Avatar name={personName(person)} url={person.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{personName(person)}</p>
                  <p className="truncate text-sm text-muted">@{person.username}</p>
                </div>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs text-white ${
                    isPicked ? 'border-brand bg-brand' : 'border-line'
                  }`}
                >
                  {isPicked && '✓'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={create}
        disabled={!canCreate}
        className="rounded-full bg-brand py-2.5 font-medium text-white hover:bg-brand-dark active:scale-95 disabled:opacity-40 transition"
      >
        {busy ? 'Creating…' : `Create group${picked.length ? ` (${picked.length + 1})` : ''}`}
      </button>
      <p className="-mt-2 text-center text-xs text-muted">Pick at least 2 people.</p>
    </div>
  )
}
