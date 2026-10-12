import { Link } from 'react-router'
import { postFileUrl } from '../lib/posts'

export type GridPost = {
  id: string
  kind: 'voice' | 'image' | 'video'
  poster_path?: string | null
  media_path: string
  duration_ms: number | null
  audio_path: string | null
  music_url: string | null
}

export const GRID_FIELDS = 'id, kind, media_path, duration_ms, audio_path, music_url, poster_path, created_at'

function seconds(ms: number | null) {
  return ms ? `${Math.round(ms / 1000)}s` : ''
}

// 3-column grid of square tiles; tap one to open the post
export default function PostGrid({ posts }: { posts: GridPost[] }) {
  return (
    <div className="grid w-full grid-cols-3 gap-0.5">
      {posts.map((post) => (
        <Link
          key={post.id}
          to={`/p/${post.id}`}
          className="group relative aspect-square overflow-hidden bg-line"
          aria-label={post.kind === 'voice' ? 'Voice post' : post.kind === 'video' ? 'Video' : 'Photo post'}
        >
          {post.kind === 'video' && post.poster_path ? (
            <>
              <img
                src={postFileUrl(post.poster_path)}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
              <span className="absolute top-1.5 right-1.5 rounded-full bg-black/40 px-1.5 text-xs text-white">
                ▶ {seconds(post.duration_ms)}
              </span>
            </>
          ) : post.kind === 'image' ? (
            <img
              src={postFileUrl(post.media_path)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-brand to-rose-400 text-white">
              <span className="text-3xl">🎙️</span>
              <span className="text-xs font-semibold">{seconds(post.duration_ms)}</span>
            </div>
          )}
          {post.kind === 'image' && (post.audio_path || post.music_url) && (
            <span className="absolute top-1.5 right-1.5 rounded-full bg-black/40 px-1.5 text-xs text-white">
              {post.music_url ? '♪' : '🔊'}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}
