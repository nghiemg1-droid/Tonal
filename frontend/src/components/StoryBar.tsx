import { useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'
import StoryEditor from './StoryEditor'
import type { Person, StoryGroup } from './StoryViewer'
import { allSeen } from '../hooks/useStories'

type RingProps = {
  active: boolean
  seen?: boolean
  children: ReactNode
}

// Red ring = new story, gray ring = you've seen it all, no ring = no story
export function StoryRing({ active, seen = false, children }: RingProps) {
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
  async function shareStory(blob: Blob) {
    const path = `${userId}/${crypto.randomUUID()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`

    const { error: uploadError } = await supabase.storage
      .from('stories')
      .upload(path, blob, { contentType: blob.type })
    if (uploadError) throw new Error(uploadError.message)

    const { error: insertError } = await supabase
      .from('stories')
      .insert({ author_id: userId, media_path: path })
    if (insertError) {
      await supabase.storage.from('stories').remove([path])
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
                <StoryRing active>
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
            <StoryRing active seen={allSeen(group)}>
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