import { clsx } from 'clsx'

interface HeatmapCell<T> {
  id: string
  item: T
}

interface HeatmapGridProps<T> {
  items: T[]
  getId: (item: T) => string
  getLabel: (item: T) => string
  /** Tailwind text/border/bg classes (e.g. from a severity token) for this cell's current state. */
  getColorClass: (item: T) => string
  getTooltip?: (item: T) => string
  onCellClick?: (item: T) => void
  columns?: number
  className?: string
}

/**
 * Generic coverage-matrix grid — generalizes RedTeamPage's hand-rolled MITRE
 * ATT&CK grid into a reusable primitive so any future coverage view
 * (compliance controls, detection rules by category, etc.) can reuse it
 * instead of re-deriving its own grid markup.
 */
export default function HeatmapGrid<T>({
  items,
  getId,
  getLabel,
  getColorClass,
  getTooltip,
  onCellClick,
  columns = 5,
  className,
}: HeatmapGridProps<T>) {
  const cells: HeatmapCell<T>[] = items.map((item) => ({ id: getId(item), item }))

  return (
    <div
      className={clsx('grid gap-2', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {cells.map(({ id, item }) => {
        const interactive = Boolean(onCellClick)
        return (
          <div
            key={id}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            title={getTooltip?.(item)}
            onClick={interactive ? () => onCellClick!(item) : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') onCellClick!(item)
                  }
                : undefined
            }
            className={clsx(
              'rounded-md border px-2 py-2 text-[0.6875rem] font-medium leading-tight transition-all duration-fast ease-standard',
              getColorClass(item),
              interactive && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-card focus-visible:-translate-y-0.5'
            )}
          >
            {getLabel(item)}
          </div>
        )
      })}
    </div>
  )
}
