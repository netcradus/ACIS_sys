import { Outlet } from 'react-router-dom'
import PlatformAdminSidebar from '@/components/PlatformAdminSidebar'
import PlatformAdminTopBar from '@/components/PlatformAdminTopBar'
import ToastContainer from '@/modules/platform-admin/components/ToastContainer'

/**
 * Deliberately separate from AppLayout.tsx (not wrapping it) — no live
 * threat-feed footer (that's tenant-specific, calls /api/alerts which a
 * platform-admin JWT has no tenant context for), different sidebar/topbar,
 * different accent color as a visual "you are in a different console" cue.
 */
export default function PlatformAdminLayout() {
  return (
    <div className="flex h-screen bg-background text-text-primary overflow-hidden font-sans">
      <PlatformAdminSidebar />

      <div className="flex-1 flex flex-col min-w-0 relative">
        <PlatformAdminTopBar />

        <main className="flex-1 overflow-y-auto p-8 animate-fade-in relative scrollbar-hide">
          <div className="relative z-10 max-w-[1800px] mx-auto pb-20">
            <Outlet />
          </div>
        </main>
      </div>

      <ToastContainer />
    </div>
  )
}
