import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useMediaUrl } from '../lib/media'
import { columnsToTrack } from '../lib/music'
import { sanitizeEdit } from '../lib/videoEdit'
import { timeAgo } from '../lib/time'
import Avatar from '../components/Avatar'
import VideoPlayer from '../components/VideoPlayer'
import VoicePlayer from '../components/VoicePlayer'
import ImageWithSound from '../components/ImageWithSound'
import MusicCredit from '../components/MusicCredit'

type PublicPost = {
  id: string
  kind: 'voice' | 'image' | 'video'
  media_path: string
  poster_path: string | null
  audio_path: string | null
  duration_ms: number | null
  caption: string | null
  music_url: string | null
  music_title: string | null
  music_artist: string | null
  music_license: string | null
  music_source_url: string | null
  video_edit: unknown
  created_at: string
  username: string
  display_name: string | null
  avatar_url: string | null
  likes: number
  comments: number
}

// What someone sees when they open a shared post link without being logged in
// (only posts from public accounts; private ones just show the sign-up)
export default function PublicPostPage({ postId }: { postId: string }) {
  const [post, setPost] = useState<PublicPost | null | undefined>(undefined)

  useEffect(() => {
    supabase.rpc('public_post', { pid: postId }).then(({ data }) => setPost((data as PublicPost | null) ?? null))
  }, [postId])

  const mediaUrl = useMediaUrl('posts', post?.media_path)
  const posterUrl = useMediaUrl('posts', post?.poster_path)
  const audioUrl = useMediaUrl('posts', post?.audio_path)

  if (post === undefined) return <p className="text-muted animate-pulse">Loading…</p>
  if (post === null)
    return <p className="rounded-2xl border border-line bg-card px-4 py-3 text-center text-sm text-muted">This post is private or no longer available.</p>

  const name = post.display_name || post.username
  const music = columnsToTrack(post)

  return (
    <article className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar name={name} url={post.avatar_url} className="h-10 w-10 text-base" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{post.username}</p>
          {music ? <MusicCredit track={music} compact /> : <p className="text-xs text-muted">{timeAgo(post.created_at)}</p>}
        </div>
      </div>

      {post.kind === 'voice' ? (
        <VoicePlayer src={mediaUrl} durationMs={post.duration_ms ?? 0} />
      ) : post.kind === 'video' ? (
        <VideoPlayer src={mediaUrl} poster={posterUrl} className="rounded-xl" edit={sanitizeEdit(post.video_edit)} music={music} />
      ) : post.audio_path || music ? (
        <ImageWithSound imageUrl={mediaUrl} audioUrl={post.audio_path ? audioUrl : (music?.url ?? '')} alt={`Photo by ${name}`} />
      ) : mediaUrl ? (
        <img src={mediaUrl} alt={`Photo by ${name}`} className="max-h-[70vh] w-full rounded-xl object-cover" />
      ) : (
        <div className="aspect-square w-full animate-pulse rounded-xl bg-line" />
      )}

      {post.caption && (
        <p className="text-sm text-ink">
          <span className="font-semibold">{post.username}</span> {post.caption}
        </p>
      )}
      <p className="text-sm text-muted">
        ❤️ {post.likes} · 💬 {post.comments}
      </p>
      <p className="rounded-xl bg-brand/10 px-3 py-2 text-center text-sm font-medium text-ink">
        Join Tonal to like, comment and post your own 👇
      </p>
    </article>
  )
}
