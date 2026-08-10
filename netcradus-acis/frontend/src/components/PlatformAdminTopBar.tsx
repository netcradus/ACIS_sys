import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, ChevronDown, ExternalLink, Search, Command } from 'lucide-react'
import keycloak from '@/lib/keycloak'
import { useAuthStore } from '@/store/authStore'
import ThemeToggle from './ThemeToggle'

interface PlatformAdminTopBarProps {
  onOpenPalette: () => void
}

export default function PlatformAdminTopBar({ onOpenPalette }: PlatformAdminTopBarProps) {
  const { user, clearAuth } = useAuthStore()
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
        <h1 className="text-h3 text-text-primary">Platform Super Admin</h1>
        <p className="text-small text-text-muted">
          Cross-tenant operations — acting outside any single tenant
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Command palette trigger — hand-rolled accent-pa styling since .input-field is hardcoded to the tenant console's blue */}
        <button
          type="button"
          onClick={onOpenPalette}
          className="group hidden md:flex items-center gap-2.5 min-w-[240px] bg-surface border border-fire-border rounded-lg px-3.5 py-2 text-small text-left text-text-muted hover:border-accent-pa/40 transition-colors"
        >
          <Search className="w-4 h-4 text-text-muted group-hover:text-accent-pa transition-colors flex-shrink-0" />
          <span className="flex-1">Search platform...</span>
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-surface-3 border border-fire-border rounded flex-shrink-0">
            <Command className="w-3 h-3 text-text-muted" />
            <span className="text-label text-text-muted">K</span>
          </span>
        </button>

        <ThemeToggle accentClass="text-accent-pa" />

        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-small font-medium text-text-secondary hover:text-text-primary border border-fire-border rounded-lg px-3 py-2 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Tenant Console
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-3 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-accent-pa/15 border border-accent-pa/40 flex items-center justify-center text-accent-pa font-semibold text-xs uppercase">
              {(user?.name || user?.preferredUsername || 'PA').slice(0, 2)}
            </div>
            <span className="text-small font-semibold text-text-primary">{user?.name || user?.preferredUsername}</span>
            <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-surface border border-fire-border rounded-xl shadow-card overflow-hidden z-50 animate-fade-in">
              <div className="px-4 py-3 border-b border-fire-border">
                <p className="text-small font-semibold text-text-primary truncate">{user?.email}</p>
                <p className="text-label uppercase text-accent-pa mt-0.5">platform-admin</p>
              </div>
              <button
                onClick={() => { clearAuth(); keycloak.logout() }}
                className="w-full text-left px-4 py-2.5 text-small font-medium text-danger hover:bg-danger/10 transition-colors flex items-center gap-3"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
