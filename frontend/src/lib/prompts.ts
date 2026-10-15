// "Question of the day": one prompt per day, the same for everyone (picked by date)

export const PROMPTS = [
  "What's the best thing you ate this week?",
  'Hot take: what overrated thing do you secretly dislike?',
  "What song is stuck in your head right now?",
  'Describe your perfect weekend in 15 seconds.',
  "What's one class everyone should take?",
  'Best study spot on campus — go.',
  "What's your most useless talent?",
  'Tell us about a tiny win from today.',
  "What's something you learned this week?",
  'Say hi in a language other than English.',
  "What's the funniest thing that happened to you this month?",
  'If you could add one thing to campus, what would it be?',
  "What's your go-to late-night snack?",
  'Sing (or hum) the first song that comes to mind.',
  "What's a movie you could watch again and again?",
  'Give one piece of advice to first-years.',
  "What's your comfort show?",
  "What's on your bucket list for this year?",
  'Rate your week from 1 to 10 and tell us why.',
  "What's the best compliment you've ever gotten?",
  'Describe your hometown in three words.',
  "What's a weird food combo you love?",
  'Who would play you in a movie?',
  "What's one thing you're looking forward to?",
  'Morning person or night owl? Defend it.',
  "What's the last thing that made you laugh out loud?",
  'Recommend a podcast, song or book.',
  "What's your dream job as a kid vs now?",
  'Unpopular opinion about dining hall food?',
  'What would your walk-up song be?',
]

export function promptForDate(date = new Date()): string {
  // Days since 2026-01-01 in the user's own time zone
  const start = new Date(2026, 0, 1)
  const day = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - start.getTime()) / 86400000)
  return PROMPTS[((day % PROMPTS.length) + PROMPTS.length) % PROMPTS.length]
}
