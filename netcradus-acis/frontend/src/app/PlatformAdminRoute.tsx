import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore, useHasRole } from '@/store/authStore'
import keycloak from '@/lib/keycloak'

/**
 * Gate for the Platform Super Admin console. Unlike ProtectedRoute (which
 * only checks authentication), this also requires the "platform-admin"
 * Keycloak realm role — a regular tenant user (any of viewer/analyst/
 * engineer/admin) is redirected to their own dashboard, not to /login,
 * since they ARE authenticated, just not authorized for this console.
 */
export default function PlatformAdminRoute() {
  const { keycloakReady, isAuthenticated } = useAuthStore()
  const isPlatformAdmin = useHasRole('platform-admin')

  if (!keycloakReady) {
    return <LoadingScreen />
  }

  const isUserAuthenticated = isAuthenticated || Boolean(keycloak.authenticated)

  if (!isUserAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-2 border-accent-pa/30 flex items-center justify-center animate-pulse-slow">
          <div className="w-12 h-12 rounded-full border-2 border-accent-pa/60 flex items-center justify-center">
            <svg className="w-6 h-6 text-accent-pa" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955
                   11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824
                   10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        </div>
        <div className="absolute inset-0 rounded-full border-t-2 border-accent-pa animate-spin" />
      </div>
      <p className="text-text-muted text-sm tracking-widest uppercase">Initialising Platform Console...</p>
    </div>
  )
}
