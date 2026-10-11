type Props = {
  className?: string
}

// Temporary logo: a sound wave inside a rounded square.
// To use your real logo later, only change this file.
export default function Logo({ className = 'h-9 w-9' }: Props) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="Tonal">
      <rect width="40" height="40" rx="11" fill="var(--color-brand)" />
      <g stroke="white" strokeWidth="3.5" strokeLinecap="round">
        <path d="M11 17v6" />
        <path d="M17 12v16" />
        <path d="M23 15v10" />
        <path d="M29 18v4" />
      </g>
    </svg>
  )
}