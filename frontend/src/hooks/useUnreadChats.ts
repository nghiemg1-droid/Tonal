import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Row = {
  last_read_at: string
  conversation: { last_message_at: string | null; last_sender_id: string | null } | null
}

// How many chats have a message I haven't read yet (updates in real time)
export function useUnreadChats(userId: string) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function recount() {
      const { data } = await supabase
        .from('conversation_members')
        .select('last_read_at, conversation:conversations(last_message_at, last_sender_id)')
        .eq('user_id', userId)
      if (cancelled) return
      const rows = (data ?? []) as unknown as Row[]
      setCount(
        rows.filter(
          (r) =>
            r.conversation?.last_message_at &&
            r.conversation.last_sender_id !== userId &&
            new Date(r.conversation.last_message_at).getTime() > new Date(r.last_read_at).getTime(),
        ).length,
      )
    }
    recount()

    // A new message somewhere, or I read a chat -> count again
    const channel = supabase
      .channel(`unread-chats:${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => recount())
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${userId}` },
        () => recount(),
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId])

  return count
}
