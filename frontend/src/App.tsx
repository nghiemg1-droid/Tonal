import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { useUnreadCount } from './hooks/useUnreadCount'
import AuthForm from './components/AuthForm'
import ThemeToggle from './components/ThemeToggle'
import NavBar, { MessagesIcon } from './components/NavBar'
import Logo from './components/Logo'
import SuggestionsSidebar from './components/SuggestionsSidebar'
import InstallPrompt from './components/InstallPrompt'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import CreatePostPage from './pages/CreatePostPage'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage from './pages/ProfilePage'
import InboxPage from './pages/InboxPage'
import ChatPage from './pages/ChatPage'
import NewGroupPage from './pages/NewGroupPage'
import LegalPage from './pages/LegalPage'
import UserProfilePage from './pages/UserProfilePage'
import PostPage from './pages/PostPage'
import ClipsPage from './pages/ClipsPage'

// Everything a logged-in user sees
function LoggedInApp({ userId }: { userId: string }) {
  const [unread, setUnread] = useUnreadCount(userId)
  const markSeen = useCallback(() => setUnread(0), [setUnread])

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-page md:pl-20">
        <NavBar unread={unread} />

        {/* Phone: top bar with the logo and the light/dark switch */}
        <header className="sticky top-0 z-10 flex pt-[env(safe-area-inset-top)] items-center justify-between border-b border-line bg-card px-4 py-1 md:hidden">
          <span className="flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <span className="text-2xl font-bold text-brand">Tonal</span>
          </span>
          <span className="flex items-center gap-1">
            <Link to="/messages" aria-label="Messages" className="p-2 text-ink">
              <MessagesIcon className="h-6 w-6" />
            </Link>
            <ThemeToggle />
          </span>
        </header>

        <div className="mx-auto flex w-full max-w-5xl justify-center gap-16 px-4 pt-6 pb-28 md:pt-10 md:pb-10">
          <main className="flex w-full max-w-[470px] flex-col items-center gap-4">
            {/* "Install the app" banner, only on the home feed */}
            <Routes>
              <Route path="/" element={<InstallPrompt />} />
              <Route path="*" element={null} />
            </Routes>
            <Routes>
              <Route path="/" element={<HomePage userId={userId} />} />
              <Route path="/search" element={<SearchPage userId={userId} />} />
              <Route path="/new" element={<CreatePostPage userId={userId} />} />
              <Route
                path="/notifications"
                element={<NotificationsPage userId={userId} onSeen={markSeen} />}
              />
              <Route path="/messages" element={<InboxPage userId={userId} />} />
              <Route path="/messages/new-group" element={<NewGroupPage userId={userId} />} />
              <Route path="/messages/:conversationId" element={<ChatPage userId={userId} />} />
              <Route path="/profile" element={<ProfilePage userId={userId} />} />
              <Route path="/clips" element={<ClipsPage userId={userId} />} />
              <Route path="/u/:username" element={<UserProfilePage userId={userId} />} />
              <Route path="/p/:postId" element={<PostPage userId={userId} />} />
              <Route path="/privacy" element={<LegalPage kind="privacy" />} />
              <Route path="/terms" element={<LegalPage kind="terms" />} />
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

  // Logged out: the Privacy Policy and Terms pages are still readable
  if (!session) {
    const path = window.location.pathname
    if (path === '/privacy' || path === '/terms') {
      return (
        <main className="flex min-h-screen justify-center bg-page px-4 py-10">
          <LegalPage kind={path === '/privacy' ? 'privacy' : 'terms'} />
        </main>
      )
    }
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

  // key: if a different user logs in, start everything fresh
  return <LoggedInApp key={session.user.id} userId={session.user.id} />
}

export default App