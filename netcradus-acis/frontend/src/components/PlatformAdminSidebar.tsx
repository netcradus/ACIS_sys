import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Users, ChevronLeft, ChevronRight, ShieldAlert, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { clsx } from 'clsx'

const navItems = [
  { icon: LayoutDashboard, label: 'Platform Dashboard', path: '/platform-admin' },
  { icon: Building2,       label: 'Tenants',            path: '/platform-admin/tenants' },
  { icon: Users,           label: 'Users',              path: '/platform-admin/users' },
  { icon: ScrollText,      label: 'Audit Logs',         path: '/platform-admin/audit-logs' },
]

/**
 * Deliberately a separate component from Sidebar.tsx (not a role-conditional
 * branch inside it) — different nav items, different accent color, and a
 * visual cue (the violet accent + "PLATFORM" badge) that this is a
 * different, cross-tenant console from the regular tenant dashboard.
 */
export default function PlatformAdminSidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={clsx(
        'relative z-20 h-full bg-background border-r border-fire-border transition-all duration-300 ease-in-out flex flex-col',
        collapsed ? 'w-[70px]' : 'w-[260px]'
      )}
    >
      <div className="min-h-[84px] py-4 flex items-center px-4 mb-2">
        {collapsed ? (
          <div className="w-10 h-10 rounded-2xl bg-accent-pa/15 border border-accent-pa/40 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-5 h-5 text-accent-pa" />
          </div>
        ) : (
          <div className="flex flex-col select-none">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-accent-pa" />
              <span className="text-text-primary font-black tracking-tight text-sm uppercase">NETCRADUS</span>
            </div>
            <span className="text-[10px] font-black tracking-[0.28em] text-accent-pa uppercase mt-1.5 font-mono">
              Platform Console
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/platform-admin'}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-bold tracking-tight mb-1 relative overflow-hidden',
                isActive ? 'text-accent-pa bg-accent-pa/10' : 'text-text-secondary hover:text-text-primary hover:bg-surface-3'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent-pa" />}
                <item.icon className="w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110" />
                {!collapsed && <span className="animate-fade-in truncate uppercase text-[11px] tracking-wider">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-7 py-6 border-t border-fire-border animate-fade-in bg-surface/40">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-pa animate-pulse" />
            <span className="text-[10px] uppercase font-bold text-accent-pa tracking-widest">Cross-Tenant Mode</span>
          </div>
          <p className="text-[9px] font-medium text-text-muted uppercase tracking-[0.2em]">Platform Admin v1.0</p>
        </div>
      )}

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-24 w-6 h-6 rounded-full bg-surface-3 border border-fire-border flex items-center justify-center text-text-secondary hover:text-accent-pa transition-all z-30 shadow-xl hover:scale-110"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  )
}
