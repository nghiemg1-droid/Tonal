// Posting streaks: milestones, rewards and how the streak bean looks.
// The streak itself is worked out by the database (my_streak / streak_levels).

export type Mood = 'sleepy' | 'smile' | 'grin' | 'joy'

export type BeanLook = {
  color: string
  mood: Mood
  sparkles: number // little stars around the bean
  armsUp: boolean
  crown: boolean
  label: string
}

// The bean gets more colorful and happier the longer the streak
export function beanLook(days: number): BeanLook {
  if (days >= 100) return { color: '#facc15', mood: 'joy', sparkles: 4, armsUp: true, crown: true, label: 'Legend' }
  if (days >= 50) return { color: '#22d3ee', mood: 'joy', sparkles: 3, armsUp: true, crown: false, label: 'Unstoppable' }
  if (days >= 30) return { color: '#a78bfa', mood: 'joy', sparkles: 2, armsUp: false, crown: false, label: 'On a roll' }
  if (days >= 14) return { color: '#f472b6', mood: 'grin', sparkles: 1, armsUp: false, crown: false, label: 'Glowing' }
  if (days >= 7) return { color: '#fb923c', mood: 'grin', sparkles: 0, armsUp: false, crown: false, label: 'Warmed up' }
  if (days >= 3) return { color: '#fcd34d', mood: 'smile', sparkles: 0, armsUp: false, crown: false, label: 'Getting going' }
  if (days >= 1) return { color: '#fde68a', mood: 'smile', sparkles: 0, armsUp: false, crown: false, label: 'Sprouting' }
  return { color: '#cbd5e1', mood: 'sleepy', sparkles: 0, armsUp: false, crown: false, label: 'Sleepy' }
}

export const MILESTONES: { days: number; reward: string }[] = [
  { days: 3, reward: 'Your streak bean shows on your profile' },
  { days: 7, reward: 'Profile color + the Aurora chat background' },
  { days: 14, reward: 'Animated story ring' },
  { days: 30, reward: '30-day badge + a frame around your photo' },
  { days: 50, reward: 'Pin a post to the top of your profile' },
  { days: 100, reward: 'Centurion 💯 badge, golden ring & chat background, Hall of Fame' },
]

export function nextMilestone(days: number): { target: number; remaining: number; progress: number } | null {
  const i = MILESTONES.findIndex((m) => m.days > days)
  if (i === -1) return null
  const prev = i === 0 ? 0 : MILESTONES[i - 1].days
  const target = MILESTONES[i].days
  return { target, remaining: target - days, progress: (days - prev) / (target - prev) }
}

// What your BEST streak has unlocked (rewards stay once earned)
export function unlocks(best: number) {
  return {
    accent: best >= 7,
    aurora: best >= 7,
    animatedRing: best >= 14,
    frame: best >= 30,
    pin: best >= 50,
    centurion: best >= 100,
  }
}

export type RingTier = 'none' | 'animated' | 'gold'

export function ringTier(best: number | null | undefined): RingTier {
  if (!best) return 'none'
  if (best >= 100) return 'gold'
  if (best >= 14) return 'animated'
  return 'none'
}

export const ACCENTS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#818cf8', '#e879f9']

// Evening nudge: after 6 PM Ohio time, if you haven't posted today
export function needsNudge(current: number, todayDone: boolean, now = new Date()): boolean {
  if (todayDone || current === 0) return false
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(now))
  return hour >= 18
}
