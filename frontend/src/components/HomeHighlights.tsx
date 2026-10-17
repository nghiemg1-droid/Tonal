import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { dropState, formatClock } from '../lib/campusDrop'
import type { DropState } from '../lib/campusDrop'
import { statusInfo, summarize } from '../lib/lineCheck'
import type { LineReport } from '../lib/lineCheck'

// Top of Home: today's Campus Drop, live Line Check, and the Guess the Spot game
export default function HomeHighlights() {
  return (
    <div className="flex w-full flex-col gap-2">
      <CampusDropBanner />
      <LineCheckStrip />
    </div>
  )
}

function CampusDropBanner() {
  const [state, setState] = useState<DropState>(() => dropState())

  useEffect(() => {
    const tick = () => setState(dropState())
    const timer = window.setInterval(tick, state.phase === 'live' ? 1000 : 20_000)
    return () => window.clearInterval(timer)
  }, [state.phase])

  if (state.phase === 'live') {
    const m = Math.floor(state.secondsLeft / 60)
    const s = String(state.secondsLeft % 60).padStart(2, '0')
    return (
      <Link
        to="/new?drop=1"
        className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-brand to-orange-400 p-4 text-white shadow-md animate-pulse"
      >
        <span className="text-3xl">⚡</span>
        <div className="flex-1">
          <p className="font-extrabold">CAMPUS DROP IS LIVE</p>
          <p className="text-sm text-white/90">Post what you're doing right now. {m}:{s} left!</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-brand">Post</span>
      </Link>
    )
  }

  return (
    <Link to="/drop" className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3">
      <span className="text-2xl">⚡</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Campus Drop</p>
        <p className="truncate text-xs text-muted">
          {state.phase === 'before'
            ? 'Today, at a surprise time between 10 AM and 9 PM. Be ready 👀'
            : `Today's drop was at ${formatClock(state.window.start)}. See what everyone was doing →`}
        </p>
      </div>
    </Link>
  )
}

function LineCheckStrip() {
  const [reports, setReports] = useState<LineReport[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () =>
      supabase
        .from('line_checks')
        .select('id, place, status, created_at')
        .order('created_at', { ascending: false })
        .limit(100)
        .then(({ data }) => {
          if (!cancelled) setReports((data ?? []) as LineReport[])
        })
    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const summary = summarize(reports)

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <Link to="/line" className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white">
        🍽️ Line Check
      </Link>
      {summary.map((s) => {
        const info = s.status ? statusInfo(s.status) : null
        return (
          <Link key={s.place} to="/line" className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink">
            <span>{info ? info.emoji : '⚪'}</span>
            {s.place}
          </Link>
        )
      })}
      <Link to="/guess" className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold text-ink">
        📍 Guess the Spot
      </Link>
    </div>
  )
}
