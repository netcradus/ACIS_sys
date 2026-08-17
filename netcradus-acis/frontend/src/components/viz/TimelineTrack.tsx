import { clsx } from 'clsx'
import SeverityBadge, { type Severity } from './SeverityBadge'

export interface TimelineEvent {
  id: string
  timestamp: string
  title: string
  description?: string
  severity?: Severity
}

const SEVERITY_DOT_CLASS: Record<Severity, string> = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low',
  info: 'bg-severity-info',
}

interface TimelineTrackProps {
  events: TimelineEvent[]
  onEventClick?: (event: TimelineEvent) => void
  /** Caps rendered events (the underlying list may be longer — e.g. a live feed). */
  limit?: number
  emptyLabel?: string
  className?: string
}

/**
 * Vertical connected-node event track — the shared "threat timeline"
 * primitive for Dashboard's live feed and any investigation view that needs
 * a chronological, severity-colored event list instead of a plain table row.
 *
 * Status (reviewed during a production-readiness audit): built for the
 * documented SOC command-center redesign plan's "Part 1 — evolved design
 * language" component set. Not yet wired into DashboardPage.tsx (which
 * still has its own hand-rolled "Live Threat Feed" markup). Deliberately
 * left as-is rather than either force-wiring it now (out of scope for that
 * audit) or deleting it (the redesign plan is still active) — see that
 * plan for the intended integration point.
 */
export default function TimelineTrack({ events, onEventClick, limit, emptyLabel = 'No recent activity', className }: TimelineTrackProps) {
  const shown = limit ? events.slice(0, limit) : events

  if (shown.length === 0) {
    return <div className={clsx('text-small text-text-muted py-4 text-center', className)}>{emptyLabel}</div>
  }

  return (
    <div className={clsx('relative', className)}>
      {shown.map((event, i) => {
        const interactive = Boolean(onEventClick)
        return (
          <div key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < shown.length - 1 && (
              <span className="absolute left-[5px] top-3 bottom-0 w-px bg-fire-border" aria-hidden="true" />
            )}
            <span
              className={clsx(
                'relative z-10 mt-1.5 w-[11px] h-[11px] rounded-full ring-4 ring-background flex-shrink-0',
                event.severity ? SEVERITY_DOT_CLASS[event.severity] : 'bg-text-muted'
              )}
            />
            <button
              type="button"
              disabled={!interactive}
              onClick={interactive ? () => onEventClick!(event) : undefined}
              className={clsx(
                'flex-1 min-w-0 text-left rounded-lg px-2.5 py-1.5 -mt-1.5 transition-colors duration-fast',
                interactive && 'hover:bg-surface-2 cursor-pointer'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-small font-semibold text-text-primary truncate">{event.title}</span>
                {event.severity && <SeverityBadge severity={event.severity} size="sm" />}
              </div>
              {event.description && (
                <p className="text-small text-text-secondary mt-0.5 line-clamp-1">{event.description}</p>
              )}
              <span className="text-label text-text-muted">{event.timestamp}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
