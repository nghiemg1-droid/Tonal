// Product analytics with PostHog (free tier): which features people use and whether they come back.
// Only runs when VITE_POSTHOG_KEY is set. No ads, nothing is sold.
// This is a readable version of PostHog's official loader snippet.

type Stub = unknown[] & {
  _i: [string, Record<string, unknown>, string][]
  __SV?: number
  [method: string]: unknown
}

const METHODS = ['capture', 'identify', 'reset', 'register', 'set_config', 'opt_out_capturing', 'opt_in_capturing']

let started = false

function getPosthog(): Stub | undefined {
  return (window as unknown as { posthog?: Stub }).posthog
}

export function initAnalytics() {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com'
  if (!key || started || typeof window === 'undefined') return
  started = true

  // 1. A small queue that remembers calls until the real library has loaded
  const stub = [] as unknown as Stub
  stub._i = []
  for (const method of METHODS) {
    stub[method] = (...args: unknown[]) => stub.push([method, ...args])
  }
  stub.__SV = 1
  ;(window as unknown as { posthog: Stub }).posthog = stub

  // 2. Load the library; it reads the queue and replaces the stub
  const script = document.createElement('script')
  script.async = true
  script.crossOrigin = 'anonymous'
  script.src = host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js'
  document.head.appendChild(script)

  stub._i.push([
    key,
    {
      api_host: host,
      persistence: 'localStorage', // no cookies
      capture_pageview: 'history_change', // counts page changes in this single-page app
      autocapture: false, // only the events we choose
      person_profiles: 'identified_only',
    },
    'posthog',
  ])
}

export function identifyUser(userId: string) {
  const ph = getPosthog()
  if (ph && typeof ph.identify === 'function') (ph.identify as (id: string) => void)(userId)
}

export function resetAnalytics() {
  const ph = getPosthog()
  if (ph && typeof ph.reset === 'function') (ph.reset as () => void)()
}

// e.g. track('post_created', { kind: 'voice' })
export function track(event: string, properties?: Record<string, string | number | boolean>) {
  const ph = getPosthog()
  if (ph && typeof ph.capture === 'function') (ph.capture as (e: string, p?: object) => void)(event, properties)
}
