import { useCallback, useEffect, useState } from 'react'
import type { UIEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { addLikeInfo, POST_FIELDS, postFileUrl } from '../lib/posts'
import type { PostRow } from '../lib/posts'
import type { Post } from '../components/PostCard'
import Avatar from '../components/Avatar'
import VideoPlayer from '../components/VideoPlayer'
import LikeButton from '../components/LikeButton'
import CommentSection from '../components/CommentSection'
import RichText from '../components/RichText'
import SharePostDialog from '../components/SharePostDialog'
import MusicCredit from '../components/MusicCredit'
import { columnsToTrack } from '../lib/music'
import { sanitizeEdit } from '../lib/videoEdit'

const PAGE = 8

// Full-screen vertical feed of short videos from everyone (swipe / scroll to the next one)
export default function ClipsPage({ userId }: { userId: string }) {
  const [clips, setClips] = useState<Post[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [commentsFor, setCommentsFor] = useState<Post | null>(null)
  const [sharing, setSharing] = useState<Post | null>(null)
  const [params] = useSearchParams()
  const startId = params.get('start') // opened from a clip on Home: show it first

  const loadMore = useCallback(
    async (before?: string) => {
      setLoading(true)
      let query = supabase
        .from('posts')
        .select(POST_FIELDS)
        .eq('kind', 'video')
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (before) query = query.lt('created_at', before)
      const { data } = await query
      let rows = (data ?? []) as unknown as PostRow[]
      const fullPage = rows.length === PAGE

      if (!before && startId) {
        const { data: first } = await supabase.from('posts').select(POST_FIELDS).eq('id', startId).maybeSingle()
        if (first) rows = [first as unknown as PostRow, ...rows.filter((r) => r.id !== startId)]
      }

      const withLikes = await addLikeInfo(rows, userId)
      setClips((prev) =>
        before ? [...prev, ...withLikes.filter((c) => !prev.some((p) => p.id === c.id))] : withLikes,
      )
      setHasMore(fullPage)
      setLoading(false)
    },
    [userId, startId],
  )

  useEffect(() => {
    loadMore()
  }, [loadMore])

  // Load the next videos when the user gets near the end
  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (!loading && hasMore && el.scrollTop + el.clientHeight * 2 > el.scrollHeight) {
      const last = clips[clips.length - 1]
      if (last) loadMore(last.created_at)
    }
  }

  return (
    <div
      onScroll={handleScroll}
      className="fixed inset-x-0 top-0 bottom-[calc(53px+env(safe-area-inset-bottom))] z-20 snap-y snap-mandatory overflow-y-auto bg-black md:bottom-0 md:left-20"
    >
      {!loading && clips.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-white">
          <span className="text-5xl">🎬</span>
          <p>No videos yet.</p>
          <Link to="/new" className="rounded-full bg-brand px-4 py-2 text-sm font-medium">
            Post the first one
          </Link>
        </div>
      )}

      {clips.map((clip) => {
        const name = clip.author.display_name || clip.author.username
        const music = columnsToTrack(clip)
        return (
          <section key={clip.id} className="relative mx-auto h-full w-full max-w-[470px] snap-start snap-always">
            <VideoPlayer
              src={postFileUrl(clip.media_path)}
              poster={clip.poster_path ? postFileUrl(clip.poster_path) : ''}
              fill
              className="h-full w-full"
              edit={sanitizeEdit(clip.video_edit)}
              music={music}
            />

            {/* Who posted it + caption */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pr-20 text-white">
              <Link to={`/u/${clip.author.username}`} className="pointer-events-auto flex items-center gap-2">
                <Avatar name={name} url={clip.author.avatar_url} className="h-9 w-9 text-sm ring-2 ring-white" />
                <span className="font-semibold">{clip.author.username}</span>
              </Link>
              {clip.caption_text && (
                <p className="pointer-events-auto mt-2 line-clamp-3 text-sm">
                  <RichText text={clip.caption_text} />
                </p>
              )}
              {music && (
                <div className="pointer-events-auto mt-2 max-w-full">
                  <MusicCredit track={music} compact light />
                </div>
              )}
            </div>

            {/* Actions on the right */}
            <div className="absolute right-2 bottom-24 flex flex-col items-center gap-3 rounded-full bg-black/30 py-2 text-white">
              <LikeButton
                postId={clip.id}
                userId={userId}
                initialLiked={clip.liked_by_me}
                initialCount={clip.like_count}
              />
              <button
                onClick={() => setCommentsFor(clip)}
                aria-label="Comments"
                className="flex flex-col items-center px-3 text-sm"
              >
                <span className="text-2xl">💬</span>
                {clip.comment_count}
              </button>
              <button
                onClick={() => setSharing(clip)}
                aria-label="Share"
                className="flex flex-col items-center px-3 text-sm"
              >
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
                Share
              </button>
            </div>
          </section>
        )
      })}

      {sharing && <SharePostDialog userId={userId} postId={sharing.id} onClose={() => setSharing(null)} />}

      {/* Comments sheet */}
      {commentsFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setCommentsFor(null)}>
          <div
            className="max-h-[75dvh] w-full max-w-[470px] overflow-y-auto rounded-t-2xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold text-ink">Comments</p>
              <button onClick={() => setCommentsFor(null)} aria-label="Close" className="text-2xl leading-none text-muted">
                ×
              </button>
            </div>
            <CommentSection
              postId={commentsFor.id}
              postAuthorId={commentsFor.author.id}
              userId={userId}
              onCountChange={(delta) =>
                setClips((prev) =>
                  prev.map((c) => (c.id === commentsFor.id ? { ...c, comment_count: c.comment_count + delta } : c)),
                )
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
