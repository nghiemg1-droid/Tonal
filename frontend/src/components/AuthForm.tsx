import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    if (error) setError(error.message)
    setLoading(false)
  }

  const inputClass =
    'rounded-lg border border-line bg-page px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand'

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm flex flex-col gap-3 rounded-2xl border border-line bg-card p-6 shadow-sm animate-fade-up [animation-delay:150ms]"
    >
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
    </form>
  )
}