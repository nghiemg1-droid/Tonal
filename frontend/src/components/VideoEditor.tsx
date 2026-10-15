import { useRef, useState } from 'react'
import { useEditedVideo } from '../hooks/useEditedVideo'
import {
  editedSeconds,
  filterCss,
  FILTERS,
  formatSeconds,
  MAX_CLIP_SECONDS,
  MIN_CLIP_SECONDS,
  SPEEDS,
  TEXT_COLORS,
  TEXT_MAX,
} from '../lib/videoEdit'
import type { VideoEdit } from '../lib/videoEdit'
import type { Track } from '../lib/music'
import { VideoTextOverlay } from './VideoPlayer'
import MusicPicker from './MusicPicker'
import MusicCredit from './MusicCredit'

type Tool = 'trim' | 'filter' | 'text' | 'sound' | 'speed'

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'trim', label: '✂️ Trim' },
  { id: 'filter', label: '🎨 Filter' },
  { id: 'text', label: 'Aa Text' },
  { id: 'sound', label: '🎵 Sound' },
  { id: 'speed', label: '⏩ Speed' },
]

type Props = {
  src: string
  edit: VideoEdit
  onChange: (edit: VideoEdit) => void
  music: Track | null
  onMusicChange: (track: Track | null) => void
  // Length of the original video in seconds (once the browser has read it)
  onDuration: (seconds: number) => void
}

// Simple editor for a short video: everything is previewed live, nothing is re-encoded
export default function VideoEditor({ src, edit, onChange, music, onMusicChange, onDuration }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const musicRef = useRef<HTMLAudioElement>(null)
  const [tool, setTool] = useState<Tool>('trim')
  const [duration, setDuration] = useState(0)
  const [paused, setPaused] = useState(true)
  const [thumb, setThumb] = useState<string | null>(null)
  const [pickingMusic, setPickingMusic] = useState(false)
  useEditedVideo(videoRef, musicRef, edit)

  const end = edit.end ?? duration
  const length = editedSeconds(edit, duration)
  const tooLong = length > MAX_CLIP_SECONDS + 0.05

  function set(patch: Partial<VideoEdit>) {
    onChange({ ...edit, ...patch })
  }

  function seek(seconds: number) {
    const video = videoRef.current
    if (video) video.currentTime = seconds
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  // A small frame of the video for the filter buttons
  function makeThumb() {
    const video = videoRef.current
    if (!video || thumb || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = Math.round((96 * video.videoHeight) / video.videoWidth)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      setThumb(canvas.toDataURL('image/jpeg', 0.7))
    } catch {
      // some formats can't be drawn; the buttons just show names
    }
  }

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-sm transition ${active ? 'bg-brand font-medium text-white' : 'bg-page text-ink hover:bg-line'}`

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Live preview */}
      <div
        className="relative mx-auto aspect-[9/16] max-h-[60vh] w-full max-w-[300px] overflow-hidden rounded-xl bg-black"
        style={{ containerType: 'inline-size' }}
      >
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="auto"
          muted={edit.volume === 0}
          onLoadedMetadata={(e) => {
            const seconds = e.currentTarget.duration
            if (Number.isFinite(seconds)) {
              setDuration(seconds)
              onDuration(seconds)
            }
          }}
          onLoadedData={makeThumb}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onClick={togglePlay}
          style={{ filter: filterCss(edit.filter) }}
          className="h-full w-full object-cover"
        />
        {music && <audio ref={musicRef} src={music.url} loop preload="auto" />}
        <VideoTextOverlay text={edit.text} />
        {paused && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play preview"
            className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-xl text-white"
          >
            ▶
          </button>
        )}
        <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs font-medium text-white ${tooLong ? 'bg-red-500' : 'bg-black/50'}`}>
          {formatSeconds(length)}
        </span>
      </div>

      {/* Tools */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTool(t.id)} className={chip(tool === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-page p-3 text-sm text-ink">
        {tool === 'trim' && duration > 0 && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <span className="w-10 text-muted">Start</span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={edit.start}
                onChange={(e) => {
                  const start = Math.min(Number(e.target.value), end - MIN_CLIP_SECONDS)
                  set({ start: Math.max(0, start) })
                  seek(Math.max(0, start))
                }}
                className="flex-1 accent-brand"
              />
              <span className="w-10 text-right tabular-nums">{formatSeconds(edit.start)}</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-10 text-muted">End</span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={end}
                onChange={(e) => {
                  const value = Math.max(Number(e.target.value), edit.start + MIN_CLIP_SECONDS)
                  set({ end: value >= duration - 0.05 ? null : Math.min(value, duration) })
                  seek(Math.max(edit.start, Math.min(value, duration) - 1))
                }}
                className="flex-1 accent-brand"
              />
              <span className="w-10 text-right tabular-nums">{formatSeconds(end)}</span>
            </label>
            <p className={tooLong ? 'text-red-500' : 'text-muted'}>
              Clip length {formatSeconds(length)} {tooLong ? `— trim it to ${formatSeconds(MAX_CLIP_SECONDS)} or less` : `(max ${formatSeconds(MAX_CLIP_SECONDS)})`}
            </p>
          </div>
        )}

        {tool === 'filter' && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => set({ filter: f.id })}
                className={`flex shrink-0 flex-col items-center gap-1 rounded-lg p-1 ${edit.filter === f.id ? 'ring-2 ring-brand' : ''}`}
              >
                {thumb ? (
                  <img src={thumb} alt="" className="h-16 w-12 rounded-md object-cover" style={{ filter: f.css }} />
                ) : (
                  <span className="h-16 w-12 rounded-md bg-line" />
                )}
                <span className="text-xs">{f.label}</span>
              </button>
            ))}
          </div>
        )}

        {tool === 'text' && (
          <div className="flex flex-col gap-2">
            <input
              value={edit.text?.value ?? ''}
              onChange={(e) =>
                set({
                  text: e.target.value
                    ? { value: e.target.value.slice(0, TEXT_MAX), color: edit.text?.color ?? '#ffffff', y: edit.text?.y ?? 0.5 }
                    : null,
                })
              }
              maxLength={TEXT_MAX}
              placeholder="Write on your video…"
              className="rounded-lg border border-line bg-card px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
            />
            {edit.text && (
              <>
                <div className="flex gap-2">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Text color ${color}`}
                      onClick={() => set({ text: { ...edit.text!, color } })}
                      className={`h-7 w-7 rounded-full border-2 ${edit.text?.color === color ? 'border-brand' : 'border-line'}`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-muted">Top</span>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.01}
                    value={edit.text.y}
                    onChange={(e) => set({ text: { ...edit.text!, y: Number(e.target.value) } })}
                    className="flex-1 accent-brand"
                  />
                  <span className="text-muted">Bottom</span>
                </label>
              </>
            )}
          </div>
        )}

        {tool === 'sound' && (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2">
              <span className="w-24 text-muted">Video sound</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={edit.volume}
                onChange={(e) => set({ volume: Number(e.target.value) })}
                className="flex-1 accent-brand"
              />
              <span className="w-10 text-right tabular-nums">{Math.round(edit.volume * 100)}%</span>
            </label>

            {music ? (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <MusicCredit track={music} compact />
                  </div>
                  <button type="button" onClick={() => setPickingMusic(true)} className="font-medium text-brand">
                    Change
                  </button>
                  <button type="button" onClick={() => onMusicChange(null)} className="text-muted" aria-label="Remove music">
                    ✕
                  </button>
                </div>
                <label className="flex items-center gap-2">
                  <span className="w-24 text-muted">Music</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={edit.musicVolume}
                    onChange={(e) => set({ musicVolume: Number(e.target.value) })}
                    className="flex-1 accent-brand"
                  />
                  <span className="w-10 text-right tabular-nums">{Math.round(edit.musicVolume * 100)}%</span>
                </label>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setPickingMusic(true)}
                className="rounded-full border border-line bg-card py-2 font-medium text-ink hover:bg-line"
              >
                🎵 Add free music
              </button>
            )}
            <p className="text-xs text-muted">Music comes from open-license libraries, with the artist credited on your clip.</p>
          </div>
        )}

        {tool === 'speed' && (
          <div className="flex gap-2">
            {SPEEDS.map((s) => (
              <button key={s} type="button" onClick={() => set({ speed: s })} className={`flex-1 ${chip(edit.speed === s)}`}>
                {s}x
              </button>
            ))}
          </div>
        )}
      </div>

      {pickingMusic && (
        <MusicPicker
          onSelect={(track) => {
            onMusicChange(track)
            setPickingMusic(false)
          }}
          onClose={() => setPickingMusic(false)}
        />
      )}
    </div>
  )
}
