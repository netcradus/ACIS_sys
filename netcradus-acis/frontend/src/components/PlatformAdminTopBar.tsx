import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, ChevronDown, ExternalLink } from 'lucide-react'
import keycloak from '@/lib/keycloak'
import { useAuthStore } from '@/store/authStore'
import ThemeToggle from './ThemeToggle'

export default function PlatformAdminTopBar() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <header className="h-16 border-b border-fire-border bg-background flex items-center justify-between px-6 flex-shrink-0">
      <div>
        <h1 className="text-sm font-black uppercase tracking-widest text-text-primary">Platform Super Admin</h1>
        <p className="text-[10px] text-text-muted font-semibold tracking-wider uppercase">
          Cross-tenant operations &mdash; acting outside any single tenant
        </p>
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle accentClass="text-accent-pa" />

        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary border border-fire-border rounded-lg px-3 py-2 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Tenant Console
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-3 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-accent-pa/15 border border-accent-pa/40 flex items-center justify-center text-accent-pa font-bold text-xs uppercase">
              {(user?.name || user?.preferredUsername || 'PA').slice(0, 2)}
            </div>
            <span className="text-xs font-bold text-text-primary">{user?.name || user?.preferredUsername}</span>
            <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-surface-2 border border-fire-border rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in">
              <div className="px-4 py-3 border-b border-fire-border">
                <p className="text-xs font-bold text-text-primary truncate">{user?.email}</p>
                <p className="text-[10px] text-accent-pa font-bold uppercase tracking-wider mt-0.5">platform-admin</p>
              </div>
              <button
                onClick={() => keycloak.logout()}
                className="w-full text-left px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-danger hover:bg-danger/10 transition-all flex items-center gap-3"
              >
                <LogOut className="w-4 h-4" /> Terminate Session
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
