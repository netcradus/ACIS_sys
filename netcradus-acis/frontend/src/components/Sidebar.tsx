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

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',             path: '/dashboard' },
  { icon: FileSearch,      label: 'Log Explorer',          path: '/dashboard/logs' },
  { icon: GitBranch,       label: 'Correlation',           path: '/dashboard/correlation' },
  { icon: AlertTriangle,   label: 'Alerts & Incidents',    path: '/dashboard/alerts' },
  { icon: Monitor,         label: 'Assets & Identities',   path: '/dashboard/assets' },
  { icon: Globe,           label: 'Threat Intel',          path: '/dashboard/threat-intel' },
  { icon: Play,            label: 'SOAR Playbooks',        path: '/dashboard/soar' },
  { icon: Crosshair,       label: 'Red Team',              path: '/dashboard/red-team' },
  { icon: Server,          label: 'Endpoints & Network',   path: '/dashboard/endpoints' },
  { icon: Shield,          label: 'Compliance & Audit',    path: '/dashboard/compliance' },
  { icon: FileText,        label: 'Reports',               path: '/dashboard/reports' },
  { icon: Sparkles,        label: 'AI Analyst',            path: '/dashboard/ai-analyst' },
  { icon: Settings,        label: 'Settings',              path: '/dashboard/settings' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

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
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/dashboard'}
            className={({ isActive }) =>
              clsx(
                "group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-bold tracking-tight mb-1 relative overflow-hidden",
                isActive 
                  ? "text-accent bg-accent/5" 
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent shadow-accent-glow" />
                )}
                <item.icon className={clsx("w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110", isActive && "shadow-accent-glow")} />
                {!collapsed && <span className="animate-fade-in truncate uppercase text-[11px] tracking-wider">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Branding */}
      {!collapsed && (
        <div className="px-7 py-6 border-t border-fire-border animate-fade-in bg-surface/20">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-success-glow" />
            <span className="text-[10px] uppercase font-bold text-success tracking-widest">System Active</span>
          </div>
          <p className="text-[9px] font-medium text-text-muted uppercase tracking-[0.2em]">Netcradus ACIS v1.2</p>
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
