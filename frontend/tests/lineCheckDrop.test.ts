import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { agoLabel, summarize } from '../src/lib/lineCheck.ts'
import { dropState, dropWindow, formatClock, localDateKey } from '../src/lib/campusDrop.ts'

describe('Line Check summary', () => {
  const now = Date.parse('2026-10-17T17:00:00Z')
  it('newest report wins, counts reports, empty places say so', () => {
    const s = summarize(
      [
        { id: '1', place: 'Curtis', status: 'long', created_at: '2026-10-17T16:40:00Z' },
        { id: '2', place: 'Curtis', status: 'empty', created_at: '2026-10-17T16:55:00Z' },
      ],
      now,
    )
    const curtis = s.find((p) => p.place === 'Curtis')!
    assert.equal(curtis.status, 'empty')
    assert.equal(curtis.reports, 2)
    assert.equal(curtis.minutesAgo, 5)
    assert.equal(s.find((p) => p.place === 'Huffman')!.status, null)
    assert.equal(agoLabel(null), 'no reports yet')
    assert.equal(agoLabel(0), 'just now')
  })
})

describe('Campus Drop', () => {
  it('is the same every time for a date, between 10 AM and 9 PM Denison time, 5 minutes long', () => {
    for (const day of ['2026-10-17', '2026-11-02', '2026-03-08', '2026-12-25']) {
      const a = dropWindow(day)
      assert.equal(a.start.getTime(), dropWindow(day).start.getTime())
      assert.equal(localDateKey(a.start), day)
      const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(a.start))
      assert.ok(hour >= 10 && hour < 21, `${day} -> ${formatClock(a.start)}`)
      assert.equal(a.end.getTime() - a.start.getTime(), 5 * 60000)
    }
  })
  it('different days get different times (usually)', () => {
    const times = new Set(['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'].map((d) => formatClock(dropWindow(d).start)))
    assert.ok(times.size >= 3)
  })
  it('knows before / live / after', () => {
    const w = dropWindow('2026-10-17')
    assert.equal(dropState(new Date(w.start.getTime() - 1000)).phase, 'before')
    const live = dropState(new Date(w.start.getTime() + 60000))
    assert.equal(live.phase, 'live')
    assert.ok(live.phase === 'live' && live.secondsLeft === 240)
    assert.equal(dropState(new Date(w.end.getTime() + 1000)).phase, 'after')
  })
})
