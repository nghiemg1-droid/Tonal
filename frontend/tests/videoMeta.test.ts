import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { stripLocation } from '../src/lib/videoMeta.ts'

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length)
  new DataView(out.buffer).setUint32(0, out.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(payload, 8)
  return out
}
const text = (s: string) => new TextEncoder().encode(s)
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
const latin = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('')

describe('stripLocation', () => {
  const xyz = box('©xyz', cat(new Uint8Array([0, 18, 0x15, 0xc7]), text('+40.0688-082.5186/')))
  const appleMeta = box('data', cat(new Uint8Array(8), text('+40.0688-082.5186+300.000/')))
  const moov = box('moov', cat(box('mvhd', new Uint8Array(20)), box('udta', cat(xyz, appleMeta))))
  const mdat = box('mdat', text('video bytes +40.0688-082.5186/ keep'))
  const file = cat(box('ftyp', text('isom0000')), moov, mdat)

  it('removes the location from the metadata, keeps the size', () => {
    const { bytes, removed } = stripLocation(file)
    assert.equal(bytes.length, file.length)
    assert.ok(removed >= 2)
    const s = latin(bytes)
    assert.ok(!s.includes('©xyz'))
    assert.ok(!s.slice(0, file.length - mdat.length).includes('40.0688'))
    assert.ok(s.includes('+00.0000-000.0000+000.000/'))
  })

  it('never touches the video data or the original', () => {
    const { bytes } = stripLocation(file)
    assert.deepEqual(bytes.slice(file.length - mdat.length), mdat)
    assert.ok(latin(file).includes('©xyz'))
  })

  it('leaves files without location alone', () => {
    const clean = cat(box('ftyp', text('isom0000')), box('moov', box('mvhd', new Uint8Array(20))))
    assert.equal(stripLocation(clean).removed, 0)
  })
})
