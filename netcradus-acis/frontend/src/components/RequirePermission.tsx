import { ShieldOff } from 'lucide-react'
import { PermissionLevel, useHasPermission, usePermissionsLoaded } from '../store/permissionsStore'

/**
 * Page/section-level gate. Mirrors what RbacEnforcementFilter actually
 * enforces server-side (see PermissionResolver) — this only controls what's
 * shown, never what's allowed; the backend rejects with 403 regardless of
 * whether this component is bypassed or its state is stale.
 */
export default function RequirePermission({
  module,
  level = 'READ',
  children,
}: {
  module: string
  level?: PermissionLevel
  children: React.ReactNode
}) {
  const has = useHasPermission(module, level)
  const loaded = usePermissionsLoaded()

  // Fail open until the first fetch resolves, matching Sidebar's same
  // reasoning — avoids a flash of "Access Denied" on every page load before
  // permissions are even known.
  if (!loaded || has) {
    return <>{children}</>
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-surface border border-fire-border rounded-xl p-8 shadow-card text-center space-y-4">
        <div className="w-14 h-14 rounded-xl bg-danger/10 border border-danger/30 text-danger flex items-center justify-center mx-auto">
          <ShieldOff className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-h3 text-text-primary">Access Restricted</h2>
          <p className="text-small text-text-secondary">
            Your role doesn't have {level === 'READ' ? '' : level.toLowerCase() + ' '}access to {module}.
            Ask an admin to update your role in Settings &gt; Roles &amp; Permissions.
          </p>
        </div>
      </div>
    </div>
  )
}
