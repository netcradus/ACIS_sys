import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import { useAuthStore } from '@/store/authStore'

// keycloak.ts constructs a real Keycloak() instance from import.meta.env at
// module-load time - mocked wholesale so tests control `authenticated` and
// can assert on `login()` without touching a real Keycloak server.
vi.mock('@/lib/keycloak', () => ({
  default: {
    authenticated: false,
    login: vi.fn(),
  },
}))

import keycloak from '@/lib/keycloak'

function renderProtectedRoute() {
  // Uses the "declarative" MemoryRouter/Routes API rather than
  // createMemoryRouter/RouterProvider (the app's real router.tsx uses the
  // data-router API) specifically because the data router's client-side
  // navigation constructs a real `Request`/`AbortSignal` under the hood -
  // and jsdom provides its own AbortController/AbortSignal classes that
  // are a different realm from Node's native ones, which fails an
  // `instanceof` check deep inside react-router's fetch-based navigation.
  // ProtectedRoute itself only uses <Navigate>/<Outlet>, which behave
  // identically under either router mode, so this sidesteps a jsdom/Node
  // tooling incompatibility without weakening what's actually being tested.
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<ProtectedRoute />}>
          <Route index element={<div>Real Dashboard Content</div>} />
        </Route>
        <Route path="/platform-admin" element={<div>Platform Admin Console</div>} />
      </Routes>
    </MemoryRouter>
  )
}

function setAuthState(overrides: Partial<ReturnType<typeof useAuthStore.getState>>) {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    keycloakReady: true,
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(keycloak as any).authenticated = false
  useAuthStore.setState({ user: null, isAuthenticated: false, keycloakReady: false })
})

describe('ProtectedRoute', () => {
  it('shows a loading screen (not the protected content) while Keycloak is still initializing', () => {
    setAuthState({ keycloakReady: false, isAuthenticated: false })
    renderProtectedRoute()

    expect(screen.getByText('Initialising ACIS...')).toBeInTheDocument()
    expect(screen.queryByText('Real Dashboard Content')).not.toBeInTheDocument()
  })

  it('redirects an unauthenticated user to Keycloak login once ready, and does not render protected content', async () => {
    setAuthState({ keycloakReady: true, isAuthenticated: false })
    renderProtectedRoute()

    await waitFor(() => expect(keycloak.login).toHaveBeenCalledTimes(1))
    expect(keycloak.login).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: expect.any(String) }))
    expect(screen.queryByText('Real Dashboard Content')).not.toBeInTheDocument()
  })

  it('does not call keycloak.login() while still initializing, even if not yet authenticated', () => {
    setAuthState({ keycloakReady: false, isAuthenticated: false })
    renderProtectedRoute()
    expect(keycloak.login).not.toHaveBeenCalled()
  })

  it('renders the protected route content for an authenticated tenant user', () => {
    setAuthState({
      keycloakReady: true,
      isAuthenticated: true,
      user: {
        sub: 'usr-1',
        email: 'analyst@acis.local',
        name: 'Analyst One',
        preferredUsername: 'analyst1',
        roles: ['analyst'],
      },
    })
    renderProtectedRoute()

    expect(screen.getByText('Real Dashboard Content')).toBeInTheDocument()
    expect(keycloak.login).not.toHaveBeenCalled()
  })

  it('redirects an authenticated platform-admin away from the tenant dashboard to /platform-admin', () => {
    setAuthState({
      keycloakReady: true,
      isAuthenticated: true,
      user: {
        sub: 'usr-2',
        email: 'admin@netcradus.com',
        name: 'Platform Admin',
        preferredUsername: 'platform-admin-user',
        roles: ['platform-admin'],
      },
    })
    renderProtectedRoute()

    expect(screen.getByText('Platform Admin Console')).toBeInTheDocument()
    expect(screen.queryByText('Real Dashboard Content')).not.toBeInTheDocument()
  })

  it('also treats a live keycloak.authenticated=true as authenticated even if the zustand store has not caught up yet', () => {
    (keycloak as any).authenticated = true
    setAuthState({ keycloakReady: true, isAuthenticated: false })
    renderProtectedRoute()

    expect(screen.getByText('Real Dashboard Content')).toBeInTheDocument()
    expect(keycloak.login).not.toHaveBeenCalled()
  })
})
