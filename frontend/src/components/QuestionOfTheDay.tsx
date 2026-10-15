import { Link } from 'react-router'
import { promptForDate } from '../lib/prompts'

// Home: today's question; answer with a voice post (tagged #qotd)
export default function QuestionOfTheDay() {
  const prompt = promptForDate()
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-brand/15 to-rose-300/15 p-4">
      <span className="text-3xl">💬</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Question of the day</p>
        <p className="font-medium text-ink">{prompt}</p>
        <Link to="/tags/qotd" className="text-xs text-muted hover:underline">
          See answers
        </Link>
      </div>
      <Link
        to={`/new?prompt=${encodeURIComponent(prompt)}`}
        className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
      >
        🎙️ Answer
      </Link>
    </div>
  )
}
