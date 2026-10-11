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

type Props = {
  post: Post
  userId: string
  onDeleted: (id: string) => void
}

export default function PostCard({ post, userId, onDeleted }: Props) {
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
    <article className="w-full rounded-2xl border border-line bg-card p-4 shadow-sm animate-fade-up">
      <header className="mb-3 flex items-center gap-3">
        <Avatar name={name} url={post.author.avatar_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{name}</p>
          <p className="truncate text-sm text-muted">
            @{post.author.username} · {timeAgo(post.created_at)}
          </p>
        </div>
        {isMine && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full px-3 py-1 text-sm text-muted hover:bg-page hover:text-red-500 disabled:opacity-50 transition"
          >
            {deleting ? '...' : 'Delete'}
          </button>
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
          className="max-h-144 w-full rounded-xl bg-page object-cover"
        />
      )}

      {/* Caption */}
      {post.caption_kind === 'text' && post.caption_text && (
        <p className="mt-3 whitespace-pre-wrap break-words text-ink">{post.caption_text}</p>
      )}
      {post.caption_kind === 'drawing' && post.caption_path && (
        <img
          src={fileUrl(post.caption_path)}
          alt={`Drawing by ${name}`}
          loading="lazy"
          className="mt-3 w-40 rounded-xl border border-line"
        />
      )}
      {post.caption_kind === 'voice' && post.caption_path && (
        <div className="mt-3">
          <VoicePlayer src={fileUrl(post.caption_path)} durationMs={post.caption_duration_ms ?? 0} />
        </div>
      )}

      <footer className="mt-2 flex items-center">
        <LikeButton
          postId={post.id}
          userId={userId}
          initialLiked={post.liked_by_me}
          initialCount={post.like_count}
        />
      </footer>

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </article>
  )
}