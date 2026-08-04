import { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

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
}

/**
 * A styled confirm modal for the Platform Admin console — the rest of the
 * app uses a bare window.confirm() for destructive actions (see
 * SettingsPage/ReportsPage); this panel gets a real modal to match the
 * "professional, modern UI" requirement for a console that can suspend or
 * delete a paying customer's tenant.
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
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
      <div className="bg-surface border border-fire-border rounded-xl w-full max-w-sm overflow-hidden shadow-card animate-scale-in">
        <div className="p-6 space-y-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              danger ? 'bg-danger/10 border border-danger/30 text-danger' : 'bg-accent-pa/10 border border-accent-pa/30 text-accent-pa'
            }`}
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
            className={`font-semibold px-4 py-2 rounded-lg text-small transition-colors disabled:opacity-50 text-white ${
              danger ? 'bg-danger hover:bg-danger/80' : 'bg-accent-pa hover:bg-accent-pa-dark'
            }`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
