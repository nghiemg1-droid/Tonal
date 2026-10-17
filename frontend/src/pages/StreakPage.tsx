import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import StreakBean from '../components/StreakBean'
import { useMyStreak } from '../hooks/useMyStreak'
import { ACCENTS, MILESTONES, beanLook, nextMilestone, unlocks } from '../lib/streaks'

// Your streak: the bean, rewards, Streak Freezes and settings
export default function StreakPage({ userId }: { userId: string }) {
  const { streak } = useMyStreak()
  const [hide, setHide] = useState(false)
  const [accent, setAccent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('hide_streak, accent')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setHide(data.hide_streak)
        setAccent(data.accent)
      })
  }, [userId])

  async function save(patch: { hide_streak?: boolean; accent?: string | null }) {
    setError(null)
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) setError(error.message)
    return !error
  }

  if (!streak) return <p className="pt-10 text-muted animate-pulse">Loading…</p>
  const look = beanLook(streak.current)
  const next = nextMilestone(streak.current)
  const got = unlocks(streak.best)

  return (
    <div className="flex w-full max-w-sm flex-col gap-5 animate-fade-up">
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-line bg-card p-6 text-center">
        <StreakBean days={streak.current} size={150} worried={!streak.todayDone && streak.current > 0} />
        <p className="text-3xl font-extrabold text-ink">{streak.current}-day streak</p>
        <p className="text-sm text-muted">
          {look.label} · best {streak.best} {streak.best === 1 ? 'day' : 'days'}
        </p>
        <p className="text-sm text-ink">
          {streak.todayDone ? '✓ You posted today' : 'Post anything today: a voice, photo, clip, story or Line Check'}
        </p>
        {next && (
          <p className="text-xs text-muted">
            {next.remaining} more {next.remaining === 1 ? 'day' : 'days'} to your {next.target}-day reward 🎁
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-card p-4">
        <p className="font-semibold text-ink">🧊 Streak Freezes: {streak.freezes} / 2</p>
        <p className="mt-1 text-sm text-muted">
          Every 7 days in a row earns a freeze. If you miss a day, a freeze is used automatically and your streak stays.
          Sick days happen 💛
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-semibold text-ink">Rewards</p>
        {MILESTONES.map((m) => {
          const done = streak.best >= m.days
          return (
            <div key={m.days} className={`flex items-center gap-3 rounded-2xl border p-3 ${done ? 'border-brand/40 bg-brand/5' : 'border-line bg-card opacity-70'}`}>
              <StreakBean days={done ? m.days : 0} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">
                  {m.days} days {done ? '✓' : '🔒'}
                </p>
                <p className="text-xs text-muted">{m.reward}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
        <p className="font-semibold text-ink">Profile color {got.accent ? '' : '🔒 (7 days)'}</p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((c) => (
            <button
              key={c}
              disabled={!got.accent}
              onClick={async () => {
                const value = accent === c ? null : c
                if (await save({ accent: value })) setAccent(value)
              }}
              aria-label={`Profile color ${c}`}
              className={`h-9 w-9 rounded-full border-4 disabled:opacity-40 ${accent === c ? 'border-ink' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
        {got.pin && <p className="text-xs text-muted">📌 To pin a post, open its ••• menu and choose “Pin to profile”.</p>}
        <label className="flex items-center justify-between gap-3 text-sm text-ink">
          Hide my streak from other people
          <input
            type="checkbox"
            checked={hide}
            onChange={async (e) => {
              const value = e.target.checked
              if (await save({ hide_streak: value })) setHide(value)
            }}
            className="h-5 w-5 accent-brand"
          />
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <Link to="/hall" className="rounded-full border border-line bg-card py-2.5 text-center font-semibold text-ink hover:bg-page">
        🏆 Hall of Fame
      </Link>
      <p className="text-center text-xs text-muted">Rewards are just for fun inside Tonal — no prizes or money.</p>
    </div>
  )
}
