import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import StreakBean from './StreakBean'

type Level = { current: number; best: number }

export function useStreakLevel(userId: string | undefined) {
  const [level, setLevel] = useState<Level | null>(null)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase.rpc('streak_levels', { uids: [userId] }).then(({ data }) => {
      const row = (data as { current_streak: number; best_streak: number }[] | null)?.[0]
      if (!cancelled) setLevel(row ? { current: row.current_streak, best: row.best_streak } : null)
    })
    return () => {
      cancelled = true
    }
  }, [userId])
  return level
}

// Streak bean + badges on a profile (nothing shows if the person hides their streak)
export default function ProfileStreak({ level, linkToStreak = false }: { level: Level | null; linkToStreak?: boolean }) {
  if (!level || (level.current < 3 && level.best < 30)) return null
  const content = (
    <div className="flex flex-wrap items-center gap-2">
      {level.current >= 3 && (
        <span className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-sm font-semibold text-ink ring-1 ring-line">
          <StreakBean days={level.current} size={22} />
          {level.current}-day streak
        </span>
      )}
      {level.best >= 100 ? (
        <span className="rounded-full bg-yellow-300 px-2.5 py-1 text-sm font-bold text-yellow-950">💯 Centurion</span>
      ) : level.best >= 30 ? (
        <span className="rounded-full bg-violet-200 px-2.5 py-1 text-sm font-bold text-violet-900">🎖️ 30-day club</span>
      ) : null}
    </div>
  )
  return linkToStreak ? <Link to="/streak">{content}</Link> : content
}

// A frame around the profile photo: purple at 30 days, gold at 100
export function AvatarFrame({ best, children }: { best: number | undefined; children: ReactNode }) {
  if (!best || best < 30) return <>{children}</>
  const ring = best >= 100 ? 'conic-gradient(#fde047, #f59e0b, #fde047, #fbbf24, #fde047)' : 'conic-gradient(#a78bfa, #f472b6, #a78bfa)'
  return (
    <span className="block shrink-0 rounded-full p-1" style={{ background: ring }}>
      <span className="block rounded-full border-2 border-page">{children}</span>
    </span>
  )
}
