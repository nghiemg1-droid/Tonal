// Helpers for recording clips with the camera in the browser.

// Best format this browser can record. MP4 first: it plays everywhere (incl. iPhone).
export function pickRecordingType(isSupported: (t: string) => boolean): { mimeType: string; base: 'video/mp4' | 'video/webm'; ext: 'mp4' | 'webm' } | null {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4;codecs=avc1,opus',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  for (const t of candidates) {
    if (isSupported(t)) return t.startsWith('video/mp4') ? { mimeType: t, base: 'video/mp4', ext: 'mp4' } : { mimeType: t, base: 'video/webm', ext: 'webm' }
  }
  return null
}

// Where to draw a camera frame so it fills the canvas (like CSS object-fit: cover)
export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number) {
  const scale = Math.max(dstW / srcW, dstH / srcH)
  const w = srcW * scale
  const h = srcH * scale
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h }
}

export function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Tonal needs your camera and microphone. Allow them in your browser settings, then try again.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return "We couldn't find a camera on this device."
  if (name === 'NotReadableError') return 'Your camera is being used by another app. Close it and try again.'
  return 'The camera could not start. You can upload a video instead.'
}
