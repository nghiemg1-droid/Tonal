// Post & story files are private. To show one we ask Supabase for a signed link that
// works for a few hours, and only if you're allowed to see the author (checked by the database).
// Links are batched (one request for many files) and cached.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type MediaBucket = 'posts' | 'stories'

const TTL_SECONDS = 6 * 3600
const REFRESH_MARGIN_MS = 10 * 60_000
const cache = new Map<string, { url: string; expires: number }>()
const waiting = new Map<MediaBucket, Map<string, ((url: string) => void)[]>>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

const keyOf = (bucket: MediaBucket, path: string) => `${bucket}/${path}`

export function cachedMediaUrl(bucket: MediaBucket, path: string): string | null {
  const hit = cache.get(keyOf(bucket, path))
  return hit && hit.expires - Date.now() > REFRESH_MARGIN_MS ? hit.url : null
}

async function flush() {
  flushTimer = null
  const jobs = [...waiting.entries()]
  waiting.clear()
  for (const [bucket, byPath] of jobs) {
    const paths = [...byPath.keys()]
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100)
      const { data } = await supabase.storage.from(bucket).createSignedUrls(chunk, TTL_SECONDS)
      const found = new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]))
      for (const path of chunk) {
        const url = found.get(path) ?? ''
        if (url) cache.set(keyOf(bucket, path), { url, expires: Date.now() + TTL_SECONDS * 1000 })
        byPath.get(path)?.forEach((done) => done(url))
      }
    }
  }
}

export function signMedia(bucket: MediaBucket, path: string): Promise<string> {
  const hit = cachedMediaUrl(bucket, path)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve) => {
    const byPath = waiting.get(bucket) ?? new Map()
    waiting.set(bucket, byPath)
    byPath.set(path, [...(byPath.get(path) ?? []), resolve])
    if (!flushTimer) flushTimer = setTimeout(flush, 15)
  })
}

// '' until the link is ready (or if you may not see the file)
export function useMediaUrl(bucket: MediaBucket, path: string | null | undefined): string {
  const [url, setUrl] = useState(() => (path ? (cachedMediaUrl(bucket, path) ?? '') : ''))
  useEffect(() => {
    if (!path) {
      setUrl('')
      return
    }
    const hit = cachedMediaUrl(bucket, path)
    if (hit) {
      setUrl(hit)
      return
    }
    let alive = true
    signMedia(bucket, path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [bucket, path])
  return url
}
