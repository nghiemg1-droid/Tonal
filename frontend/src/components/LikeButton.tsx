import { useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { supabase } from '../lib/supabase'

type Props = {
  postId: string
  userId: string
  initialLiked: boolean
  initialCount: number
}

// 8 directions for the little burst of dots
const PARTICLE_ANGLES = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2)

export default function LikeButton({ postId, userId, initialLiked, initialCount }: Props) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [burst, setBurst] = useState(0) // changes each time we like, to replay the burst
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    const next = !liked

    // Update the screen right away (optimistic update)
    setLiked(next)
    setCount((c) => c + (next ? 1 : -1))
    if (next) setBurst((b) => b + 1)

    setBusy(true)
    const { error } = next
      ? await supabase.from('likes').insert({ post_id: postId, user_id: userId })
      : await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId)
    setBusy(false)

    // If saving failed, undo the change on screen
    if (error) {
      setLiked(!next)
      setCount((c) => c + (next ? -1 : 1))
    }
  }

  const direction = liked ? 1 : -1

  return (
    // reducedMotion="user": no animations for people who turned on Reduce Motion
    <MotionConfig reducedMotion="user">
      <button
        onClick={toggle}
        aria-label={liked ? 'Unlike' : 'Like'}
        aria-pressed={liked}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-page transition-colors ${
          liked ? 'text-brand' : 'text-muted'
        }`}
      >
        <span className="relative flex h-6 w-6 items-center justify-center">
          {/* The heart: pops in with a spring when liked */}
          <motion.svg
            key={liked ? 'liked' : 'not-liked'}
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill={liked ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ scale: liked ? 0.3 : 1 }}
            animate={{ scale: 1 }}
            whileTap={{ scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 12 }}
          >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </motion.svg>

          {/* The burst: 8 dots fly outward and fade */}
          {liked &&
            burst > 0 &&
            PARTICLE_ANGLES.map((angle, i) => (
              <motion.span
                key={`${burst}-${i}`}
                className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-brand"
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos(angle) * 20,
                  y: Math.sin(angle) * 20,
                  opacity: 0,
                  scale: 0.3,
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            ))}
        </span>

        {/* The count: rolls up when it grows, down when it shrinks */}
        <span className="relative h-5 min-w-4 overflow-hidden text-sm tabular-nums">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={count}
              className="block"
              initial={{ y: 12 * direction, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12 * direction, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {count}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
    </MotionConfig>
  )
}