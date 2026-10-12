import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { GRID_FIELDS } from '../components/PostGrid'
import type { GridPost } from '../components/PostGrid'

const PAGE = 30

type Row = GridPost & { created_at: string }

// Posts for a profile grid (authorId) or the Explore grid (everyone except excludeId)
export function useGridPosts(options: { authorId?: string; excludeId?: string }) {
  const { authorId, excludeId } = options
  const [posts, setPosts] = useState<Row[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchPage = useCallback(
    async (before?: string) => {
      let query = supabase.from('posts').select(GRID_FIELDS).order('created_at', { ascending: false }).limit(PAGE)
      if (authorId) query = query.eq('author_id', authorId)
      if (excludeId) query = query.neq('author_id', excludeId)
      if (before) query = query.lt('created_at', before)
      const { data } = await query
      return (data ?? []) as Row[]
    },
    [authorId, excludeId],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPage().then((rows) => {
      if (cancelled) return
      setPosts(rows)
      setHasMore(rows.length === PAGE)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [fetchPage])

  async function loadMore() {
    const oldest = posts[posts.length - 1]
    if (!oldest) return
    const rows = await fetchPage(oldest.created_at)
    setPosts((prev) => [...prev, ...rows])
    setHasMore(rows.length === PAGE)
  }

  return { posts, hasMore, loading, loadMore }
}
