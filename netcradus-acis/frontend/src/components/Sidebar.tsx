import { NavLink } from 'react-router-dom'
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
  ChevronLeft,
  ChevronRight,
  Zap,
  Sparkles,
  Bot,
} from 'lucide-react'
import { useState } from 'react'
import { clsx } from 'clsx'
import NetcradusLogo from './NetcradusLogo'
import { useAuthStore } from '../store/authStore'
import { usePermissionsStore, MODULES } from '../store/permissionsStore'

// module: which of the 6 RBAC modules (see acis-common's DefaultRoleProvisioner)
// this page's real API calls fall under — a nav item only shows if the
// caller's role has at least READ there. Dashboard has no dedicated backend
// API of its own (pure aggregate view), so it's gated on the Dashboard
// module by convention rather than any enforced endpoint.
const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',             path: '/dashboard',              module: MODULES.DASHBOARD },
  { icon: FileSearch,      label: 'Log Explorer',          path: '/dashboard/logs',          module: MODULES.ALERTS_CORRELATION },
  { icon: GitBranch,       label: 'Correlation',           path: '/dashboard/correlation',   module: MODULES.ALERTS_CORRELATION },
  { icon: AlertTriangle,   label: 'Alerts & Incidents',    path: '/dashboard/alerts',        module: MODULES.ALERTS_CORRELATION },
  { icon: Monitor,         label: 'Assets & Identities',   path: '/dashboard/assets',        module: MODULES.ASSETS_THREAT_INTEL },
  { icon: Globe,           label: 'Threat Intel',          path: '/dashboard/threat-intel',  module: MODULES.ASSETS_THREAT_INTEL },
  { icon: Play,            label: 'SOAR Playbooks',        path: '/dashboard/soar',          module: MODULES.SOAR_PLAYBOOKS },
  { icon: Crosshair,       label: 'Red Team',              path: '/dashboard/red-team',      module: MODULES.SOAR_PLAYBOOKS },
  { icon: Server,          label: 'Endpoints & Network',   path: '/dashboard/endpoints',     module: MODULES.ASSETS_THREAT_INTEL },
  { icon: Shield,          label: 'Compliance & Audit',    path: '/dashboard/compliance',    module: MODULES.REPORTS_COMPLIANCE },
  { icon: FileText,        label: 'Reports',               path: '/dashboard/reports',       module: MODULES.REPORTS_COMPLIANCE },
  { icon: Sparkles,        label: 'AI Analyst',            path: '/dashboard/ai-analyst',    module: MODULES.ALERTS_CORRELATION },
  { icon: Settings,        label: 'Settings',              path: '/dashboard/settings',      module: MODULES.SETTINGS },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { user } = useAuthStore()
  const permissions = usePermissionsStore((s) => s.permissions)
  const permissionsLoaded = usePermissionsStore((s) => s.loaded)
  // Fail open until the first fetch resolves — otherwise every nav item
  // flashes hidden-then-visible on every page load, which reads as broken
  // rather than as a permissions boundary. The backend enforces the real
  // boundary regardless of what's shown here in that brief window.
  const visibleNavItems = !permissionsLoaded
    ? navItems
    : navItems.filter((item) => (permissions[item.module] || 'NONE') !== 'NONE')

  return (
    <aside 
      className={clsx(
        "relative z-20 h-full bg-background border-r border-fire-border transition-all duration-300 ease-in-out flex flex-col",
        collapsed ? 'w-[70px]' : 'w-[260px]'
      )}
    >
      {/* Brand area */}
      <div className="min-h-[84px] py-4 flex items-center px-4 mb-2">
        <NetcradusLogo size={collapsed ? 'sm' : 'md'} collapsed={collapsed} showTagline={!collapsed} />
      </div>

      {/* Navigation items */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/dashboard'}
            className={({ isActive }) =>
              clsx(
                "group flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-colors duration-150 text-small mb-0.5 relative overflow-hidden",
                isActive
                  ? "text-accent bg-accent/10 font-semibold"
                  : "text-text-secondary font-medium hover:text-text-primary hover:bg-surface-2"
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={isActive ? 2.25 : 2} />
                {!collapsed && <span className="animate-fade-in truncate">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Branding + Profile */}
      {!collapsed && (
        <div className="border-t border-fire-border animate-fade-in">
          <div className="px-5 py-3.5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-label uppercase text-success">System Active</span>
            </div>
            <p className="text-label uppercase text-text-muted">Netcradus ACIS v1.2</p>
          </div>

          <div className="flex items-center gap-3 px-3.5 py-3 mx-3 mb-3 rounded-lg bg-surface-2 border border-fire-border">
            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-accent font-semibold text-xs shrink-0 overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{user?.name?.charAt(0).toUpperCase() || 'S'}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-small font-semibold text-text-primary truncate">{user?.name || 'Security Operator'}</p>
              <p className="text-label uppercase text-text-muted truncate">
                {user?.roles?.[0] || 'Viewer'} • Zone_01
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-24 w-6 h-6 rounded-full bg-surface-2 border border-fire-border flex items-center justify-center text-text-secondary hover:text-accent transition-all z-30 shadow-xl hover:scale-110"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  )
}
