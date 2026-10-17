import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import StreakBean from '../components/StreakBean'

type Row = {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  current_streak: number
  best_streak: number
}

// 100-day Centurions and today's longest streaks (people who hide their streak or have private accounts aren't listed)
export default function HallOfFamePage() {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    supabase.rpc('hall_of_fame').then(({ data }) => setRows((data ?? []) as Row[]))
  }, [])

  const centurions = (rows ?? []).filter((r) => r.best_streak >= 100)
  const top = (rows ?? []).filter((r) => r.current_streak >= 3)

  const item = (r: Row, rank?: number) => (
    <Link key={r.user_id + (rank ?? '')} to={`/u/${r.username}`} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
      {rank !== undefined && <span className="w-6 text-center font-bold text-muted">{rank}</span>}
      <Avatar name={r.display_name || r.username} url={r.avatar_url} className="h-10 w-10 text-base" />
      <span className="min-w-0 flex-1 truncate font-semibold text-ink">{r.username}</span>
      <StreakBean days={r.current_streak} size={34} />
      <span className="w-10 text-right font-bold text-ink">{r.current_streak}</span>
    </Link>
  )

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 animate-fade-up">
      <div>
        <h2 className="text-2xl font-bold text-ink">🏆 Hall of Fame</h2>
        <p className="text-sm text-muted">Post something every day to climb the list.</p>
      </div>
      {rows === null && <p className="text-muted animate-pulse">Loading…</p>}
      {centurions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-ink">💯 Centurions (100+ days)</p>
          {centurions.map((r) => item(r))}
        </div>
      )}
      {rows && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-ink">Longest streaks right now</p>
          {top.length === 0 && <p className="text-sm text-muted">Nobody has a 3-day streak yet. Be the first!</p>}
          {top.map((r, i) => item(r, i + 1))}
        </div>
      )}
    </div>
  )
}
