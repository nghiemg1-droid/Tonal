import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import ProfileEditor from '../components/ProfileEditor'
import BlockedAccounts from '../components/BlockedAccounts'
import DeleteAccount from '../components/DeleteAccount'
import PostGrid from '../components/PostGrid'
import { useGridPosts } from '../hooks/useGridPosts'

export default function ProfilePage({ userId }: { userId: string }) {
  const { posts, hasMore, loadMore, loading } = useGridPosts({ authorId: userId })

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <ProfileEditor userId={userId} />

      <Link
        to="/saved"
        className="flex w-full max-w-sm items-center justify-center gap-2 rounded-xl border border-line bg-card py-2 text-sm font-medium text-ink hover:bg-page"
      >
        🔖 Saved posts
      </Link>

      {/* My posts */}
      <section className="flex w-full flex-col gap-2">
        {!loading && posts.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            No posts yet. <Link to="/new" className="text-brand">Share your first one</Link>
          </p>
        )}
        <PostGrid posts={posts} />
        {hasMore && (
          <button onClick={loadMore} className="self-center text-sm text-brand">
            Load more
          </button>
        )}
      </section>

      <button
        onClick={() => supabase.auth.signOut()}
        className="rounded-full border border-line px-5 py-2 text-ink hover:bg-card active:scale-95 transition"
      >
        Log out
      </button>

      {/* Settings */}
      <BlockedAccounts userId={userId} />
      <DeleteAccount userId={userId} />

      <p className="text-xs text-muted">
        <Link to="/privacy" className="hover:text-brand">
          Privacy Policy
        </Link>
        {' · '}
        <Link to="/terms" className="hover:text-brand">
          Terms of Use
        </Link>
      </p>
    </div>
  )
}
