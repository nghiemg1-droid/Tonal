import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { columnsToTrack, searchMusic } from '../lib/music'
import type { MusicColumns, Track } from '../lib/music'
import { playExclusive } from '../lib/playback'

type Props = {
  onSelect: (track: Track) => void
  onClose: () => void
}

// Songs used most on Tonal in the last 2 weeks
async function loadTrending(): Promise<Track[]> {
  const since = new Date(Date.now() - 14 * 86400_000).toISOString()
  const fields = 'music_url, music_title, music_artist, music_license, music_source_url'
  const [posts, stories] = await Promise.all([
    supabase.from('posts').select(fields).not('music_url', 'is', null).gt('created_at', since).limit(500),
    supabase.from('stories').select(fields).not('music_url', 'is', null).limit(500),
  ])
  const rows = [...(posts.data ?? []), ...(stories.data ?? [])] as MusicColumns[]

  const byUrl = new Map<string, { track: Track; uses: number }>()
  for (const row of rows) {
    const track = columnsToTrack(row)
    if (!track) continue
    const entry = byUrl.get(track.url) ?? { track, uses: 0 }
    entry.uses += 1
    byUrl.set(track.url, entry)
  }
  return [...byUrl.values()].sort((a, b) => b.uses - a.uses).slice(0, 15).map((e) => e.track)
}

function formatDuration(ms: number | null) {
  if (!ms) return ''
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const MOODS = ['chill', 'happy', 'lofi', 'piano', 'acoustic', 'electronic', 'cinematic', 'jazz']

export default function MusicPicker({ onSelect, onClose }: Props) {
  const [tab, setTab] = useState<'browse' | 'trending'>('browse')
  const [query, setQuery] = useState('')
  const [tracks, setTracks] = useState<Track[]>([])
  const [trending, setTrending] = useState<Track[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  async function runSearch(q: string) {
    setLoading(true)
    setError(null)
    try {
      setTracks(await searchMusic(q))
    } catch (err) {
      setError((err as Error).message)
    }
    setLoading(false)
  }

  // Start with something to listen to
  useEffect(() => {
    let cancelled = false
    searchMusic('chill')
      .then((list) => {
        if (!cancelled) setTracks(list)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (tab !== 'trending' || trending) return
    loadTrending().then(setTrending)
  }, [tab, trending])

  // Stop the preview when the picker closes
  useEffect(() => {
    const audio = audioRef.current
    return () => audio?.pause()
  }, [])

  function handleSearch(e: FormEvent) {
    e.preventDefault()
    setTab('browse')
    runSearch(query)
  }

  function togglePreview(track: Track) {
    const audio = audioRef.current
    if (!audio) return
    if (previewing === track.url) {
      audio.pause()
      setPreviewing(null)
      return
    }
    audio.src = track.url
    playExclusive(audio).catch(() => setError('Could not play this song'))
    setPreviewing(track.url)
  }

  function choose(track: Track) {
    audioRef.current?.pause()
    onSelect(track)
  }

  const list = tab === 'browse' ? tracks : (trending ?? [])

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] w-full max-w-md flex-col gap-3 rounded-t-2xl bg-card p-4 shadow-xl animate-fade-up sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-ink">Add music</h3>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-muted hover:text-ink">
            ×
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs, moods, genres…"
            className="min-w-0 flex-1 rounded-full bg-page px-4 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button type="submit" className="rounded-full bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark">
            Search
          </button>
        </form>

        <div className="flex gap-1 rounded-full bg-page p-1 text-sm">
          {(['browse', 'trending'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full py-1 transition ${tab === t ? 'bg-card font-medium text-ink shadow-sm' : 'text-muted'}`}
            >
              {t === 'browse' ? 'For you' : '🔥 Trending on Tonal'}
            </button>
          ))}
        </div>

        {tab === 'browse' && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {MOODS.map((mood) => (
              <button
                key={mood}
                onClick={() => {
                  setQuery(mood)
                  runSearch(mood)
                }}
                className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink hover:bg-page"
              >
                {mood}
              </button>
            ))}
          </div>
        )}

        <ul className="-mx-1 flex min-h-40 flex-col overflow-y-auto">
          {loading && <li className="p-3 text-sm text-muted">Searching…</li>}
          {!loading && list.length === 0 && (
            <li className="p-3 text-sm text-muted">
              {tab === 'trending' ? 'No songs used on Tonal yet. Be the first!' : 'No songs found.'}
            </li>
          )}
          {!loading &&
            list.map((track) => (
              <li key={track.url} className="flex items-center gap-3 rounded-xl px-1 py-2 hover:bg-page">
                <button
                  onClick={() => togglePreview(track)}
                  aria-label={previewing === track.url ? 'Pause preview' : 'Play preview'}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"
                >
                  {previewing === track.url ? '❚❚' : '▶'}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{track.title}</p>
                  <p className="truncate text-xs text-muted">
                    {track.artist} · {track.license}
                    {track.durationMs ? ` · ${formatDuration(track.durationMs)}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => choose(track)}
                  className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark"
                >
                  Use
                </button>
              </li>
            ))}
        </ul>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <p className="text-center text-[11px] text-muted">
          Songs are shared under open licenses. Credits are shown with your post.
        </p>
        <audio ref={audioRef} onEnded={() => setPreviewing(null)} />
      </div>
    </div>
  )
}
