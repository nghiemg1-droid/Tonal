import { supabase } from './supabase'

export type ReportTarget = 'user' | 'post' | 'comment' | 'story' | 'message'

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Bullying or harassment' },
  { value: 'hate', label: 'Hate speech or symbols' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'violence', label: 'Violence or dangerous acts' },
  { value: 'self_harm', label: 'Suicide or self-harm' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'other', label: 'Something else' },
] as const

export async function blockUser(userId: string, otherId: string) {
  const { error } = await supabase.from('blocks').insert({ blocker_id: userId, blocked_id: otherId })
  // 23505 = already blocked, that's fine
  if (error && error.code !== '23505') throw error
}

export async function unblockUser(userId: string, otherId: string) {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', userId)
    .eq('blocked_id', otherId)
  if (error) throw error
}

// The ids of everyone I blocked
export async function loadMyBlocks(userId: string): Promise<Set<string>> {
  const { data } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', userId)
  return new Set((data ?? []).map((row) => row.blocked_id as string))
}
