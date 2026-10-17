import { useCallback, useEffect, useRef, useState } from 'react'
import { cameraErrorMessage, coverRect, pickRecordingType } from '../lib/recorder'

const W = 720 // recorded size (9:16)
const H = 1280
const HOLD_MS = 350 // pressing longer than this = "hold to record"

type Status = 'starting' | 'ready' | 'recording' | 'paused' | 'error'

type Props = {
  maxSeconds?: number
  onDone: (file: File, seconds: number) => void
  onClose: () => void
  onUploadInstead: () => void
}

// Record a clip like on TikTok/Instagram: tap or hold to record, pause between shots,
// flip the camera (even mid-clip), 3-second timer. What you see is what gets recorded.
export default function CameraRecorder({ maxSeconds = 60, onDone, onClose, onUploadInstead }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camVideoRef = useRef<HTMLVideoElement>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const elapsedRef = useRef(0)
  const lastTickRef = useRef(0)
  const pressRef = useRef<{ at: number; started: boolean } | null>(null)
  const typeRef = useRef(pickRecordingType((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)))

  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [status, setStatus] = useState<Status>('starting')
  const [elapsed, setElapsed] = useState(0) // seconds recorded so far
  const [marks, setMarks] = useState<number[]>([]) // where each shot ended
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Camera (video only, so flipping never asks for the microphone again)
  const startCamera = useCallback(async (mode: 'user' | 'environment') => {
    camStreamRef.current?.getTracks().forEach((t) => t.stop())
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    camStreamRef.current = stream
    const video = camVideoRef.current
    if (video) {
      video.srcObject = stream
      await video.play().catch(() => {})
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !typeRef.current) throw new Error('unsupported')
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        await startCamera('user')
        if (!cancelled) setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setError((err as Error).message === 'unsupported' ? "This browser can't record video. You can upload one instead." : cameraErrorMessage(err))
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      camStreamRef.current?.getTracks().forEach((t) => t.stop())
      micStreamRef.current?.getTracks().forEach((t) => t.stop())
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.onstop = null
        recorderRef.current.stop()
      }
    }
  }, [startCamera])

  // Draw the camera onto the canvas (cropped to 9:16, front camera mirrored)
  useEffect(() => {
    let frame = 0
    const draw = () => {
      const canvas = canvasRef.current
      const video = camVideoRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && video && ctx && video.videoWidth) {
        const r = coverRect(video.videoWidth, video.videoHeight, W, H)
        ctx.save()
        if (facing === 'user') {
          ctx.translate(W, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(video, r.x, r.y, r.w, r.h)
        ctx.restore()
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [facing])

  // Count recorded time; stop at the limit
  useEffect(() => {
    if (status !== 'recording') return
    lastTickRef.current = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      elapsedRef.current += (now - lastTickRef.current) / 1000
      lastTickRef.current = now
      setElapsed(elapsedRef.current)
      if (elapsedRef.current >= maxSeconds) finish()
    }, 100)
    return () => window.clearInterval(timer)
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  function record() {
    const type = typeRef.current
    const canvas = canvasRef.current
    if (!type || !canvas || elapsedRef.current >= maxSeconds) return
    if (!recorderRef.current) {
      const captured = typeof canvas.captureStream === 'function' ? canvas.captureStream(30) : camStreamRef.current
      if (!captured) return
      const stream = new MediaStream([...captured.getVideoTracks(), ...(micStreamRef.current?.getAudioTracks() ?? [])])
      const recorder = new MediaRecorder(stream, { mimeType: type.mimeType, videoBitsPerSecond: 4_000_000 })
      chunksRef.current = []
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
      recorder.start(250)
      recorderRef.current = recorder
    } else if (recorderRef.current.state === 'paused') {
      recorderRef.current.resume()
    }
    setStatus('recording')
  }

  function pause() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.pause()
    setMarks((m) => [...m, elapsedRef.current])
    setStatus('paused')
  }

  function finish() {
    const recorder = recorderRef.current
    const type = typeRef.current
    if (!recorder || !type) return
    const seconds = Math.min(elapsedRef.current, maxSeconds)
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: type.base })
      onDone(new File([blob], `tonal-clip-${Date.now()}.${type.ext}`, { type: type.base }), seconds)
    }
    if (recorder.state !== 'inactive') recorder.stop()
  }

  function retake() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    recorderRef.current = null
    chunksRef.current = []
    elapsedRef.current = 0
    setElapsed(0)
    setMarks([])
    setStatus('ready')
  }

  async function flip() {
    const next = facing === 'user' ? 'environment' : 'user'
    try {
      await startCamera(next)
      setFacing(next)
    } catch (err) {
      setError(cameraErrorMessage(err))
    }
  }

  function startTimer() {
    let n = 3
    setCountdown(n)
    const timer = window.setInterval(() => {
      n -= 1
      if (n <= 0) {
        window.clearInterval(timer)
        setCountdown(0)
        record()
      } else setCountdown(n)
    }, 1000)
  }

  // Tap = start/stop, hold = record only while pressing
  function onPressStart() {
    if (countdown) return
    const started = status !== 'recording'
    pressRef.current = { at: Date.now(), started }
    if (started) record()
  }
  function onPressEnd() {
    const press = pressRef.current
    pressRef.current = null
    if (!press) return
    const held = Date.now() - press.at > HOLD_MS
    if (!press.started || held) pause()
  }

  const recording = status === 'recording'
  const hasClip = elapsed > 0
  const left = Math.max(0, Math.ceil(maxSeconds - elapsed))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <video ref={camVideoRef} playsInline muted className="hidden" />
      <div className="relative h-full w-full max-w-[min(100vw,56.25vh)] overflow-hidden bg-black">
        <canvas ref={canvasRef} width={W} height={H} className="h-full w-full object-cover" />

        {/* progress bar with a tick where each shot ended */}
        <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] h-1.5 overflow-hidden rounded-full bg-white/30">
          <div className="h-full bg-brand" style={{ width: `${(elapsed / maxSeconds) * 100}%` }} />
          {marks.map((m, i) => (
            <span key={i} className="absolute top-0 h-full w-0.5 bg-white" style={{ left: `${(m / maxSeconds) * 100}%` }} />
          ))}
        </div>

        <div className="absolute inset-x-3 top-[max(1.75rem,calc(env(safe-area-inset-top)+1rem))] flex items-center justify-between text-white">
          <button onClick={onClose} aria-label="Close camera" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-xl">
            ✕
          </button>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${recording ? 'bg-red-500' : 'bg-black/40'}`}>
            {recording ? '● ' : ''}
            {Math.floor(elapsed)}s / {maxSeconds}s
          </span>
          <div className="flex flex-col gap-2">
            <button onClick={flip} disabled={status === 'error'} aria-label="Flip camera" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-xl">
              🔄
            </button>
            <button onClick={startTimer} disabled={recording || !!countdown || status === 'error'} aria-label="3 second timer" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-sm font-bold">
              3s
            </button>
          </div>
        </div>

        {countdown > 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-9xl font-extrabold text-white drop-shadow-lg">
            {countdown}
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center text-white">
            <span className="text-5xl">📷</span>
            <p>{error}</p>
            <button onClick={onUploadInstead} className="rounded-full bg-white px-5 py-2 font-semibold text-black">
              Upload a video instead
            </button>
          </div>
        )}
        {status === 'starting' && <p className="absolute inset-0 flex items-center justify-center text-white/80">Starting camera…</p>}

        {/* bottom controls */}
        {status !== 'error' && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-around bg-gradient-to-t from-black/60 to-transparent px-6 pt-10 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white">
            <button onClick={hasClip && !recording ? retake : onUploadInstead} className="w-20 text-sm font-semibold">
              {hasClip && !recording ? '↺ Retake' : '📁 Upload'}
            </button>
            <button
              onPointerDown={onPressStart}
              onPointerUp={onPressEnd}
              onPointerLeave={() => pressRef.current && onPressEnd()}
              onContextMenu={(e) => e.preventDefault()}
              disabled={status === 'starting' || left === 0}
              aria-label={recording ? 'Pause recording' : 'Record'}
              className="flex h-20 w-20 touch-none select-none items-center justify-center rounded-full border-4 border-white"
            >
              <span className={`block bg-red-500 transition-all ${recording ? 'h-8 w-8 rounded-md' : 'h-16 w-16 rounded-full'}`} />
            </button>
            <button
              onClick={finish}
              disabled={!hasClip || recording || elapsed < 1}
              className="w-20 rounded-full bg-brand py-2 text-sm font-bold disabled:opacity-0"
            >
              Next ✓
            </button>
          </div>
        )}
        {status === 'ready' && !hasClip && (
          <p className="pointer-events-none absolute inset-x-0 bottom-36 text-center text-sm text-white/90 drop-shadow">Tap to record · hold to record while pressing</p>
        )}
      </div>
    </div>
  )
}
