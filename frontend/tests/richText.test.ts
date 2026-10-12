import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseRichText } from '../src/lib/richText.ts'

describe('parseRichText', () => {
  it('finds hashtags and mentions', () => {
    assert.deepEqual(parseRichText('hi @Minh look #Summer!'), [
      { type: 'text', text: 'hi ' },
      { type: 'mention', text: '@Minh', username: 'minh' },
      { type: 'text', text: ' look ' },
      { type: 'tag', text: '#Summer', tag: 'summer' },
      { type: 'text', text: '!' },
    ])
  })
  it('keeps Vietnamese letters in hashtags', () => {
    const tags = parseRichText('#HàNội #Đà_Lạt').filter((p) => p.type === 'tag')
    assert.deepEqual(tags.map((t) => (t.type === 'tag' ? t.tag : '')), ['hànội', 'đà_lạt'])
  })
  it('ignores emails and plain text', () => {
    assert.deepEqual(parseRichText('mail me at a@test.com'), [{ type: 'text', text: 'mail me at a@test.com' }])
    assert.deepEqual(parseRichText(''), [])
  })
})
