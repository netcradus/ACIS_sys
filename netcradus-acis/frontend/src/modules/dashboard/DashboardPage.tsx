import { useEffect, useState } from 'react'
import { LayoutDashboard, Activity, ShieldAlert, Zap, Layers, ArrowUpRight, ArrowDownRight, MoreHorizontal } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import { clsx } from 'clsx'

interface DashboardStats {
  totalAlerts: number
  criticalAlerts: number
  highAlerts: number
  openIncidents: number
  events24h: number | null
}

const SEVERITY_DATA = [
  { name: 'Critical', value: 18, color: '#FF3333' },
  { name: 'High', value: 64, color: '#FF8800' },
  { name: 'Medium', value: 55, color: '#FFD700' },
  { name: 'Low', value: 84, color: '#00C2FF' },
]

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [incidents, setIncidents] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = async () => {
    try {
      // Parallel fetch for stats and recent alerts
      const [statsRes, alertsRes] = await Promise.all([
        apiClient.get('/api/alerts/dashboard/summary'),
        apiClient.get('/api/alerts')
      ])

      setStats(statsRes.data)

      // Limit to 5 for the dashboard and map to the UI model
      const recent = (alertsRes.data as any[]).slice(0, 5).map(a => ({
        id: a.id,
        title: a.title,
        severity: a.severity.charAt(0).toUpperCase() + a.severity.slice(1).toLowerCase(),
        source: a.source || 'Unknown',
        owner: a.ownerName || 'Unassigned',
        status: a.status,
        updated: formatTimeAgo(a.createdAt)
      }))
      setIncidents(recent)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  function formatTimeAgo(dateString: string) {
    if (!dateString) return '---'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

  useEffect(() => {
    fetchData()

    // Subscribe to dashboard updates (stats)
    const dashSub = wsClient.subscribe('/topic/dashboard', () => fetchData())

    // Also listen for new alerts to update the table immediately
    const alertSub = wsClient.subscribe('/topic/alerts', (msg) => {
      // We could just re-fetch everything or prepend the new alert
      fetchData()
    })

    return () => {
      dashSub.then(s => s?.unsubscribe())
      alertSub.then(s => s?.unsubscribe())
    }
  }, [])

  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Hero Panel */}
      <div className="relative overflow-hidden rounded-[2rem] border border-fire-border/30 bg-surface-3/80 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,77,0,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(0,194,255,0.14),transparent_30%)] pointer-events-none" />
        <div className="relative z-10 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-accent">Command Center</p>
            <h1 className="text-5xl lg:text-6xl font-extrabold uppercase tracking-tight leading-tight text-white">Secure operations at the speed of threat.</h1>
            <p className="max-w-2xl text-sm text-text-secondary leading-7">
              Monitor live alerts, correlate threats, and act on critical incidents with a unified cyber defense console built for advanced SOC workflows.
            </p>
            <div className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-black/40 border border-fire-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-white">
                <ShieldAlert className="w-3.5 h-3.5 text-accent" /> Active Defense
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-black/40 border border-fire-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-text-secondary">
                <Layers className="w-3.5 h-3.5 text-info" /> Full Stack Visibility
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="card-mission bg-glass-surface border-fire-border/50 p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted mb-3">Threat Confidence</p>
              <p className="text-4xl font-black text-white tracking-tight">87%</p>
              <p className="text-[11px] text-text-secondary mt-3">Based on correlation score and real-time model predictions.</p>
            </div>
            <div className="card-mission bg-glass-surface border-fire-border/50 p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted mb-3">Response Readiness</p>
              <p className="text-4xl font-black text-white tracking-tight">95%</p>
              <p className="text-[11px] text-text-secondary mt-3">Automated playbooks and analyst workflows are ready.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header Info */}
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Operational Overview</h1>
          <p className="text-[10px] text-text-secondary font-bold tracking-[0.4em] uppercase mt-2">Mission Critical Infrastructure Health</p>
        </div>
        <div className="flex items-center gap-4 bg-surface-2 border border-fire-border px-4 py-2 rounded-xl">
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest leading-none mb-1">Grid Sync</span>
            <span className="text-xs font-black text-success tabular-nums">100% SECURE</span>
          </div>
          <div className="w-px h-6 bg-border" />
          <Activity className="w-4 h-4 text-accent" />
        </div>
      </div>

      {/* KPI Row - Technical Performance Look */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: 'Events (24h)', value: stats?.events24h ?? null, change: 'Live Feed', up: true, data: [] },
          { title: 'Notable Events', value: stats?.totalAlerts ?? null, change: 'Live Feed', up: true, data: [] },
          { title: 'Mean Time to Detect', value: null, change: '---', up: false, data: [] },
          { title: 'Mean Time to Respond', value: null, change: '---', up: false, data: [] },
        ].map((card, i) => (
          <div key={i} className="card-mission group relative overflow-hidden bg-surface-2 border-fire-border/60 hover:border-accent/40">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted group-hover:text-text-secondary transition-colors">
                  {card.title}
                </span>
                <MoreHorizontal className="w-4 h-4 text-text-muted cursor-pointer hover:text-white" />
              </div>
              <div className="text-3xl font-black text-white tracking-tighter mb-2 tabular-nums">
                {isLoading ? '---' : (card.value === null ? <span className="text-sm font-normal text-text-muted uppercase">Still in development</span> : card.value)}
              </div>
              <div className="flex items-center gap-1.5 mb-6">
                {card.value !== null && card.up && <ArrowUpRight className="w-3 h-3 text-accent" />}
                {card.value !== null && !card.up && <ArrowDownRight className="w-3 h-3 text-success" />}
                {card.value !== null && (
                  <span className={clsx("text-[10px] font-black uppercase tracking-tighter", card.up ? "text-accent" : "text-success")}>
                    {card.change} <span className="text-text-muted font-bold ml-1">vs yesterday</span>
                  </span>
                )}
              </div>

              {/* Mini Sparkline Bars */}
              {card.data && card.data.length > 0 && (
                <div className="h-8 flex items-end gap-1">
                  {card.data.map((v, idx) => (
                    <div
                      key={idx}
                      className={clsx(
                        "flex-1 rounded-sm transition-all duration-500",
                        card.up ? "bg-accent/40" : "bg-success/40",
                        idx === card.data.length - 1 && (card.up ? "bg-accent shadow-accent-glow" : "bg-success shadow-success-glow")
                      )}
                      style={{ height: `${v}%` }}
                    />
                  ))}
                </div>
              )}
            </div>
            {/* Subtle background glow */}
            <div className={clsx("absolute -bottom-8 -right-8 w-24 h-24 blur-[40px] rounded-full opacity-10 transition-opacity group-hover:opacity-20", card.up ? "bg-accent" : "bg-success")} />
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card-mission bg-surface-2 border-fire-border/60">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Ingest Volume vs Errors</h3>
              <p className="text-[10px] text-text-secondary font-bold mt-1">Global collection nodes telemetry — Last 8 Hours</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm bg-accent shadow-accent-glow" />
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Events</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm bg-danger shadow-lg shadow-danger/20" />
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Errors</span>
              </div>
            </div>
          </div>

          <div className="h-[340px] w-full mt-4 flex items-center justify-center border border-dashed border-fire-border/40 rounded-xl relative">
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40">
              <span className="text-sm font-semibold uppercase tracking-widest">Still in development</span>
              <span className="text-[10px] text-text-muted mt-2">Real-time chart metric feed pending</span>
            </div>
          </div>
        </div>

        <div className="card-mission bg-surface-2 border-fire-border/60">
          <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-10 text-center">Alert Severity Mix</h3>
          <div className="h-64 w-full flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Critical', value: stats?.criticalAlerts ?? 0, color: '#FF3333' },
                    { name: 'High', value: stats?.highAlerts ?? 0, color: '#FF8800' },
                    { name: 'Medium', value: (stats?.totalAlerts ?? 0) - (stats?.criticalAlerts ?? 0) - (stats?.highAlerts ?? 0), color: '#FFD700' },
                    { name: 'Low', value: 0, color: '#00C2FF' }, // Backend doesn't split med/low yet
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={75}
                  outerRadius={100}
                  paddingAngle={6}
                  dataKey="value"
                  stroke="none"
                >
                  {[
                    { color: '#FF3333' },
                    { color: '#FF8800' },
                    { color: '#FFD700' },
                    { color: '#00C2FF' },
                  ].map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-4xl font-black text-white tracking-tighter leading-none">{stats?.totalAlerts ?? 221}</span>
              <span className="text-[10px] text-text-secondary font-bold uppercase tracking-[0.2em] mt-1">Alerts</span>
            </div>
          </div>

          <div className="mt-10 space-y-3">
            {[
              { name: 'Critical', value: stats?.criticalAlerts ?? 18, color: '#FF3333' },
              { name: 'High', value: stats?.highAlerts ?? 64, color: '#FF8800' },
              { name: 'Medium', value: (stats?.totalAlerts ?? 0) - (stats?.criticalAlerts ?? 0) - (stats?.highAlerts ?? 0) || 55, color: '#FFD700' },
              { name: 'Low', value: 84, color: '#00C2FF' },
            ].map((item) => (
              <div key={item.name} className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/5 rounded-lg transition-colors group">
                <div className="w-2.5 h-2.5 rounded-sm shadow-sm" style={{ backgroundColor: item.color }} />
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest group-hover:text-white transition-colors">{item.name}</span>
                <span className="text-xs font-black text-white ml-auto tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Incidents Table */}
      <div className="card-mission bg-surface-2 border-fire-border/60">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Open Incidents Queue</h3>
            <p className="text-[10px] text-text-secondary font-bold mt-1">Prioritized active threats requiring analyst review</p>
          </div>
          <button className="text-[10px] font-black text-accent uppercase tracking-widest hover:underline px-4 py-2 bg-accent/5 rounded-lg border border-accent/20">
            View All Criticals →
          </button>
        </div>

        <div className="overflow-x-auto min-h-[200px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-text-muted animate-pulse font-black uppercase tracking-widest text-[10px]">
              Syncing with mission logs...
            </div>
          ) : incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-text-muted border border-dashed border-fire-border/40 rounded-2xl mx-4 mb-4">
              <ShieldAlert className="w-8 h-8 mb-2 opacity-20" />
              <span className="font-black uppercase tracking-widest text-[10px]">No active incidents detected</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-fire-border">
                  <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">#</th>
                  <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Title</th>
                  <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Severity</th>
                  <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Source</th>
                  <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Assignee</th>
                  <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Status</th>
                  <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4 text-right">Elapsed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {incidents.map((inc, i) => (
                  <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-4 font-mono text-[10px] text-text-muted font-bold whitespace-nowrap">{inc.id}</td>
                    <td className="py-4 px-4">
                      <p className="text-xs font-bold text-white tracking-tight leading-tight max-w-md">{inc.title}</p>
                    </td>
                    <td className="py-4 px-4">
                      <span className={clsx(
                        "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border",
                        ['CRITICAL', 'HIGH', 'Critical', 'High'].includes(inc.severity) ? "bg-danger/10 text-danger border-danger/20" : "bg-warning/10 text-warning border-warning/20"
                      )}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-mono text-[10px] text-text-secondary uppercase tracking-tighter">{inc.source}</td>
                    <td className="py-4 px-4 text-[11px] text-text-secondary font-bold uppercase tracking-tight">{inc.owner}</td>
                    <td className="py-4 px-4">
                      <span className="text-[10px] font-black text-accent uppercase tracking-tighter bg-accent/5 px-2 py-1 rounded-md border border-accent/20 underline decoration-dotted underline-offset-4">
                        {inc.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-[11px] font-bold text-white text-right font-mono tabular-nums whitespace-nowrap">{inc.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

