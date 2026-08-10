import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts'
import { useChartColors } from '../../hooks/useChartColors'

interface SparklineProps {
  /** Plain numeric series, oldest first — no timestamps needed for a trend indicator. */
  data: number[]
  /** Defaults to the current accent token. Pass a severity/status token color for KPI tiles that track a specific metric. */
  color?: string
  height?: number
  className?: string
}

/**
 * Minimal trend-line for KPI tiles — no axes/legend/tooltip, just the shape
 * of the trend. Thin wrapper around the same recharts primitive already used
 * by DashboardPage's AreaChart/LogExplorerPage's BarChart, routed through
 * useChartColors() so it re-themes with the rest of the app.
 */
export default function Sparkline({ data, color, height = 32, className }: SparklineProps) {
  const colors = useChartColors()
  const strokeColor = color ?? colors.accent
  const chartData = data.map((value, i) => ({ i, value }))

  if (data.length < 2) return <div className={className} style={{ height }} />

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
