import { NavLink } from 'react-router'

const iconProps = {
  className: 'h-6 w-6',
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
  { to: '/new', label: 'New', icon: <NewIcon /> },
  { to: '/profile', label: 'Profile', icon: <ProfileIcon /> },
]

export default function NavBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:left-0 md:right-auto md:w-60 md:flex-col md:gap-1 md:border-t-0 md:border-r md:px-3 md:py-6">
      <span className="hidden px-3 pb-6 text-3xl font-bold text-brand md:block">Tonal</span>

      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/'}
          className={({ isActive }) =>
            `group flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition md:flex-none md:flex-row md:justify-start md:gap-4 md:rounded-xl md:px-3 md:py-3 md:text-base md:hover:bg-page ${
              isActive ? 'font-semibold text-brand' : 'text-muted hover:text-ink'
            }`
          }
        >
          <span className="transition group-active:scale-90">{link.icon}</span>
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}