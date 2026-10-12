import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import PostGrid, { GRID_FIELDS } from '../components/PostGrid'
import type { GridPost } from '../components/PostGrid'

// Posts I saved (only I can see this page)
export default function SavedPage({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<GridPost[] | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('saved_posts')
      .select(`post:posts(${GRID_FIELDS})`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(120)
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data ?? []) as unknown as { post: GridPost | null }[]
        setPosts(rows.map((r) => r.post).filter((p): p is GridPost => p !== null))
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <div className="flex w-full flex-col gap-4 animate-fade-up">
      <div className="flex items-center gap-3">
        <Link to="/profile" aria-label="Back" className="text-2xl text-muted hover:text-ink">
          ‹
        </Link>
        <h2 className="text-xl font-bold text-ink">Saved</h2>
      </div>
      <p className="-mt-2 text-sm text-muted">Only you can see what you've saved.</p>
      {posts === null && <p className="text-muted animate-pulse">Loading…</p>}
      {posts?.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">Tap the bookmark on any post to save it here.</p>
      )}
      {posts && <PostGrid posts={posts} />}
    </div>
  )
}
