import { createBrowserRouter, useRouteError, useNavigate, Navigate } from 'react-router-dom'
import { ShieldAlert, RefreshCw, Home } from 'lucide-react'
import ProtectedRoute          from './ProtectedRoute'
import AppLayout               from './AppLayout'
import PlatformAdminRoute      from './PlatformAdminRoute'
import PlatformAdminLayout     from './PlatformAdminLayout'

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
      <div className="max-w-md w-full bg-surface-2 border border-fire-border rounded-2xl p-8 shadow-2xl text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 text-accent flex items-center justify-center mx-auto shadow-xl">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-black uppercase tracking-wider text-text-primary">Console Runtime Recovery</h2>
          <p className="text-xs text-text-secondary">An isolated component error occurred during rendering.</p>
        </div>

        <div className="bg-surface-3 border border-fire-border/80 rounded-xl p-3 text-[11px] font-mono text-danger text-left overflow-x-auto max-h-32 leading-relaxed">
          {error?.statusText || error?.message || String(error)}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 bg-accent hover:bg-accent-dark text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md"
          >
            <RefreshCw className="w-4 h-4" /> Reload Console
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex-1 bg-surface-3 hover:bg-surface-2 border border-fire-border text-text-secondary font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
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
          { index: true,              element: <DashboardPage /> },
          { path: 'logs',             element: <LogExplorerPage /> },
          { path: 'correlation',      element: <CorrelationPage /> },
          { path: 'alerts',           element: <AlertsPage /> },
          { path: 'assets',           element: <AssetsPage /> },
          { path: 'threat-intel',     element: <ThreatIntelPage /> },
          { path: 'soar',             element: <SoarPage /> },
          { path: 'red-team',         element: <RedTeamPage /> },
          { path: 'endpoints',        element: <EndpointsPage /> },
          { path: 'compliance',       element: <CompliancePage /> },
          { path: 'reports',          element: <ReportsPage /> },
          { path: 'ai-analyst',       element: <AiAnalystPage /> },
          { path: 'settings',         element: <SettingsPage /> },
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
  // Catch-all: redirect unknown paths to /dashboard, which itself sends
  // unauthenticated visitors straight to Keycloak's hosted login page.
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
    errorElement: <RouteErrorFallback />,
  }
])
