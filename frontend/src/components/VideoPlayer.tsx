import { useEffect, useRef, useState } from 'react'
import { playExclusive } from '../lib/playback'

// Feed videos start muted (browsers only autoplay silent videos); one tap turns sound on for all
let soundOn = false

type Props = {
  src: string
  poster: string
  className?: string
  // Clips page: fill the screen and play with sound if the user already turned it on
  fill?: boolean
}

export default function VideoPlayer({ src, poster, className = '', fill = false }: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(!soundOn)
  const [paused, setPaused] = useState(true)

  // Play when at least 60% is on screen, pause when it scrolls away
  useEffect(() => {
    const video = ref.current
    if (!video) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.6) {
          video.muted = !soundOn
          setMuted(!soundOn)
          const start = soundOn ? playExclusive(video) : video.play()
          start.catch(() => {
            // sound blocked: try again silently
            video.muted = true
            setMuted(true)
            video.play().catch(() => {})
          })
        } else {
          video.pause()
        }
      },
      { threshold: [0, 0.6] },
    )
    observer.observe(video)
    return () => {
      observer.disconnect()
      video.pause()
    }
  }, [])

  function toggleSound() {
    const video = ref.current
    if (!video) return
    soundOn = video.muted // turning sound on (or off) for every video
    video.muted = !soundOn
    setMuted(!soundOn)
    if (soundOn) playExclusive(video).catch(() => {})
  }

  function togglePlay() {
    const video = ref.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        loop
        playsInline
        muted={muted}
        preload="metadata"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onClick={togglePlay}
        className={`h-full w-full ${fill ? 'object-cover' : 'max-h-[70vh] object-contain'}`}
      />
      {paused && (
        <button
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-2xl text-white"
        >
          ▶
        </button>
      )}
      <button
        onClick={toggleSound}
        aria-label={muted ? 'Turn sound on' : 'Mute'}
        className="absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-sm text-white"
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  )
}
