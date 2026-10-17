import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { beanLook, needsNudge, nextMilestone, ringTier, unlocks } from '../src/lib/streaks.ts'

describe('streak bean', () => {
  it('gets happier and more colorful', () => {
    assert.equal(beanLook(0).mood, 'sleepy')
    assert.equal(beanLook(5).mood, 'smile')
    assert.equal(beanLook(10).mood, 'grin')
    assert.equal(beanLook(40).mood, 'joy')
    assert.equal(beanLook(100).crown, true)
    assert.notEqual(beanLook(7).color, beanLook(14).color)
  })
})

describe('milestones and rewards', () => {
  it('finds the next milestone', () => {
    assert.deepEqual(nextMilestone(0), { target: 3, remaining: 3, progress: 0 })
    assert.equal(nextMilestone(10)?.target, 14)
    assert.equal(nextMilestone(100), null)
  })
  it('unlocks by best streak and picks story rings', () => {
    assert.equal(unlocks(6).accent, false)
    assert.equal(unlocks(7).aurora, true)
    assert.equal(unlocks(49).pin, false)
    assert.equal(unlocks(100).centurion, true)
    assert.equal(ringTier(13), 'none')
    assert.equal(ringTier(14), 'animated')
    assert.equal(ringTier(120), 'gold')
    assert.equal(ringTier(null), 'none')
  })
  it('nudges only in the evening, only if a streak is at risk', () => {
    const evening = new Date('2026-10-17T23:00:00Z') // 7 PM in Ohio
    const morning = new Date('2026-10-17T13:00:00Z') // 9 AM in Ohio
    assert.equal(needsNudge(5, false, evening), true)
    assert.equal(needsNudge(5, true, evening), false)
    assert.equal(needsNudge(0, false, evening), false)
    assert.equal(needsNudge(5, false, morning), false)
  })
})
