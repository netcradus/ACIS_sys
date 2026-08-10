import { clsx } from 'clsx'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

const SEVERITY_CLASSES: Record<Severity, string> = {
  critical: 'text-severity-critical border-severity-critical/30 bg-severity-critical/10',
  high: 'text-severity-high border-severity-high/30 bg-severity-high/10',
  medium: 'text-severity-medium border-severity-medium/30 bg-severity-medium/10',
  low: 'text-severity-low border-severity-low/30 bg-severity-low/10',
  info: 'text-severity-info border-severity-info/30 bg-severity-info/10',
}

const DEFAULT_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
}

interface SeverityBadgeProps {
  severity: Severity
  /** Overrides the default title-cased severity name (e.g. a raw API string). */
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Single source of truth for severity color coding — replaces the hand-rolled
 * severity <span> markup previously duplicated across AlertsPage/RedTeamPage/
 * CompliancePage, each with its own ad hoc color mapping.
 */
export default function SeverityBadge({ severity, label, size = 'md', className }: SeverityBadgeProps) {
  return (
    <span
      className={clsx(
        'badge-mission',
        SEVERITY_CLASSES[severity],
        size === 'sm' && 'px-2 py-0.5 text-[0.625rem]',
        className
      )}
    >
      {label ?? DEFAULT_LABEL[severity]}
    </span>
  )
}

/** Normalizes a raw API severity string (any casing) to the Severity union, defaulting to 'info' for unrecognized values. */
export function toSeverity(raw: string | null | undefined): Severity {
  const v = (raw ?? '').toLowerCase()
  if (v === 'critical' || v === 'p1') return 'critical'
  if (v === 'high') return 'high'
  if (v === 'medium' || v === 'moderate') return 'medium'
  if (v === 'low') return 'low'
  return 'info'
}
