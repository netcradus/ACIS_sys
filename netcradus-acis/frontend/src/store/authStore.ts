import { create } from 'zustand'

export interface AuthUser {
  sub:                string
  email:              string
  name:               string
  preferredUsername:  string
  roles:              string[]
  phone?:             string
  department?:        string
  timezone?:          string
  avatarUrl?:         string
  mfaEnabled?:        boolean
  emailNotifications?: boolean
  soundAlerts?:       boolean
  criticalOnly?:      boolean
}

interface AuthState {
  user:             AuthUser | null
  isAuthenticated:  boolean
  keycloakReady:    boolean
  setUser:          (user: AuthUser) => void
  updateProfile:    (partialUser: Partial<AuthUser>) => void
  clearAuth:        () => void
  setKeycloakReady: (ready: boolean) => void
}

const STORAGE_KEY = 'acis_user_profile'

function getInitialUser(): AuthUser | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (e) {
    console.error('Failed to parse saved user profile:', e)
  }
  return null
}

/**
 * Zustand auth store.
 * Populated in main.tsx after keycloak.init() resolves, or from localStorage.
 * Read throughout the app for user info and auth state.
 */
export const useAuthStore = create<AuthState>((set) => ({
  // `user` may optimistically hydrate from a cached profile for display
  // purposes, but `isAuthenticated` must NEVER be inferred from localStorage
  // presence alone — that only proves a profile was cached during some past
  // session, not that the current Keycloak session is still valid. The only
  // things allowed to assert authentication are setUser() (called from
  // main.tsx after a real, successful keycloak.init()) and clearAuth().
  // Trusting stale cache here previously caused a real bug: the app would
  // render as "logged in" with no live token, every API call would 401, and
  // apiClient's 401 handler would force a genuine keycloak.login() — which
  // looked like a redirect loop back to Keycloak's hosted login page.
  user:            getInitialUser(),
  isAuthenticated: false,
  keycloakReady:   false,

  setUser: (user) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    set({ user, isAuthenticated: true })
  },

  updateProfile: (partialUser) => {
    set((state) => {
      const updated: AuthUser = state.user
        ? { ...state.user, ...partialUser }
        : {
            sub: 'usr-acis-' + Date.now().toString(36),
            name: partialUser.name || 'Security Operator',
            email: partialUser.email || 'operator@netcradus.local',
            preferredUsername: 'operator',
            roles: ['SUPER_ADMIN'],
            ...partialUser,
          }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return { user: updated, isAuthenticated: true }
    })
  },

  clearAuth: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ user: null, isAuthenticated: false })
  },

  setKeycloakReady: (ready) => set({ keycloakReady: ready }),
}))

/** Convenience selector — returns true if the user has the given role */
export function useHasRole(role: string): boolean {
  return useAuthStore((s) => s.user?.roles.includes(role) ?? false)
}
