import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  maxWidth?: string
}

/**
 * The generic form/create-edit modal this app never had — Soar ("New/Edit
 * Playbook"), Correlation ("New/Edit Rule"), and Settings (Invite User /
 * Create Group / Create Role / Generate API Key) each independently
 * hand-rolled their own overlay markup and CSS for this exact same shape.
 * Real Escape-to-close and backdrop-click-to-close, and a close button with
 * an actual accessible name (every hand-rolled version had neither).
 */
export default function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-lg' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-[110] p-4"
      onClick={onClose}
    >
      <div
        className={`bg-surface-overlay border border-fire-border rounded-xl w-full ${maxWidth} max-h-[90vh] overflow-hidden shadow-overlay animate-scale-in flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-fire-border shrink-0">
          <h3 className="text-h3 text-text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 p-4 border-t border-fire-border shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
