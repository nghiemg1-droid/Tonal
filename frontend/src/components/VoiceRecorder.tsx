import { useEffect, useRef, useState } from 'react'

const MAX_MS = 60_000

export type Recording = {
  blob: Blob
  durationMs: number
}

type Props = {
  onChange: (recording: Recording | null) => void
}

// Chrome records WebM, iPhone (Safari) records MP4: pick what this browser supports
function pickMimeType() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return options.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function VoiceRecorder({ onChange }: Props) {
  const [status, setStatus] = useState<'idle' | 'recording' | 'done'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const startRef = useRef(0)
  const timerRef = useRef<number | null>(null)

  // Turn off the microphone if the user leaves the page mid-recording
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  // Free the preview audio from memory when it's replaced
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  async function start() {
    setError(null)

    if (typeof MediaRecorder === 'undefined') {
      setError('Your browser cannot record audio.')
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was blocked. Allow it in your browser settings.')
      return
    }

    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop()) // microphone off
      const durationMs = Math.min(Math.max(Date.now() - startRef.current, 1), MAX_MS)
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
      setAudioUrl(URL.createObjectURL(blob))
      setStatus('done')
      onChange({ blob, durationMs })
    }

    recorderRef.current = recorder
    startRef.current = Date.now()
    setElapsed(0)
    recorder.start()
    setStatus('recording')

    timerRef.current = window.setInterval(() => {
      const ms = Date.now() - startRef.current
      setElapsed(ms)
      if (ms >= MAX_MS) stop() // auto-stop at 60 seconds
    }, 200)
  }

  function stop() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state === 'recording') recorder.stop()
  }

  function reset() {
    setAudioUrl(null)
    setElapsed(0)
    setStatus('idle')
    onChange(null)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {status !== 'done' && (
        <>
          <button
            type="button"
            onClick={status === 'recording' ? stop : start}
            aria-label={status === 'recording' ? 'Stop recording' : 'Start recording'}
            className={`flex h-24 w-24 items-center justify-center rounded-full bg-brand text-4xl text-white shadow-lg hover:bg-brand-dark active:scale-95 transition ${
              status === 'recording' ? 'animate-pulse ring-8 ring-brand/30' : ''
            }`}
          >
            {status === 'recording' ? '■' : '🎙️'}
          </button>

          {status === 'recording' ? (
            <div className="flex w-full flex-col items-center gap-2">
              <p className="font-medium tabular-nums text-ink">
                {formatTime(elapsed)} / {formatTime(MAX_MS)}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-brand transition-[width] duration-200"
                  style={{ width: `${Math.min((elapsed / MAX_MS) * 100, 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Tap to record · up to 60 seconds</p>
          )}
        </>
      )}

      {status === 'done' && audioUrl && (
        <div className="flex w-full flex-col items-center gap-3">
          <audio controls src={audioUrl} className="w-full" />
          <p className="text-sm text-muted">Length: {formatTime(elapsed)}</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-ink hover:bg-page active:scale-95 transition"
          >
            Record again
          </button>
        </div>
      )}

      {error && <p className="text-center text-sm text-red-500">{error}</p>}
    </div>
  )
}