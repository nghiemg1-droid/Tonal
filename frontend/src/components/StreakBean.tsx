import { beanLook } from '../lib/streaks'

type Props = {
  days: number
  size?: number // height in px
  worried?: boolean // streak at risk today
  bounce?: boolean
  className?: string
}

// The streak mascot: a bean that gets more colorful and happier the longer your streak
export default function StreakBean({ days, size = 40, worried = false, bounce = false, className = '' }: Props) {
  const look = beanLook(days)
  const ink = '#1f1b2e'
  const mood = worried && days > 0 ? 'worried' : look.mood
  const sparkleSpots = [
    [8, 30],
    [92, 26],
    [6, 86],
    [94, 82],
  ].slice(0, look.sparkles)

  return (
    <svg
      viewBox="0 -2 100 126"
      height={size}
      width={(size * 100) / 124}
      className={`${bounce ? 'animate-bounce' : ''} ${className}`}
      role="img"
      aria-label={`${days}-day streak`}
    >
      {look.armsUp && (
        <g stroke={ink} strokeWidth="5" strokeLinecap="round">
          <path d="M20 66 L6 44" />
          <path d="M80 66 L94 44" />
        </g>
      )}
      <rect x="18" y="18" width="64" height="98" rx="32" fill={look.color} stroke={ink} strokeWidth="5" />
      {look.crown && (
        <path d="M30 26 L32 4 L42 15 L50 1 L58 15 L68 4 L70 26 Z" fill="#fde047" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
      )}
      {/* cheeks */}
      <ellipse cx="32" cy="72" rx="7" ry="4" fill="#ff8c96" opacity={days >= 1 ? 0.9 : 0.3} />
      <ellipse cx="68" cy="72" rx="7" ry="4" fill="#ff8c96" opacity={days >= 1 ? 0.9 : 0.3} />
      {/* eyes */}
      {mood === 'sleepy' ? (
        <g stroke={ink} strokeWidth="4" strokeLinecap="round">
          <path d="M33 56 h10" />
          <path d="M57 56 h10" />
        </g>
      ) : mood === 'joy' ? (
        <g stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M32 58 q6 -9 12 0" />
          <path d="M56 58 q6 -9 12 0" />
        </g>
      ) : (
        <g>
          <ellipse cx="38" cy="56" rx="8" ry="9" fill="white" stroke={ink} strokeWidth="3" />
          <ellipse cx="62" cy="56" rx="8" ry="9" fill="white" stroke={ink} strokeWidth="3" />
          <circle cx={mood === 'worried' ? 37 : 39} cy={mood === 'worried' ? 58 : 57} r="4" fill={ink} />
          <circle cx={mood === 'worried' ? 61 : 63} cy={mood === 'worried' ? 58 : 57} r="4" fill={ink} />
        </g>
      )}
      {/* mouth */}
      {mood === 'sleepy' && <path d="M44 82 h12" stroke={ink} strokeWidth="4" strokeLinecap="round" />}
      {mood === 'smile' && <path d="M40 78 q10 10 20 0" stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none" />}
      {mood === 'grin' && <path d="M38 77 q12 16 24 0 Z" fill={ink} stroke={ink} strokeWidth="3" strokeLinejoin="round" />}
      {mood === 'joy' && (
        <g>
          <path d="M36 76 q14 22 28 0 Z" fill={ink} stroke={ink} strokeWidth="3" strokeLinejoin="round" />
          <path d="M43 85 q7 6 14 0" fill="#ff7a8a" />
        </g>
      )}
      {mood === 'worried' && (
        <g>
          <path d="M40 86 q10 -8 20 0" stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M86 30 q5 8 0 12 q-5 -4 0 -12 Z" fill="#60a5fa" stroke={ink} strokeWidth="2" />
        </g>
      )}
      {sparkleSpots.map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y - 8} L${x + 2.5} ${y - 2.5} L${x + 8} ${y} L${x + 2.5} ${y + 2.5} L${x} ${y + 8} L${x - 2.5} ${y + 2.5} L${x - 8} ${y} L${x - 2.5} ${y - 2.5} Z`}
          fill="#fde047"
          stroke={ink}
          strokeWidth="1.5"
        />
      ))}
    </svg>
  )
}
