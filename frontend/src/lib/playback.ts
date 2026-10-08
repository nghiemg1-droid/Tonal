// Only one sound plays at a time across the whole app
let current: HTMLMediaElement | null = null

export function playExclusive(media: HTMLMediaElement) {
  if (current && current !== media) current.pause()
  current = media
  return media.play()
}