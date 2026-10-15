import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { COUNTRIES, toE164 } from '../lib/phone'

// Log in (or sign up) with a phone number and a 6-digit code sent by SMS
export default function PhoneLogin() {
  const [country, setCountry] = useState('+1')
  const [number, setNumber] = useState('')
  const [phone, setPhone] = useState<string | null>(null) // set once the code is sent
  const [code, setCode] = useState('')
  const [wait, setWait] = useState(0) // seconds before "send again"
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  function friendly(message: string) {
    if (/provider|sms|phone.*(disabled|not enabled)|unsupported/i.test(message)) {
      return 'Phone sign-in is not available yet. Please use email for now.'
    }
    return message
  }

  async function sendCode(target: string) {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({ phone: target })
    setLoading(false)
    if (error) {
      setError(friendly(error.message))
      return
    }
    setPhone(target)
    setWait(60)
  }

  function handleSend(e: FormEvent) {
    e.preventDefault()
    const target = toE164(country, number)
    if (!target) {
      setError('Please enter a valid phone number.')
      return
    }
    sendCode(target)
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    if (!phone) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' })
    setLoading(false)
    if (error) setError(error.message.includes('expired') ? 'That code is wrong or has expired.' : error.message)
    // on success the app switches to the logged-in screen by itself
  }

  const inputClass =
    'rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand'
  const button =
    'rounded-full bg-brand py-2 font-medium text-white hover:bg-brand-dark active:scale-95 disabled:opacity-50 transition'

  if (!phone) {
    return (
      <form onSubmit={handleSend} className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold text-ink">Log in with phone</h2>
        <p className="-mt-1 text-sm text-muted">We'll text you a 6-digit code. New here? This creates your account.</p>
        <div className="flex gap-2">
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={`${inputClass} w-28`} aria-label="Country code">
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="Phone number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            required
            className={`${inputClass} min-w-0 flex-1`}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading} className={button}>
          {loading ? 'Sending…' : 'Send code'}
        </button>
        <p className="text-center text-xs text-muted">
          By continuing, you agree to our{' '}
          <a href="/terms" className="underline hover:text-brand">Terms</a> and{' '}
          <a href="/privacy" className="underline hover:text-brand">Privacy Policy</a>. SMS rates may apply.
        </p>
      </form>
    )
  }

  return (
    <form onSubmit={handleVerify} className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold text-ink">Enter the code</h2>
      <p className="-mt-1 text-sm text-muted">Sent to {phone}</p>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="Code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
        required
        className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button type="submit" disabled={loading || code.length < 6} className={button}>
        {loading ? 'Checking…' : 'Verify'}
      </button>
      <div className="flex justify-between text-sm">
        <button type="button" onClick={() => setPhone(null)} className="text-muted hover:text-ink">
          ← Change number
        </button>
        <button type="button" disabled={wait > 0 || loading} onClick={() => sendCode(phone)} className="text-brand disabled:text-muted">
          {wait > 0 ? `Send again in ${wait}s` : 'Send again'}
        </button>
      </div>
    </form>
  )
}
