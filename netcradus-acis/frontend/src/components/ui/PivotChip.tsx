import { clsx } from 'clsx'
import { ArrowUpRight } from 'lucide-react'
import { useEntityPivot, type PivotEntityType } from '../../hooks/useEntityPivot'

interface PivotChipProps {
  value: string
  type: PivotEntityType
  /** Target module route this value should filter, e.g. '/dashboard/assets'. */
  route: string
  /** Overrides the displayed text (defaults to the raw value). */
  label?: string
  className?: string
}

/**
 * Renders a value (IP, host, asset id, rule id) as a clickable pivot instead
 * of plain text — closes the gap where entities across Alerts/Assets/
 * ThreatIntel/LogExplorer were previously inert strings with no way to jump
 * to the same value in another module.
 */
export default function PivotChip({ value, type, route, label, className }: PivotChipProps) {
  const { pivotTo } = useEntityPivot()

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        pivotTo(route, { type, value })
      }}
      title={`Pivot to ${type}: ${value}`}
      className={clsx(
        'group inline-flex items-center gap-0.5 font-mono text-text-primary hover:text-accent transition-colors duration-fast underline decoration-dotted decoration-fire-border underline-offset-2 hover:decoration-accent',
        className
      )}
    >
      {label ?? value}
      <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}
