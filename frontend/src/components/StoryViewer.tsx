import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/time'
import Avatar from './Avatar'

export type Person = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

export type Story = {
  id: string
  media_path: string
  created_at: string
  seen: boolean
}

export type StoryGroup = {
  person: Person
  stories: Story[]
}

const DURATION = 5000 // each photo shows for 5 seconds

type Props = {
  group: StoryGroup
  isMine: boolean
  onClose: () => void
  onDeleted: () => void
  onSeen?: (storyId: string) => void
}

type Viewer = Person & { viewed_at: string }

export default function StoryViewer({ group, isMine, onClose, onDeleted, onSeen }: Props) {
  // Start at the first story I haven't seen yet (like Instagram)
  const [index, setIndex] = useState(() => {
    const firstUnseen = group.stories.findIndex((s) => !s.seen)
    return firstUnseen === -1 ? 0 : firstUnseen
  })
  const [viewers, setViewers] = useState<Viewer[] | null>(null)
  const [showViewers, setShowViewers] = useState(false)
  const [progress, setProgress] = useState(0) // 0 → 1 for the current photo
  const [paused, setPaused] = useState(false)
  const elapsedRef = useRef(0)
  const pressStartRef = useRef(0)

  const story = group.stories[index]
  const name = group.person.display_name || group.person.username

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
      const p = elapsedRef.current / DURATION
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
    await supabase.storage.from('stories').remove([story.media_path])
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
          src={supabase.storage.from('stories').getPublicUrl(story.media_path).data.publicUrl}
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

        {/* Tap areas: left half = back, right half = next */}
        <button
          aria-label="Previous"
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerLeave={pressEnd}
          onClick={() => tap(-1)}
          className="absolute top-16 bottom-0 left-0 w-1/2"
        />
        <button
          aria-label="Next"
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerLeave={pressEnd}
          onClick={() => tap(1)}
          className="absolute top-16 right-0 bottom-0 w-1/2"
        />

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