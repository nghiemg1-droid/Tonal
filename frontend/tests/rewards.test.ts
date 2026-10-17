import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
}
const { cleanRef, inviteLink, looksLikeSchoolEmail, peekRef, saveRefFromUrl, takeRef } = await import('../src/lib/rewards.ts')

describe('invite links', () => {
  beforeEach(() => store.clear())
  it('builds a link and cleans the ref', () => {
    assert.equal(inviteLink('minh.n', 'https://x.app'), 'https://x.app/join?ref=minh.n')
    assert.equal(cleanRef('@Minh_N'), 'Minh_N')
    assert.equal(cleanRef('<script>'), null)
    assert.equal(cleanRef(''), null)
  })
  it('remembers the ref until it is used once', () => {
    saveRefFromUrl('?ref=tonal')
    assert.equal(peekRef(), 'tonal')
    assert.equal(takeRef(), 'tonal')
    assert.equal(takeRef(), null)
    saveRefFromUrl('?foo=1')
    assert.equal(peekRef(), null)
  })
})

describe('school email', () => {
  it('accepts any .edu, rejects others', () => {
    assert.equal(looksLikeSchoolEmail('jane@denison.edu'), true)
    assert.equal(looksLikeSchoolEmail(' Sam@students.osu.EDU '), true)
    assert.equal(looksLikeSchoolEmail('jane@gmail.com'), false)
    assert.equal(looksLikeSchoolEmail('jane@edu.vn'), false)
    assert.equal(looksLikeSchoolEmail('not an email'), false)
  })
})
