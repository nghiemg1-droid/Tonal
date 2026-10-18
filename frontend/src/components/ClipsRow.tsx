import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import MediaImg from './MediaImg'

type Clip = {
  id: string
  poster_path: string | null
  duration_ms: number | null
  author: { username: string } | null
}

// Home: a row of the newest short videos; tap one to watch it full screen
export default function ClipsRow() {
  const [clips, setClips] = useState<Clip[]>([])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('posts')
      .select('id, poster_path, duration_ms, author:profiles!posts_author_id_fkey(username)')
      .eq('kind', 'video')
      .order('created_at', { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (!cancelled) setClips((data ?? []) as unknown as Clip[])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-ink">🎬 Clips</h2>
        <Link to="/clips" className="text-sm font-semibold text-brand">
          Watch all
        </Link>
      </div>

      {clips.length === 0 ? (
        <Link
          to="/new"
          className="flex items-center gap-3 rounded-xl border border-dashed border-line p-4 text-sm text-muted hover:border-brand hover:text-brand"
        >
          <span className="text-2xl">🎬</span>
          No clips yet. Post the first short video!
        </Link>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {clips.map((clip) => (
            <Link
              key={clip.id}
              to={`/clips?start=${clip.id}`}
              className="relative aspect-[9/16] w-28 shrink-0 overflow-hidden rounded-xl bg-black"
            >
              {clip.poster_path && (
                <MediaImg path={clip.poster_path} alt="" loading="lazy" className="h-full w-full object-cover" />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 text-xs font-semibold text-white">
                ▶ {clip.author?.username}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
