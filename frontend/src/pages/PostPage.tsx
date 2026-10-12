import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { addLikeInfo, POST_FIELDS } from '../lib/posts'
import type { PostRow } from '../lib/posts'
import PostCard from '../components/PostCard'
import type { Post } from '../components/PostCard'

// One post on its own page (from a profile grid, Explore or a notification)
export default function PostPage({ userId }: { userId: string }) {
  const { postId = '' } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState<Post | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPost(null)
    setMissing(false)
    supabase
      .from('posts')
      .select(POST_FIELDS)
      .eq('id', postId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (cancelled) return
        if (!data) {
          setMissing(true)
          return
        }
        const [withLikes] = await addLikeInfo([data as unknown as PostRow], userId)
        if (!cancelled) setPost(withLikes)
      })
    return () => {
      cancelled = true
    }
  }, [postId, userId])

  if (missing) {
    return (
      <div className="w-full rounded-2xl border border-line bg-card p-6 text-center">
        <p className="font-semibold text-ink">This post isn't available.</p>
        <Link to="/" className="mt-3 inline-block text-sm text-brand">
          Go home
        </Link>
      </div>
    )
  }
  if (!post) return <p className="pt-10 text-muted animate-pulse">Loading…</p>

  return (
    <div className="flex w-full flex-col gap-3">
      <button onClick={() => navigate(-1)} className="self-start text-2xl text-muted hover:text-ink" aria-label="Back">
        ‹
      </button>
      <PostCard
        post={post}
        userId={userId}
        onDeleted={() => navigate('/profile', { replace: true })}
        onOpenStory={() => {}}
        onBlocked={() => navigate('/', { replace: true })}
        initialShowComments
      />
    </div>
  )
}
