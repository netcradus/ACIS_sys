// global/process polyfills are handled by the inline script in index.html
// (must run synchronously before module evaluation)


import React from 'react'

import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import keycloak from './lib/keycloak'
import { useAuthStore, AuthUser } from './store/authStore'
import { usePermissionsStore } from './store/permissionsStore'

async function bootstrap() {
  try {
    // Initialize Keycloak but do NOT force automatic redirects here.
    // Instead, rely on ProtectedRoute/PlatformAdminRoute to trigger
    // keycloak.login() (Keycloak's own hosted login page) on demand.
    const authenticated = await keycloak.init({
      checkLoginIframe: false,
      pkceMethod: 'S256',
      flow: 'standard',
    })


    if (authenticated && keycloak.tokenParsed) {
      const tp = keycloak.tokenParsed as Record<string, unknown>
      const roles: string[] = (tp.realm_access as { roles?: string[] })?.roles ?? []

      const user: AuthUser = {
        sub: (tp.sub as string) ?? '',
        email: (tp.email as string) ?? '',
        name: (tp.name as string) ?? (tp.preferred_username as string) ?? '',
        preferredUsername: (tp.preferred_username as string) ?? '',
        roles,
      }
      useAuthStore.getState().setUser(user)
      // Fires GET /api/soar/settings/my-permissions — mirrors what
      // RbacEnforcementFilter actually enforces server-side, so the sidebar/
      // pages can hide what a user's role can't do rather than let them hit
      // a wall of 403s. Harmless no-op for platform-admin JWTs (no tenant_id
      // claim, so it just resolves to an empty permission map).
      usePermissionsStore.getState().fetchPermissions()
    }
  } catch (err) {
    // Keycloak init failure (e.g. server down) — show app in unauthenticated state
    console.error('[Keycloak] Init failed:', err)
  } finally {
    // Always mark Keycloak as ready, even on failure, so ProtectedRoute can render
    useAuthStore.getState().setKeycloakReady(true)
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

bootstrap()
