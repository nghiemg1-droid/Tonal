import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { displayMode, logAuth } from './lib/authLog'
import LoginTroubleshooting from './components/LoginTroubleshooting'
import { supabase } from './lib/supabase'
import { useUnreadCount } from './hooks/useUnreadCount'
import { useUnreadChats } from './hooks/useUnreadChats'
import { identifyUser, resetAnalytics } from './lib/analytics'
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
import TagPage from './pages/TagPage'
import SavedPage from './pages/SavedPage'
import LineCheckPage from './pages/LineCheckPage'
import DropPage from './pages/DropPage'
import GuessSpotPage from './pages/GuessSpotPage'
import StreakPage from './pages/StreakPage'
import HallOfFamePage from './pages/HallOfFamePage'

// Everything a logged-in user sees
function LoggedInApp({ userId }: { userId: string }) {
  const [unread, setUnread] = useUnreadCount(userId)
  const unreadChats = useUnreadChats(userId)
  const markSeen = useCallback(() => setUnread(0), [setUnread])

  // Analytics: link events to this account (an id only, never the email)
  useEffect(() => {
    identifyUser(userId)
    return () => resetAnalytics()
  }, [userId])

  // Housekeeping: delete my stories that ended, and their files, so storage stays small
  useEffect(() => {
    supabase.rpc('cleanup_my_expired_stories').then(({ data }) => {
      const paths = (data ?? []) as string[]
      if (paths.length > 0) supabase.storage.from('stories').remove(paths)
    })
  }, [userId])

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-page md:pl-20">
        <NavBar unread={unread} unreadChats={unreadChats} />

        {/* Phone: top bar with the logo and the light/dark switch */}
        <header className="sticky top-0 z-10 flex pt-[env(safe-area-inset-top)] items-center justify-between border-b border-line bg-card px-4 py-1 md:hidden">
          <Link to="/" aria-label="Home">
            <Logo className="h-8 w-8" />
          </Link>
          <span className="flex items-center gap-1">
            <Link to="/messages" aria-label="Messages" className="p-2 text-ink">
              <span className="relative block">
                <MessagesIcon className="h-6 w-6" />
                {unreadChats > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-card bg-brand px-0.5 text-[9px] font-bold text-white">
                    {unreadChats > 9 ? '9+' : unreadChats}
                  </span>
                )}
              </span>
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
              <Route path="/line" element={<LineCheckPage userId={userId} />} />
              <Route path="/drop" element={<DropPage />} />
              <Route path="/guess" element={<GuessSpotPage userId={userId} />} />
              <Route path="/streak" element={<StreakPage userId={userId} />} />
              <Route path="/hall" element={<HallOfFamePage />} />
              <Route path="/tags/:tag" element={<TagPage />} />
              <Route path="/saved" element={<SavedPage userId={userId} />} />
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
    supabase.auth.getSession().then(({ data, error }) => {
      logAuth(`open (${displayMode()}): ${data.session ? 'logged in' : 'logged out'}${error ? ` · ${error.message}` : ''}`)
      setSession(data.session)
      setLoading(false)
    })

    // Update automatically when the user logs in or out
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event !== 'INITIAL_SESSION') logAuth(`event ${event}`)
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
        <LoginTroubleshooting />
      </main>
    )
  }

  // key: if a different user logs in, start everything fresh
  return <LoggedInApp key={session.user.id} userId={session.user.id} />
}

export default App