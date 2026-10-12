import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { timeAgo } from '../src/lib/time.ts'
import { cleanUsernameQuery } from '../src/lib/search.ts'

function secondsAgo(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString()
}

describe('timeAgo', () => {
  it('says "now" for the last minute', () => {
    assert.equal(timeAgo(secondsAgo(10)), 'now')
  })
  it('uses minutes, hours and days', () => {
    assert.equal(timeAgo(secondsAgo(5 * 60)), '5m')
    assert.equal(timeAgo(secondsAgo(3 * 3600)), '3h')
    assert.equal(timeAgo(secondsAgo(2 * 86400)), '2d')
  })
  it('shows a date after a week', () => {
    assert.match(timeAgo(secondsAgo(10 * 86400)), /\d/)
    assert.doesNotMatch(timeAgo(secondsAgo(10 * 86400)), /d$/)
  })
})

describe('cleanUsernameQuery', () => {
  it('keeps only a-z, 0-9 and _', () => {
    assert.equal(cleanUsernameQuery('  @Minh_Nghiem! '), 'minh_nghiem')
    assert.equal(cleanUsernameQuery('%'), '')
  })
})
