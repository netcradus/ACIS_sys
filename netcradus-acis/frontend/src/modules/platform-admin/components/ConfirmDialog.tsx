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
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl animate-scale-in">
        <div className="p-6 space-y-4">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              danger ? 'bg-danger/10 border border-danger/30 text-danger' : 'bg-[#7C3AED]/10 border border-[#7C3AED]/30 text-[#7C3AED]'
            }`}
          >
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h3>
            <p className="text-xs text-neutral-400 mt-2 leading-relaxed">{message}</p>
          </div>
          {children}
        </div>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-900">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="border border-neutral-800 bg-[#0C0C0D] hover:bg-neutral-800 text-neutral-400 hover:text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`font-bold px-4 py-2 rounded-xl text-xs transition-colors disabled:opacity-50 text-white ${
              danger ? 'bg-danger hover:bg-danger/80' : 'bg-[#7C3AED] hover:bg-[#6D28D9]'
            }`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
