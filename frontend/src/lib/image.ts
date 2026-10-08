function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85))
}

// Prefer WebP; fall back to JPEG on browsers that can't make WebP
async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  let blob = await canvasToBlob(canvas, 'image/webp')
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg')
  }
  if (!blob) throw new Error('Could not process the image')
  return blob
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image')
  return { canvas, ctx }
}

/**
 * Avatar: crop to a centered square and shrink.
 * Drawing onto a canvas also removes EXIF data such as GPS location.
 */
export async function makeAvatar(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const { canvas, ctx } = makeCanvas(size, size)
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close()
  return encodeCanvas(canvas)
}

/**
 * Post photo: keep the shape, shrink so the longest side is at most maxSide.
 * Also removes EXIF data such as GPS location.
 */
export async function makePostImage(file: File, maxSide = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const { canvas, ctx } = makeCanvas(width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return encodeCanvas(canvas)
}