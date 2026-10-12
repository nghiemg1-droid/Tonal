import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  addView,
  applyReaction,
  audioExtension,
  checkFile,
  countReactions,
  fileExtension,
  formatSize,
  normalPaths,
  preview,
} from '../src/lib/messages.ts'
import type { Message } from '../src/lib/messages.ts'

function msg(fields: Partial<Message>): Message {
  return {
    id: 'm1',
    conversation_id: 'c1',
    sender_id: 'u1',
    kind: 'text',
    body: 'hi',
    media_path: null,
    duration_ms: null,
    file_size: null,
    reply_to_id: null,
    deleted_at: null,
    view_once: false,
    created_at: '2026-10-12T10:00:00Z',
    ...fields,
  }
}

describe('preview', () => {
  it('shows the text of a text message', () => {
    assert.equal(preview(msg({ body: 'hello' })), 'hello')
  })
  it('hides the content of an unsent message', () => {
    assert.equal(preview(msg({ deleted_at: '2026-10-12T10:01:00Z', body: null })), 'Message unsent')
  })
  it('labels media messages', () => {
    assert.equal(preview(msg({ kind: 'voice', body: null })), '🎙️ Voice message')
    assert.equal(preview(msg({ kind: 'drawing', body: null })), '✏️ Drawing')
    assert.equal(preview(msg({ kind: 'image', body: null })), '📷 Photo')
    assert.equal(preview(msg({ kind: 'image', body: null, view_once: true })), '📸 View-once photo')
    assert.equal(preview(msg({ kind: 'file', body: 'cv.pdf' })), '📎 cv.pdf')
  })
})

describe('normalPaths', () => {
  it('skips view-once photos and messages without files', () => {
    const list = [
      msg({ id: 'a' }),
      msg({ id: 'b', kind: 'image', body: null, media_path: 'c1/u1/b.webp' }),
      msg({ id: 'c', kind: 'image', body: null, media_path: 'c1/u1/c.webp', view_once: true }),
    ]
    assert.deepEqual(normalPaths(list), ['c1/u1/b.webp'])
  })
})

describe('applyReaction', () => {
  it('adds, changes and removes a reaction', () => {
    let map = applyReaction({}, { message_id: 'm1', user_id: 'u1', emoji: '❤️' })
    assert.deepEqual(map, { m1: { u1: '❤️' } })

    map = applyReaction(map, { message_id: 'm1', user_id: 'u1', emoji: '😂' })
    assert.deepEqual(map, { m1: { u1: '😂' } })

    map = applyReaction(map, { message_id: 'm1', user_id: 'u1', emoji: null })
    assert.deepEqual(map, { m1: {} })
  })
  it('does not change the old map (React needs a new object)', () => {
    const before = { m1: { u1: '❤️' } }
    applyReaction(before, { message_id: 'm1', user_id: 'u2', emoji: '👍' })
    assert.deepEqual(before, { m1: { u1: '❤️' } })
  })
})

describe('countReactions', () => {
  it('counts each emoji', () => {
    assert.deepEqual(countReactions({ a: '❤️', b: '❤️', c: '😂' }), { '❤️': 2, '😂': 1 })
    assert.deepEqual(countReactions(undefined), {})
  })
})

describe('addView', () => {
  it('adds a viewer only once', () => {
    let map = addView({}, { message_id: 'm1', user_id: 'u2' })
    map = addView(map, { message_id: 'm1', user_id: 'u2' })
    assert.deepEqual(map, { m1: ['u2'] })
  })
})

describe('files', () => {
  it('accepts a small PDF', () => {
    assert.equal(checkFile({ type: 'application/pdf', size: 1000 }), null)
  })
  it('rejects files over 10 MB', () => {
    assert.match(checkFile({ type: 'application/pdf', size: 11 * 1024 * 1024 }) ?? '', /10 MB/)
  })
  it('rejects HTML (it could run code)', () => {
    assert.notEqual(checkFile({ type: 'text/html', size: 100 }), null)
  })
  it('makes a safe extension', () => {
    assert.equal(fileExtension('report.final.PDF'), 'pdf')
    assert.equal(fileExtension('no-extension'), 'bin')
    assert.equal(fileExtension('weird.p<d>f'), 'pdf')
  })
  it('formats sizes', () => {
    assert.equal(formatSize(500), '500 B')
    assert.equal(formatSize(2048), '2 KB')
    assert.equal(formatSize(5 * 1024 * 1024), '5.0 MB')
  })
  it('picks the audio extension', () => {
    assert.equal(audioExtension('audio/mp4'), 'm4a')
    assert.equal(audioExtension('audio/ogg;codecs=opus'), 'ogg')
    assert.equal(audioExtension('audio/webm;codecs=opus'), 'webm')
  })
})
