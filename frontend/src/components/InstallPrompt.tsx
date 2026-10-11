import { useEffect, useState } from 'react'
import Logo from './Logo'

// Chrome/Edge/Android fire this event when the app can be installed
type InstallEvent = Event & { prompt: () => Promise<void> }

const DISMISS_KEY = 'tonal-install-dismissed'

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [hidden, setHidden] = useState(() => isStandalone() || wasDismissed())

  useEffect(() => {
    if (hidden) return
    if (isIos()) {
      setShowIosHint(true)
      return
    }
    function onPrompt(e: Event) {
      e.preventDefault() // we show our own button instead
      setInstallEvent(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [hidden])

  function dismiss() {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // private mode: it just shows again next time
    }
  }

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    setInstallEvent(null)
    dismiss()
  }

  if (hidden || (!showIosHint && !installEvent)) return null

  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-sm animate-fade-up">
      <Logo className="h-10 w-10 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-ink">Get the Tonal app</p>
        {showIosHint ? (
          <p className="text-muted">
            Tap <span aria-label="Share">⬆️</span> Share, then <b>Add to Home Screen</b>.
          </p>
        ) : (
          <p className="text-muted">Install it for a full-screen experience.</p>
        )}
      </div>
      {installEvent && (
        <button
          onClick={install}
          className="rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark transition"
        >
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="px-1 text-xl text-muted hover:text-ink">
        ×
      </button>
    </div>
  )
}
