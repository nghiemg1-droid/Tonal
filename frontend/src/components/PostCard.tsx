import { useState } from 'react'
import { Link } from 'react-router'
import { columnsToTrack } from '../lib/music'
import type { MusicColumns } from '../lib/music'
import MusicCredit from './MusicCredit'
import VideoPlayer from './VideoPlayer'
import { sanitizeEdit } from '../lib/videoEdit'
import RichText from './RichText'
import SharePostDialog from './SharePostDialog'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import Avatar from './Avatar'
import VoicePlayer from './VoicePlayer'
import LikeButton from './LikeButton'
import ImageWithSound from './ImageWithSound'
import CommentSection from './CommentSection'
import ReportDialog from './ReportDialog'
import { blockUser } from '../lib/safety'
import { StoryRing } from './StoryBar'
import { useMyStreak } from '../hooks/useMyStreak'
import { unlocks } from '../lib/streaks'
import type { StoryGroup } from './StoryViewer'

export type Post = Partial<MusicColumns> & {
  id: string
  kind: 'voice' | 'image' | 'video'
  poster_path?: string | null
  video_edit?: unknown // settings from the clip editor (checked with sanitizeEdit)
  show_in_feed?: boolean
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
  transcript?: string | null
  saved_by_me?: boolean
  comment_count: number
  author: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    founding_member?: boolean
  }
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
  storyGroup?: StoryGroup
  onOpenStory: (group: StoryGroup) => void
  onBlocked?: (authorId: string) => void
  initialShowComments?: boolean
}

export default function PostCard({
  post,
  userId,
  onDeleted,
  storyGroup,
  onOpenStory,
  onBlocked,
  initialShowComments = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showComments, setShowComments] = useState(initialShowComments)
  const [commentCount, setCommentCount] = useState(post.comment_count)
  const [reporting, setReporting] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [saved, setSaved] = useState(!!post.saved_by_me)
  const [sharing, setSharing] = useState(false)
  const [caption, setCaption] = useState(post.caption_kind === 'text' ? (post.caption_text ?? '') : '')
  const [editingCaption, setEditingCaption] = useState(false)
  const [captionDraft, setCaptionDraft] = useState('')
  const canEditCaption = post.caption_kind === null || post.caption_kind === 'text'

  const isMine = post.author.id === userId
  const { streak } = useMyStreak()
  const canPin = isMine && unlocks(streak?.best ?? 0).pin
  const [pinned, setPinned] = useState(false)
  const mediaUrl = fileUrl(post.media_path)
  const name = post.author.display_name || post.author.username
  const music = columnsToTrack(post)

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
    const files = [post.media_path, post.audio_path, post.caption_path, post.poster_path ?? null].filter(
      (path): path is string => path !== null,
    )
    await supabase.storage.from('posts').remove(files)
    onDeleted(post.id)
  }

  async function handleBlock() {
    setMenuOpen(false)
    if (!window.confirm(`Block @${post.author.username}? You won't see each other's posts or stories, and they can't message you.`)) return
    try {
      await blockUser(userId, post.author.id)
      onBlocked?.(post.author.id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function toggleSave() {
    const next = !saved
    setSaved(next)
    const { error } = next
      ? await supabase.from('saved_posts').insert({ post_id: post.id })
      : await supabase.from('saved_posts').delete().eq('post_id', post.id).eq('user_id', userId)
    if (error && error.code !== '23505') setSaved(!next)
  }

  async function saveCaption() {
    const text = captionDraft.trim()
    const { error } = await supabase
      .from('posts')
      .update({ caption_kind: text ? 'text' : null, caption_text: text || null })
      .eq('id', post.id)
    if (error) {
      setError(error.message)
      return
    }
    setCaption(text)
    setEditingCaption(false)
  }

  const menuItem = 'block w-full px-4 py-2.5 text-left text-sm hover:bg-page disabled:opacity-50'

  return (
    <article className="w-full pb-6 animate-fade-up">
      <header className="mb-3 flex items-center gap-3">
        {storyGroup ? (
          <button
            onClick={() => onOpenStory(storyGroup)}
            aria-label={`View ${post.author.username}'s story`}
            className="rounded-full"
          >
            <StoryRing active seen={storyGroup.stories.every((s) => s.seen)} streakBest={storyGroup.person.streak_best}>
              <Avatar name={name} url={post.author.avatar_url} className="h-8 w-8 text-sm" />
            </StoryRing>
          </button>
        ) : (
          <StoryRing active={false}>
            <Avatar name={name} url={post.author.avatar_url} className="h-8 w-8 text-sm" />
          </StoryRing>
        )}

        <p className="min-w-0 flex-1 truncate text-sm">
          <Link to={`/u/${post.author.username}`} className="font-semibold text-ink hover:underline">
            {post.author.username}
          </Link>
          {post.author.founding_member && (
            <span title="Founding member" className="ml-1 text-xs">
              🏅
            </span>
          )}
          <Link to={`/p/${post.id}`} className="text-muted hover:underline">
            {' '}• {timeAgo(post.created_at)}
          </Link>
          {music && <MusicCredit track={music} compact />}
        </p>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="More options"
            className="rounded-full px-2 py-1 text-muted hover:text-ink transition"
          >
            •••
          </button>
          {menuOpen && (
            <div className="absolute top-8 right-0 z-20 w-48 overflow-hidden rounded-xl border border-line bg-card shadow-lg">
              {isMine ? (
                <>
                  {canEditCaption && (
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        setCaptionDraft(caption)
                        setEditingCaption(true)
                      }}
                      className={`${menuItem} text-ink`}
                    >
                      Edit caption
                    </button>
                  )}
                  {canPin && (
                    <button
                      onClick={async () => {
                        setMenuOpen(false)
                        const { error } = await supabase.from('profiles').update({ pinned_post_id: post.id }).eq('id', userId)
                        if (!error) setPinned(true)
                      }}
                      className={`${menuItem} text-ink`}
                    >
                      {pinned ? '📌 Pinned ✓' : '📌 Pin to profile'}
                    </button>
                  )}
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`${menuItem} font-semibold text-red-500`}
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      setReporting(true)
                    }}
                    className={`${menuItem} font-semibold text-red-500`}
                  >
                    Report
                  </button>
                  <button onClick={handleBlock} className={`${menuItem} text-red-500`}>
                    Block @{post.author.username}
                  </button>
                </>
              )}
              <button onClick={() => setMenuOpen(false)} className={`${menuItem} text-ink`}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </header>

      {reporting && (
        <ReportDialog
          userId={userId}
          targetType="post"
          targetId={post.id}
          label="post"
          onClose={() => setReporting(false)}
        />
      )}

      {/* Photos and videos go edge to edge on phones (like other social apps) */}
      {post.kind === 'voice' ? (
        <VoicePlayer src={mediaUrl} durationMs={post.duration_ms ?? 0} transcript={post.transcript} />
      ) : (
        <div className="-mx-4 md:mx-0">
          {post.kind === 'video' ? (
            <VideoPlayer
              src={mediaUrl}
              poster={post.poster_path ? fileUrl(post.poster_path) : ''}
              className="md:rounded-md"
              edit={sanitizeEdit(post.video_edit)}
              music={music}
            />
          ) : post.audio_path || music ? (
            <ImageWithSound
              imageUrl={mediaUrl}
              audioUrl={post.audio_path ? fileUrl(post.audio_path) : (music?.url ?? '')}
              alt={`Photo by ${name}`}
            />
          ) : (
            <button onClick={() => setFullscreen(true)} className="block w-full" aria-label="View photo full screen">
              <img
                src={mediaUrl}
                alt={`Photo by ${name}`}
                loading="lazy"
                className="max-h-[80vh] w-full bg-card object-cover md:rounded-md"
              />
            </button>
          )}
        </div>
      )}

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black"
          onClick={() => setFullscreen(false)}
          role="dialog"
          aria-label="Photo"
        >
          <img src={mediaUrl} alt={`Photo by ${name}`} className="max-h-full max-w-full object-contain" />
          <button
            onClick={() => setFullscreen(false)}
            aria-label="Close"
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-2xl text-white"
          >
            ×
          </button>
        </div>
      )}

      <footer className="mt-2 -ml-3 flex items-center">
        <LikeButton
          postId={post.id}
          userId={userId}
          initialLiked={post.liked_by_me}
          initialCount={post.like_count}
        />
        <button
          onClick={() => setShowComments((open) => !open)}
          aria-label="Comments"
          aria-expanded={showComments}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-page active:scale-90 transition ${
            showComments ? 'text-brand' : 'text-muted'
          }`}
        >
          <CommentIcon />
          <span className="text-sm tabular-nums">{commentCount}</span>
        </button>
        <button
          onClick={() => setSharing(true)}
          aria-label="Share"
          className="rounded-full px-3 py-1.5 text-muted hover:bg-page active:scale-90 transition"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
        <button
          onClick={toggleSave}
          aria-label={saved ? 'Remove from saved' : 'Save'}
          className={`ml-auto rounded-full px-3 py-1.5 hover:bg-page active:scale-90 transition ${saved ? 'text-ink' : 'text-muted'}`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
            <path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </footer>

      {sharing && <SharePostDialog userId={userId} postId={post.id} onClose={() => setSharing(false)} />}

      {editingCaption && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
            maxLength={300}
            rows={3}
            autoFocus
            placeholder="Write a caption… use #hashtags and @mentions"
            className="w-full resize-none rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingCaption(false)} className="rounded-full border border-line px-4 py-1 text-sm text-ink">
              Cancel
            </button>
            <button onClick={saveCaption} className="rounded-full bg-brand px-4 py-1 text-sm font-medium text-white">
              Save
            </button>
          </div>
        </div>
      )}

      {/* Caption */}
      {caption && !editingCaption && (
        <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm text-ink">
          <Link to={`/u/${post.author.username}`} className="font-semibold hover:underline">
            {post.author.username}
          </Link>{' '}
          <RichText text={caption} />
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

      {showComments && (
        <CommentSection
          postId={post.id}
          postAuthorId={post.author.id}
          userId={userId}
          onCountChange={(delta) => setCommentCount((count) => count + delta)}
        />
      )}

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </article>
  )
}