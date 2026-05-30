import { create } from 'zustand'

export interface AuthUser {
  sub:               string
  email:             string
  name:              string
  preferredUsername: string
  roles:             string[]
}

interface AuthState {
  user:             AuthUser | null
  isAuthenticated:  boolean
  keycloakReady:    boolean
  setUser:          (user: AuthUser) => void
  clearAuth:        () => void
  setKeycloakReady: (ready: boolean) => void
}

/**
 * Zustand auth store.
 * Populated in main.tsx after keycloak.init() resolves.
 * Read throughout the app for user info and auth state.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user:            null,
  isAuthenticated: false,
  keycloakReady:   false,

  setUser: (user) => set({ user, isAuthenticated: true }),

  clearAuth: () => set({ user: null, isAuthenticated: false }),

  setKeycloakReady: (ready) => set({ keycloakReady: ready }),
}))

/** Convenience selector — returns true if the user has the given role */
export function useHasRole(role: string): boolean {
  return useAuthStore((s) => s.user?.roles.includes(role) ?? false)
}
