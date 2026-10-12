import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { cleanUsernameQuery } from '../lib/search'
import { startChat } from '../lib/chat'
import { loadMyBlocks } from '../lib/safety'
import Avatar from './Avatar'

type Result = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
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
  const [blocked, setBlocked] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  // People I blocked don't show up in search
  useEffect(() => {
    loadMyBlocks(userId).then(setBlocked)
  }, [userId])

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
    // "#something" searches a hashtag
    const raw = query.trim()
    if (raw.startsWith('#') && raw.length > 1) {
      navigate(`/tags/${encodeURIComponent(raw.slice(1).toLowerCase())}`)
      return
    }
    const clean = cleanUsernameQuery(query)
    if (!clean) return

    setError(null)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .ilike('username', `%${clean}%`)
      .neq('id', userId)
      .order('username')
      .limit(10)

    if (error) {
      setError(error.message)
      return
    }
    setResults((data ?? []).filter((person) => !blocked.has(person.id)))
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

  async function openChat(targetId: string) {
    setError(null)
    try {
      navigate(`/messages/${await startChat(targetId)}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-sm animate-fade-up">
      <h2 className="mb-3 text-xl font-bold text-ink">Find people</h2>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people or #hashtags"
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
              <Link to={`/u/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={name} url={person.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink hover:underline">{name}</p>
                  <p className="truncate text-sm text-muted">@{person.username}</p>
                </div>
              </Link>
              <button
                onClick={() => openChat(person.id)}
                aria-label={`Message ${name}`}
                title="Message"
                className="rounded-full border border-line px-2.5 py-1.5 text-sm hover:bg-page active:scale-95 transition"
              >
                💬
              </button>
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