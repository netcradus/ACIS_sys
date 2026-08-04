import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Monitor, Check, type LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'
import { useThemeStore, type ThemeMode } from '../store/themeStore'

const OPTIONS: { mode: ThemeMode; label: string; icon: LucideIcon }[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'System', icon: Monitor },
]

interface ThemeToggleProps {
  /** Tailwind text-color class used for the active option / open state — lets each console keep its own accent (tenant orange vs. platform-admin violet). */
  accentClass?: string
}

export default function ThemeToggle({ accentClass = 'text-accent' }: ThemeToggleProps) {
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const ActiveIcon = OPTIONS.find((o) => o.mode === mode)?.icon ?? Monitor

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Change theme"
        aria-haspopup="true"
        aria-expanded={open}
        title="Change theme"
        className={clsx(
          'relative p-2.5 rounded-lg border transition-colors focus:outline-none',
          open
            ? clsx('bg-surface-3 border-fire-border', accentClass)
            : 'bg-surface-2 border-fire-border text-text-secondary hover:text-text-primary'
        )}
      >
        <ActiveIcon className="w-[18px] h-[18px]" />
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-40 bg-surface border border-fire-border rounded-xl shadow-card py-1.5 z-50 animate-fade-in overflow-hidden">
          {OPTIONS.map(({ mode: optMode, label, icon: Icon }) => (
            <button
              key={optMode}
              onClick={() => {
                setMode(optMode)
                setOpen(false)
              }}
              className={clsx(
                'w-full text-left px-3.5 py-2.5 text-small font-medium transition-colors flex items-center gap-3 hover:bg-surface-2',
                mode === optMode ? clsx(accentClass, 'font-semibold') : 'text-text-secondary hover:text-text-primary'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
              {mode === optMode && <Check className="w-3.5 h-3.5 ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
