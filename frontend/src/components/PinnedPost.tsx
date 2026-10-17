import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { addLikeInfo, POST_FIELDS } from '../lib/posts'
import type { PostRow } from '../lib/posts'
import PostCard from './PostCard'
import type { Post } from './PostCard'

// The post someone pinned to the top of their profile (a 50-day streak reward)
export default function PinnedPost({ postId, userId, canUnpin = false }: { postId: string | null; userId: string; canUnpin?: boolean }) {
  const [post, setPost] = useState<Post | null>(null)

  useEffect(() => {
    if (!postId) return setPost(null)
    let cancelled = false
    supabase
      .from('posts')
      .select(POST_FIELDS)
      .eq('id', postId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data || cancelled) return
        const [withLikes] = await addLikeInfo([data as unknown as PostRow], userId)
        if (!cancelled) setPost(withLikes)
      })
    return () => {
      cancelled = true
    }
  }, [postId, userId])

  if (!post) return null
  return (
    <section className="flex w-full flex-col gap-1">
      <div className="flex items-center justify-between px-1 text-sm font-semibold text-muted">
        <span>📌 Pinned</span>
        {canUnpin && (
          <button
            onClick={async () => {
              const { error } = await supabase.from('profiles').update({ pinned_post_id: null }).eq('id', userId)
              if (!error) setPost(null)
            }}
            className="text-xs text-brand"
          >
            Unpin
          </button>
        )}
      </div>
      <PostCard post={post} userId={userId} onDeleted={() => setPost(null)} onOpenStory={() => {}} />
    </section>
  )
}
