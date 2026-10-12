import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { columnsToTrack, licenseLabel, toTrack, trackToColumns } from '../src/lib/music.ts'

describe('licenseLabel', () => {
  it('formats Creative Commons licenses', () => {
    assert.equal(licenseLabel('by', '4.0'), 'CC BY 4.0')
    assert.equal(licenseLabel('by-nc-sa', '3.0'), 'CC BY-NC-SA 3.0')
    assert.equal(licenseLabel('cc0'), 'CC0')
    assert.equal(licenseLabel(undefined), 'Open license')
  })
})

describe('toTrack', () => {
  it('keeps only https songs with a credit page', () => {
    assert.equal(toTrack({ url: 'http://x.com/a.mp3', foreign_landing_url: 'https://x.com' }), null)
    assert.equal(toTrack({ url: 'https://x.com/a.mp3' }), null)
  })
  it('fills in missing names', () => {
    const t = toTrack({ url: 'https://x.com/a.mp3', foreign_landing_url: 'https://x.com/a', license: 'by', license_version: '4.0' })
    assert.equal(t?.title, 'Untitled')
    assert.equal(t?.artist, 'Unknown artist')
    assert.equal(t?.license, 'CC BY 4.0')
  })
})

describe('database columns', () => {
  it('round-trips a track', () => {
    const track = { url: 'https://x.com/a.mp3', title: 'Song', artist: 'Me', license: 'CC0', sourceUrl: 'https://x.com/a', durationMs: null }
    assert.deepEqual(columnsToTrack(trackToColumns(track)), track)
  })
  it('turns "no music" into empty columns', () => {
    assert.equal(trackToColumns(null).music_url, null)
    assert.equal(columnsToTrack(trackToColumns(null)), null)
  })
})
