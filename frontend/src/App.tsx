import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import AuthForm from './components/AuthForm'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

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

  if (loading) {
    return <main className="min-h-screen bg-gray-50" />
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-50 px-4">
      <h1 className="text-5xl font-bold tracking-tight text-gray-900">
        Welcome to <span className="text-brand">Tonal</span>
      </h1>

      {session ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-gray-600">
            Logged in as <span className="font-medium">{session.user.email}</span>
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-full border border-gray-300 px-5 py-2 text-gray-700 hover:bg-gray-100 transition"
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