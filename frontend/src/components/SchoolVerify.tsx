import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { looksLikeSchoolEmail } from '../lib/rewards'

// Verify a school email (.edu, any school). One school email = one account, so clone
// accounts can't collect invite rewards. Only a fingerprint of the email is stored.
export function useSchoolStatus() {
  const [domain, setDomain] = useState<string | null | undefined>(undefined) // undefined = loading
  const reload = () =>
    supabase.rpc('my_school_status').then(({ data }) => {
      const row = (data as { verified: boolean; domain: string | null }[] | null)?.[0]
      setDomain(row?.verified ? row.domain : null)
    })
  useEffect(() => {
    reload()
  }, [])
  return { domain, reload }
}

export default function SchoolVerify({ onVerified }: { onVerified: () => void }) {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const target = (sentTo ?? email).trim()
    if (!looksLikeSchoolEmail(target)) return setError('Please use a school email that ends in .edu')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('school-email', { body: { email: target } })
    setBusy(false)
    if (error) {
      // the function's own message (e.g. "already linked") is in the response body
      let message = 'Could not send the code. Try again in a minute.'
      try {
        const body = await (error as { context?: Response }).context?.json()
        if (body?.error) message = body.error
      } catch {
        // keep the general message
      }
      return setError(message)
    }
    if ((data as { error?: string })?.error) return setError((data as { error: string }).error)
    setSentTo(target)
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('verify_school_code', { code: code.trim() })
    setBusy(false)
    if (error) return setError(error.message)
    if (!data) return setError('That code is not right. Check your school inbox (and spam).')
    onVerified()
  }

  const field = 'rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand'

  return (
    <div className="flex flex-col gap-2">
      {!sentTo ? (
        <form onSubmit={send} className="flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@school.edu"
            className={`${field} min-w-0 flex-1`}
          />
          <button disabled={busy} className="rounded-full bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? '…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            className={`${field} min-w-0 flex-1 tracking-widest`}
          />
          <button disabled={busy || code.length < 6} className="rounded-full bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? '…' : 'Verify'}
          </button>
        </form>
      )}
      {sentTo && (
        <p className="text-xs text-muted">
          Code sent to {sentTo}. Check spam too.{' '}
          <button onClick={() => send()} disabled={busy} className="text-brand">
            Send again
          </button>
          {' · '}
          <button
            onClick={() => {
              setSentTo(null)
              setCode('')
            }}
            className="text-brand"
          >
            Change email
          </button>
        </p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="text-xs text-muted">
        Any school email ending in .edu works. It doesn't change how you log in, and we only keep the school name — not your
        address.
      </p>
    </div>
  )
}
