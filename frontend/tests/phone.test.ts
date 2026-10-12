import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toE164 } from '../src/lib/phone.ts'

describe('toE164', () => {
  it('formats a Vietnamese number written locally', () => {
    assert.equal(toE164('+84', '0912 345 678'), '+84912345678')
  })
  it('formats a US number', () => {
    assert.equal(toE164('+1', '(740) 555-0123'), '+17405550123')
  })
  it('keeps a full international number', () => {
    assert.equal(toE164('+1', '+84 912 345 678'), '+84912345678')
  })
  it('rejects things that are too short', () => {
    assert.equal(toE164('+1', '123'), null)
    assert.equal(toE164('+84', ''), null)
  })
})
