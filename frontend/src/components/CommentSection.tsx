import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { supabase } from '../lib/supabase'
import { encodeCanvas, makePostImage } from '../lib/image'
import { timeAgo } from '../lib/time'
import Avatar from './Avatar'
import VoicePlayer from './VoicePlayer'
import VoiceRecorder from './VoiceRecorder'
import type { Recording } from './VoiceRecorder'
import DrawingPad from './DrawingPad'

type Comment = {
  id: string
  kind: 'text' | 'voice' | 'image' | 'drawing'
  body: string | null
  media_path: string | null
  duration_ms: number | null
  created_at: string
  author: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
}

type Mode = Comment['kind']

const TEXT_MAX = 300
const FIELDS =
  'id, kind, body, media_path, duration_ms, created_at, author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url)'

function fileUrl(path: string) {
  return supabase.storage.from('posts').getPublicUrl(path).data.publicUrl
}

function audioExtension(mime: string) {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

type Props = {
  postId: string
  postAuthorId: string
  userId: string
  onCountChange: (delta: number) => void
}

export default function CommentSection({ postId, postAuthorId, userId, onCountChange }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>('text')
  const [text, setText] = useState('')
  const [recording, setRecording] = useState<Recording | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [drawing, setDrawing] = useState<HTMLCanvasElement | null>(null)
  const [composerKey, setComposerKey] = useState(0) // changing it resets the recorder and drawing pad
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load comments, oldest first (like a conversation)
  useEffect(() => {
    let cancelled = false
    supabase
      .from('comments')
      .select(FIELDS)
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setComments((data ?? []) as unknown as Comment[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [postId])

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image')
      return
    }
    setError(null)
    setImageFile(file)
  }

  // Enter sends, Shift + Enter makes a new line
  function handleTextKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function resetComposer() {
    setText('')
    setRecording(null)
    setImageFile(null)
    setDrawing(null)
    setComposerKey((k) => k + 1)
  }

  async function send() {
    if (!canSend || sending) return
    setSending(true)
    setError(null)
    let path: string | null = null

    try {
      let body: string | null = null
      let durationMs: number | null = null

      if (mode === 'text') {
        body = text.trim()
      } else {
        let blob: Blob
        let contentType: string
        let ext: string

        if (mode === 'voice') {
          if (!recording) return
          blob = recording.blob
          contentType = blob.type.split(';')[0] || 'audio/webm'
          ext = audioExtension(contentType)
          durationMs = recording.durationMs
        } else if (mode === 'image') {
          if (!imageFile) return
          blob = await makePostImage(imageFile, 1080)
          contentType = blob.type
          ext = contentType === 'image/webp' ? 'webp' : 'jpg'
        } else {
          if (!drawing) return
          blob = await encodeCanvas(drawing)
          contentType = blob.type
          ext = contentType === 'image/webp' ? 'webp' : 'jpg'
        }

        // Upload into my own folder
        const filePath = `${userId}/comments/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(filePath, blob, { contentType })
        if (uploadError) throw new Error(uploadError.message)
        path = filePath
      }

      // Save the comment and get it back with my profile attached
      const { data, error: insertError } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          author_id: userId,
          kind: mode,
          body,
          media_path: path,
          duration_ms: durationMs,
        })
        .select(FIELDS)
        .single()
      if (insertError) throw new Error(insertError.message)

      setComments((prev) => [...prev, data as unknown as Comment])
      onCountChange(1)
      resetComposer()
    } catch (err) {
      // Don't leave an orphan file behind
      if (path) await supabase.storage.from('posts').remove([path])
      setError(err instanceof Error ? err.message : 'Could not send')
    } finally {
      setSending(false)
    }
  }

  async function remove(comment: Comment) {
    const { error } = await supabase.from('comments').delete().eq('id', comment.id)
    if (error) {
      setError(error.message)
      return
    }
    // Only the commenter can delete files in their own folder
    if (comment.media_path && comment.author.id === userId) {
      await supabase.storage.from('posts').remove([comment.media_path])
    }
    setComments((prev) => prev.filter((c) => c.id !== comment.id))
    onCountChange(-1)
  }

  const canSend =
    (mode === 'text' && text.trim().length > 0) ||
    (mode === 'voice' && recording !== null) ||
    (mode === 'image' && imageFile !== null) ||
    (mode === 'drawing' && drawing !== null)

  const tabClass = (active: boolean) =>
    `flex-1 rounded-full py-1.5 text-center transition ${
      active ? 'bg-brand font-medium text-white' : 'text-muted hover:text-ink'
    }`

  return (
    <div className="mt-3 flex flex-col gap-4 rounded-xl border border-line bg-card p-3 animate-fade-up">
      {loading ? (
        <p className="text-sm text-muted animate-pulse">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted">No comments yet. Be the first!</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((comment) => {
            const name = comment.author.display_name || comment.author.username
            const canDelete = comment.author.id === userId || postAuthorId === userId
            return (
              <li key={comment.id} className="flex gap-3">
                <Avatar name={name} url={comment.author.avatar_url} className="h-8 w-8 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <Link to={`/u/${comment.author.username}`} className="font-semibold text-ink hover:underline">
                      {comment.author.username}
                    </Link>
                    <span className="text-muted"> • {timeAgo(comment.created_at)}</span>
                  </p>
                  <div className="mt-1">
                    {comment.kind === 'text' ? (
                      <p className="whitespace-pre-wrap wrap-break-word text-sm text-ink">{comment.body}</p>
                    ) : comment.kind === 'voice' && comment.media_path ? (
                      <VoicePlayer
                        src={fileUrl(comment.media_path)}
                        durationMs={comment.duration_ms ?? 0}
                      />
                    ) : comment.media_path ? (
                      <img
                        src={fileUrl(comment.media_path)}
                        alt={comment.kind === 'drawing' ? `Drawing by ${name}` : `Photo by ${name}`}
                        loading="lazy"
                        className="w-40 rounded-xl border border-line"
                      />
                    ) : null}
                  </div>
                </div>
                {canDelete && (
                  <button
                    onClick={() => remove(comment)}
                    aria-label="Delete comment"
                    className="self-start text-xs text-muted hover:text-red-500 transition"
                  >
                    Delete
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Composer */}
      <div className="flex flex-col gap-3 border-t border-line pt-3">
        <div className="flex gap-1 rounded-full bg-page p-1 text-sm">
          <button type="button" onClick={() => setMode('text')} className={tabClass(mode === 'text')}>
            Aa
          </button>
          <button type="button" onClick={() => setMode('voice')} className={tabClass(mode === 'voice')}>
            🎙️
          </button>
          <button type="button" onClick={() => setMode('image')} className={tabClass(mode === 'image')}>
            🖼️
          </button>
          <button type="button" onClick={() => setMode('drawing')} className={tabClass(mode === 'drawing')}>
            ✏️
          </button>
        </div>

        <div key={composerKey}>
          <div className={mode === 'text' ? '' : 'hidden'}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleTextKey}
              maxLength={TEXT_MAX}
              rows={2}
              placeholder="Add a comment..."
              className="w-full resize-none rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <p className="text-right text-xs text-muted">
              {text.length}/{TEXT_MAX}
            </p>
          </div>

          <div className={mode === 'voice' ? '' : 'hidden'}>
            <VoiceRecorder onChange={setRecording} />
          </div>

          <div className={mode === 'image' ? 'flex flex-col items-center gap-2' : 'hidden'}>
            {imageFile && <p className="max-w-full truncate text-sm text-ink">🖼️ {imageFile.name}</p>}
            <label className="cursor-pointer rounded-full border border-line px-4 py-1.5 text-sm text-ink hover:bg-page active:scale-95 transition">
              {imageFile ? 'Choose another' : 'Choose a photo'}
              <input type="file" accept="image/*" onChange={handleImageChange} className="sr-only" />
            </label>
          </div>

          <div className={mode === 'drawing' ? '' : 'hidden'}>
            <DrawingPad onChange={setDrawing} />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={send}
          disabled={!canSend || sending}
          className="rounded-full bg-brand py-2 font-medium text-white hover:bg-brand-dark active:scale-95 disabled:opacity-40 transition"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )
}