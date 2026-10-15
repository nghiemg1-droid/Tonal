import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PROMPTS, promptForDate } from '../src/lib/prompts.ts'

describe('promptForDate', () => {
  it('is the same all day and changes the next day', () => {
    const morning = promptForDate(new Date(2026, 9, 14, 8))
    const night = promptForDate(new Date(2026, 9, 14, 23))
    const tomorrow = promptForDate(new Date(2026, 9, 15, 8))
    assert.equal(morning, night)
    assert.notEqual(morning, tomorrow)
  })
  it('always returns a prompt, even for old dates', () => {
    assert.ok(PROMPTS.includes(promptForDate(new Date(2020, 0, 1))))
  })
})
