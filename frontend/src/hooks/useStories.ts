import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Person, Story, StoryGroup } from '../components/StoryViewer'

const PERSON_FIELDS = 'id, username, display_name, avatar_url'

// Active stories from me and the people I follow, grouped by person
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
      .select(`id, media_path, created_at, author:profiles!stories_author_id_fkey(${PERSON_FIELDS})`)
      .in('author_id', ids)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })

    const rows = (data ?? []) as unknown as (Story & { author: Person })[]
    const map = new Map<string, StoryGroup>()
    for (const { author, ...story } of rows) {
      const group = map.get(author.id) ?? { person: author, stories: [] }
      group.stories.push(story)
      map.set(author.id, group)
    }

    setMe(meRow)
    setGroups(map)
  }, [userId])

  useEffect(() => {
    reload()
  }, [reload])

  return { me, groups, reload }
}