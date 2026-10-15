import { useState } from 'react'
import { readAuthLog } from '../lib/authLog'

// On the login screen: shows the last login events on this device, so a surprise
// log-out can be reported with a screenshot. Hidden when there's nothing to show.
export default function LoginTroubleshooting() {
  const [lines] = useState(() => readAuthLog().slice(-15))
  const [copied, setCopied] = useState(false)
  if (lines.length === 0) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
    } catch {
      // can't copy: a screenshot works too
    }
  }

  return (
    <details className="w-full max-w-sm text-xs text-muted">
      <summary className="cursor-pointer text-center">Logged out unexpectedly?</summary>
      <p className="mt-2">Take a screenshot of this and send it to the Tonal team — it helps us fix it.</p>
      <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-card p-2 whitespace-pre-wrap">{lines.join('\n')}</pre>
      <button onClick={copy} className="mt-2 rounded-full border border-line px-3 py-1 text-ink">
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </details>
  )
}
