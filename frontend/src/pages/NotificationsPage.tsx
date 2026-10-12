import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import Avatar from '../components/Avatar'

type Notification = {
  id: string
  type: 'like' | 'comment' | 'follow'
  read_at: string | null
  created_at: string
  actor: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
  post: {
    id: string
    kind: 'voice' | 'image'
    media_path: string
  } | null
}

const FIELDS =
  'id, type, read_at, created_at, actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url), post:posts(id, kind, media_path)'

const MESSAGES = {
  like: 'liked your post.',
  comment: 'commented on your post.',
  follow: 'started following you.',
}

type Props = {
  userId: string
  onSeen: () => void
}

export default function NotificationsPage({ userId, onSeen }: Props) {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('notifications')
        .select(FIELDS)
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (cancelled) return
      if (error) setError(error.message)
      else setItems((data ?? []) as unknown as Notification[])
      setLoading(false)

      // Mark everything as read (the list above still shows which ones were new)
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', userId)
        .is('read_at', null)
      if (!cancelled) onSeen()
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId, onSeen])

  if (loading) {
    return <p className="pt-10 text-muted animate-pulse">Loading notifications...</p>
  }

  return (
    <div className="flex w-full flex-col gap-1 animate-fade-up">
      <h1 className="mb-3 text-2xl font-bold text-ink">Notifications</h1>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {items.length === 0 ? (
        <p className="pt-6 text-center text-muted">
          Nothing yet. Likes, comments and new followers will show up here.
        </p>
      ) : (
        items.map((item) => {
          const name = item.actor.display_name || item.actor.username
          const isNew = item.read_at === null
          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isNew ? 'bg-brand/10' : ''}`}
            >
              <Link to={`/u/${item.actor.username}`}>
                <Avatar name={name} url={item.actor.avatar_url} className="h-11 w-11 text-lg" />
              </Link>

              <p className="min-w-0 flex-1 text-sm text-ink">
                <Link to={`/u/${item.actor.username}`} className="font-semibold hover:underline">
                  {item.actor.username}
                </Link>{' '}
                {MESSAGES[item.type]}{' '}
                <span className="text-muted">{timeAgo(item.created_at)}</span>
              </p>

              {item.post && (
                <Link to={`/p/${item.post.id}`} className="shrink-0">
                {item.post.kind === 'image' ? (
                  <img
                    src={supabase.storage.from('posts').getPublicUrl(item.post.media_path).data.publicUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-page text-xl">
                    🎙️
                  </span>
                )}
                </Link>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}