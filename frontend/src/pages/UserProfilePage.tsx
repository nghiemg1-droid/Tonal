import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { startChat } from '../lib/chat'
import { blockUser, unblockUser } from '../lib/safety'
import { useGridPosts } from '../hooks/useGridPosts'
import Avatar from '../components/Avatar'
import PostGrid from '../components/PostGrid'
import FollowList from '../components/FollowList'
import ReportDialog from '../components/ReportDialog'

type Profile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_private: boolean
  founding_member: boolean
}

type Counts = { posts: number; followers: number; following: number }

export default function UserProfilePage({ userId }: { userId: string }) {
  const { username = '' } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [counts, setCounts] = useState<Counts>({ posts: 0, followers: 0, following: 0 })
  const [following, setFollowing] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [requested, setRequested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [list, setList] = useState<'followers' | 'following' | null>(null)
  const [menu, setMenu] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Profile + counts + my relationship with them
  useEffect(() => {
    let cancelled = false
    setProfile(null)
    setNotFound(false)

    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, is_private, founding_member')
        .eq('username', username.toLowerCase())
        .maybeSingle()
      if (cancelled) return
      if (!data) {
        setNotFound(true)
        return
      }
      setProfile(data)

      const [posts, followers, followingCount, iFollow, iBlocked, iRequested] = await Promise.all([
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', data.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', data.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', data.id),
        supabase.from('follows').select('follower_id').eq('follower_id', userId).eq('following_id', data.id).maybeSingle(),
        supabase.from('blocks').select('blocked_id').eq('blocker_id', userId).eq('blocked_id', data.id).maybeSingle(),
        supabase.from('follow_requests').select('target_id').eq('requester_id', userId).eq('target_id', data.id).maybeSingle(),
      ])
      if (cancelled) return
      setCounts({ posts: posts.count ?? 0, followers: followers.count ?? 0, following: followingCount.count ?? 0 })
      setFollowing(!!iFollow.data)
      setBlocked(!!iBlocked.data)
      setRequested(!!iRequested.data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [username, userId])

  const { posts, hasMore, loadMore, loading } = useGridPosts({ authorId: profile?.id ?? '00000000-0000-0000-0000-000000000000' })

  if (profile && profile.id === userId) return <Navigate to="/profile" replace />

  if (notFound) {
    return (
      <div className="w-full rounded-2xl border border-line bg-card p-6 text-center">
        <p className="font-semibold text-ink">Sorry, this page isn't available.</p>
        <p className="mt-1 text-sm text-muted">The account may have been deleted or renamed.</p>
        <Link to="/" className="mt-3 inline-block text-sm text-brand">
          Go home
        </Link>
      </div>
    )
  }
  if (!profile) return <p className="pt-10 text-muted animate-pulse">Loading…</p>

  const name = profile.display_name || profile.username

  async function toggleFollow() {
    if (!profile) return
    setBusy(true)
    setError(null)

    // Private account: send (or cancel) a follow request instead
    if (profile.is_private && !following) {
      const { error } = requested
        ? await supabase.from('follow_requests').delete().eq('requester_id', userId).eq('target_id', profile.id)
        : await supabase.from('follow_requests').insert({ target_id: profile.id })
      setBusy(false)
      if (error && error.code !== '23505') setError(error.message)
      else setRequested(!requested)
      return
    }

    const { error } = following
      ? await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', profile.id)
      : await supabase.from('follows').insert({ follower_id: userId, following_id: profile.id })
    setBusy(false)
    if (error) {
      setError(error.message.includes('row-level security') ? "You can't follow this account." : error.message)
      return
    }
    setFollowing(!following)
    setCounts((c) => ({ ...c, followers: c.followers + (following ? -1 : 1) }))
  }

  async function message() {
    if (!profile) return
    try {
      navigate(`/messages/${await startChat(profile.id)}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function toggleBlock() {
    if (!profile) return
    setMenu(false)
    try {
      if (blocked) {
        await unblockUser(userId, profile.id)
        setBlocked(false)
      } else {
        if (!window.confirm(`Block @${profile.username}?`)) return
        await blockUser(userId, profile.id)
        setBlocked(true)
        setFollowing(false)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const stat = 'flex flex-col items-center text-sm text-muted'
  const statNumber = 'text-base font-bold text-ink'

  return (
    <div className="flex w-full flex-col gap-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-5">
        <Avatar name={name} url={profile.avatar_url} className="h-20 w-20 text-3xl" />
        <div className="flex flex-1 justify-around">
          <div className={stat}>
            <span className={statNumber}>{counts.posts}</span>posts
          </div>
          <button className={stat} onClick={() => setList('followers')}>
            <span className={statNumber}>{counts.followers}</span>followers
          </button>
          <button className={stat} onClick={() => setList('following')}>
            <span className={statNumber}>{counts.following}</span>following
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-ink">
            {name}
            {profile.founding_member && (
              <span title="Founding member" className="ml-1 text-sm">
                🏅
              </span>
            )}
          </h2>
          <span className="text-sm text-muted">@{profile.username}</span>
          <div className="flex-1" />
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} aria-label="More options" className="px-2 text-muted">
              •••
            </button>
            {menu && (
              <div className="absolute top-7 right-0 z-20 w-44 overflow-hidden rounded-xl border border-line bg-card shadow-lg">
                <button
                  onClick={() => {
                    setMenu(false)
                    setReporting(true)
                  }}
                  className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-red-500 hover:bg-page"
                >
                  Report
                </button>
                <button onClick={toggleBlock} className="block w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-page">
                  {blocked ? 'Unblock' : 'Block'}
                </button>
                <button onClick={() => setMenu(false)} className="block w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-page">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
        {profile.bio && <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{profile.bio}</p>}
      </div>

      {blocked ? (
        <div className="flex items-center justify-between rounded-xl bg-card p-3 text-sm">
          <span className="text-muted">You blocked this account.</span>
          <button onClick={toggleBlock} className="font-semibold text-brand">
            Unblock
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={toggleFollow}
            disabled={busy}
            className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
              following ? 'bg-card text-ink border border-line' : 'bg-brand text-white hover:bg-brand-dark'
            }`}
          >
            {following ? 'Following' : requested ? 'Requested' : 'Follow'}
          </button>
          <button
            onClick={message}
            className="flex-1 rounded-lg border border-line bg-card py-1.5 text-sm font-semibold text-ink hover:bg-page"
          >
            Message
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!blocked && profile.is_private && !following && (
        <div className="flex flex-col items-center gap-2 border-t border-line py-10 text-center">
          <span className="text-4xl">🔒</span>
          <p className="font-semibold text-ink">This account is private</p>
          <p className="text-sm text-muted">Follow to see their posts and stories.</p>
        </div>
      )}

      {!blocked && (!profile.is_private || following) && (
        <>
          {!loading && posts.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">No posts yet.</p>
          )}
          <PostGrid posts={posts} />
          {hasMore && (
            <button onClick={loadMore} className="self-center text-sm text-brand">
              Load more
            </button>
          )}
        </>
      )}

      {list && <FollowList userId={profile.id} kind={list} onClose={() => setList(null)} />}
      {reporting && (
        <ReportDialog
          userId={userId}
          targetType="user"
          targetId={profile.id}
          label={`@${profile.username}`}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  )
}
