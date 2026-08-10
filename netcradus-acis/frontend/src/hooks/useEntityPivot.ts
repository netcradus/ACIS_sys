import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

// 'severity' covers Dashboard KPI drill-downs (e.g. "Notable Events" ->
// Alerts pre-filtered to a severity tier) — the same mechanism as an entity
// pivot, just seeding a filter value instead of a specific entity's value.
export type PivotEntityType = 'ip' | 'host' | 'asset' | 'rule' | 'ioc' | 'severity'

export interface PivotTarget {
  type: PivotEntityType
  value: string
}

const PARAM_TYPE = 'pivotType'
const PARAM_VALUE = 'pivotValue'

/**
 * Sender side of the cross-module pivot mechanism — thin wrapper around
 * useNavigate, no new state store. Clicking a PivotChip (e.g. an IP in
 * AlertsPage) calls pivotTo(), which lands the user on the target module
 * pre-filtered via query params that page reads on mount via usePivotSeed().
 * Purely client-side: works because every target page already has its own
 * local filter state — this just seeds it.
 */
export function useEntityPivot() {
  const navigate = useNavigate()

  function pivotTo(route: string, target: PivotTarget) {
    const params = new URLSearchParams({ [PARAM_TYPE]: target.type, [PARAM_VALUE]: target.value })
    navigate(`${route}?${params.toString()}`)
  }

  return { pivotTo }
}

/**
 * Receiver side — call once in a target page (AssetsPage, AlertsPage,
 * LogExplorerPage, ThreatIntelPage) to read a pivot seed at mount and have
 * the params cleared from the URL right after, so back/forward navigation
 * and manual URL edits don't re-trigger the same filter unexpectedly.
 * The returned value is captured once (lazy useState init) so it stays
 * stable even after the params are cleared on the next render.
 */
export function usePivotSeed(): PivotTarget | null {
  const [searchParams, setSearchParams] = useSearchParams()

  const [seed] = useState<PivotTarget | null>(() => {
    const type = searchParams.get(PARAM_TYPE) as PivotEntityType | null
    const value = searchParams.get(PARAM_VALUE)
    return type && value ? { type, value } : null
  })

  useEffect(() => {
    if (!searchParams.has(PARAM_TYPE) && !searchParams.has(PARAM_VALUE)) return
    const next = new URLSearchParams(searchParams)
    next.delete(PARAM_TYPE)
    next.delete(PARAM_VALUE)
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return seed
}
