import { useEffect, useState } from 'react'
import { useThemeStore } from '../store/themeStore'

export interface ChartColors {
  accent:        string
  accentLight:   string
  success:       string
  warning:       string
  danger:        string
  info:          string
  severityHigh:   string
  severityMedium: string
  textSecondary: string
  textMuted:     string
  border:        string
  surface:       string
  surface2:      string
}

const TOKENS: Array<[keyof ChartColors, string]> = [
  ['accent', '--accent'],
  ['accentLight', '--accent-light'],
  ['success', '--success'],
  ['warning', '--warning'],
  ['danger', '--danger'],
  ['info', '--info'],
  ['severityHigh', '--severity-high'],
  ['severityMedium', '--severity-medium'],
  ['textSecondary', '--text-secondary'],
  ['textMuted', '--text-muted'],
  ['border', '--border'],
  ['surface', '--surface'],
  ['surface2', '--surface-2'],
]

function readChartColors(): ChartColors {
  const styles = getComputedStyle(document.documentElement)
  const result = {} as ChartColors
  for (const [key, cssVar] of TOKENS) {
    result[key] = styles.getPropertyValue(cssVar).trim()
  }
  return result
}

/**
 * Recharts takes literal color strings, not CSS custom properties, so chart
 * consumers (DashboardPage, LogExplorerPage) resolve the app's current
 * tokens through this hook instead of hardcoding hex — re-reads whenever
 * `resolvedTheme` flips so charts re-theme along with the rest of the app.
 */
export function useChartColors(): ChartColors {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const [colors, setColors] = useState<ChartColors>(() => readChartColors())

  useEffect(() => {
    setColors(readChartColors())
  }, [resolvedTheme])

  return colors
}
