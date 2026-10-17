import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import StreakBean from './StreakBean'
import { useMyStreak } from '../hooks/useMyStreak'
import { MILESTONES, needsNudge, nextMilestone } from '../lib/streaks'

const CELEBRATED_KEY = 'tonal-streak-celebrated'

function celebrated(): number[] {
  try {
    return JSON.parse(localStorage.getItem(CELEBRATED_KEY) ?? '[]')
  } catch {
    return []
  }
}

// Home: your streak bean, progress to the next reward, and an evening nudge
export default function StreakCard() {
  const { streak } = useMyStreak()
  const [party, setParty] = useState<number | null>(null)

  // Just reached a milestone? Celebrate once.
  useEffect(() => {
    if (!streak?.todayDone) return
    const hit = MILESTONES.find((m) => m.days === streak.current)
    if (hit && !celebrated().includes(hit.days)) {
      setParty(hit.days)
      try {
        localStorage.setItem(CELEBRATED_KEY, JSON.stringify([...celebrated(), hit.days]))
      } catch {
        // can't remember: it may celebrate again, that's fine
      }
    }
  }, [streak?.current, streak?.todayDone])

  if (!streak) return null
  const next = nextMilestone(streak.current)
  const nudge = needsNudge(streak.current, streak.todayDone)
  const reward = party ? MILESTONES.find((m) => m.days === party) : null

  return (
    <>
      <Link
        to="/streak"
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition active:scale-[0.99] ${
          nudge ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : 'border-line bg-card'
        }`}
      >
        <StreakBean days={streak.current} size={52} worried={!streak.todayDone && streak.current > 0} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">
            {streak.current > 0 ? `${streak.current}-day streak` : 'Start a streak'}
            {streak.freezes > 0 && (
              <span className="ml-2 text-xs font-medium text-sky-500" title="Streak Freezes: save your streak if you miss a day">
                🧊×{streak.freezes}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted">
            {nudge
              ? `Your streak ends at midnight. Post anything to keep it!`
              : streak.todayDone
                ? 'Posted today ✓ Come back tomorrow'
                : streak.current > 0
                  ? 'Post anything today to keep it going'
                  : 'Post anything today — a voice, photo, clip, story or Line Check'}
          </p>
          {next && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(next.progress * 100)}%` }} />
              </div>
              <span className="shrink-0 text-[11px] text-muted">
                {next.remaining} to {next.target} 🎁
              </span>
            </div>
          )}
        </div>
      </Link>

      {reward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setParty(null)}>
          <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-3xl bg-card p-6 text-center shadow-2xl animate-fade-up">
            <StreakBean days={reward.days} size={140} bounce />
            <p className="text-2xl font-extrabold text-ink">{reward.days}-day streak!</p>
            <p className="text-sm text-muted">You unlocked:</p>
            <p className="font-semibold text-ink">{reward.reward}</p>
            <button onClick={() => setParty(null)} className="mt-2 rounded-full bg-brand px-6 py-2 font-bold text-white">
              Yay! 🎉
            </button>
          </div>
        </div>
      )}
    </>
  )
}
