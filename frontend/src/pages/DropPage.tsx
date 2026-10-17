import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { dropState, dropWindow, formatClock, localDateKey } from '../lib/campusDrop'
import PostGrid, { GRID_FIELDS } from '../components/PostGrid'
import type { GridPost } from '../components/PostGrid'

const GRACE_MS = 15 * 60_000 // posts that arrive a bit late (slow upload) still count

// Everything posted with #CampusDrop during today's drop (or yesterday's, if today's hasn't happened yet)
export default function DropPage() {
  const state = dropState()
  const window_ =
    state.phase === 'before' ? dropWindow(localDateKey(new Date(Date.now() - 24 * 3600_000))) : state.window
  const [posts, setPosts] = useState<GridPost[] | null>(null)
  const startMs = window_.start.getTime()
  const endMs = window_.end.getTime()

  useEffect(() => {
    let cancelled = false
    supabase
      .from('posts')
      .select(GRID_FIELDS)
      .contains('tags', ['campusdrop'])
      .gte('created_at', new Date(startMs - 60_000).toISOString())
      .lte('created_at', new Date(endMs + GRACE_MS).toISOString())
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (!cancelled) setPosts((data ?? []) as GridPost[])
      })
    return () => {
      cancelled = true
    }
  }, [startMs, endMs])

  return (
    <div className="flex w-full flex-col gap-4 animate-fade-up">
      <div>
        <h2 className="text-2xl font-bold text-ink">⚡ Campus Drop</h2>
        <p className="text-sm text-muted">
          {state.phase === 'live'
            ? 'The drop is LIVE right now!'
            : `Denison at ${formatClock(window_.start)}${state.phase === 'before' ? ' (yesterday)' : ''} — what everyone was doing.`}
        </p>
      </div>
      {state.phase === 'live' && (
        <Link to="/new?drop=1" className="rounded-full bg-brand py-3 text-center font-bold text-white">
          Post yours now ⚡
        </Link>
      )}
      {posts === null && <p className="text-muted animate-pulse">Loading…</p>}
      {posts?.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          Nobody posted in this drop. Next one: today, sometime between 10 AM and 9 PM. Keep Tonal open 👀
        </p>
      )}
      {posts && posts.length > 0 && <PostGrid posts={posts} />}
    </div>
  )
}
