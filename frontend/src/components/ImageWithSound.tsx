import { useEffect, useRef, useState } from 'react'
import { playExclusive } from '../lib/playback'

// If the user mutes one post, other posts stay quiet too (until they unmute)
let soundOn = true

type Props = {
  imageUrl: string
  audioUrl: string
  alt: string
}

export default function ImageWithSound({ imageUrl, audioUrl, alt }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [blocked, setBlocked] = useState(false) // browser wants a tap before playing sound

  function tryPlay(audio: HTMLAudioElement) {
    playExclusive(audio)
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true))
  }

  // Play when at least 60% of the photo is on screen, pause when it scrolls away
  useEffect(() => {
    const container = containerRef.current
    const audio = audioRef.current
    if (!container || !audio) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.6 && soundOn) tryPlay(audio)
        else audio.pause()
      },
      { threshold: 0.6 },
    )
    observer.observe(container)

    return () => {
      observer.disconnect()
      audio.pause()
    }
  }, [])

  function toggleSound() {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) {
      soundOn = true
      tryPlay(audio)
    } else {
      soundOn = false
      audio.pause()
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <img
        src={imageUrl}
        alt={alt}
        loading="lazy"
        className="max-h-144 w-full rounded-xl bg-page object-cover"
      />

      {blocked && (
        <span className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-xs text-white">
          Tap 🔇 for sound
        </span>
      )}

      <button
        onClick={toggleSound}
        aria-label={playing ? 'Mute' : 'Play sound'}
        className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white active:scale-90 transition"
      >
        {playing ? '🔊' : '🔇'}
      </button>

      <audio
        ref={audioRef}
        src={audioUrl}
        loop
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </div>
  )
}