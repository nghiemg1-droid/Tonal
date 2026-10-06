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

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm"
    >
      <h2 className="text-2xl font-bold text-gray-900">
        {mode === 'login' ? 'Log in' : 'Create account'}
      </h2>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
      />

      <input
        type="password"
        placeholder="Password (at least 6 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
        className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-full bg-brand py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-50 transition"
      >
        {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Sign up'}
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        className="text-sm text-gray-500 hover:text-brand"
      >
        {mode === 'login'
          ? "Don't have an account? Sign up"
          : 'Already have an account? Log in'}
      </button>
    </form>
  )
}