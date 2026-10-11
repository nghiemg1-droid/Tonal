import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'

type Person = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

const FIELDS = 'id, username, display_name, avatar_url'

function StoryBubble({ person, label, isMe }: { person: Person; label: string; isMe?: boolean }) {
  return (
    <button
      type="button"
      title="Stories are coming soon"
      className="flex w-16 shrink-0 flex-col items-center gap-1"
    >
      {/* Grey ring for now; it turns brand-colored when stories arrive */}
      <span className="relative rounded-full bg-line p-0.5">
        <span className="block rounded-full border-2 border-page">
          <Avatar
            name={person.display_name || person.username}
            url={person.avatar_url}
            className="h-14 w-14 text-xl"
          />
        </span>
        {isMe && (
          <span className="absolute right-0 bottom-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-page bg-brand text-xs font-bold text-white">
            +
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-xs text-ink">{label}</span>
    </button>
  )
}

export default function StoryBar({ userId }: { userId: string }) {
  const [me, setMe] = useState<Person | null>(null)
  const [people, setPeople] = useState<Person[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: meRow } = await supabase.from('profiles').select(FIELDS).eq('id', userId).single()

      // People I follow ("follows" points to "profiles" twice, so name the link to use)
      const { data: rows } = await supabase
        .from('follows')
        .select(`following:profiles!follows_following_id_fkey(${FIELDS})`)
        .eq('follower_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (cancelled) return
      setMe(meRow)
      setPeople(((rows ?? []) as unknown as { following: Person }[]).map((row) => row.following))
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!me) return null

  return (
    <div className="flex w-full gap-4 overflow-x-auto pb-2 [scrollbar-width:none]">
      <StoryBubble person={me} label="Your story" isMe />
      {people.map((person) => (
        <StoryBubble key={person.id} person={person} label={person.username} />
      ))}
    </div>
  )
}