import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Person, Story, StoryGroup } from '../components/StoryViewer'

const PERSON_FIELDS = 'id, username, display_name, avatar_url'

// Active stories from me and the people I follow, grouped by person.
// People with stories I haven't seen yet come first.
export function useStories(userId: string) {
  const [me, setMe] = useState<Person | null>(null)
  const [groups, setGroups] = useState<Map<string, StoryGroup>>(new Map())

  const reload = useCallback(async () => {
    const { data: meRow } = await supabase.from('profiles').select(PERSON_FIELDS).eq('id', userId).single()

    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
    const ids = [userId, ...(follows ?? []).map((row) => row.following_id)]

    const { data } = await supabase
      .from('stories')
      .select(
        `id, media_path, created_at, audio_path, audio_duration_ms, music_url, music_title, music_artist, music_license, music_source_url, author:profiles!stories_author_id_fkey(${PERSON_FIELDS})`,
      )
      .in('author_id', ids)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })

    const rows = (data ?? []) as unknown as (Omit<Story, 'seen'> & { author: Person })[]

    // Which of these stories have I already seen?
    const storyIds = rows.map((row) => row.id)
    const { data: views } = storyIds.length
      ? await supabase.from('story_views').select('story_id').eq('viewer_id', userId).in('story_id', storyIds)
      : { data: [] }
    const seenIds = new Set((views ?? []).map((v) => v.story_id as string))

    const byPerson = new Map<string, StoryGroup>()
    for (const { author, ...story } of rows) {
      const group = byPerson.get(author.id) ?? { person: author, stories: [] }
      // my own stories always count as seen
      group.stories.push({ ...story, seen: author.id === userId || seenIds.has(story.id) })
      byPerson.set(author.id, group)
    }

    // Unseen first, then seen (the order inside each part stays the same)
    const sorted = [...byPerson.values()].sort(
      (a, b) => Number(allSeen(a)) - Number(allSeen(b)),
    )

    setMe(meRow)
    setGroups(new Map(sorted.map((group) => [group.person.id, group])))
  }, [userId])

  // Called by the viewer the moment a story is shown
  const markSeen = useCallback((storyId: string) => {
    setGroups((prev) => {
      const next = new Map(prev)
      for (const [id, group] of prev) {
        if (group.stories.some((s) => s.id === storyId && !s.seen)) {
          next.set(id, {
            ...group,
            stories: group.stories.map((s) => (s.id === storyId ? { ...s, seen: true } : s)),
          })
        }
      }
      return next
    })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { me, groups, reload, markSeen }
}

export function allSeen(group: StoryGroup) {
  return group.stories.every((s) => s.seen)
}
