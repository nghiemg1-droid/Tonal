function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85))
}

/**
 * Crop the image to a centered square, shrink it, and re-encode it.
 * Drawing onto a canvas also removes EXIF data such as GPS location.
 */
export async function makeAvatar(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image')

  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close()

  // Prefer WebP; fall back to JPEG on browsers that can't make WebP
  let blob = await canvasToBlob(canvas, 'image/webp')
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg')
  }
  if (!blob) throw new Error('Could not process the image')
  return blob
}