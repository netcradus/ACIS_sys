import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute          from './ProtectedRoute'
import AppLayout               from './AppLayout'

// Auth
import LoginPage               from '@/modules/auth/LoginPage'

// Dashboard modules (stubs for Phase 1)
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

export const router = createBrowserRouter([
  {
    path:    '/login',
    element: <LoginPage />,
  },
  {
    path:    '/dashboard',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
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
          { path: 'settings',         element: <SettingsPage /> },
        ],
      },
    ],
  },
  // Catch-all: redirect unknown paths to /dashboard
  {
    path: '*',
    element: <LoginPage />,
  }
])
