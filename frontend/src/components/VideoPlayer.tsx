import { useEffect, useRef, useState } from 'react'
import { playExclusive } from '../lib/playback'
import { DEFAULT_EDIT, filterCss } from '../lib/videoEdit'
import type { VideoEdit, VideoText } from '../lib/videoEdit'
import type { Track } from '../lib/music'
import { useEditedVideo } from '../hooks/useEditedVideo'

// Feed videos start muted (browsers only autoplay silent videos); one tap turns sound on for all
let soundOn = false

// Text written on top of a video (size follows the video's width, so it looks the same everywhere)
export function VideoTextOverlay({ text }: { text: VideoText | null }) {
  if (!text) return null
  return (
    <div
      className="pointer-events-none absolute inset-x-[6%] -translate-y-1/2 text-center font-bold break-words whitespace-pre-wrap"
      style={{
        top: `${text.y * 100}%`,
        color: text.color,
        fontSize: '7cqw',
        lineHeight: 1.2,
        textShadow: '0 1px 6px rgba(0,0,0,0.55)',
      }}
    >
      {text.value}
    </div>
  )
}

type Props = {
  src: string
  poster: string
  className?: string
  // Clips page: fill the screen and play with sound if the user already turned it on
  fill?: boolean
  edit?: VideoEdit
  music?: Track | null
}

export default function VideoPlayer({ src, poster, className = '', fill = false, edit = DEFAULT_EDIT, music = null }: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const musicRef = useRef<HTMLAudioElement>(null)
  const [muted, setMuted] = useState(!soundOn)
  const [paused, setPaused] = useState(true)
  useEditedVideo(ref, musicRef, edit)

  // The clip's own sound is off when the creator turned it down to 0 (phones ignore volume)
  const videoMuted = muted || edit.volume === 0

  // Play when at least 60% is on screen, pause when it scrolls away
  useEffect(() => {
    const video = ref.current
    if (!video) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.6) {
          video.muted = !soundOn || video.volume === 0
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
    soundOn = muted // turning sound on (or off) for every video
    setMuted(!soundOn)
    if (soundOn) {
      video.muted = edit.volume === 0
      playExclusive(video).catch(() => {})
      musicRef.current?.play().catch(() => {})
    }
  }

  function togglePlay() {
    const video = ref.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  const hasSound = edit.volume > 0 || !!music

  return (
    <div className={`relative overflow-hidden bg-black ${className}`} style={{ containerType: 'inline-size' }}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        playsInline
        muted={videoMuted}
        preload="metadata"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onClick={togglePlay}
        style={{ filter: filterCss(edit.filter) }}
        className={`h-full w-full ${fill ? 'object-cover' : 'max-h-[70vh] object-contain'}`}
      />
      {music && <audio ref={musicRef} src={music.url} muted={muted} loop preload="none" />}
      <VideoTextOverlay text={edit.text} />
      {paused && (
        <button
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-2xl text-white"
        >
          ▶
        </button>
      )}
      {hasSound && (
        <button
          onClick={toggleSound}
          aria-label={muted ? 'Turn sound on' : 'Mute'}
          className="absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-sm text-white"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      )}
    </div>
  )
}
