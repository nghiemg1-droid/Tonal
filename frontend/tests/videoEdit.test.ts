import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compactEdit, DEFAULT_EDIT, editedSeconds, filterCss, formatSeconds, sanitizeEdit } from '../src/lib/videoEdit.ts'

describe('sanitizeEdit', () => {
  it('falls back to no edits for junk', () => {
    assert.deepEqual(sanitizeEdit(null), DEFAULT_EDIT)
    assert.deepEqual(sanitizeEdit([1, 2]), DEFAULT_EDIT)
    assert.deepEqual(sanitizeEdit('x'), DEFAULT_EDIT)
  })
  it('keeps good values and fixes bad ones', () => {
    const e = sanitizeEdit({ start: 2, end: 1, filter: 'nope', speed: 3, volume: 5, text: { value: 'hi', color: 'red', y: 2 } })
    assert.equal(e.start, 2)
    assert.equal(e.end, null) // end before start is ignored
    assert.equal(e.filter, 'none')
    assert.equal(e.speed, 1)
    assert.equal(e.volume, 1)
    assert.deepEqual(e.text, { value: 'hi', color: '#ffffff', y: 0.95 })
  })
  it('drops empty text', () => {
    assert.equal(sanitizeEdit({ text: { value: '   ' } }).text, null)
  })
})

describe('editedSeconds', () => {
  it('uses trim and speed', () => {
    assert.equal(editedSeconds({ ...DEFAULT_EDIT, start: 10, end: 40 }, 90), 30)
    assert.equal(editedSeconds({ ...DEFAULT_EDIT, start: 10, end: null, speed: 2 }, 90), 40)
    assert.equal(editedSeconds({ ...DEFAULT_EDIT, end: 200 }, 90), 90)
  })
})

describe('compactEdit', () => {
  it('is null when nothing changed', () => {
    assert.equal(compactEdit({ ...DEFAULT_EDIT, end: 30 }, 30), null)
  })
  it('only keeps changes, and round-trips', () => {
    const edit = { ...DEFAULT_EDIT, start: 1.234, filter: 'bw' as const, text: { value: ' hey ', color: '#ffffff', y: 0.2 } }
    const saved = compactEdit(edit, 30)
    assert.deepEqual(saved, { start: 1.23, filter: 'bw', text: { value: 'hey', color: '#ffffff', y: 0.2 } })
    assert.equal(sanitizeEdit(saved).filter, 'bw')
  })
})

describe('helpers', () => {
  it('formats and finds filters', () => {
    assert.equal(formatSeconds(75.4), '1:15')
    assert.equal(formatSeconds(5), '0:05')
    assert.equal(filterCss('none'), 'none')
    assert.match(filterCss('bw'), /grayscale/)
  })
})
