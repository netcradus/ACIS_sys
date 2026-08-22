/**
 * The real loading/error(+Retry)/empty three-state block — copy-pasted
 * verbatim across ~9 pages' tables (identical
 * `<div className="flex flex-col items-center gap-2 py-4">` + Retry button
 * markup each time). One shared component now; pass `colSpan` when used
 * inside a `<table>` body so it renders as a real `<tr><td>` row instead of
 * a bare `<div>` that would break the table structure.
 */
export type EmptyStateVariant = 'loading' | 'error' | 'empty'

interface EmptyStateProps {
  variant: EmptyStateVariant
  message?: string
  onRetry?: () => void
  colSpan?: number
}

const DEFAULT_MESSAGES: Record<EmptyStateVariant, string> = {
  loading: 'Loading...',
  error: 'Unable to load. Please try again.',
  empty: 'Nothing found.',
}

function EmptyStateContent({ variant, message, onRetry }: Omit<EmptyStateProps, 'colSpan'>) {
  const text = message ?? DEFAULT_MESSAGES[variant]

  if (variant === 'loading') {
    return <div className="text-center text-text-muted py-6">{text}</div>
  }

  if (variant === 'error') {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <span>{text}</span>
        {onRetry && (
          <button className="btn-mission text-small px-3 py-1.5" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    )
  }

  return <div className="text-center text-text-muted py-6">{text}</div>
}

export default function EmptyState({ variant, message, onRetry, colSpan }: EmptyStateProps) {
  if (colSpan) {
    return (
      <tr>
        <td colSpan={colSpan}>
          <EmptyStateContent variant={variant} message={message} onRetry={onRetry} />
        </td>
      </tr>
    )
  }
  return <EmptyStateContent variant={variant} message={message} onRetry={onRetry} />
}
