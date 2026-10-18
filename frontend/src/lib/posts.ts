import { supabase } from './supabase'
import type { Post } from '../components/PostCard'

export const POST_FIELDS =
  'id, kind, media_path, audio_path, duration_ms, poster_path, transcript, caption_kind, caption_text, caption_path, caption_duration_ms, music_url, music_title, music_artist, music_license, music_source_url, video_edit, show_in_feed, created_at, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, founding_member), likes(count), comments(count)'

// What the database sends back, before we add "did I like it?"
export type PostRow = Omit<Post, 'like_count' | 'liked_by_me' | 'comment_count'> & {
  likes: { count: number }[]
  comments: { count: number }[]
}

// Add the like count, comment count, and whether I liked each post
export async function addLikeInfo(rows: PostRow[], userId: string): Promise<Post[]> {
  if (rows.length === 0) return []

  const { data } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', rows.map((row) => row.id))
  const likedByMe = new Set((data ?? []).map((row) => row.post_id))

  const { data: savedRows } = await supabase
    .from('saved_posts')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', rows.map((row) => row.id))
  const savedByMe = new Set((savedRows ?? []).map((row) => row.post_id))

  return rows.map(({ likes, comments, ...post }) => ({
    ...post,
    like_count: likes[0]?.count ?? 0,
    comment_count: comments[0]?.count ?? 0,
    liked_by_me: likedByMe.has(post.id),
    saved_by_me: savedByMe.has(post.id),
  }))
}
