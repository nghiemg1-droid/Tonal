import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cameraErrorMessage, coverRect, pickRecordingType } from '../src/lib/recorder.ts'

describe('recorder helpers', () => {
  it('prefers MP4, falls back to WebM, or nothing', () => {
    assert.equal(pickRecordingType((t) => t === 'video/mp4')?.ext, 'mp4')
    assert.equal(pickRecordingType((t) => t.startsWith('video/webm;codecs=vp8'))?.base, 'video/webm')
    assert.equal(pickRecordingType(() => false), null)
  })
  it('crops a landscape camera to a 9:16 canvas', () => {
    const r = coverRect(1280, 720, 720, 1280)
    assert.equal(Math.round(r.h), 1280)
    assert.ok(r.w > 720 && r.x < 0)
  })
  it('explains camera errors', () => {
    assert.match(cameraErrorMessage({ name: 'NotAllowedError' }), /Allow/)
    assert.match(cameraErrorMessage({ name: 'Weird' }), /upload/)
  })
})
