import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type MyStreak = { current: number; best: number; freezes: number; todayDone: boolean }

// One shared copy for the whole app, refreshed when the app comes back to the front
let cache: MyStreak | null = null
const listeners = new Set<(s: MyStreak) => void>()

export async function refreshMyStreak() {
  const { data } = await supabase.rpc('my_streak')
  const row = (data as { current_streak: number; best_streak: number; freezes: number; today_done: boolean }[] | null)?.[0]
  if (!row) return
  cache = { current: row.current_streak, best: row.best_streak, freezes: row.freezes, todayDone: row.today_done }
  listeners.forEach((fn) => fn(cache!))
}

export function useMyStreak() {
  const [streak, setStreak] = useState<MyStreak | null>(cache)
  const refresh = useCallback(() => refreshMyStreak(), [])

  useEffect(() => {
    listeners.add(setStreak)
    refreshMyStreak()
    const onVisible = () => document.visibilityState === 'visible' && refreshMyStreak()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      listeners.delete(setStreak)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return { streak, refresh }
}
