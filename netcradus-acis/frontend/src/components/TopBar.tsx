import { Search, Bell, User, LogOut, ChevronDown, Command } from 'lucide-react'
import { useState } from 'react'
import keycloak from '../lib/keycloak'
import { useAuthStore } from '../store/authStore'
import { clsx } from 'clsx'

export default function TopBar() {
  const { user } = useAuthStore()
  const [showProfile, setShowProfile] = useState(false)

  return (
    <header className="h-20 border-b border-fire-border bg-black/80 backdrop-blur-md px-8 flex items-center justify-between z-20 sticky top-0 overflow-visible">
      <div className="flex items-center gap-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted hidden lg:block border-r border-fire-border pr-6">
          Security Operations Center
        </h2>

        {/* Search Bar - Professional/Technical Look */}
        <div className="relative group min-w-[320px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-accent transition-colors" />
          <input
            type="text"
            placeholder="SEARCH ACIS INTEL..."
            className="w-full bg-surface-2 border border-fire-border rounded-xl py-2.5 pl-11 pr-12 text-[11px] font-bold text-white placeholder:text-text-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/40 transition-all uppercase tracking-widest"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-1 bg-surface-3 border border-fire-border rounded-md">
            <Command className="w-3 h-3 text-text-muted" />
            <span className="text-[9px] font-bold text-text-muted">K</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Notifications - High Contrast */}
        <button className="relative p-2.5 rounded-xl bg-surface-2 border border-fire-border text-text-secondary hover:text-white transition-all hover:border-accent/30 group">
          <Bell className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-accent rounded-full border-2 border-black animate-pulse" />
        </button>

        {/* User Identity - Professional Layout */}
        <div className="relative">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-4 transition-all group"
          >
            <div className="flex flex-col text-right hidden sm:flex">
              <p className="text-xs font-black text-white tracking-tight uppercase leading-none mb-1 group-hover:text-accent transition-colors">
                {user?.name || 'ADMINISTRATOR'}
              </p>
              <p className="text-[9px] text-text-secondary font-bold uppercase tracking-[0.1em] leading-none">
                {user?.roles?.[0] || 'SUPER_ADMIN'} • ZONE_01
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-surface-2 border border-fire-border group-hover:border-accent/40 flex items-center justify-center text-accent font-black text-sm tracking-tighter shadow-lg transition-all overflow-hidden relative">
              <span className="relative z-10">{user?.name?.charAt(0).toUpperCase() || 'A'}</span>
              <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <ChevronDown className={clsx("w-4 h-4 text-text-muted transition-transform group-hover:text-white", showProfile && "rotate-180")} />
          </button>

          {showProfile && (
            <div className="absolute right-0 mt-4 w-56 bg-surface-2 border border-fire-border rounded-2xl shadow-2xl py-2 z-50 animate-fade-in divide-y divide-border overflow-visible">
              <div className="px-5 py-4">
                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Session Identity</p>
                <p className="text-xs font-bold text-white truncate">{user?.email || 'admin@acme.local'}</p>
              </div>
              <div className="py-2">
                <button className="w-full text-left px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-text-secondary hover:text-white hover:bg-surface-3 transition-all flex items-center gap-3">
                  <User className="w-4 h-4 text-accent" /> Profile Settings
                </button>
              </div>
              <div className="py-2">
                <button
                  onClick={() => keycloak.logout()}
                  className="w-full text-left px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-danger hover:bg-danger/10 transition-all flex items-center gap-3"
                >
                  <LogOut className="w-4 h-4" /> Terminate Session
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
