import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  email: string
  onBack: () => void
}

// After signing up: type the 6-digit code from the email to finish
export default function EmailCodeStep({ email, onBack }: Props) {
  const [code, setCode] = useState('')
  const [wait, setWait] = useState(60)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  async function verify(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setLoading(false)
    if (error) setError(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired.' : error.message)
    // on success the app opens by itself
  }

  async function resend() {
    setError(null)
    setMessage(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) {
      setError(/rate limit/i.test(error.message) ? 'Too many emails right now. Please try again in a while.' : error.message)
      return
    }
    setMessage('New code sent ✓')
    setWait(60)
  }

  const inputClass =
    'rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand'

  return (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold text-ink">Check your email</h2>
      <p className="-mt-1 text-sm text-muted">
        We sent a 6-digit code to <b className="text-ink">{email}</b>. Check spam too.
      </p>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        required
        autoFocus
        className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}
      <button
        type="submit"
        disabled={loading || code.length < 6}
        className="rounded-full bg-brand py-2 font-medium text-white hover:bg-brand-dark active:scale-95 disabled:opacity-50 transition"
      >
        {loading ? 'Checking…' : 'Verify'}
      </button>
      <div className="flex justify-between text-sm">
        <button type="button" onClick={onBack} className="text-muted hover:text-ink">
          ← Back
        </button>
        <button type="button" disabled={wait > 0} onClick={resend} className="text-brand disabled:text-muted">
          {wait > 0 ? `Send again in ${wait}s` : 'Send again'}
        </button>
      </div>
    </form>
  )
}
