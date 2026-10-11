import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import AuthForm from './components/AuthForm'
import ThemeToggle from './components/ThemeToggle'
import NavBar from './components/NavBar'
import Logo from './components/Logo'
import SuggestionsSidebar from './components/SuggestionsSidebar'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import CreatePostPage from './pages/CreatePostPage'
import ProfilePage from './pages/ProfilePage'

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
        <Logo className="h-16 w-16 animate-pulse" />
      </main>
    )
  }

  // Logged out: welcome + login form
  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-page px-4">
        <ThemeToggle className="fixed top-4 right-4" />
        <Logo className="h-16 w-16 animate-fade-up" />
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
      <div className="min-h-screen bg-page md:pl-20">
        <NavBar />

        {/* Phone: top bar with the logo and the light/dark switch */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-4 py-1 md:hidden">
          <span className="flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <span className="text-2xl font-bold text-brand">Tonal</span>
          </span>
          <ThemeToggle />
        </header>

        <div className="mx-auto flex w-full max-w-5xl justify-center gap-16 px-4 pt-6 pb-28 md:pt-10 md:pb-10">
          <main className="flex w-full max-w-[470px] flex-col items-center gap-4">
            <Routes>
              <Route path="/" element={<HomePage userId={userId} />} />
              <Route path="/search" element={<SearchPage userId={userId} />} />
              <Route path="/new" element={<CreatePostPage userId={userId} />} />
              <Route path="/profile" element={<ProfilePage userId={userId} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          {/* Right column on wide screens, only on the home feed */}
          <Routes>
            <Route path="/" element={<SuggestionsSidebar userId={userId} />} />
            <Route path="*" element={null} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App