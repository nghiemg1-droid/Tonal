import { useEffect, useRef, useState } from 'react'
import { playExclusive } from '../lib/playback'

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

type Props = {
  src: string
  durationMs: number
  transcript?: string | null // words of the clip, shown with the CC button
}

const SPEEDS = [1, 1.5, 2]

export default function VoicePlayer({ src, durationMs, transcript }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [showText, setShowText] = useState(false)

  function nextSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  // Stop playing if the post leaves the screen (e.g. changing page)
  useEffect(() => {
    const audio = audioRef.current
    return () => audio?.pause()
  }, [])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) {
      playExclusive(audio).catch(() => setPlaying(false))
    } else {
      audio.pause()
    }
  }

  const progress = Math.min(currentMs / durationMs, 1)

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-page p-3">
    <div className="flex items-center gap-3">
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-dark active:scale-90 transition"
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-brand" style={{ width: `${progress * 100}%` }} />
      </div>

      <span className="w-10 text-right text-sm tabular-nums text-muted">
        {formatTime(playing || currentMs > 0 ? currentMs : durationMs)}
      </span>

      <button
        onClick={nextSpeed}
        aria-label={`Playback speed ${speed}x`}
        className="w-9 shrink-0 rounded-full bg-card py-0.5 text-xs font-semibold text-ink"
      >
        {speed}×
      </button>
      {transcript && (
        <button
          onClick={() => setShowText((v) => !v)}
          aria-label={showText ? 'Hide words' : 'Show words'}
          className={`shrink-0 rounded px-1 text-[10px] font-bold ${showText ? 'bg-ink text-page' : 'border border-muted text-muted'}`}
        >
          CC
        </button>
      )}

      <audio
        ref={audioRef}
        src={src || undefined}
        preload="none"
        onPlay={(e) => {
          e.currentTarget.playbackRate = speed
          setPlaying(true)
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrentMs(0)
        }}
        onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
      />
    </div>
    {showText && transcript && <p className="text-sm text-ink">“{transcript}”</p>}
    </div>
  )
}