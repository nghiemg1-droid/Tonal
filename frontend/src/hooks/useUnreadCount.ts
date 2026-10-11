import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Number of unread notifications, kept up to date in real time
export function useUnreadCount(userId: string) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    // 1. Count what's unread right now
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null)
      .then(({ count }) => {
        if (!cancelled) setCount(count ?? 0)
      })

    // 2. Listen for new ones
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        () => setCount((c) => c + 1),
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId])

  return [count, setCount] as const
}