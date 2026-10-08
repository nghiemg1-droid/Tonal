import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Result = {
  id: string
  username: string
  display_name: string | null
}

type Props = {
  userId: string
  onFollowChange?: () => void
}

export default function UserSearch({ userId, onFollowChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [searched, setSearched] = useState(false)
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load the list of people I already follow
  useEffect(() => {
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
      .then(({ data }) => {
        setFollowing(new Set((data ?? []).map((row) => row.following_id)))
      })
  }, [userId])

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    // Usernames only contain a-z, 0-9 and _, so drop everything else
    const clean = query.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!clean) return

    setError(null)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .ilike('username', `%${clean}%`)
      .neq('id', userId)
      .order('username')
      .limit(10)

    if (error) {
      setError(error.message)
      return
    }
    setResults(data ?? [])
    setSearched(true)
  }

  async function toggleFollow(targetId: string) {
    const isFollowing = following.has(targetId)
    setBusyId(targetId)
    setError(null)

    const { error } = isFollowing
      ? await supabase
          .from('follows')
          .delete()
          .eq('follower_id', userId)
          .eq('following_id', targetId)
      : await supabase
          .from('follows')
          .insert({ follower_id: userId, following_id: targetId })

    setBusyId(null)
    if (error) {
      setError(error.message)
      return
    }

    setFollowing((prev) => {
      const next = new Set(prev)
      if (isFollowing) {
        next.delete(targetId)
      } else {
        next.add(targetId)
      }
      return next
    })
        onFollowChange?.()
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-sm animate-fade-up [animation-delay:300ms]">
      <h2 className="mb-3 text-xl font-bold text-ink">Find people</h2>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username"
          className="min-w-0 flex-1 rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="submit"
          className="rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark active:scale-95 transition"
        >
          Search
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {searched && results.length === 0 && (
        <p className="mt-4 text-sm text-muted">No one found.</p>
      )}

      <ul className="mt-4 flex flex-col gap-3">
        {results.map((person) => {
          const name = person.display_name || person.username
          const isFollowing = following.has(person.id)
          return (
            <li key={person.id} className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white">
                {name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{name}</p>
                <p className="truncate text-sm text-muted">@{person.username}</p>
              </div>
              <button
                onClick={() => toggleFollow(person.id)}
                disabled={busyId === person.id}
                className={
                  isFollowing
                    ? 'rounded-full border border-line px-4 py-1.5 text-sm text-ink hover:bg-page active:scale-95 disabled:opacity-50 transition'
                    : 'rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark active:scale-95 disabled:opacity-50 transition'
                }
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}