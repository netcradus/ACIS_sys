import { ReactNode } from 'react'
import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import Sparkline from '../viz/Sparkline'

interface KpiTileProps {
  title: string
  /** null renders the "still in development" placeholder state instead of a number — matches this codebase's no-fake-data precedent for metrics with no real backend source yet (e.g. MTTD/MTTR). */
  value: number | string | null
  loading?: boolean
  trend?: { label: string; direction: 'up' | 'down' }
  sparklineData?: number[]
  /** Present + non-null value + a handler together make the tile a real drill-down control instead of decorative. */
  onClick?: () => void
  accentClass?: 'accent' | 'accent-pa'
  className?: string
  children?: ReactNode
}

const ACCENT = {
  accent: { text: 'text-accent', border: 'hover:border-accent/40', glow: 'bg-accent' },
  'accent-pa': { text: 'text-accent-pa', border: 'hover:border-accent-pa/40', glow: 'bg-accent-pa' },
} as const

/**
 * Replaces Dashboard's inline KPI tile markup — the previous version's "⋯"
 * icon and (on some tiles) a "View All" affordance had no onClick at all.
 * Real drill-down: pass onClick (typically wired through useEntityPivot) and
 * the whole tile becomes a real button, not just its value.
 */
export default function KpiTile({
  title,
  value,
  loading,
  trend,
  sparklineData,
  onClick,
  accentClass = 'accent',
  className,
  children,
}: KpiTileProps) {
  const styles = ACCENT[accentClass]
  const interactive = Boolean(onClick) && value !== null && !loading

  const content = (
    <>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-label uppercase text-text-muted group-hover:text-text-secondary transition-colors">
            {title}
          </span>
          {interactive && (
            <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text-primary group-hover:translate-x-0.5 transition-all" />
          )}
        </div>
        <div className="text-h1 text-text-primary mb-2 tabular-nums">
          {loading ? '—' : value === null ? (
            <span className="text-small font-normal text-text-muted">Still in development</span>
          ) : (
            value
          )}
        </div>
        {value !== null && trend && (
          <div className="flex items-center gap-1.5 mb-2">
            {trend.direction === 'up' ? (
              <ArrowUpRight className={clsx('w-3 h-3', styles.text)} />
            ) : (
              <ArrowDownRight className="w-3 h-3 text-success" />
            )}
            <span className={clsx('text-small font-medium', trend.direction === 'up' ? styles.text : 'text-success')}>
              {trend.label}
            </span>
          </div>
        )}
        {value !== null && sparklineData && sparklineData.length > 1 && (
          <Sparkline data={sparklineData} className="mt-1" />
        )}
        {children}
      </div>
      <div className={clsx('absolute -bottom-8 -right-8 w-24 h-24 blur-[40px] rounded-full opacity-10 transition-opacity group-hover:opacity-20', styles.glow)} />
    </>
  )

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          'card-mission group relative overflow-hidden bg-surface-2 border-fire-border/60 text-left w-full transition-colors',
          styles.border,
          className
        )}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={clsx('card-mission group relative overflow-hidden bg-surface-2 border-fire-border/60', styles.border, className)}>
      {content}
    </div>
  )
}
