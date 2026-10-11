import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import { encodeCanvas } from '../lib/image'

// The finished story is a 1080×1920 image (9:16, like a phone screen)
const W = 1080
const H = 1920

// Sizes as a share of the story width, so the preview and the final image match
const TEXT_SIZE = 0.07
const STICKER_SIZE = 0.18
const IMAGE_SIZE = 0.45
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const TEXT_MAX = 200

const TEXT_COLORS = ['#ffffff', '#111827', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc']
const STICKERS = [
  '😀', '😂', '🥰', '😎', '🤩', '😭', '🥳',
  '😴', '🔥', '✨', '💯', '❤️', '💔', '👍',
  '👏', '🙏', '🎉', '🎵', '🎧', '🌈', '☀️',
  '🌙', '⭐', '🍕', '☕', '🌸', '📸', '🏀',
]

type Base = { id: string; x: number; y: number; scale: number } // x, y = center, from 0 to 1
type TextLayer = Base & { type: 'text'; text: string; color: string }
type StickerLayer = Base & { type: 'sticker'; emoji: string }
type ImageLayer = Base & { type: 'image'; src: string; img: HTMLImageElement }
type Layer = TextLayer | StickerLayer | ImageLayer

type Drag = {
  id: string
  startX: number
  startY: number
  layerX: number
  layerY: number
  moved: boolean
  wasSelected: boolean
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value))
}

async function loadImage(src: string) {
  const img = new Image()
  img.src = src
  await img.decode()
  return img
}

function newBase(): Base {
  return { id: crypto.randomUUID(), x: 0.5, y: 0.5, scale: 1 }
}

// Draw the background and every layer onto one 1080×1920 image
async function renderStory(background: ImageBitmap, layers: Layer[]): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create the story')

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)

  // Background fills the whole story (like object-cover)
  const fit = Math.max(W / background.width, H / background.height)
  const bw = background.width * fit
  const bh = background.height * fit
  ctx.drawImage(background, (W - bw) / 2, (H - bh) / 2, bw, bh)

  for (const layer of layers) {
    const cx = layer.x * W
    const cy = layer.y * H

    if (layer.type === 'image') {
      const w = W * IMAGE_SIZE * layer.scale
      const h = (w * layer.img.naturalHeight) / layer.img.naturalWidth
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(cx - w / 2, cy - h / 2, w, h, w * 0.06)
      ctx.clip()
      ctx.drawImage(layer.img, cx - w / 2, cy - h / 2, w, h)
      ctx.restore()
      continue
    }

    const size = W * (layer.type === 'text' ? TEXT_SIZE : STICKER_SIZE) * layer.scale
    const lines = (layer.type === 'text' ? layer.text : layer.emoji).split('\n')
    const lineHeight = size * 1.2

    ctx.save()
    ctx.font = `700 ${size}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (layer.type === 'text') {
      ctx.fillStyle = layer.color
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
      ctx.shadowBlur = size * 0.15
    }
    lines.forEach((line, i) => {
      ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * lineHeight)
    })
    ctx.restore()
  }

  return encodeCanvas(canvas)
}

type Props = {
  file: File
  onCancel: () => void
  onShare: (blob: Blob) => Promise<void>
}

export default function StoryEditor({ file, onCancel, onShare }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const urlsRef = useRef<string[]>([])
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showStickers, setShowStickers] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track the preview size so layers scale with the screen
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Make a preview link for the background (a fresh one each time the effect runs)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setBgUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Free the extra photos from memory when the editor closes
  useEffect(() => {
    const urls = urlsRef.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const selected = layers.find((layer) => layer.id === selectedId) ?? null
  const editing = layers.find(
    (layer): layer is TextLayer => layer.id === editingId && layer.type === 'text',
  )

  function update(id: string, changes: Partial<Base & { text: string; color: string }>) {
    setLayers((prev) => prev.map((layer) => (layer.id === id ? ({ ...layer, ...changes } as Layer) : layer)))
  }

  function add(layer: Layer) {
    setLayers((prev) => [...prev, layer])
    setSelectedId(layer.id)
  }

  function remove(id: string) {
    setLayers((prev) => prev.filter((layer) => layer.id !== id))
    setSelectedId((current) => (current === id ? null : current))
  }

  function addText() {
    const layer: TextLayer = { ...newBase(), type: 'text', text: '', color: '#ffffff' }
    add(layer)
    setEditingId(layer.id)
    setShowStickers(false)
  }

  function addSticker(emoji: string) {
    add({ ...newBase(), y: 0.4, type: 'sticker', emoji })
    setShowStickers(false)
  }

  async function addImages(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const [i, picked] of files.entries()) {
      if (!picked.type.startsWith('image/')) continue
      const src = URL.createObjectURL(picked)
      urlsRef.current.push(src)
      try {
        const img = await loadImage(src)
        // Spread several photos out a little so they don't sit exactly on top of each other
        add({ ...newBase(), x: 0.45 + i * 0.05, y: 0.45 + i * 0.05, type: 'image', src, img })
      } catch {
        setError('Could not open one of the photos. Try a JPG or PNG.')
      }
    }
  }

  function finishEditing() {
    if (editing && !editing.text.trim()) remove(editing.id)
    setEditingId(null)
  }

  function resize(factor: number) {
    if (!selected) return
    update(selected.id, { scale: Math.min(4, Math.max(0.3, selected.scale * factor)) })
  }

  // ---------- Dragging ----------
  function handleDown(e: ReactPointerEvent<HTMLDivElement>, layer: Layer) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      id: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      layerX: layer.x,
      layerY: layer.y,
      moved: false,
      wasSelected: selectedId === layer.id,
    }
    setSelectedId(layer.id)
    setShowStickers(false)
  }

  function handleMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || box.w === 0) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
    update(drag.id, { x: clamp(drag.layerX + dx / box.w), y: clamp(drag.layerY + dy / box.h) })
  }

  function handleUp(layer: Layer) {
    const drag = dragRef.current
    dragRef.current = null
    // Tapping text that's already selected opens it for editing
    if (drag && !drag.moved && drag.wasSelected && layer.type === 'text') setEditingId(layer.id)
  }

  async function share() {
    setSharing(true)
    setError(null)
    setSelectedId(null)

    let background: ImageBitmap
    try {
      // Read the photo straight from the file, not from the preview link
      background = await createImageBitmap(file)
    } catch {
      setError("This photo format isn't supported here. Try a JPG or PNG.")
      setSharing(false)
      return
    }

    try {
      const visible = layers.filter((layer) => layer.type !== 'text' || layer.text.trim())
      await onShare(await renderStory(background, visible))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share your story')
      setSharing(false)
    } finally {
      background.close()
    }
  }

  const roundButton =
    'flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-lg text-white active:scale-90 transition'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create a story"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
    >
      <div
        ref={boxRef}
        onPointerDown={() => {
          setSelectedId(null)
          setShowStickers(false)
        }}
        className="relative aspect-9/16 w-full max-w-[calc(90vh*9/16)] overflow-hidden bg-black sm:rounded-2xl"
      >
        {bgUrl && (
          <img
            src={bgUrl}
            alt="Story background"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* Layers */}
        {layers.map((layer) => {
          const isSelected = layer.id === selectedId
          const textSize = box.w * TEXT_SIZE * layer.scale
          return (
            <div
              key={layer.id}
              onPointerDown={(e) => handleDown(e, layer)}
              onPointerMove={handleMove}
              onPointerUp={() => handleUp(layer)}
              onPointerCancel={() => handleUp(layer)}
              className={`absolute cursor-move touch-none select-none rounded-lg ${
                isSelected ? 'ring-2 ring-white/80' : ''
              }`}
              style={{ left: `${layer.x * 100}%`, top: `${layer.y * 100}%`, transform: 'translate(-50%, -50%)' }}
            >
              {layer.type === 'text' && (
                <div
                  style={{
                    fontSize: textSize,
                    lineHeight: 1.2,
                    color: layer.color,
                    fontWeight: 700,
                    fontFamily: FONT,
                    whiteSpace: 'pre',
                    textAlign: 'center',
                    textShadow: `0 0 ${textSize * 0.15}px rgba(0, 0, 0, 0.45)`,
                  }}
                >
                  {layer.text || ' '}
                </div>
              )}
              {layer.type === 'sticker' && (
                <div style={{ fontSize: box.w * STICKER_SIZE * layer.scale, lineHeight: 1.2 }}>
                  {layer.emoji}
                </div>
              )}
              {layer.type === 'image' && (
                <img
                  src={layer.src}
                  alt=""
                  draggable={false}
                  style={{
                    width: box.w * IMAGE_SIZE * layer.scale,
                    borderRadius: box.w * IMAGE_SIZE * layer.scale * 0.06,
                  }}
                />
              )}
            </div>
          )
        })}

        {/* Top toolbar */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 p-3"
        >
          <button onClick={onCancel} aria-label="Cancel" className={roundButton}>
            ✕
          </button>
          <div className="flex-1" />
          <button onClick={addText} aria-label="Add text" className={`${roundButton} font-bold`}>
            Aa
          </button>
          <button
            onClick={() => setShowStickers((open) => !open)}
            aria-label="Add sticker"
            className={roundButton}
          >
            😊
          </button>
          <label aria-label="Add photos" className={`${roundButton} cursor-pointer`}>
            🖼️
            <input type="file" accept="image/*" multiple onChange={addImages} className="sr-only" />
          </label>
        </div>

        {/* Sticker picker */}
        {showStickers && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute inset-x-3 top-16 z-10 grid grid-cols-7 gap-2 rounded-2xl bg-black/75 p-3 text-3xl animate-fade-up"
          >
            {STICKERS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => addSticker(emoji)}
                className="rounded-lg p-1 hover:bg-white/10 active:scale-90 transition"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Controls for the selected layer */}
        {selected && !editing && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-20 z-10 flex flex-col items-center gap-2"
          >
            {selected.type === 'text' && (
              <div className="flex gap-2 rounded-full bg-black/50 p-2">
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => update(selected.id, { color })}
                    aria-label={`Text color ${color}`}
                    className={`h-6 w-6 rounded-full border-2 ${
                      selected.color === color ? 'border-white' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => resize(1 / 1.15)} aria-label="Make smaller" className={roundButton}>
                −
              </button>
              <button onClick={() => resize(1.15)} aria-label="Make bigger" className={roundButton}>
                ＋
              </button>
              <button onClick={() => remove(selected.id)} aria-label="Delete" className={roundButton}>
                🗑
              </button>
            </div>
          </div>
        )}

        {/* Share */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-end gap-3 p-4"
        >
          {error && <p className="flex-1 text-sm text-red-300">{error}</p>}
          <button
            onClick={share}
            disabled={sharing}
            className="rounded-full bg-white px-5 py-2 font-semibold text-black active:scale-95 disabled:opacity-50 transition"
          >
            {sharing ? 'Sharing...' : 'Share'}
          </button>
        </div>

        {/* Typing text */}
        {editing && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/60 p-6"
          >
            <textarea
              autoFocus
              value={editing.text}
              onChange={(e) => update(editing.id, { text: e.target.value })}
              maxLength={TEXT_MAX}
              rows={3}
              placeholder="Type something..."
              className="w-full resize-none bg-transparent text-center text-3xl font-bold placeholder:text-white/50 focus:outline-none"
              style={{ color: editing.color, fontFamily: FONT }}
            />
            <div className="flex gap-2">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => update(editing.id, { color })}
                  aria-label={`Text color ${color}`}
                  className={`h-7 w-7 rounded-full border-2 ${
                    editing.color === color ? 'border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <button
              onClick={finishEditing}
              className="rounded-full bg-white px-6 py-2 font-semibold text-black active:scale-95 transition"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}