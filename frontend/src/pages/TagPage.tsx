import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import PostGrid, { GRID_FIELDS } from '../components/PostGrid'
import type { GridPost } from '../components/PostGrid'

// All posts with one #hashtag
export default function TagPage() {
  const { tag = '' } = useParams()
  const clean = decodeURIComponent(tag).toLowerCase()
  const [posts, setPosts] = useState<GridPost[] | null>(null)
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setPosts(null)
    supabase
      .from('posts')
      .select(GRID_FIELDS, { count: 'exact' })
      .contains('tags', [clean])
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data, count }) => {
        if (cancelled) return
        setPosts((data ?? []) as GridPost[])
        setCount(count ?? 0)
      })
    return () => {
      cancelled = true
    }
  }, [clean])

  return (
    <div className="flex w-full flex-col gap-4 animate-fade-up">
      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-3xl font-bold text-brand">
          #
        </span>
        <div>
          <h2 className="text-xl font-bold text-ink">#{clean}</h2>
          <p className="text-sm text-muted">
            {count} {count === 1 ? 'post' : 'posts'}
          </p>
        </div>
      </div>
      {posts === null && <p className="text-muted animate-pulse">Loading…</p>}
      {posts?.length === 0 && <p className="text-sm text-muted">No posts with this hashtag yet.</p>}
      {posts && <PostGrid posts={posts} />}
    </div>
  )
}
