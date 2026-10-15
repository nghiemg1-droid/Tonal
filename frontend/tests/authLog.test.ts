import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Minimal localStorage for Node
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
}
const { logAuth, readAuthLog, supabaseDebugLogger } = await import('../src/lib/authLog.ts')

describe('authLog', () => {
  beforeEach(() => store.clear())

  it('keeps the newest 40 lines', () => {
    for (let i = 0; i < 50; i++) logAuth(`line ${i}`)
    const lines = readAuthLog()
    assert.equal(lines.length, 40)
    assert.match(lines[39], /line 49$/)
  })

  it('records refresh errors but never objects (tokens)', () => {
    supabaseDebugLogger('prefix', '#_callRefreshToken()', 'error', new Error('Invalid Refresh Token: Already Used'))
    supabaseDebugLogger('prefix', '#_saveSession()', { access_token: 'secret', refresh_token: 'secret2' })
    supabaseDebugLogger('prefix', '#_acquireLock', 'begin')
    const all = readAuthLog().join('\n')
    assert.match(all, /Already Used/)
    assert.doesNotMatch(all, /secret/)
    assert.doesNotMatch(all, /acquireLock/)
  })

  it('survives broken data', () => {
    store.set('tonal-auth-log', '{bad json')
    assert.deepEqual(readAuthLog(), [])
  })
})
