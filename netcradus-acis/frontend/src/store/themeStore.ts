import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeState {
  mode:           ThemeMode
  resolvedTheme:  ResolvedTheme
  setMode:        (mode: ThemeMode) => void
}

const STORAGE_KEY = 'acis_theme_mode'
const media = window.matchMedia('(prefers-color-scheme: dark)')

function getInitialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved
    }
  } catch (e) {
    console.error('Failed to read saved theme mode:', e)
  }
  return 'system'
}

function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? (media.matches ? 'dark' : 'light') : mode
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved)
}

/**
 * Zustand theme store. `data-theme` on <html> is set here (and, for the
 * very first paint, by the blocking inline script in index.html) — every
 * CSS color in the app resolves through custom properties keyed off that
 * attribute, so nothing else needs to know the theme exists.
 */
export const useThemeStore = create<ThemeState>((set, get) => {
  const initialMode = getInitialMode()
  const initialResolved = resolve(initialMode)
  applyTheme(initialResolved)

  media.addEventListener('change', () => {
    if (get().mode === 'system') {
      const resolved = resolve('system')
      applyTheme(resolved)
      set({ resolvedTheme: resolved })
    }
  })

  return {
    mode: initialMode,
    resolvedTheme: initialResolved,

    setMode: (mode) => {
      localStorage.setItem(STORAGE_KEY, mode)
      const resolved = resolve(mode)
      applyTheme(resolved)
      set({ mode, resolvedTheme: resolved })
    },
  }
})
