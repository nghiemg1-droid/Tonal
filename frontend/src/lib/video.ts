// Helpers for short videos: checks, length and the poster (still picture)
import { encodeCanvas } from './image.ts'

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024
export const MAX_VIDEO_MS = 60_000 // what viewers see, after trimming
export const MAX_SOURCE_MS = 180_000 // a longer video is OK if you trim it down to 60 s
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

// Returns an error message, or null when the file is OK
export function checkVideoFile(file: { type: string; size: number }): string | null {
  if (!VIDEO_TYPES.includes(file.type)) return 'Please choose an MP4, MOV or WebM video.'
  if (file.size > MAX_VIDEO_BYTES) return 'Videos can be up to 50 MB.'
  return null
}

export function videoExtension(type: string): string {
  if (type === 'video/webm') return 'webm'
  if (type === 'video/quicktime') return 'mov'
  return 'mp4'
}

// Videos recorded in the browser often don't say how long they are (duration = Infinity).
// Jumping far past the end makes the browser work it out.
export function fixInfiniteDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration)) return Promise.resolve(video.duration)
  return new Promise((resolve) => {
    const done = () => {
      if (!Number.isFinite(video.duration)) return
      video.removeEventListener('durationchange', done)
      video.removeEventListener('timeupdate', done)
      const seconds = video.duration
      video.addEventListener('seeked', () => resolve(seconds), { once: true })
      video.currentTime = 0
    }
    video.addEventListener('durationchange', done)
    video.addEventListener('timeupdate', done)
    video.currentTime = 1e101
  })
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.onloadeddata = () => resolve(video)
    video.onerror = () => reject(new Error("This video format can't be played in your browser."))
    video.src = url
  })
}

// Length + a poster image (WebP/JPEG, longest side 720 px), taken at `atSeconds`
// (default: the first half-second)
export async function readVideo(file: File, atSeconds?: number): Promise<{ durationMs: number; poster: Blob }> {
  const url = URL.createObjectURL(file)
  try {
    const video = await loadVideo(url)
    await fixInfiniteDuration(video)
    const durationMs = Math.round(video.duration * 1000)
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Could not read the video length.')

    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve()
      video.currentTime =
        atSeconds === undefined
          ? Math.min(0.5, video.duration / 2)
          : Math.min(atSeconds + 0.3, Math.max(0, video.duration - 0.1))
    })

    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process the video')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const poster = await encodeCanvas(canvas)
    return { durationMs, poster }
  } finally {
    URL.revokeObjectURL(url)
  }
}
