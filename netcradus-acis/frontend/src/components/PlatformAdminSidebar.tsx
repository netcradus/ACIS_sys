import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Users, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { clsx } from 'clsx'

const navItems = [
  { icon: LayoutDashboard, label: 'Platform Dashboard', path: '/platform-admin' },
  { icon: Building2,       label: 'Tenants',            path: '/platform-admin/tenants' },
  { icon: Users,           label: 'Users',              path: '/platform-admin/users' },
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
        'relative z-20 h-full bg-black border-r border-[#1A1A1A] transition-all duration-300 ease-in-out flex flex-col',
        collapsed ? 'w-[70px]' : 'w-[260px]'
      )}
    >
      <div className="min-h-[84px] py-4 flex items-center px-4 mb-2">
        {collapsed ? (
          <div className="w-10 h-10 rounded-2xl bg-[#7C3AED]/15 border border-[#7C3AED]/40 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-5 h-5 text-[#7C3AED]" />
          </div>
        ) : (
          <div className="flex flex-col select-none">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-[#7C3AED]" />
              <span className="text-white font-black tracking-tight text-sm uppercase">NETCRADUS</span>
            </div>
            <span className="text-[10px] font-black tracking-[0.28em] text-[#7C3AED] uppercase mt-1.5 font-mono">
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
                isActive ? 'text-[#7C3AED] bg-[#7C3AED]/10' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#7C3AED]" />}
                <item.icon className="w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110" />
                {!collapsed && <span className="animate-fade-in truncate uppercase text-[11px] tracking-wider">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-7 py-6 border-t border-[#1A1A1A] animate-fade-in bg-neutral-950/40">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] animate-pulse" />
            <span className="text-[10px] uppercase font-bold text-[#7C3AED] tracking-widest">Cross-Tenant Mode</span>
          </div>
          <p className="text-[9px] font-medium text-neutral-600 uppercase tracking-[0.2em]">Platform Admin v1.0</p>
        </div>
      )}

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-24 w-6 h-6 rounded-full bg-neutral-900 border border-[#1A1A1A] flex items-center justify-center text-neutral-400 hover:text-[#7C3AED] transition-all z-30 shadow-xl hover:scale-110"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  )
}
