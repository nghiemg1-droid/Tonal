import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import PostCard from '../components/PostCard'
import type { Post } from '../components/PostCard'

const PAGE_SIZE = 10
const POST_FIELDS =
  'id, kind, media_path, audio_path, duration_ms, created_at, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url), likes(count)'
// What the database sends back, before we add "did I like it?"
type PostRow = Omit<Post, 'like_count' | 'liked_by_me'> & { likes: { count: number }[] }

// Newest posts from these authors; "before" loads the next (older) page
function fetchPosts(authorIds: string[], before?: string) {
  let query = supabase
    .from('posts')
    .select(POST_FIELDS)
    .in('author_id', authorIds)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) query = query.lt('created_at', before)
  return query
}

// Add the like count and whether I liked each post
async function addLikeInfo(rows: PostRow[], userId: string): Promise<Post[]> {
  if (rows.length === 0) return []

  const { data } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', rows.map((row) => row.id))
  const likedByMe = new Set((data ?? []).map((row) => row.post_id))

  return rows.map(({ likes, ...post }) => ({
    ...post,
    like_count: likes[0]?.count ?? 0,
    liked_by_me: likedByMe.has(post.id),
  }))
}

export default function HomePage({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<Post[]>([])
  const [authorIds, setAuthorIds] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // First page: me + everyone I follow
  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)
      const ids = [userId, ...(follows ?? []).map((row) => row.following_id)]

      const { data, error } = await fetchPosts(ids)
      if (error) {
        if (!cancelled) setError(error.message)
      } else {
        const rows = (data ?? []) as unknown as PostRow[]
        const withLikes = await addLikeInfo(rows, userId)
        if (!cancelled) {
          setPosts(withLikes)
          setHasMore(rows.length === PAGE_SIZE)
        }
      }

      if (!cancelled) {
        setAuthorIds(ids)
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  async function loadMore() {
    if (!authorIds || posts.length === 0) return
    setLoadingMore(true)

    const oldest = posts[posts.length - 1].created_at
    const { data, error } = await fetchPosts(authorIds, oldest)

    if (error) {
      setError(error.message)
      setLoadingMore(false)
      return
    }

    const rows = (data ?? []) as unknown as PostRow[]
    const withLikes = await addLikeInfo(rows, userId)
    setPosts((prev) => [...prev, ...withLikes])
    setHasMore(rows.length === PAGE_SIZE)
    setLoadingMore(false)
  }

  function removePost(id: string) {
    setPosts((prev) => prev.filter((post) => post.id !== id))
  }

  if (loading) {
    return <p className="pt-10 text-muted animate-pulse">Loading your feed...</p>
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 pt-10 text-center animate-fade-up">
          <h1 className="text-3xl font-bold text-ink">Your feed is quiet</h1>
          <p className="text-muted">Post your first voice or photo, or follow some people.</p>
          <div className="flex gap-2">
            <Link
              to="/new"
              className="rounded-full bg-brand px-5 py-2 font-medium text-white hover:bg-brand-dark active:scale-95 transition"
            >
              New post
            </Link>
            <Link
              to="/search"
              className="rounded-full border border-line px-5 py-2 text-ink hover:bg-card active:scale-95 transition"
            >
              Find people
            </Link>
          </div>
        </div>
      ) : (
        posts.map((post) => (
          <PostCard key={post.id} post={post} userId={userId} onDeleted={removePost} />
        ))
      )}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="rounded-full border border-line px-5 py-2 text-ink hover:bg-card active:scale-95 disabled:opacity-50 transition"
        >
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  )
}