import { useState } from 'react'

export default function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )

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
      className="fixed top-4 right-4 rounded-full border border-line bg-card p-2 text-xl hover:scale-110 active:scale-95 transition"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}