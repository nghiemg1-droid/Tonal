import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

import PhoneLogin from './PhoneLogin'
import EmailCodeStep from './EmailCodeStep'

export default function AuthForm() {
  const [method, setMethod] = useState<'email' | 'phone'>('email')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [codeFor, setCodeFor] = useState<string | null>(null) // email waiting for its code

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const clean = email.trim().toLowerCase()

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: clean, password })
      setLoading(false)
      if (!error) return
      // Signed up but never typed the code: ask for it now
      if (/not confirmed/i.test(error.message)) {
        await supabase.auth.resend({ type: 'signup', email: clean })
        setCodeFor(clean)
        return
      }
      setError(error.message)
      return
    }

    const { data, error } = await supabase.auth.signUp({ email: clean, password })
    setLoading(false)
    if (error) {
      // A code was already emailed a moment ago: just ask for it
      if (/security purposes|after \d+ seconds/i.test(error.message)) {
        setCodeFor(clean)
        return
      }
      setError(/rate limit/i.test(error.message) ? 'Too many sign-ups right now. Please try again in a while.' : error.message)
      return
    }
    // When email confirmation is on, there's no session yet: ask for the code
    if (!data.session) setCodeFor(clean)
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded-full py-1.5 text-sm transition ${active ? 'bg-brand font-medium text-white' : 'text-muted hover:text-ink'}`
  const methodTabs = (
    <div className="flex gap-1 rounded-full bg-page p-1">
      <button type="button" onClick={() => setMethod('email')} className={tabClass(method === 'email')}>
        ✉️ Email
      </button>
      <button type="button" onClick={() => setMethod('phone')} className={tabClass(method === 'phone')}>
        📱 Phone
      </button>
    </div>
  )

  if (codeFor) {
    return (
      <div className="w-full max-w-sm flex flex-col gap-3 rounded-2xl border border-line bg-card p-6 shadow-sm animate-fade-up">
        <EmailCodeStep email={codeFor} onBack={() => setCodeFor(null)} />
      </div>
    )
  }

  if (method === 'phone') {
    return (
      <div className="w-full max-w-sm flex flex-col gap-3 rounded-2xl border border-line bg-card p-6 shadow-sm animate-fade-up">
        {methodTabs}
        <PhoneLogin />
      </div>
    )
  }

  const inputClass =
    'rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand'

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm flex flex-col gap-3 rounded-2xl border border-line bg-card p-6 shadow-sm animate-fade-up [animation-delay:150ms]"
    >
      {methodTabs}

      <h2 className="text-2xl font-bold text-ink">
        {mode === 'login' ? 'Log in' : 'Create account'}
      </h2>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className={inputClass}
      />

      <input
        type="password"
        placeholder="Password (at least 6 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
        className={inputClass}
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-full bg-brand py-2 font-medium text-white hover:bg-brand-dark active:scale-95 disabled:opacity-50 transition"
      >
        {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Sign up'}
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        className="text-sm text-muted hover:text-brand transition"
      >
        {mode === 'login'
          ? "Don't have an account? Sign up"
          : 'Already have an account? Log in'}
      </button>

      <p className="text-center text-xs text-muted">
        {mode === 'signup' ? 'By signing up, you agree to our ' : ''}
        <a href="/terms" className="underline hover:text-brand">
          Terms
        </a>{' '}
        and{' '}
        <a href="/privacy" className="underline hover:text-brand">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  )
}