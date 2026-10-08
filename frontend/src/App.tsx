import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import AuthForm from './components/AuthForm'
import ThemeToggle from './components/ThemeToggle'

const API_URL = import.meta.env.VITE_API_URL

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [backendMessage, setBackendMessage] = useState<string | null>(null)

  useEffect(() => {
    // Check if the user is already logged in
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    // Update automatically when the user logs in or out
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // When logged in, ask our FastAPI backend who we are
  useEffect(() => {
    if (!session) {
      setBackendMessage(null)
      return
    }

    fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => setBackendMessage(`Backend verified: ${data.email}`))
      .catch(() => setBackendMessage('Could not reach the backend'))
  }, [session])

  // Splash screen while we check the login
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-page">
        <span className="text-4xl font-bold text-brand animate-pulse">Tonal</span>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-page px-4">
      <ThemeToggle />

      <h1 className="text-5xl font-bold tracking-tight text-ink animate-fade-up">
        Welcome to <span className="text-brand">Tonal</span>
      </h1>

      {session ? (
        <div className="flex flex-col items-center gap-3 animate-fade-up [animation-delay:150ms]">
          <p className="text-muted">
            Logged in as <span className="font-medium text-ink">{session.user.email}</span>
          </p>
          {backendMessage && <p className="text-sm text-muted">{backendMessage}</p>}
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-full border border-line px-5 py-2 text-ink hover:bg-card active:scale-95 transition"
          >
            Log out
          </button>
        </div>
      ) : (
        <AuthForm />
      )}
    </main>
  )
}

export default App