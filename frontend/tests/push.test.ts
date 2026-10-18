import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
;(globalThis as unknown as { navigator: object }).navigator ??= { userAgent: 'node' }
const { base64UrlToBytes, isIos } = await import('../src/lib/pushUtils.ts')

describe('push helpers', () => {
  it('decodes base64url keys', () => {
    assert.deepEqual([...base64UrlToBytes('AQID')], [1, 2, 3])
    assert.deepEqual([...base64UrlToBytes('-_8')], [251, 255])
  })
  it('spots iPhones', () => {
    assert.equal(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true)
    assert.equal(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), false)
  })
})
