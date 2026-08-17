import { useChartColors } from '../../hooks/useChartColors'

interface GaugeThreshold {
  /** Upper bound (as a % of max, 0-100) this color applies up to. */
  upTo: number
  color: string
}

interface GaugeProps {
  value: number
  max?: number
  label?: string
  /** Sub-label under the numeric value, e.g. a unit ("%", "ms"). */
  unit?: string
  /** Color bands by percentage-of-max, evaluated in order. Defaults to a success/warning/danger ramp. */
  thresholds?: GaugeThreshold[]
  size?: number
  className?: string
}

const RADIUS = 42
const STROKE = 8
const CIRCUMFERENCE = Math.PI * RADIUS // half-circle arc

/**
 * Hand-built SVG radial gauge (no charting-library dependency needed) —
 * replaces Dashboard's hand-rolled CPU-gauge divs with a reusable, threshold-
 * colored arc. A half-circle sweep (180°) reads clearly at small sizes,
 * matching the compact gauges CrowdStrike/Sentinel-style consoles use for
 * single-metric tiles.
 *
 * Status (reviewed during a production-readiness audit): built for the
 * documented SOC command-center redesign plan's "Part 1 — evolved design
 * language" component set. Not yet wired into DashboardPage.tsx (which
 * still uses its own hand-rolled gauge markup). Deliberately left as-is
 * rather than either force-wiring it now (out of scope for that audit) or
 * deleting it (the redesign plan is still active) — see that plan for the
 * intended integration point.
 */
export default function Gauge({ value, max = 100, label, unit, thresholds, size = 120, className }: GaugeProps) {
  const colors = useChartColors()
  const bands: GaugeThreshold[] = thresholds ?? [
    { upTo: 60, color: colors.success },
    { upTo: 85, color: colors.warning },
    { upTo: 100, color: colors.danger },
  ]

  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const activeColor = bands.find((b) => pct <= b.upTo)?.color ?? bands[bands.length - 1].color
  const offset = CIRCUMFERENCE * (1 - pct / 100)

  return (
    <div className={className} style={{ width: size }}>
      <svg viewBox="0 0 100 56" width={size} height={size * 0.56} className="overflow-visible">
        <path
          d="M 8 50 A 42 42 0 0 1 92 50"
          fill="none"
          stroke={colors.surface2}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        <path
          d="M 8 50 A 42 42 0 0 1 92 50"
          fill="none"
          stroke={activeColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset var(--duration-base) var(--ease-standard), stroke var(--duration-base) var(--ease-standard)' }}
        />
      </svg>
      <div className="text-center -mt-2">
        <div className="text-h3 font-bold text-text-primary tabular-nums">
          {Math.round(value)}
          {unit && <span className="text-small font-medium text-text-muted ml-0.5">{unit}</span>}
        </div>
        {label && <div className="text-label uppercase text-text-muted mt-0.5">{label}</div>}
      </div>
    </div>
  )
}
