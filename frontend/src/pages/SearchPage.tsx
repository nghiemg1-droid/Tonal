import UserSearch from '../components/UserSearch'
import PostGrid from '../components/PostGrid'
import { useGridPosts } from '../hooks/useGridPosts'

// Search people + Explore: the newest posts from everyone
export default function SearchPage({ userId }: { userId: string }) {
  const { posts, hasMore, loadMore, loading } = useGridPosts({ excludeId: userId })

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <UserSearch userId={userId} />

      <section className="flex w-full flex-col gap-3">
        <h2 className="font-bold text-ink">Explore</h2>
        {!loading && posts.length === 0 && (
          <p className="text-sm text-muted">Nothing to explore yet. Invite some friends!</p>
        )}
        <PostGrid posts={posts} />
        {hasMore && (
          <button onClick={loadMore} className="self-center text-sm text-brand">
            Load more
          </button>
        )}
      </section>
    </div>
  )
}
