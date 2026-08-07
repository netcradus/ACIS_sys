import { createBrowserRouter, useRouteError, useNavigate, Navigate } from 'react-router-dom'
import { ShieldAlert, RefreshCw, Home } from 'lucide-react'
import ProtectedRoute          from './ProtectedRoute'
import AppLayout               from './AppLayout'
import PlatformAdminRoute      from './PlatformAdminRoute'
import PlatformAdminLayout     from './PlatformAdminLayout'
import SignupPage              from '@/modules/auth/SignupPage'
import AcceptInvitePage        from '@/modules/auth/AcceptInvitePage'
import RequirePermission       from '@/components/RequirePermission'
import { MODULES }             from '@/store/permissionsStore'

// Dashboard modules
import DashboardPage           from '@/modules/dashboard/DashboardPage'
import LogExplorerPage         from '@/modules/log-explorer/LogExplorerPage'
import CorrelationPage         from '@/modules/correlation/CorrelationPage'
import AlertsPage              from '@/modules/alerts/AlertsPage'
import AssetsPage              from '@/modules/assets/AssetsPage'
import ThreatIntelPage         from '@/modules/threat-intel/ThreatIntelPage'
import SoarPage                from '@/modules/soar/SoarPage'
import RedTeamPage             from '@/modules/red-team/RedTeamPage'
import EndpointsPage           from '@/modules/endpoints/EndpointsPage'
import CompliancePage          from '@/modules/compliance/CompliancePage'
import ReportsPage             from '@/modules/reports/ReportsPage'
import SettingsPage            from '@/modules/settings/SettingsPage'
import AiAnalystPage           from '@/modules/ai-analyst/AiAnalystPage'

// Platform Admin modules
import PlatformDashboardPage   from '@/modules/platform-admin/PlatformDashboardPage'
import TenantListPage          from '@/modules/platform-admin/TenantListPage'
import TenantDetailPage        from '@/modules/platform-admin/TenantDetailPage'
import UserListPage            from '@/modules/platform-admin/UserListPage'
import UserDetailPage          from '@/modules/platform-admin/UserDetailPage'
import AuditLogsPage           from '@/modules/platform-admin/AuditLogsPage'

function RouteErrorFallback() {
  const error: any = useRouteError()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background text-text-primary flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-surface border border-fire-border rounded-xl p-8 shadow-card text-center space-y-6">
        <div className="w-16 h-16 rounded-xl bg-accent/10 border border-accent/30 text-accent flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-h3 text-text-primary">Console Runtime Recovery</h2>
          <p className="text-small text-text-secondary">An isolated component error occurred during rendering.</p>
        </div>

        <div className="bg-surface-3 border border-fire-border rounded-lg p-3 text-small font-mono text-danger text-left overflow-x-auto max-h-32 leading-relaxed">
          {error?.statusText || error?.message || String(error)}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => window.location.reload()}
            className="btn-fire flex-1 py-2.5 text-small"
          >
            <RefreshCw className="w-4 h-4" /> Reload Console
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-mission flex-1 py-2.5 text-small"
          >
            <Home className="w-4 h-4 text-accent" /> Return Home
          </button>
        </div>
      </div>
    </div>
  )
}

export const router = createBrowserRouter([
  {
    path:    '/dashboard',
    element: <ProtectedRoute />,
    errorElement: <RouteErrorFallback />,
    children: [
      {
        element: <AppLayout />,
        errorElement: <RouteErrorFallback />,
        children: [
          { index: true,              element: <RequirePermission module={MODULES.ALERTS_CORRELATION}><DashboardPage /></RequirePermission> },
          { path: 'logs',             element: <RequirePermission module={MODULES.ALERTS_CORRELATION}><LogExplorerPage /></RequirePermission> },
          { path: 'correlation',      element: <RequirePermission module={MODULES.ALERTS_CORRELATION}><CorrelationPage /></RequirePermission> },
          { path: 'alerts',           element: <RequirePermission module={MODULES.ALERTS_CORRELATION}><AlertsPage /></RequirePermission> },
          { path: 'assets',           element: <RequirePermission module={MODULES.ASSETS_THREAT_INTEL}><AssetsPage /></RequirePermission> },
          { path: 'threat-intel',     element: <RequirePermission module={MODULES.ASSETS_THREAT_INTEL}><ThreatIntelPage /></RequirePermission> },
          { path: 'soar',             element: <RequirePermission module={MODULES.SOAR_PLAYBOOKS}><SoarPage /></RequirePermission> },
          { path: 'red-team',         element: <RequirePermission module={MODULES.SOAR_PLAYBOOKS}><RedTeamPage /></RequirePermission> },
          { path: 'endpoints',        element: <RequirePermission module={MODULES.ASSETS_THREAT_INTEL}><EndpointsPage /></RequirePermission> },
          { path: 'compliance',       element: <RequirePermission module={MODULES.REPORTS_COMPLIANCE}><CompliancePage /></RequirePermission> },
          { path: 'reports',          element: <RequirePermission module={MODULES.REPORTS_COMPLIANCE}><ReportsPage /></RequirePermission> },
          { path: 'ai-analyst',       element: <RequirePermission module={MODULES.ALERTS_CORRELATION}><AiAnalystPage /></RequirePermission> },
          { path: 'settings',         element: <RequirePermission module={MODULES.SETTINGS}><SettingsPage /></RequirePermission> },
        ],
      },
    ],
  },
  {
    path:    '/platform-admin',
    element: <PlatformAdminRoute />,
    errorElement: <RouteErrorFallback />,
    children: [
      {
        element: <PlatformAdminLayout />,
        errorElement: <RouteErrorFallback />,
        children: [
          { index: true,             element: <PlatformDashboardPage /> },
          { path: 'tenants',         element: <TenantListPage /> },
          { path: 'tenants/:id',     element: <TenantDetailPage /> },
          { path: 'users',          element: <UserListPage /> },
          { path: 'users/:id',      element: <UserDetailPage /> },
          { path: 'audit-logs',     element: <AuditLogsPage /> },
        ],
      },
    ],
  },
  // Deliberately NOT wrapped in ProtectedRoute/PlatformAdminRoute — those
  // force-redirect unauthenticated visitors straight to Keycloak, which
  // would make this page unreachable by the exact people it's for. Must be
  // registered ahead of the catch-all below or it falls through to it.
  {
    path: '/signup',
    element: <SignupPage />,
    errorElement: <RouteErrorFallback />,
  },
  // Also deliberately outside ProtectedRoute — an invitee has no Keycloak
  // account (and therefore no way to authenticate) until this page's own
  // accept flow creates one. See InvitationService/InvitationController.
  {
    path: '/accept-invite',
    element: <AcceptInvitePage />,
    errorElement: <RouteErrorFallback />,
  },
  // Catch-all: redirect unknown paths to /dashboard, which itself sends
  // unauthenticated visitors straight to Keycloak's hosted login page.
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
    errorElement: <RouteErrorFallback />,
  }
])
