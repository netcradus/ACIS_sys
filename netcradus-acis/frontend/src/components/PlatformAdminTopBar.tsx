import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, ChevronDown, ExternalLink } from 'lucide-react'
import keycloak from '@/lib/keycloak'
import { useAuthStore } from '@/store/authStore'

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
    <header className="h-16 border-b border-[#1A1A1A] bg-black flex items-center justify-between px-6 flex-shrink-0">
      <div>
        <h1 className="text-sm font-black uppercase tracking-widest text-white">Platform Super Admin</h1>
        <p className="text-[10px] text-neutral-500 font-semibold tracking-wider uppercase">
          Cross-tenant operations &mdash; acting outside any single tenant
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 hover:text-white border border-[#1A1A1A] rounded-lg px-3 py-2 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Tenant Console
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-neutral-900 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#7C3AED]/15 border border-[#7C3AED]/40 flex items-center justify-center text-[#7C3AED] font-bold text-xs uppercase">
              {(user?.name || user?.preferredUsername || 'PA').slice(0, 2)}
            </div>
            <span className="text-xs font-bold text-white">{user?.name || user?.preferredUsername}</span>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-[#0C0C0D] border border-[#1A1A1A] rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in">
              <div className="px-4 py-3 border-b border-neutral-900">
                <p className="text-xs font-bold text-white truncate">{user?.email}</p>
                <p className="text-[10px] text-[#7C3AED] font-bold uppercase tracking-wider mt-0.5">platform-admin</p>
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
