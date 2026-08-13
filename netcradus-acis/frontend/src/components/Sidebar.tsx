import { NavLink } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { clsx } from 'clsx'
import NetcradusLogo from './NetcradusLogo'
import { tenantNavItems as navItems } from './navConfig'
import { useAuthStore } from '../store/authStore'
import { usePermissionsStore } from '../store/permissionsStore'
import './ChromeTokens.css'
import './Sidebar.css'

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
        "app-sidebar soc-chrome relative z-20 h-full border-r border-fire-border transition-all duration-300 ease-in-out flex flex-col",
        collapsed ? 'w-[70px]' : 'w-[260px]'
      )}
    >
      {/* Brand area */}
      <div className="app-sidebar-brand min-h-[84px] py-4 flex items-center px-4 mb-2">
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
                "app-sidebar-link group flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-colors duration-150 text-small mb-0.5 relative overflow-hidden",
                isActive
                  ? "active text-accent font-semibold"
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
        <div className="app-sidebar-footer animate-fade-in">
          <div className="px-5 py-3.5">
            <div className="flex items-center gap-2 mb-1">
              <div className="app-sidebar-status-dot w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-label uppercase text-success">System Active</span>
            </div>
            <p className="text-label uppercase text-text-muted">Netcradus ACIS v1.2</p>
          </div>

          <div className="app-sidebar-profile flex items-center gap-3 px-3.5 py-3 mx-3 mb-3 rounded-lg">
            <div className="app-sidebar-avatar w-8 h-8 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-accent font-semibold text-xs shrink-0 overflow-hidden">
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
        className="app-sidebar-toggle absolute -right-3 top-24 w-6 h-6 rounded-full bg-surface-2 border border-fire-border flex items-center justify-center text-text-secondary hover:text-accent transition-all z-30 shadow-xl hover:scale-110"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  )
}
