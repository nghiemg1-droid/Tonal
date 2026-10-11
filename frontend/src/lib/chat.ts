import { supabase } from './supabase'

export type Person = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

export const PERSON_FIELDS = 'id, username, display_name, avatar_url'

export function personName(person: Person) {
  return person.display_name || person.username
}

// Open (or create) the 1-to-1 chat with someone and return its id
export async function startChat(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_dm', { other_id: otherId })
  if (error) throw error
  return data as string
}

// Find people by username, leaving out the ids in `exclude`
export async function searchPeople(query: string, exclude: string[]): Promise<Person[]> {
  // Usernames only contain a-z, 0-9 and _, so drop everything else
  const clean = query.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!clean) return []

  const { data, error } = await supabase
    .from('profiles')
    .select(PERSON_FIELDS)
    .ilike('username', `%${clean}%`)
    .order('username')
    .limit(15)

  if (error) throw error
  return ((data ?? []) as Person[]).filter((p) => !exclude.includes(p.id))
}
