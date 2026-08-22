import { ReactNode } from 'react'
import SharedConfirmDialog from '@/components/ui/ConfirmDialog'

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
 * Real thin wrapper around the shared components/ui/ConfirmDialog, pinned to
 * the platform-admin console's accent-pa identity — this used to be a full
 * independent copy of that component (same markup, hardcoded accent-pa
 * classes inline) despite a stale comment on the shared one claiming this
 * file already re-exported it. Consolidated so the two consoles' confirm
 * modals can never drift out of sync again.
 */
export default function ConfirmDialog(props: ConfirmDialogProps) {
  return <SharedConfirmDialog {...props} accentClass="accent-pa" />
}
