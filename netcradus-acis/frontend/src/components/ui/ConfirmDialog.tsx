import { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { clsx } from 'clsx'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
  /** Which console's accent to use for the non-danger icon/confirm button. Defaults to the tenant console's blue. */
  accentClass?: 'accent' | 'accent-pa'
}

// Full literal class strings (not string-interpolated) so Tailwind's static
// content scanner always picks them up regardless of what else is in the bundle.
const ACCENT_STYLES = {
  accent: {
    icon: 'bg-accent/10 border border-accent/30 text-accent',
    confirm: 'bg-accent hover:bg-accent-dark',
  },
  'accent-pa': {
    icon: 'bg-accent-pa/10 border border-accent-pa/30 text-accent-pa',
    confirm: 'bg-accent-pa hover:bg-accent-pa-dark',
  },
} as const

/**
 * The single confirm modal for real destructive/state-changing actions
 * across both consoles — promoted out of the platform-admin-only
 * ConfirmDialog (see src/modules/platform-admin/components/ConfirmDialog.tsx,
 * migrated to re-export this in the platform-admin redesign stage) so the
 * ~14 window.confirm()/alert() call sites across SettingsPage/ReportsPage/
 * EndpointsPage/AlertsPage/SoarPage/AiAnalystPage/CompliancePage can be
 * replaced with the same real modal platform-admin already had.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
  accentClass = 'accent',
}: ConfirmDialogProps) {
  if (!open) return null

  const styles = ACCENT_STYLES[accentClass]

  return (
    <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
      <div className="bg-surface-overlay border border-fire-border rounded-xl w-full max-w-sm overflow-hidden shadow-overlay animate-scale-in">
        <div className="p-6 space-y-4">
          <div
            className={clsx(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              danger ? 'bg-danger/10 border border-danger/30 text-danger' : styles.icon
            )}
          >
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-h3 text-text-primary">{title}</h3>
            <p className="text-small text-text-secondary mt-2 leading-relaxed">{message}</p>
          </div>
          {children}
        </div>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-fire-border">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="border border-fire-border bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary font-semibold px-4 py-2 rounded-lg text-small transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={clsx(
              'font-semibold px-4 py-2 rounded-lg text-small transition-colors disabled:opacity-50 text-white',
              danger ? 'bg-danger hover:bg-danger/80' : styles.confirm
            )}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
