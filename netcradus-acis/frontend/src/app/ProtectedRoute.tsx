import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore, useHasRole } from '@/store/authStore'
import keycloak              from '@/lib/keycloak'

/**
 * Protected route wrapper for the TENANT dashboard.
 *
 * Flow:
 * 1. While Keycloak is initializing → show full-page loading spinner
 * 2. If not authenticated → redirect straight to Keycloak's own hosted
 *    login page (no intermediate in-app login screen); the browser lands
 *    back on this same URL after a successful login
 * 3. If user is a platform-admin (no tenant context) → redirect to /platform-admin
 * 4. If authenticated tenant user → render child routes via <Outlet />
 */
export default function ProtectedRoute() {
  const { keycloakReady, isAuthenticated } = useAuthStore()
  const isPlatformAdmin = useHasRole('platform-admin')
  const isUserAuthenticated = isAuthenticated || Boolean(keycloak.authenticated)

  useEffect(() => {
    if (keycloakReady && !isUserAuthenticated) {
      keycloak.login({ redirectUri: window.location.href })
    }
  }, [keycloakReady, isUserAuthenticated])

  if (!keycloakReady || !isUserAuthenticated) {
    return <LoadingScreen />
  }

  // Platform admins don't have a tenant_id — redirect them to their own console
  if (isPlatformAdmin) {
    return <Navigate to="/platform-admin" replace />
  }

  return <Outlet />
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4">
      {/* Animated shield logo */}
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-2 border-accent/30 flex items-center justify-center animate-pulse-slow">
          <div className="w-12 h-12 rounded-full border-2 border-accent/60 flex items-center justify-center">
            <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955
                   11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824
                   10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        </div>
        {/* Spinning ring */}
        <div className="absolute inset-0 rounded-full border-t-2 border-accent animate-spin" />
      </div>
      <p className="text-text-secondary text-sm tracking-widest uppercase">Initialising ACIS...</p>
    </div>
  )
}
