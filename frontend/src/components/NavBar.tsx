import { Link, NavLink } from 'react-router'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'

const iconProps = {
  className: 'h-7 w-7',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function NewIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

export function MessagesIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12Z" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  )
}

const links = [
  { to: '/', label: 'Home', icon: <HomeIcon /> },
  { to: '/search', label: 'Search', icon: <SearchIcon /> },
  { to: '/new', label: 'New post', icon: <NewIcon /> },
  // On phones Messages lives in the top bar instead
  { to: '/messages', label: 'Messages', icon: <MessagesIcon />, desktopOnly: true },
  { to: '/notifications', label: 'Notifications', icon: <HeartIcon /> },
  { to: '/profile', label: 'Profile', icon: <ProfileIcon /> },
]

export default function NavBar({ unread }: { unread: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:left-0 md:right-auto md:w-20 md:flex-col md:items-center md:gap-2 md:border-t-0 md:border-r md:py-6">
      <Link to="/" aria-label="Tonal home" className="hidden pb-8 md:block">
        <Logo className="h-10 w-10" />
      </Link>

      {links.map((link) => {
        const showBadge = link.to === '/notifications' && unread > 0
        return (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            aria-label={showBadge ? `${link.label} (${unread} new)` : link.label}
            title={link.label}
            className={({ isActive }) =>
              `group ${link.desktopOnly ? 'hidden md:flex' : 'flex'} flex-1 items-center justify-center py-3 transition md:h-12 md:w-12 md:flex-none md:rounded-xl md:py-0 md:hover:bg-page ${
                isActive ? 'text-brand' : 'text-muted hover:text-ink'
              }`
            }
          >
            <span className="relative transition group-active:scale-90">
              {link.icon}
              {showBadge && (
                <span className="absolute -top-1.5 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-brand px-1 text-[10px] font-bold text-white animate-fade-up">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </span>
          </NavLink>
        )
      })}

      {/* Light/dark switch sits at the bottom of the desktop rail */}
      <div className="hidden md:mt-auto md:block">
        <ThemeToggle />
      </div>
    </nav>
  )
}