// Remove location (GPS) data from MP4 / MOV videos before upload.
// Phones can save where a video was filmed inside the file's metadata (the "moov" box).
// We don't re-encode anything: we only
//   1. rename location boxes ('©xyz', 'loci') to 'free', which players ignore, and
//   2. turn any ISO 6709 location text (e.g. "+40.0688-082.5186+300.000/") into zeros.
// Only the metadata box is touched, never the video/audio data.

const FREE = [0x66, 0x72, 0x65, 0x65] // 'free'
const LOCATION_BOXES = [
  [0xa9, 0x78, 0x79, 0x7a], // '©xyz'
  [0x6c, 0x6f, 0x63, 0x69], // 'loci'
]
// +DD.DDDD-DDD.DDDD with optional altitude and trailing slash
const ISO6709 = /[+-]\d{2}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?(?:CRS[^/]*)?\/?/g

type Range = { start: number; end: number }

// Top-level boxes named 'moov' (where metadata lives)
function findMoov(bytes: Uint8Array): Range[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Range[] = []
  let pos = 0
  while (pos + 8 <= bytes.length) {
    let size = view.getUint32(pos)
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7])
    let header = 8
    if (size === 1) {
      if (pos + 16 > bytes.length) break
      size = Number(view.getBigUint64(pos + 8))
      header = 16
    } else if (size === 0) {
      size = bytes.length - pos
    }
    if (size < header || pos + size > bytes.length) break
    if (type === 'moov') out.push({ start: pos, end: pos + size })
    pos += size
  }
  return out
}

export function stripLocation(bytes: Uint8Array): { bytes: Uint8Array<ArrayBuffer>; removed: number } {
  const out = new Uint8Array(bytes) // copy; the original stays untouched
  const view = new DataView(out.buffer)
  let removed = 0
  for (const { start, end } of findMoov(out)) {
    // 1. location boxes -> 'free'
    for (let i = start + 8; i + 4 <= end; i++) {
      for (const box of LOCATION_BOXES) {
        if (out[i] === box[0] && out[i + 1] === box[1] && out[i + 2] === box[2] && out[i + 3] === box[3] && i >= 4) {
          const size = view.getUint32(i - 4)
          if (size >= 8 && i - 4 + size <= end) {
            out.set(FREE, i)
            removed++
          }
        }
      }
    }
    // 2. location text -> zeros (same length, so nothing else moves)
    let text = ''
    for (let i = start; i < end; i++) text += String.fromCharCode(out[i])
    for (const match of text.matchAll(ISO6709)) {
      const at = start + (match.index ?? 0)
      for (let k = 0; k < match[0].length; k++) {
        const c = out[at + k]
        if (c >= 0x31 && c <= 0x39) out[at + k] = 0x30 // digits 1-9 -> 0
      }
      removed++
    }
  }
  return { bytes: out, removed }
}

// For uploads: MP4/MOV get cleaned, other formats are returned as they are
export async function stripVideoLocation(file: Blob): Promise<Blob> {
  if (!/video\/(mp4|quicktime)/.test(file.type)) return file
  const { bytes, removed } = stripLocation(new Uint8Array(await file.arrayBuffer()))
  return removed > 0 ? new Blob([bytes], { type: file.type }) : file
}
