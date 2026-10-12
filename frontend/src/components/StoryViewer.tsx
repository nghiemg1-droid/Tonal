import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import Avatar from './Avatar'
import MusicCredit from './MusicCredit'
import { columnsToTrack } from '../lib/music'
import type { MusicColumns } from '../lib/music'
import { playExclusive } from '../lib/playback'
import { startChat } from '../lib/chat'

const QUICK_REACTIONS = ['😂', '😮', '😍', '😢', '👏', '🔥']

export type Person = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

export type Story = Partial<MusicColumns> & {
  id: string
  media_path: string
  created_at: string
  seen: boolean
  audio_path?: string | null
  audio_duration_ms?: number | null
}

export type StoryGroup = {
  person: Person
  stories: Story[]
}

const DURATION = 5000 // a photo story shows for 5 seconds
const MUSIC_DURATION = 15000 // a story with a song plays 15 seconds of it

function storyDuration(story: Story) {
  if (story.audio_path && story.audio_duration_ms) return story.audio_duration_ms
  if (story.music_url) return MUSIC_DURATION
  return DURATION
}

function storyFileUrl(path: string) {
  return supabase.storage.from('stories').getPublicUrl(path).data.publicUrl
}

type Props = {
  group: StoryGroup
  isMine: boolean
  onClose: () => void
  onDeleted: () => void
  onSeen?: (storyId: string) => void
  userId?: string // needed to reply to someone else's story
}

type Viewer = Person & { viewed_at: string }

export default function StoryViewer({ group, isMine, onClose, onDeleted, onSeen, userId }: Props) {
  // Start at the first story I haven't seen yet (like Instagram)
  const [index, setIndex] = useState(() => {
    const firstUnseen = group.stories.findIndex((s) => !s.seen)
    return firstUnseen === -1 ? 0 : firstUnseen
  })
  const [viewers, setViewers] = useState<Viewer[] | null>(null)
  const [showViewers, setShowViewers] = useState(false)
  const [reply, setReply] = useState('')
  const [replyStatus, setReplyStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState(0) // 0 → 1 for the current photo
  const [paused, setPaused] = useState(false)
  const elapsedRef = useRef(0)
  const pressStartRef = useRef(0)

  const story = group.stories[index]
  const name = group.person.display_name || group.person.username
  const audioRef = useRef<HTMLAudioElement>(null)
  const [muted, setMuted] = useState(false)
  const music = story ? columnsToTrack(story) : null
  const soundUrl = story?.audio_path ? storyFileUrl(story.audio_path) : (music?.url ?? null)

  function goTo(next: number) {
    elapsedRef.current = 0
    setProgress(0)
    if (next < 0) return
    if (next >= group.stories.length) {
      onClose()
      return
    }
    setIndex(next)
  }

  // Move the progress bar forward; go to the next photo when it's full
  useEffect(() => {
    if (paused) return
    let frame = 0
    let last = performance.now()

    function tick(now: number) {
      elapsedRef.current += now - last
      last = now
      const p = elapsedRef.current / storyDuration(group.stories[index])
      if (p >= 1) {
        goTo(index + 1)
        return
      }
      setProgress(p)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [paused, index])

  // Mark the story on screen as seen (not my own)
  const storyId = group.stories[index]?.id
  useEffect(() => {
    if (!storyId || isMine) return
    onSeen?.(storyId)
    // viewer_id is filled in by the database (it's always "me")
    // 23505 = already seen before, that's fine
    supabase.from('story_views').insert({ story_id: storyId }).then(() => {})
  }, [storyId, isMine, onSeen])

  // My own story: load who has seen it
  useEffect(() => {
    if (!storyId || !isMine) return
    let cancelled = false
    setViewers(null)
    setShowViewers(false)
    supabase
      .from('story_views')
      .select('viewed_at, viewer:profiles!story_views_viewer_id_fkey(id, username, display_name, avatar_url)')
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data ?? []) as unknown as { viewed_at: string; viewer: Person }[]
        setViewers(rows.map((row) => ({ ...row.viewer, viewed_at: row.viewed_at })))
      })
    return () => {
      cancelled = true
    }
  }, [storyId, isMine])

  // Sound: start from the beginning on each story, follow pause/hold and mute
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !soundUrl) return
    audio.currentTime = 0
  }, [soundUrl, index])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !soundUrl) return
    audio.muted = muted
    if (paused) audio.pause()
    else playExclusive(audio).catch(() => setMuted(true))
  }, [soundUrl, paused, muted, index])

  useEffect(() => {
    const audio = audioRef.current
    return () => audio?.pause()
  }, [])

  // Reply to the story: it arrives in your chat with this person, with the story attached
  async function sendReply(text: string) {
    const body = text.trim()
    if (!body || !userId || !story) return
    try {
      const conversationId = await startChat(group.person.id)
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: userId,
        kind: 'text',
        body,
        story_id: story.id,
      })
      if (error) throw error
      setReply('')
      setReplyStatus('Sent ✓')
    } catch (err) {
      const message = (err as Error).message
      setReplyStatus(message.includes('row-level security') || message.includes("can't message") ? "Can't reply to this story" : message)
    }
    setPaused(false)
    window.setTimeout(() => setReplyStatus(null), 2000)
  }

  // Keyboard: Esc closes, arrows move
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goTo(index + 1)
      if (e.key === 'ArrowLeft') goTo(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index])

  // Hold to pause; a quick tap moves to the previous / next photo
  function pressStart() {
    pressStartRef.current = Date.now()
    setPaused(true)
  }
  function pressEnd() {
    setPaused(false)
  }
  function tap(direction: -1 | 1) {
    if (Date.now() - pressStartRef.current < 250) goTo(index + direction)
  }

  async function handleDelete() {
    setPaused(true)
    if (!window.confirm('Delete this story?')) {
      setPaused(false)
      return
    }
    const { error } = await supabase.from('stories').delete().eq('id', story.id)
    if (error) {
      setPaused(false)
      return
    }
    await supabase.storage
      .from('stories')
      .remove([story.media_path, ...(story.audio_path ? [story.audio_path] : [])])
    onDeleted()
  }

  if (!story) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Story by ${group.person.username}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
    >
      <div className="relative h-full w-full overflow-hidden bg-black sm:aspect-[9/16] sm:h-[85vh] sm:w-auto sm:rounded-2xl">
        <img
          src={storyFileUrl(story.media_path)}
          alt={`Story by ${name}`}
          className="h-full w-full object-contain"
        />

        {/* Progress bars, one per photo */}
        <div className="absolute inset-x-2 top-2 flex gap-1">
          {group.stories.map((s, i) => (
            <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full bg-white"
                style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute inset-x-3 top-5 z-10 flex items-center gap-2 text-white">
          <Avatar name={name} url={group.person.avatar_url} className="h-8 w-8 text-sm" />
          <span className="text-sm font-semibold">{group.person.username}</span>
          <span className="text-sm text-white/70">{timeAgo(story.created_at)}</span>
          <div className="flex-1" />
          {soundUrl && (
            <button
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Turn sound on' : 'Mute'}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 transition"
            >
              {muted ? '🔇' : '🔊'}
            </button>
          )}
          {isMine && (
            <button
              onClick={handleDelete}
              className="rounded-full px-3 py-1 text-sm hover:bg-white/10 transition"
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close story"
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl hover:bg-white/10 transition"
          >
            ✕
          </button>
        </div>

        {/* Song credit (or voice) under the header */}
        {(music || story.audio_path) && (
          <div className="absolute top-16 left-4 z-10 flex max-w-[70%] items-center rounded-full bg-black/40 px-3 py-1">
            {music ? (
              <MusicCredit track={music} compact light />
            ) : (
              <span className="text-xs text-white/90">🎙️ Voice</span>
            )}
          </div>
        )}
        {soundUrl && <audio ref={audioRef} src={soundUrl} loop={!story.audio_path} preload="auto" />}

        {/* Tap areas: left half = back, right half = next */}
        <button
          aria-label="Previous"
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerLeave={pressEnd}
          onClick={() => tap(-1)}
          className={`absolute top-16 left-0 w-1/2 ${isMine ? 'bottom-0' : 'bottom-24'}`}
        />
        <button
          aria-label="Next"
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerLeave={pressEnd}
          onClick={() => tap(1)}
          className={`absolute top-16 right-0 w-1/2 ${isMine ? 'bottom-0' : 'bottom-24'}`}
        />

        {/* Someone else's story: reply or react */}
        {!isMine && userId && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black/60 to-transparent p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {replyStatus ? (
              <p className="text-center text-sm text-white">{replyStatus}</p>
            ) : (
              <div className="flex justify-center gap-3 text-2xl">
                {QUICK_REACTIONS.map((emoji) => (
                  <button key={emoji} onClick={() => sendReply(emoji)} className="transition hover:scale-125 active:scale-90">
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                sendReply(reply)
              }}
              className="flex gap-2"
            >
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onFocus={() => setPaused(true)}
                onBlur={() => !reply && setPaused(false)}
                maxLength={500}
                placeholder={`Reply to ${group.person.username}…`}
                className="min-w-0 flex-1 rounded-full border border-white/60 bg-transparent px-4 py-2 text-sm text-white placeholder:text-white/70 focus:outline-none"
              />
              {reply.trim() && (
                <button type="submit" className="px-2 text-sm font-semibold text-white">
                  Send
                </button>
              )}
            </form>
          </div>
        )}

        {/* My story: "Seen by N" at the bottom */}
        {isMine && viewers && (
          <button
            onClick={() => {
              setShowViewers((v) => !v)
              setPaused((p) => !p)
            }}
            className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-10 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-sm text-white"
          >
            👁 {viewers.length === 0 ? 'No views yet' : `Seen by ${viewers.length}`}
          </button>
        )}

        {isMine && showViewers && viewers && viewers.length > 0 && (
          <div className="absolute inset-x-0 bottom-0 z-20 max-h-[50%] overflow-y-auto rounded-t-2xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-fade-up">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-ink">Seen by {viewers.length}</p>
              <button
                onClick={() => {
                  setShowViewers(false)
                  setPaused(false)
                }}
                aria-label="Close"
                className="text-xl text-muted"
              >
                ×
              </button>
            </div>
            <ul className="flex flex-col gap-3">
              {viewers.map((v) => (
                <li key={v.id} className="flex items-center gap-3">
                  <Avatar name={v.display_name || v.username} url={v.avatar_url} className="h-9 w-9 text-sm" />
                  <span className="flex-1 truncate text-sm text-ink">{v.username}</span>
                  <span className="text-xs text-muted">{timeAgo(v.viewed_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}