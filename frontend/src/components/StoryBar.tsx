import { useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'
import StoryEditor from './StoryEditor'
import type { StorySound } from './StoryEditor'
import { trackToColumns } from '../lib/music'
import { audioExtension } from '../lib/messages'
import type { Person, StoryGroup } from './StoryViewer'
import { allSeen } from '../hooks/useStories'
import { ringTier } from '../lib/streaks'

type RingProps = {
  active: boolean
  seen?: boolean
  streakBest?: number | null // long posting streaks get a special ring
  children: ReactNode
}

// Red ring = new story, gray ring = you've seen it all, no ring = no story.
// New stories from people with a 14+ day streak spin in color; 100+ days spin in gold.
export function StoryRing({ active, seen = false, streakBest, children }: RingProps) {
  const tier = active && !seen ? ringTier(streakBest) : 'none'
  if (tier !== 'none') {
    const gradient =
      tier === 'gold'
        ? 'conic-gradient(#fde047, #f59e0b, #fef08a, #f59e0b, #fde047)'
        : 'conic-gradient(#f87171, #fb923c, #facc15, #4ade80, #22d3ee, #a78bfa, #f472b6, #f87171)'
    return (
      <span className="relative block overflow-hidden rounded-full p-[3px]">
        <span className="absolute -inset-1/4 animate-[spin_3s_linear_infinite]" style={{ background: gradient }} />
        <span className="relative block rounded-full border-2 border-page bg-page">{children}</span>
      </span>
    )
  }
  const color = !active ? '' : seen ? 'bg-line' : 'bg-brand'
  return (
    <span className={`block rounded-full p-0.5 ${color}`}>
      <span className="block rounded-full border-2 border-page">{children}</span>
    </span>
  )
}

type Props = {
  userId: string
  me: Person | null
  groups: Map<string, StoryGroup>
  onChanged: () => Promise<void> | void
  onOpen: (group: StoryGroup) => void
}

export default function StoryBar({ userId, me, groups, onChanged, onOpen }: Props) {
  const [editorFile, setEditorFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Picking a photo opens the editor
  function handlePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image')
      return
    }
    setError(null)
    setEditorFile(file)
  }

  // The editor gives back the finished 1080×1920 image
  async function shareStory(blob: Blob, sound: StorySound) {
    const path = `${userId}/${crypto.randomUUID()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`
    const uploaded: string[] = []

    const { error: uploadError } = await supabase.storage
      .from('stories')
      .upload(path, blob, { contentType: blob.type })
    if (uploadError) throw new Error(uploadError.message)
    uploaded.push(path)

    // Optional voice recording
    let audioPath: string | null = null
    if (sound.voice) {
      const type = sound.voice.blob.type.split(';')[0] || 'audio/webm'
      audioPath = `${userId}/${crypto.randomUUID()}.${audioExtension(type)}`
      const { error } = await supabase.storage
        .from('stories')
        .upload(audioPath, sound.voice.blob, { contentType: type })
      if (error) {
        await supabase.storage.from('stories').remove(uploaded)
        throw new Error(error.message)
      }
      uploaded.push(audioPath)
    }

    const { error: insertError } = await supabase.from('stories').insert({
      author_id: userId,
      media_path: path,
      audio_path: audioPath,
      audio_duration_ms: sound.voice?.durationMs ?? null,
      ...trackToColumns(sound.voice ? null : sound.music),
    })
    if (insertError) {
      await supabase.storage.from('stories').remove(uploaded)
      throw new Error(insertError.message)
    }

    setEditorFile(null)
    await onChanged()
  }

  if (!me) return null

  const myName = me.display_name || me.username
  const myGroup = groups.get(userId)
  const others = [...groups.values()].filter((group) => group.person.id !== userId)
  const fileInput = <input type="file" accept="image/*" onChange={handlePick} className="sr-only" />

  return (
    <>
      <div className="flex w-full gap-4 overflow-x-auto pb-2 [scrollbar-width:none]">
        {/* Me */}
        <div className="flex w-16 shrink-0 flex-col items-center gap-1">
          <div className="relative">
            {myGroup ? (
              <button onClick={() => onOpen(myGroup)} aria-label="View your story">
                <StoryRing active streakBest={myGroup.person.streak_best}>
                  <Avatar name={myName} url={me.avatar_url} className="h-14 w-14 text-xl" />
                </StoryRing>
              </button>
            ) : (
              <label className="block cursor-pointer" aria-label="Add to your story">
                <StoryRing active={false}>
                  <Avatar name={myName} url={me.avatar_url} className="h-14 w-14 text-xl" />
                </StoryRing>
                {fileInput}
              </label>
            )}

            {/* The + always adds a new story */}
            <label
              className="absolute right-0 bottom-0 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-2 border-page bg-brand text-xs font-bold text-white active:scale-90 transition"
              aria-label="Add to your story"
            >
              +
              {fileInput}
            </label>
          </div>
          <span className="w-full truncate text-center text-xs text-ink">Your story</span>
        </div>

        {/* People I follow who have a story right now */}
        {others.map((group) => (
          <button
            key={group.person.id}
            onClick={() => onOpen(group)}
            className="flex w-16 shrink-0 flex-col items-center gap-1"
          >
            <StoryRing active seen={allSeen(group)} streakBest={group.person.streak_best}>
              <Avatar
                name={group.person.display_name || group.person.username}
                url={group.person.avatar_url}
                className="h-14 w-14 text-xl"
              />
            </StoryRing>
            <span className={`w-full truncate text-center text-xs ${allSeen(group) ? 'text-muted' : 'text-ink'}`}>
              {group.person.username}
            </span>
          </button>
        ))}
      </div>

      {error && <p className="w-full text-sm text-red-500">{error}</p>}

      {editorFile && (
        <StoryEditor file={editorFile} onCancel={() => setEditorFile(null)} onShare={shareStory} />
      )}
    </>
  )
}