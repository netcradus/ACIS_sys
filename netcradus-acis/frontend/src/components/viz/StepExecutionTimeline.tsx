import { useState } from 'react'
import { CheckCircle2, XCircle, CircleDashed, CircleDot, MinusCircle, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'

export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

export interface ExecutionStep {
  name: string
  status: StepStatus
  timestamp?: string
  /** Per-step detail text — SOAR's stepLog.message, RedTeam's stepLog.technique, etc. Callers normalize their own raw field into this. */
  output?: string
}

interface StepExecutionTimelineProps {
  steps: ExecutionStep[]
  /** 'live' adds a pulse animation to the current running step — pass while the underlying execution's status is still "running" (callers already poll every 5s; this only affects the visual, no new transport). */
  mode?: 'live' | 'historical'
  emptyLabel?: string
  className?: string
}

const STATUS_ICON: Record<StepStatus, typeof CheckCircle2> = {
  pending: CircleDashed,
  running: CircleDot,
  success: CheckCircle2,
  failed: XCircle,
  skipped: MinusCircle,
}

const STATUS_CLASS: Record<StepStatus, string> = {
  pending: 'text-text-muted',
  running: 'text-info',
  success: 'text-success',
  failed: 'text-danger',
  skipped: 'text-text-muted',
}

/**
 * Shared step-by-step execution timeline — replaces both SOAR's raw
 * JSON.parse(stepLogs) pretty-print dump and Red Team's static execution
 * table with a real per-step visual. Callers normalize their own raw
 * stepLogs shape (SOAR: {step, status, message, timestamp}; Red Team:
 * {stage, name, status, technique, timestamp}) into ExecutionStep[] at the
 * call site — this component doesn't know or care which backend produced it.
 */
export default function StepExecutionTimeline({ steps, mode = 'historical', emptyLabel = 'No step data yet', className }: StepExecutionTimelineProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  if (steps.length === 0) {
    return <div className={clsx('text-small text-text-muted py-4 text-center', className)}>{emptyLabel}</div>
  }

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className={className}>
      {steps.map((step, i) => {
        const Icon = STATUS_ICON[step.status]
        const isLive = mode === 'live' && step.status === 'running'
        const isOpen = expanded.has(i)
        const hasOutput = Boolean(step.output)

        return (
          <div key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {i < steps.length - 1 && (
              <span className="absolute left-[9px] top-5 bottom-0 w-px bg-fire-border" aria-hidden="true" />
            )}
            <span className={clsx('relative z-10 mt-0.5 flex-shrink-0', STATUS_CLASS[step.status], isLive && 'animate-pulse-slow')}>
              <Icon className="w-[18px] h-[18px]" />
            </span>
            <button
              type="button"
              disabled={!hasOutput}
              onClick={hasOutput ? () => toggle(i) : undefined}
              className={clsx(
                'flex-1 min-w-0 text-left rounded-lg px-2.5 py-1 -mt-1 transition-colors duration-fast',
                hasOutput && 'hover:bg-surface-2 cursor-pointer'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-small font-medium text-text-primary">{step.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {step.timestamp && <span className="text-label text-text-muted">{step.timestamp}</span>}
                  {hasOutput && (
                    <ChevronDown className={clsx('w-3.5 h-3.5 text-text-muted transition-transform duration-fast', isOpen && 'rotate-180')} />
                  )}
                </div>
              </div>
              {hasOutput && isOpen && (
                <p className="text-small text-text-secondary mt-1 leading-relaxed">{step.output}</p>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}
