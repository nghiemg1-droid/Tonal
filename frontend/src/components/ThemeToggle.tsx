import { useState } from 'react'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  function toggle() {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      // Storage can be blocked (private mode); the toggle still works for this visit
    }
    setDark(next)
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl hover:bg-page active:scale-90 transition ${className}`}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}