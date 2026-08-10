import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import PlatformAdminSidebar from '@/components/PlatformAdminSidebar'
import PlatformAdminTopBar from '@/components/PlatformAdminTopBar'
import ToastContainer from '@/modules/platform-admin/components/ToastContainer'
import CommandPalette, { type PaletteEntityResult } from '@/components/ui/CommandPalette'
import { platformAdminNavItems } from '@/components/navConfig'
import apiClient from '@/lib/apiClient'

interface Tenant {
  id: string
  name: string
  status: string
}

interface PlatformUser {
  id: string
  username: string
  email: string
}

/**
 * Deliberately separate from AppLayout.tsx (not wrapping it) — no live
 * threat-feed footer (that's tenant-specific, calls /api/alerts which a
 * platform-admin JWT has no tenant context for), different sidebar/topbar,
 * different accent color as a visual "you are in a different console" cue.
 */
export default function PlatformAdminLayout() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navigate = useNavigate()

  // Lazily fetched on first palette search — this layout doesn't otherwise
  // need tenant/user lists, so nothing is fetched until the palette is used.
  const tenantsRef = useRef<Tenant[] | null>(null)
  const usersRef = useRef<PlatformUser[] | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const searchEntities = useCallback(async (query: string): Promise<PaletteEntityResult[]> => {
    const q = query.toLowerCase()

    if (tenantsRef.current === null) {
      try {
        const res = await apiClient.get('/api/platform/tenants')
        tenantsRef.current = res.data || []
      } catch {
        tenantsRef.current = []
      }
    }
    if (usersRef.current === null) {
      try {
        const res = await apiClient.get('/api/platform/users')
        usersRef.current = res.data || []
      } catch {
        usersRef.current = []
      }
    }

    const tenantMatches: PaletteEntityResult[] = (tenantsRef.current || [])
      .filter((t) => t.name?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((t) => ({
        id: `tenant-${t.id}`,
        label: t.name,
        sublabel: `Tenant · ${t.status}`,
        onSelect: () => navigate(`/platform-admin/tenants/${t.id}`),
      }))

    const userMatches: PaletteEntityResult[] = (usersRef.current || [])
      .filter((u) => u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((u) => ({
        id: `user-${u.id}`,
        label: u.username,
        sublabel: `User · ${u.email}`,
        onSelect: () => navigate(`/platform-admin/users/${u.id}`),
      }))

    return [...tenantMatches, ...userMatches]
  }, [navigate])

  return (
    <div className="flex h-screen bg-background text-text-primary overflow-hidden font-sans">
      <PlatformAdminSidebar />

      <div className="flex-1 flex flex-col min-w-0 relative">
        <PlatformAdminTopBar onOpenPalette={() => setPaletteOpen(true)} />

        <main className="flex-1 overflow-y-auto p-8 animate-fade-in relative scrollbar-hide">
          <div className="relative z-10 max-w-[1800px] mx-auto pb-20">
            <Outlet />
          </div>
        </main>
      </div>

      <ToastContainer />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        navItems={platformAdminNavItems}
        searchEntities={searchEntities}
        accentClass="accent-pa"
      />
    </div>
  )
}
