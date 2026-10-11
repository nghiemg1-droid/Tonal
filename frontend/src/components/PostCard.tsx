import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'
import VoicePlayer from './VoicePlayer'
import LikeButton from './LikeButton'
import ImageWithSound from './ImageWithSound'

export type Post = {
  id: string
  kind: 'voice' | 'image'
  media_path: string
  audio_path: string | null
  duration_ms: number | null
  caption_kind: 'text' | 'drawing' | 'voice' | null
  caption_text: string | null
  caption_path: string | null
  caption_duration_ms: number | null
  created_at: string
  like_count: number
  liked_by_me: boolean
  author: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
}

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString()
}

function fileUrl(path: string) {
  return supabase.storage.from('posts').getPublicUrl(path).data.publicUrl
}

function CommentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12Z" />
    </svg>
  )
}

type Props = {
  post: Post
  userId: string
  onDeleted: (id: string) => void
}

export default function PostCard({ post, userId, onDeleted }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMine = post.author.id === userId
  const mediaUrl = fileUrl(post.media_path)
  const name = post.author.display_name || post.author.username

  async function handleDelete() {
    if (!window.confirm('Delete this post?')) return
    setDeleting(true)
    setError(null)

    const { error } = await supabase.from('posts').delete().eq('id', post.id)
    if (error) {
      setError(error.message)
      setDeleting(false)
      return
    }

    // Remove every file of this post, so they don't waste storage
    const files = [post.media_path, post.audio_path, post.caption_path].filter(
      (path): path is string => path !== null,
    )
    await supabase.storage.from('posts').remove(files)
    onDeleted(post.id)
  }

  return (
    <article className="w-full border-b border-line pb-5 animate-fade-up">
      <header className="mb-3 flex items-center gap-3">
        <span className="rounded-full bg-brand p-0.5">
          <span className="block rounded-full border-2 border-page">
            <Avatar name={name} url={post.author.avatar_url} className="h-8 w-8 text-sm" />
          </span>
        </span>

        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold text-ink">{post.author.username}</span>
          <span className="text-muted"> • {timeAgo(post.created_at)}</span>
        </p>

        {isMine && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="More options"
              className="rounded-full px-2 py-1 text-muted hover:text-ink transition"
            >
              •••
            </button>
            {menuOpen && (
              <div className="absolute top-8 right-0 z-20 w-36 overflow-hidden rounded-xl border border-line bg-card shadow-lg">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-red-500 hover:bg-page disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="block w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-page"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {post.kind === 'voice' ? (
        <VoicePlayer src={mediaUrl} durationMs={post.duration_ms ?? 0} />
      ) : post.audio_path ? (
        <ImageWithSound imageUrl={mediaUrl} audioUrl={fileUrl(post.audio_path)} alt={`Photo by ${name}`} />
      ) : (
        <img
          src={mediaUrl}
          alt={`Photo by ${name}`}
          loading="lazy"
          className="max-h-144 w-full rounded-md border border-line bg-card object-cover"
        />
      )}

      <footer className="mt-2 -ml-3 flex items-center">
        <LikeButton
          postId={post.id}
          userId={userId}
          initialLiked={post.liked_by_me}
          initialCount={post.like_count}
        />
        <button
          disabled
          aria-label="Comments (coming soon)"
          title="Comments are coming soon"
          className="rounded-full px-3 py-1.5 text-muted opacity-60"
        >
          <CommentIcon />
        </button>
      </footer>

      {/* Caption */}
      {post.caption_kind === 'text' && post.caption_text && (
        <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm text-ink">
          <span className="font-semibold">{post.author.username}</span> {post.caption_text}
        </p>
      )}
      {post.caption_kind === 'drawing' && post.caption_path && (
        <img
          src={fileUrl(post.caption_path)}
          alt={`Drawing by ${name}`}
          loading="lazy"
          className="mt-2 w-40 rounded-xl border border-line"
        />
      )}
      {post.caption_kind === 'voice' && post.caption_path && (
        <div className="mt-2">
          <VoicePlayer src={fileUrl(post.caption_path)} durationMs={post.caption_duration_ms ?? 0} />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </article>
  )
}