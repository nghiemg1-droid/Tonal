import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

const SIZE = 600 // the drawing is saved as a 600×600 image
const COLORS = ['#111827', '#f87171', '#3b82f6', '#22c55e', '#f59e0b']

type Point = { x: number; y: number }
type Stroke = { color: string; points: Point[] }

type Props = {
  // Gives the canvas when there is a drawing, or null when it's empty
  onChange: (canvas: HTMLCanvasElement | null) => void
}

export default function DrawingPad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef(false)
  const [color, setColor] = useState(COLORS[0])
  const [strokeCount, setStrokeCount] = useState(0)

  // Paint everything again: white background + every stroke
  function redraw() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 8

    for (const stroke of strokesRef.current) {
      ctx.strokeStyle = stroke.color
      ctx.beginPath()
      stroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      if (stroke.points.length === 1) {
        // a single tap draws a dot
        ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y)
      }
      ctx.stroke()
    }
  }

  useEffect(() => {
    redraw()
  }, [])

  // Convert screen position to canvas position (the canvas is scaled to fit the screen)
  function toPoint(e: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) * SIZE) / rect.width,
      y: ((e.clientY - rect.top) * SIZE) / rect.height,
    }
  }

  function handleDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    strokesRef.current.push({ color, points: [toPoint(e)] })
    redraw()
  }

  function handleMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    strokesRef.current[strokesRef.current.length - 1].points.push(toPoint(e))
    redraw()
  }

  function handleUp() {
    if (!drawingRef.current) return
    drawingRef.current = false
    setStrokeCount(strokesRef.current.length)
    onChange(canvasRef.current)
  }

  function undo() {
    strokesRef.current.pop()
    redraw()
    setStrokeCount(strokesRef.current.length)
    onChange(strokesRef.current.length > 0 ? canvasRef.current : null)
  }

  function clear() {
    strokesRef.current = []
    redraw()
    setStrokeCount(0)
    onChange(null)
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        className="aspect-square w-full cursor-crosshair touch-none rounded-xl border border-line"
      />

      <div className="flex items-center gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            className={`h-7 w-7 rounded-full border-2 transition ${
              color === c ? 'scale-110 border-ink' : 'border-transparent'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}

        <div className="flex-1" />

        <button
          type="button"
          onClick={undo}
          disabled={strokeCount === 0}
          className="rounded-full border border-line px-3 py-1 text-sm text-ink hover:bg-page disabled:opacity-40 transition"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={strokeCount === 0}
          className="rounded-full border border-line px-3 py-1 text-sm text-ink hover:bg-page disabled:opacity-40 transition"
        >
          Clear
        </button>
      </div>
    </div>
  )
}