import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import AuthForm from './components/AuthForm'
import ThemeToggle from './components/ThemeToggle'
import NavBar from './components/NavBar'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import ProfilePage from './pages/ProfilePage'
import CreatePostPage from './pages/CreatePostPage'

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

  // Splash screen while we check the login
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-page">
        <span className="text-4xl font-bold text-brand animate-pulse">Tonal</span>
      </main>
    )
  }

  // Logged out: welcome + login form
  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-page px-4">
        <ThemeToggle />
        <h1 className="text-5xl font-bold tracking-tight text-ink animate-fade-up">
          Welcome to <span className="text-brand">Tonal</span>
        </h1>
        <AuthForm />
      </main>
    )
  }

  // Logged in: navigation + pages
  const userId = session.user.id

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-page md:pl-60">
        <NavBar />
        <ThemeToggle />
        <main className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 pt-20 pb-28 md:pb-10">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage userId={userId} />} />
            <Route path="/new" element={<CreatePostPage userId={userId} />} />
            <Route path="/profile" element={<ProfilePage userId={userId} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App