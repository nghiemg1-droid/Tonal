import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { checkVideoFile, videoExtension } from '../src/lib/video.ts'

describe('checkVideoFile', () => {
  it('accepts a normal MP4', () => {
    assert.equal(checkVideoFile({ type: 'video/mp4', size: 10 * 1024 * 1024 }), null)
  })
  it('rejects big files and other types', () => {
    assert.match(checkVideoFile({ type: 'video/mp4', size: 51 * 1024 * 1024 }) ?? '', /50 MB/)
    assert.notEqual(checkVideoFile({ type: 'image/gif', size: 100 }), null)
  })
})

describe('videoExtension', () => {
  it('matches the type', () => {
    assert.equal(videoExtension('video/quicktime'), 'mov')
    assert.equal(videoExtension('video/webm'), 'webm')
    assert.equal(videoExtension('video/mp4'), 'mp4')
  })
})
