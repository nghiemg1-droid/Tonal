import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { encodeCanvas } from '../lib/image'
import { track } from '../lib/analytics'

// The finished card is a 4:5 post (1080 × 1350)
const W = 1080
const H = 1350
const BOX = { x: 100, y: 250, size: 880 }
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const CAPTION = '📍 Guess the spot! First correct answer in the comments gets a shoutout 👇 #GuessTheSpot'

function draw(canvas: HTMLCanvasElement, img: HTMLImageElement | null, zoom: number, cx: number, cy: number, hint: string) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#18161f'
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 92px ${FONT}`
  ctx.fillText('GUESS THE SPOT 📍', W / 2, 130)

  // Zoomed-in part of the photo, in a rounded square
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(BOX.x, BOX.y, BOX.size, BOX.size, 60)
  ctx.clip()
  if (img) {
    const side = Math.min(img.naturalWidth, img.naturalHeight) / zoom
    const sx = Math.min(Math.max(cx * img.naturalWidth - side / 2, 0), img.naturalWidth - side)
    const sy = Math.min(Math.max(cy * img.naturalHeight - side / 2, 0), img.naturalHeight - side)
    ctx.drawImage(img, sx, sy, side, side, BOX.x, BOX.y, BOX.size, BOX.size)
  } else {
    ctx.fillStyle = '#2a2738'
    ctx.fillRect(BOX.x, BOX.y, BOX.size, BOX.size)
  }
  ctx.restore()
  ctx.lineWidth = 12
  ctx.strokeStyle = '#f87171'
  ctx.beginPath()
  ctx.roundRect(BOX.x, BOX.y, BOX.size, BOX.size, 60)
  ctx.stroke()

  ctx.fillStyle = '#fbbf24'
  ctx.font = `800 48px ${FONT}`
  ctx.fillText(hint.trim() ? `Hint: ${hint.trim()}` : 'Only real Denison students know 👀', W / 2, 1200, W - 120)
  ctx.fillStyle = '#c8c8d7'
  ctx.font = `600 38px ${FONT}`
  ctx.fillText('First correct comment gets a shoutout · Tonal', W / 2, 1278, W - 120)
}

// Make a "Guess the Spot" post: zoom into a detail of a campus photo, others guess in the comments
export default function GuessSpotPage({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(3)
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 })
  const [hint, setHint] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, img, zoom, center.x, center.y, hint)
  }, [img, zoom, center, hint])

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Please choose a photo')
    const image = new Image()
    image.src = URL.createObjectURL(file)
    try {
      await image.decode()
    } catch {
      return setError("This photo can't be opened here. Try a JPG or PNG.")
    }
    setError(null)
    setImg(image)
    setCenter({ x: 0.5, y: 0.5 })
  }

  // Drag on the preview to choose which part to zoom into
  function onDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, cx: center.x, cy: center.y }
  }
  function onMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (!drag || !img) return
    const rect = e.currentTarget.getBoundingClientRect()
    const boxPx = (BOX.size / W) * rect.width // size of the photo box on screen
    const visible = 1 / zoom // share of the photo's short side that is visible
    const short = Math.min(img.naturalWidth, img.naturalHeight)
    const dx = ((e.clientX - drag.x) / boxPx) * visible * (short / img.naturalWidth)
    const dy = ((e.clientY - drag.y) / boxPx) * visible * (short / img.naturalHeight)
    setCenter({ x: Math.min(1, Math.max(0, drag.cx - dx)), y: Math.min(1, Math.max(0, drag.cy - dy)) })
  }
  function onUp() {
    dragRef.current = null
  }

  async function post() {
    const canvas = canvasRef.current
    if (!canvas || !img) return
    setPosting(true)
    setError(null)
    let path: string | null = null
    try {
      const blob = await encodeCanvas(canvas)
      path = `${userId}/${crypto.randomUUID()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`
      const { error: upErr } = await supabase.storage.from('posts').upload(path, blob, { contentType: blob.type })
      if (upErr) throw new Error(upErr.message)
      const { data, error: insErr } = await supabase
        .from('posts')
        .insert({ author_id: userId, kind: 'image', media_path: path, caption_kind: 'text', caption_text: CAPTION })
        .select('id')
        .single()
      if (insErr || !data) throw new Error(insErr?.message ?? 'Could not post')
      track('guess_spot_posted', { zoom })
      navigate(`/p/${data.id}`)
    } catch (err) {
      if (path) await supabase.storage.from('posts').remove([path])
      setError(err instanceof Error ? err.message : 'Could not post')
      setPosting(false)
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-line bg-card p-5 shadow-sm animate-fade-up">
      <div>
        <h2 className="text-xl font-bold text-ink">📍 Guess the Spot</h2>
        <p className="text-sm text-muted">Zoom into a tiny detail of a campus spot. People guess in the comments; reply later with the answer!</p>
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={`w-full touch-none rounded-xl ${img ? 'cursor-grab' : ''}`}
      />

      <label className="cursor-pointer rounded-full border border-line py-2 text-center text-sm font-medium text-ink hover:bg-page">
        📷 {img ? 'Choose another photo' : 'Choose or take a photo'}
        <input type="file" accept="image/*" onChange={pick} className="sr-only" />
      </label>

      {img && (
        <>
          <label className="flex items-center gap-3 text-sm text-muted">
            Zoom
            <input
              type="range"
              min={1}
              max={8}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-brand"
            />
          </label>
          <p className="-mt-2 text-xs text-muted">Drag the picture to move. More zoom = harder.</p>
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value.slice(0, 40))}
            placeholder="Hint (optional) — e.g. 'you walk past it every day'"
            className="rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </>
      )}

      <p className="text-xs text-muted">🙏 Pick a public spot. No people's faces, dorm windows or room numbers.</p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        onClick={post}
        disabled={!img || posting}
        className="rounded-full bg-brand py-2.5 font-bold text-white hover:bg-brand-dark active:scale-95 disabled:opacity-40 transition"
      >
        {posting ? 'Posting…' : 'Post the challenge'}
      </button>
    </div>
  )
}
