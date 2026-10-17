import { CHAT_THEMES } from '../lib/chatThemes'
import { useMyStreak } from '../hooks/useMyStreak'

type Props = {
  current: string
  onPick: (id: string) => void
  onClose: () => void
}

export default function ThemePicker({ current, onPick, onClose }: Props) {
  const { streak } = useMyStreak()
  const best = streak?.best ?? 0
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-2xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl animate-fade-up sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-bold text-ink">Chat theme</h3>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-muted">
            ×
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">Everyone in this chat will see the new background.</p>
        <div className="grid grid-cols-5 gap-3">
          {CHAT_THEMES.map((t) => {
            const locked = !!t.unlock && best < t.unlock
            return (
            <button
              key={t.id}
              onClick={() => !locked && onPick(t.id)}
              disabled={locked}
              title={locked ? `Unlocks at a ${t.unlock}-day posting streak` : undefined}
              className={`flex flex-col items-center gap-1 ${locked ? 'opacity-50' : ''}`}
            >
              <span
                className={`relative flex h-14 w-14 items-end justify-end overflow-hidden rounded-2xl border-2 p-1.5 ${
                  current === t.id ? 'border-brand' : 'border-line'
                }`}
                style={{ background: t.background ?? 'var(--page)' }}
              >
                <span className="h-3 w-6 rounded-full" style={{ backgroundColor: t.bubble ?? 'var(--color-brand)' }} />
                {locked && <span className="absolute inset-0 flex items-center justify-center text-lg">🔒</span>}
              </span>
              <span className={`text-[11px] ${current === t.id ? 'font-semibold text-ink' : 'text-muted'}`}>{t.name}{locked ? ` · ${t.unlock}d` : ''}</span>
            </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
