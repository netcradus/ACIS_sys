import {
  LayoutDashboard,
  FileSearch,
  GitBranch,
  AlertTriangle,
  Monitor,
  Globe,
  Play,
  Crosshair,
  Server,
  Shield,
  FileText,
  Settings,
  Sparkles,
  Building2,
  Users,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { MODULES } from '../store/permissionsStore'

export interface NavItem {
  icon: LucideIcon
  label: string
  path: string
  /** Tenant-console items only — which of the 5 RBAC modules gates this item. Platform-admin items have no per-item gating (flat platform-admin realm-role gate covers the whole console). */
  module?: string
}

/**
 * Data extraction only — Sidebar.tsx/PlatformAdminSidebar.tsx keep their own
 * render + permission-check logic (tenant console filters by module
 * permission, platform-admin doesn't gate per-item at all — see
 * RbacEnforcementFilter's flat platform-admin realm-role gate). This file
 * exists so CommandPalette's Navigate section can never drift out of sync
 * with what the sidebars actually show.
 */
export const tenantNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard',           path: '/dashboard',             module: MODULES.ALERTS_CORRELATION },
  { icon: FileSearch,      label: 'Log Explorer',        path: '/dashboard/logs',         module: MODULES.ALERTS_CORRELATION },
  { icon: GitBranch,       label: 'Correlation',         path: '/dashboard/correlation',  module: MODULES.ALERTS_CORRELATION },
  { icon: AlertTriangle,   label: 'Alerts & Incidents',  path: '/dashboard/alerts',       module: MODULES.ALERTS_CORRELATION },
  { icon: Monitor,         label: 'Assets & Identities', path: '/dashboard/assets',       module: MODULES.ASSETS_THREAT_INTEL },
  { icon: Globe,           label: 'Threat Intel',        path: '/dashboard/threat-intel', module: MODULES.ASSETS_THREAT_INTEL },
  { icon: Play,            label: 'SOAR Playbooks',      path: '/dashboard/soar',         module: MODULES.SOAR_PLAYBOOKS },
  { icon: Crosshair,       label: 'Red Team',            path: '/dashboard/red-team',     module: MODULES.SOAR_PLAYBOOKS },
  { icon: Server,          label: 'Endpoints & Network', path: '/dashboard/endpoints',    module: MODULES.ASSETS_THREAT_INTEL },
  { icon: Shield,          label: 'Compliance & Audit',  path: '/dashboard/compliance',   module: MODULES.REPORTS_COMPLIANCE },
  { icon: FileText,        label: 'Reports',             path: '/dashboard/reports',      module: MODULES.REPORTS_COMPLIANCE },
  { icon: Sparkles,        label: 'AI Analyst',          path: '/dashboard/ai-analyst',   module: MODULES.ALERTS_CORRELATION },
  { icon: Settings,        label: 'Settings',            path: '/dashboard/settings',     module: MODULES.SETTINGS },
]

export const platformAdminNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Platform Dashboard', path: '/platform-admin' },
  { icon: Building2,       label: 'Tenants',            path: '/platform-admin/tenants' },
  { icon: Users,           label: 'Users',              path: '/platform-admin/users' },
  { icon: ScrollText,      label: 'Audit Logs',         path: '/platform-admin/audit-logs' },
]
