import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'

type Person = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

const FIELDS = 'id, username, display_name, avatar_url'

export default function SuggestionsSidebar({ userId }: { userId: string }) {
  const [me, setMe] = useState<Person | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [followed, setFollowed] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: meRow } = await supabase.from('profiles').select(FIELDS).eq('id', userId).single()

      // Suggest newest people I don't follow yet (and not me)
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)
      const exclude = [userId, ...(follows ?? []).map((row) => row.following_id)]

      const { data: others } = await supabase
        .from('profiles')
        .select(FIELDS)
        .not('id', 'in', `(${exclude.join(',')})`)
        .order('created_at', { ascending: false })
        .limit(5)

      if (cancelled) return
      setMe(meRow)
      setPeople(others ?? [])
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  async function toggleFollow(targetId: string) {
    const isFollowing = followed.has(targetId)
    const { error } = isFollowing
      ? await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId)
      : await supabase.from('follows').insert({ follower_id: userId, following_id: targetId })
    if (error) return

    setFollowed((prev) => {
      const next = new Set(prev)
      if (isFollowing) {
        next.delete(targetId)
      } else {
        next.add(targetId)
      }
      return next
    })
  }

  return (
    <aside className="hidden w-80 shrink-0 pt-2 lg:block">
      {me && (
        <Link to="/profile" className="flex items-center gap-3">
          <Avatar
            name={me.display_name || me.username}
            url={me.avatar_url}
            className="h-11 w-11 text-lg"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{me.username}</p>
            <p className="truncate text-sm text-muted">{me.display_name}</p>
          </div>
        </Link>
      )}

      <div className="mt-6 mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-muted">Suggested for you</p>
        <Link to="/search" className="text-xs font-semibold text-ink hover:text-muted">
          See all
        </Link>
      </div>

      {people.length === 0 ? (
        <p className="text-sm text-muted">No new people to suggest right now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3">
              <Avatar
                name={person.display_name || person.username}
                url={person.avatar_url}
                className="h-9 w-9 text-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{person.username}</p>
                <p className="truncate text-xs text-muted">New to Tonal</p>
              </div>
              <button
                onClick={() => toggleFollow(person.id)}
                className={`text-xs font-semibold transition ${
                  followed.has(person.id) ? 'text-muted hover:text-ink' : 'text-brand hover:text-brand-dark'
                }`}
              >
                {followed.has(person.id) ? 'Following' : 'Follow'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs text-muted">© 2026 Tonal</p>
    </aside>
  )
}