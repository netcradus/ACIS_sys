// global/process polyfills are handled by the inline script in index.html
// (must run synchronously before module evaluation)


import React from 'react'

import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import keycloak from './lib/keycloak'
import { useAuthStore, AuthUser } from './store/authStore'

async function bootstrap() {
  try {
    // Initialize Keycloak but do NOT force automatic redirects here.
    // Instead, rely on the ProtectedRoute and manual triggers in LoginPage.
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
