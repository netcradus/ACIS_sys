import { useEffect, useState, useMemo } from 'react'
import {
  LayoutDashboard,
  Activity,
  ShieldAlert,
  Zap,
  Layers,
  ArrowUpRight,
  Terminal,
  RefreshCw,
  Play,
  ShieldCheck,
  Network,
  Cloud,
  Database,
  Sliders,
  Binary,
  GitBranch,
  Dna,
  Share2,
  Crosshair,
  KeyRound,
  FileCode2,
  AlertTriangle,
  Cpu,
  Brain,
  ChevronRight,
  Ban,
  MonitorOff,
  Bug,
  ClipboardCheck,
  MapPin
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { useNavigate } from 'react-router-dom'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import { clsx } from 'clsx'
import { useChartColors } from '@/hooks/useChartColors'
import { useCanRead, MODULES } from '@/store/permissionsStore'
import { useEntityPivot } from '@/hooks/useEntityPivot'
import KpiTile from '@/components/ui/KpiTile'
import TimelineTrack, { type TimelineEvent } from '@/components/viz/TimelineTrack'
import { toSeverity } from '@/components/viz/SeverityBadge'

interface DashboardStats {
  totalAlerts: number
  criticalAlerts: number
  highAlerts: number
  openIncidents: number
  events24h: number | null
}

interface RedTeamSimulation {
  id: string
  name: string
  description: string
  steps: string
}

interface RedTeamExecution {
  id: string
  simulationId: string
  status: 'running' | 'completed' | 'failed'
  stepLogs: string
  startedAt: string | null
  completedAt: string | null
}

/** Same phishing/lateral/other classification RedTeamService.executeSimulationAsync
 * uses server-side to pick a scenario's synthetic log stages — reused here so the
 * simulator's decorative "which SOAR action is active" panel stays consistent
 * with what the real backend execution is actually doing. */
function simulationCategory(name: string): 'phishing' | 'lateral' | 'other' {
  const n = name.toLowerCase()
  if (n.includes('phishing')) return 'phishing'
  if (n.includes('lateral')) return 'lateral'
  return 'other'
}

export default function DashboardPage() {
  const chartColors = useChartColors()
  const navigate = useNavigate()
  const { pivotTo } = useEntityPivot()
  const canReadSoarPlaybooks = useCanRead(MODULES.SOAR_PLAYBOOKS)
  const [activeTab, setActiveTab] = useState<'architecture' | 'overview'>('architecture')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [incidents, setIncidents] = useState<any[]>([])
  const [severityCounts, setSeverityCounts] = useState<{ critical: number; high: number; medium: number; low: number } | null>(null)
  const [responseReadiness, setResponseReadiness] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Simulation State Machine — driven by real acis-soar Red Team executions,
  // not a scripted setTimeout sequence. simVector holds the real
  // RedTeamSimulation.id being run.
  const [simState, setSimState] = useState<'idle' | 'simulating'>('idle')
  const [simVector, setSimVector] = useState<string | null>(null)
  const [simStep, setSimStep] = useState<number>(0)
  const [simRisk, setSimRisk] = useState<number>(20)
  const [simLogs, setSimLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] [SYSTEM] Monitoring system telemetry. State: 100% SECURE.`
  ])
  const [gridNodes, setGridNodes] = useState<('secure' | 'probing' | 'compromised' | 'contained')[]>(
    Array(24).fill('secure')
  )
  const [redTeamSimulations, setRedTeamSimulations] = useState<RedTeamSimulation[]>([])
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null)
  const [loggedStages, setLoggedStages] = useState<number>(0)

  // Real ingest-pipeline telemetry — GET /api/logs/ingest-stats
  // (IngestMetricsService/acis-log-service) tracks the genuine gap between
  // a log's ingest-receipt timestamp and the moment the Kafka consumer
  // finishes processing it, plus that service's real JVM CPU load. Replaces
  // what used to be Math.random()-based synthetic history and a hardcoded
  // cpuUsage constant.
  const [ingestStats, setIngestStats] = useState<{ lagSeriesMs: number[]; cpuUsagePercent: number } | null>(null)

  useEffect(() => {
    const fetchIngestStats = async () => {
      try {
        const res = await apiClient.get('/api/logs/ingest-stats')
        setIngestStats(res.data)
      } catch (e) {
        console.error('Failed to fetch ingest stats:', e)
      }
    }
    fetchIngestStats()
    const interval = setInterval(fetchIngestStats, 5000)
    return () => clearInterval(interval)
  }, [])

  const ingestLagHistory = (ingestStats?.lagSeriesMs ?? []).map((v, i) => ({ t: i, v }))
  const cpuUsage = Math.round(ingestStats?.cpuUsagePercent ?? 0)

  // Real live feed — derived from the same real, WebSocket-refreshed alert
  // data already fetched into `incidents` below, instead of a static
  // 4-item array with fabricated relative timestamps that never updated.
  const threatFeedEvents: TimelineEvent[] = incidents.slice(0, 4).map((inc, i) => ({
    id: String(inc.incidentNumber ?? inc.id ?? i),
    title: inc.title,
    description: inc.source,
    timestamp: inc.updated,
    severity: toSeverity(inc.severity),
  }))

  const attackMapNodes = [
    { id: 'n1', x: 22, y: 38 },
    { id: 'n2', x: 48, y: 28 },
    { id: 'n3', x: 52, y: 58 },
    { id: 'n4', x: 78, y: 40 },
    { id: 'n5', x: 68, y: 66 },
  ]
  const attackMapLinks: [string, string][] = [
    ['n1', 'n2'],
    ['n2', 'n4'],
    ['n3', 'n5'],
    ['n1', 'n3'],
  ]

  const fetchData = async () => {
    try {
      const [statsRes, alertsRes] = await Promise.all([
        apiClient.get('/api/alerts/dashboard/summary'),
        apiClient.get('/api/alerts')
      ])

      setStats(statsRes.data)
      // Real per-severity counts computed from the same real alert list
      // already fetched here — replaces a pie chart that used to show a
      // hardcoded Low count (0 in the chart itself, 84 in the legend right
      // below it) and Medium/Critical/High fallback literals whenever
      // stats hadn't loaded yet.
      const allAlerts = alertsRes.data as any[]
      setSeverityCounts({
        critical: allAlerts.filter(a => a.severity === 'CRITICAL').length,
        high: allAlerts.filter(a => a.severity === 'HIGH').length,
        medium: allAlerts.filter(a => a.severity === 'MEDIUM').length,
        low: allAlerts.filter(a => a.severity === 'LOW').length,
      })
      // Real "Response Readiness": share of open alerts that already have
      // an assigned owner (ownerId), i.e. actively being worked rather than
      // sitting unassigned — replaces a hardcoded "95%".
      const openAlerts = allAlerts.filter(a => a.status === 'OPEN' || a.status === 'INVESTIGATING')
      setResponseReadiness(openAlerts.length === 0 ? 100 : Math.round((openAlerts.filter(a => a.ownerId).length / openAlerts.length) * 100))
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

  const fetchRedTeamSimulations = async () => {
    try {
      const response = await apiClient.get<RedTeamSimulation[]>('/api/red-team/simulations')
      setRedTeamSimulations(response.data || [])
    } catch (error) {
      console.error('Failed to fetch red team simulations:', error)
    }
  }

  useEffect(() => {
    fetchData()
    // Red Team simulations require SOAR Playbooks READ (same module the
    // Red Team nav item itself is gated on) — skipping the call entirely
    // for a user who lacks it avoids a 403 console error and an honestly
    // wrong "no campaigns configured" message for campaigns that exist but
    // just aren't visible to them.
    if (canReadSoarPlaybooks) {
      fetchRedTeamSimulations()
    }
    const dashSub = wsClient.subscribe('/topic/dashboard', () => fetchData())
    const alertSub = wsClient.subscribe('/topic/alerts', () => fetchData())

    return () => {
      dashSub.then(s => s?.unsubscribe())
      alertSub.then(s => s?.unsubscribe())
    }
  }, [canReadSoarPlaybooks])

  // Add Log Entry Utility
  const logMsg = (sender: string, text: string) => {
    const time = new Date().toLocaleTimeString()
    setSimLogs(prev => [`[${time}] [${sender}] ${text}`, ...prev])
  }

  function parseStepLogs(stepLogsJson: string): { stage: number; name: string; technique: string | null }[] {
    try {
      const parsed = JSON.parse(stepLogsJson)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function parseDeclaredStepCount(stepsJson: string): number {
    try {
      const parsed = JSON.parse(stepsJson)
      return Array.isArray(parsed) ? parsed.length : 1
    } catch {
      return 1
    }
  }

  const activeSimulation = useMemo(
    () => redTeamSimulations.find(s => s.id === simVector) || null,
    [redTeamSimulations, simVector]
  )

  // Trigger a real Red Team execution — POSTs to acis-soar, which actually
  // runs the campaign (real synthetic events sent to Kafka, real MITRE
  // technique tags, real step_logs persisted per execution) rather than
  // a client-side scripted narrative.
  const runSimulation = async (simulationId: string) => {
    if (simState === 'simulating') return
    const simulation = redTeamSimulations.find(s => s.id === simulationId)
    if (!simulation) return

    setSimState('simulating')
    setSimVector(simulationId)
    setSimStep(1)
    setSimRisk(70)
    setLoggedStages(0)
    setSimLogs([])
    setGridNodes(Array(24).fill('secure'))
    logMsg('RED TEAM', `Initiating real campaign: '${simulation.name}' mapping to MITRE ATT&CK matrix...`)

    try {
      const response = await apiClient.post<RedTeamExecution>(`/api/red-team/simulations/${simulationId}/start`)
      setActiveExecutionId(response.data.id)
    } catch (err) {
      console.error('Failed to start simulation', err)
      logMsg('SYSTEM', 'Failed to start campaign — see console for details.')
      setSimState('idle')
      setSimVector(null)
      setSimStep(0)
    }
  }

  // Poll the real execution this session started, rendering its real
  // persisted step_logs as they land instead of a fixed setTimeout script.
  useEffect(() => {
    if (simState !== 'simulating' || !activeExecutionId) return
    let cancelled = false

    const poll = async () => {
      try {
        const response = await apiClient.get<RedTeamExecution>(`/api/red-team/executions/${activeExecutionId}`)
        const execution = response.data
        if (cancelled) return

        const steps = parseStepLogs(execution.stepLogs)
        if (steps.length > loggedStages) {
          steps.slice(loggedStages).forEach(step => {
            const tag = step.technique ? ` [${step.technique}]` : ''
            logMsg('RED TEAM', `${step.name}${tag}`)
          })
          setLoggedStages(steps.length)
        }

        const declaredTotal = Math.max(
          activeSimulation ? parseDeclaredStepCount(activeSimulation.steps) : 1,
          steps.length,
          1
        )
        const progress = Math.min(1, steps.length / declaredTotal)
        const litCount = Math.round(progress * 24)
        setGridNodes(prev => prev.map((_, idx) =>
          idx >= litCount ? 'secure' : execution.status === 'completed' ? 'contained' : 'compromised'
        ))
        setSimStep(execution.status === 'running' ? Math.min(4, 2 + Math.floor(progress * 2)) : 5)

        if (execution.status === 'completed' || execution.status === 'failed') {
          logMsg('SYSTEM', execution.status === 'completed'
            ? 'Closed-loop cycle complete. Grid state: 100% SECURE.'
            : 'Campaign execution failed — see acis-soar service logs.')
          setSimRisk(20)
          setTimeout(() => {
            setSimState('idle')
            setSimVector(null)
            setSimStep(0)
            setActiveExecutionId(null)
            setLoggedStages(0)
            setGridNodes(Array(24).fill('secure'))
          }, 2500)
        }
      } catch (err) {
        console.error('Failed to poll execution status', err)
      }
    }

    poll()
    const interval = setInterval(poll, 1500)
    return () => { cancelled = true; clearInterval(interval) }
  }, [simState, activeExecutionId, loggedStages, activeSimulation])

  const activeVectorLabel = activeSimulation?.name || 'Campaign Verification'

  return (
    <div className="space-y-6 animate-fade-in relative min-h-screen text-text-primary pb-12">
      {/* Top Banner and Navigation Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between border-b border-fire-border pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <h1 className="text-lg font-medium tracking-tight text-text-primary">Autonomous Cyber Immune System</h1>
          </div>
          <p className="text-small text-text-secondary mt-1">
            Real-time closed-loop security automation & validation console
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 w-fit">
          <button
            onClick={() => setActiveTab('architecture')}
            className={clsx(
              "px-4 py-2 rounded-lg text-small font-semibold transition-colors duration-150 border",
              activeTab === 'architecture'
                ? "bg-accent border-accent text-white"
                : "bg-surface-2 border-fire-border text-text-secondary hover:text-text-primary hover:border-accent/30"
            )}
          >
            Immune Architecture
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            className={clsx(
              "px-4 py-2 rounded-lg text-small font-semibold transition-colors duration-150 border",
              activeTab === 'overview'
                ? "bg-accent border-accent text-white"
                : "bg-surface-2 border-fire-border text-text-secondary hover:text-text-primary hover:border-accent/30"
            )}
          >
            SOC Operational View
          </button>
        </div>
      </div>

      {activeTab === 'architecture' ? (
        <div className="space-y-6">
          {/* Cyber Immune Flow Chart View */}
          
          {/* Simulation Dashboard Controller */}
          <div className="relative overflow-hidden rounded-[2rem] border border-fire-border bg-surface-2 p-6 shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent)_8%,transparent),transparent_40%)] pointer-events-none" />
            
            <div className="relative z-10 flex flex-col xl:flex-row gap-6 items-start xl:items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="badge-mission bg-accent/10 border-accent text-accent">Active Sandbox Mode</span>
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Closed-loop simulator</span>
                </div>
                <h2 className="text-lg font-medium text-text-primary tracking-tight">Closed-Loop Attack & Remediation Simulator</h2>
                <p className="max-w-2xl text-[11px] uppercase tracking-[0.1em] text-text-secondary">
                  Select a real Red Team campaign to run against acis-soar. Watch as the system moves through the defense lifecycle using the campaign's actual persisted execution log.
                </p>
              </div>

              {/* Simulation Selectors — real campaigns from this tenant's Red Team library */}
              <div className="flex flex-wrap gap-2 w-full xl:w-auto">
                {!canReadSoarPlaybooks && (
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    Your role doesn't have access to SOAR Playbooks — ask an admin for access to run campaigns
                  </span>
                )}
                {canReadSoarPlaybooks && redTeamSimulations.length === 0 && (
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    No Red Team campaigns configured yet — add one on the Red Team page
                  </span>
                )}
                {redTeamSimulations.map(v => (
                  <button
                    key={v.id}
                    onClick={() => runSimulation(v.id)}
                    disabled={simState === 'simulating'}
                    className={clsx(
                      "btn-mission text-[9px] font-black uppercase tracking-widest py-3 px-4 flex-1 xl:flex-none border border-fire-border hover:border-accent/40 rounded-xl",
                      simVector === v.id ? "border-accent text-accent bg-accent/5 font-extrabold" : "text-text-primary bg-background/40 hover:bg-background/60"
                    )}
                  >
                    {v.name}
                  </button>
                ))}

                <button
                  onClick={() => {
                    setSimState('idle');
                    setSimVector(null);
                    setSimStep(0);
                    setSimRisk(20);
                    setActiveExecutionId(null);
                    setLoggedStages(0);
                    setGridNodes(Array(24).fill('secure'));
                    setSimLogs([`[${new Date().toLocaleTimeString()}] [SYSTEM] Telemetry reset. System secure.`]);
                  }}
                  disabled={simState !== 'simulating'}
                  className="bg-background/40 border border-fire-border hover:border-danger/40 hover:text-danger text-text-muted rounded-xl p-3 flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                  title="Reset System State"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            {/* Visual Steps Tracker */}
            <div className="mt-6 border-t border-fire-border pt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { step: 1, label: 'TEST / TRIGGER', desc: 'Campaign Launch', status: simStep === 1, icon: Play, color: 'text-accent bg-accent/10 border-accent/30' },
                { step: 2, label: 'DETECT (L1)', desc: 'AI-Powered SIEM', status: simStep === 2, icon: Cpu, color: 'text-success bg-success/10 border-success/30' },
                { step: 3, label: 'ANALYZE / RESPOND (L2)', desc: 'Autonomous SOAR', status: simStep === 3, icon: Network, color: 'text-accent-pa bg-accent-pa/10 border-accent-pa/30' },
                { step: 4, label: 'HEAL & DECEIVE (L4)', desc: 'State Snapshot Restore', status: simStep === 4, icon: ShieldCheck, color: 'text-accent bg-accent/10 border-accent/30' },
                { step: 5, label: 'CLOSE (L5)', desc: 'Cycle Complete', status: simStep === 5, icon: Brain, color: 'text-accent bg-accent/10 border-accent/30' }
              ].map(item => (
                <div
                  key={item.step}
                  className={clsx(
                    "p-3 rounded-xl border transition-all duration-300 relative",
                    item.status
                      ? "bg-accent/10 border-accent/70 shadow-lg shadow-accent/5 scale-102"
                      : simStep > item.step
                        ? "bg-success/5 border-success/30 opacity-70"
                        : "bg-surface-3/30 border-fire-border opacity-40"
                  )}
                >
                  {simStep > item.step && (
                    <div className="absolute right-2 top-2 bg-success text-black rounded-full p-0.5">
                      <ShieldCheck className="h-3 w-3" />
                    </div>
                  )}
                  <div className={clsx("h-8 w-8 rounded-full border flex items-center justify-center mb-2", item.color)}>
                    <item.icon className="h-4 w-4" />
                  </div>
                  <span className="text-[9px] font-black uppercase text-text-secondary tracking-widest leading-none">Step {item.step}</span>
                  <div className="text-xs font-black text-text-primary mt-1 uppercase tracking-tight">{item.label}</div>
                  <div className="text-[9px] text-text-secondary mt-1">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Flow Grid — Layer 1 / 2 / 3 in a single row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Layer 1 — AI-Powered SIEM (blue/info) */}
            <div className={clsx(
              "card-mission relative transition-all duration-300",
              simStep === 2 ? "border-info/80 shadow-[0_0_20px_color-mix(in_srgb,var(--info)_15%,transparent)] bg-surface-2" : "border-fire-border bg-background/40"
            )}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="badge-mission bg-info/10 border-info text-info">Layer 1</span>
                  <h3 className="text-sm font-black uppercase tracking-wider text-text-primary mt-1">AI-Powered SIEM</h3>
                </div>
                <Activity className={clsx("h-5 w-5", simStep === 2 ? "text-info animate-pulse" : "text-text-muted")} />
              </div>

              <div className="space-y-4">
                {/* Log Ingestion Path */}
                <div className="rounded-xl border border-fire-border bg-background/50 p-3">
                  <div className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-2">Ingestion Telemetry</div>
                  <div className="space-y-1.5 text-[10px] font-bold text-text-secondary uppercase">
                    {['Network Logs', 'Cloud Telemetry', 'Application Logs'].map((label) => (
                      <div key={label} className="flex items-center justify-between">
                        <span>{label}</span>
                        <span className={clsx("flex items-center gap-1.5", simStep === 2 ? "text-info" : "text-success")}>
                          <span className={clsx("h-1.5 w-1.5 rounded-full", simStep === 2 ? "bg-info animate-pulse" : "bg-success")} />
                          Active
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Flow Steps */}
                <div className="flex items-center justify-between gap-1 text-[9px] font-black text-center">
                  <div className="flex-1 p-2 rounded bg-surface-3 border border-fire-border text-text-secondary">Kafka/Fluentd</div>
                  <span className="text-text-muted">➔</span>
                  <div className="flex-1 p-2 rounded bg-surface-3 border border-fire-border text-text-secondary">Normalization</div>
                  <span className="text-text-muted">➔</span>
                  <div className="flex-1 p-2 rounded bg-surface-3 border border-fire-border text-text-secondary">Correlation</div>
                </div>

                {/* Models State */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-background/40 border border-fire-border rounded-xl">
                    <div className="text-[9px] font-black uppercase text-text-muted">LSTM Predictor</div>
                    <div className="text-xs font-black text-text-primary mt-1">ACTIVE</div>
                  </div>
                  <div className="p-3 bg-background/40 border border-fire-border rounded-xl">
                    <div className="text-[9px] font-black uppercase text-text-muted">Isolation Forest</div>
                    <div className="text-xs font-black text-text-primary mt-1">MONITORING</div>
                  </div>
                </div>

                {/* Ingest Lag sparkline + CPU usage gauge */}
                <div className="p-3 bg-background border border-fire-border rounded-xl grid grid-cols-[1fr_auto] gap-3 items-center">
                  <div>
                    <div className="text-[9px] font-black uppercase text-text-muted tracking-widest">Ingest Lag</div>
                    <div className="text-lg font-black text-text-primary font-mono leading-tight">
                      {ingestLagHistory.length > 0 ? `${ingestLagHistory[ingestLagHistory.length - 1].v} ms` : '— ms'}
                    </div>
                    <div className="h-8 w-full mt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={ingestLagHistory} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                          <Area type="monotone" dataKey="v" stroke={chartColors.info} fill={chartColors.info} fillOpacity={0.15} strokeWidth={1.5} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="relative h-16 w-16 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-text-primary/5"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-info transition-all duration-500"
                        strokeDasharray={`${cpuUsage}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-xs font-black font-mono text-text-primary leading-none">{cpuUsage}%</span>
                      <span className="text-[6px] font-bold text-text-secondary uppercase mt-0.5 text-center leading-tight">CPU<br />Usage</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 2 — Autonomous SOAR (green/success) */}
            <div className={clsx(
              "card-mission relative transition-all duration-300",
              simStep === 3 ? "border-success/80 shadow-[0_0_20px_color-mix(in_srgb,var(--success)_15%,transparent)] bg-surface-2" : "border-fire-border bg-background/40"
            )}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="badge-mission bg-success/10 border-success text-success">Layer 2</span>
                  <h3 className="text-sm font-black uppercase tracking-wider text-text-primary mt-1 font-bold">Autonomous SOAR</h3>
                </div>
                <Zap className={clsx("h-5 w-5", simStep === 3 ? "text-success animate-pulse" : "text-text-muted")} />
              </div>

              <div className="space-y-4">
                {/* Architecture & Orchestration tags */}
                <div className="flex items-center gap-2">
                  <span className="badge-mission border-fire-border bg-background/50 text-text-muted">Python Microservices</span>
                  <span className="badge-mission border-fire-border bg-background/50 text-text-muted">K8s Orchestration</span>
                </div>

                {/* Flow logic */}
                <div className="p-3 bg-background/40 border border-fire-border rounded-xl text-center text-[10px] uppercase font-bold text-text-secondary">
                  Playbooks ➔ Automated Actions
                </div>

                {/* Action HUD list */}
                <div className="space-y-2">
                  {[
                    { key: 'block', name: 'Block IP Range', icon: Ban, active: simStep === 3 && activeSimulation !== null && simulationCategory(activeSimulation.name) === 'other' },
                    { key: 'isolate', name: 'Isolate Endpoint Node', icon: MonitorOff, active: simStep === 3 && activeSimulation !== null && simulationCategory(activeSimulation.name) === 'lateral' },
                    { key: 'script', name: 'Execute Containment Script', icon: FileCode2, active: simStep === 3 && activeSimulation !== null && simulationCategory(activeSimulation.name) === 'phishing' },
                    { key: 'kill', name: 'Kill Malicious Process', icon: Bug, active: false },
                    { key: 'remediate', name: 'Remediate & Log', icon: ClipboardCheck, active: false },
                  ].map(a => (
                    <div
                      key={a.key}
                      className={clsx(
                        "px-3 py-2.5 rounded-xl border text-xs font-black uppercase flex items-center justify-between gap-2 transition-all duration-300",
                        a.active ? "bg-success/10 border-success text-text-primary scale-102" : "bg-background/30 border-fire-border text-text-secondary"
                      )}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <a.icon className={clsx("h-3.5 w-3.5 shrink-0", a.active ? "text-success" : "text-text-muted")} />
                        <span className="truncate">{a.name}</span>
                      </span>
                      {a.active ? (
                        <span className="h-2 w-2 rounded-full bg-success animate-ping shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-text-muted shrink-0" />
                      )}
                    </div>
                  ))}
                </div>

                {/* SOAR Telemetry HUD */}
                <div className="p-3 bg-background border border-fire-border rounded-xl flex items-center justify-between text-xs font-black uppercase text-text-muted">
                  <span>Remediation Lag</span>
                  <span className="font-mono text-text-primary">&lt; 10s</span>
                </div>
              </div>
            </div>

            {/* Layer 3 — AI Red Team Simulator (purple/accent-pa) */}
            <div className={clsx(
              "card-mission relative transition-all duration-300",
              simStep === 1 ? "border-accent-pa/80 shadow-[0_0_20px_color-mix(in_srgb,var(--accent-pa)_15%,transparent)] bg-surface-2" : "border-fire-border bg-background/40"
            )}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="badge-mission bg-accent-pa/10 border-accent-pa text-accent-pa">Layer 3</span>
                  <h3 className="text-sm font-black uppercase tracking-wider text-text-primary mt-1">AI Red Team Simulator</h3>
                </div>
                <Crosshair className={clsx("h-5 w-5", simStep === 1 ? "text-accent-pa animate-pulse" : "text-text-muted")} />
              </div>

              <div className="space-y-4">
                {/* Framework indicator */}
                <div className="flex items-center justify-between text-[10px] font-black text-text-muted uppercase">
                  <span>Methodology</span>
                  <span className="badge-mission border-accent-pa bg-accent-pa/5 text-accent-pa font-extrabold tracking-widest">MITRE Framework</span>
                </div>

                {/* Holographic matrix nodes */}
                <div className="bg-background border border-fire-border rounded-xl p-4">
                  <div className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-3 text-center">Interactive Grid Map</div>

                  <div className="grid grid-cols-6 gap-2 w-fit mx-auto">
                    {gridNodes.map((state, idx) => (
                      <div
                        key={idx}
                        className={clsx(
                          "h-5 w-5 rounded-md border-2 transition-all duration-500",
                          // Plain Tailwind opacity modifiers (bg-x/NN) silently no-op on
                          // these CSS-variable-based colors — Tailwind can't decompose a
                          // var() into RGB channels at build time, so it emits invalid CSS
                          // that the browser drops, leaving a fully transparent fill. Using
                          // color-mix() directly (already the working pattern in index.css)
                          // resolves the variable at runtime instead, so it actually tints.
                          state === 'secure' && "bg-[color-mix(in_srgb,var(--accent-pa)_14%,var(--surface-3))] border-[color-mix(in_srgb,var(--accent-pa)_70%,transparent)] hover:border-accent-pa",
                          state === 'probing' && "bg-[color-mix(in_srgb,var(--warning)_25%,transparent)] border-warning animate-pulse shadow-lg shadow-warning/20",
                          state === 'compromised' && "bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] border-danger animate-pulse shadow-lg shadow-danger/20",
                          state === 'contained' && "bg-[color-mix(in_srgb,var(--accent-pa)_45%,transparent)] border-accent-pa shadow-lg shadow-accent-pa/20"
                        )}
                        title={`Node ${idx + 1}: ${state.toUpperCase()}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Telemetry info */}
                <div className="p-3 bg-background border border-fire-border rounded-xl flex items-center justify-between text-xs font-black uppercase text-text-muted">
                  <span>Propagation lag</span>
                  <span className="font-mono text-text-primary">&lt; 10s</span>
                </div>
              </div>
            </div>

          </div>

          {/* Live Threat Feed + Global Attack Map */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card-mission border-fire-border bg-background/40 p-5">
              <div className="flex items-center justify-between border-b border-fire-border pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-primary">Live Threat Feed</h3>
                </div>
                <button
                  onClick={() => navigate('/dashboard/alerts')}
                  className="text-label text-accent hover:underline"
                >
                  View All
                </button>
              </div>

              <TimelineTrack
                events={threatFeedEvents}
                onEventClick={() => navigate('/dashboard/alerts')}
                emptyLabel="No recent incidents"
              />
            </div>

            <div className="card-mission border-fire-border bg-background/40 p-5 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-fire-border pb-3 mb-3 relative z-10">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-primary">Global Attack Map</h3>
                <MapPin className="h-4 w-4 text-text-muted" />
              </div>

              {/* Fixed dark backdrop, independent of the app's light/dark theme —
                  world-network.png is a bright dotted map designed to pop against
                  black; blended at low opacity onto a light card background it
                  washed out to a hazy, low-contrast smear. A radar/tactical map
                  widget reading as its own "screen" is also a common, deliberate
                  pattern in SOC dashboards, so this isn't just a workaround. */}
              <div className="relative h-40 rounded-xl overflow-hidden border border-fire-border/60 bg-[#0a0e17]">
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-70"
                  style={{ backgroundImage: "url('/world-network.png')" }}
                />
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {attackMapLinks.map(([fromId, toId], i) => {
                    const from = attackMapNodes.find(n => n.id === fromId)!
                    const to = attackMapNodes.find(n => n.id === toId)!
                    return (
                      <line
                        key={i}
                        x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        stroke="#60A5FA"
                        strokeWidth={0.5}
                        strokeOpacity={0.85}
                      />
                    )
                  })}
                  {attackMapNodes.map(n => (
                    <circle key={n.id} cx={n.x} cy={n.y} r={1.2} fill="#60A5FA" className="animate-pulse" />
                  ))}
                </svg>
              </div>

              <div className="flex items-center justify-between mt-3 text-[9px] font-black uppercase tracking-widest text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Grid Status: <span className="text-success">Nominal</span>
                </span>
                <span>TZ: IST</span>
              </div>
            </div>
          </div>

          {/* Terminal Console Log */}
          <div className="card-mission border-fire-border bg-background p-5">
            <div className="flex items-center justify-between border-b border-fire-border pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-accent animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-primary">Closed-Loop Campaign Logs</h3>
              </div>
              <div className="text-[9px] font-bold text-text-secondary uppercase tracking-widest bg-surface-3 px-2 py-0.5 rounded">
                {simState === 'simulating' ? `${activeVectorLabel} Running` : 'System Monitoring'}
              </div>
            </div>

            <div className="h-32 overflow-y-auto font-mono text-[10px] text-text-secondary space-y-2 custom-scrollbar">
              {simLogs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className={clsx(
                    "font-bold shrink-0",
                    log.includes('RED TEAM') && "text-accent",
                    log.includes('SYSTEM') && "text-text-primary"
                  )}>
                    {log}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      ) : (
        <div className="space-y-8 animate-fade-in relative">
          {/* Classic SOC Operational Overview (Original Code UI) */}
          
          {/* Hero Panel */}
          <div className="relative overflow-hidden rounded-2xl border border-fire-border bg-surface-2 p-8 shadow-card">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_28%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--info)_8%,transparent),transparent_30%)] pointer-events-none" />
            <div className="relative z-10 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
              <div className="space-y-4">
                <p className="text-label uppercase text-accent">Command Center</p>
                <h1 className="text-display text-text-primary">Secure operations at the speed of threat.</h1>
                <p className="max-w-2xl text-body text-text-secondary">
                  Monitor live alerts, correlate threats, and act on critical incidents with a unified cyber defense console built for advanced SOC workflows.
                </p>
                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-background border border-fire-border px-3.5 py-1.5 text-small font-medium text-text-primary">
                    <ShieldAlert className="w-3.5 h-3.5 text-accent" /> Active Defense
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-background border border-fire-border px-3.5 py-1.5 text-small font-medium text-text-secondary">
                    <Layers className="w-3.5 h-3.5 text-info" /> Full Stack Visibility
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="card-mission bg-glass-surface border-fire-border/50 p-5">
                  <p className="text-label uppercase text-text-muted mb-2">Threat Confidence</p>
                  <p className="text-small font-normal text-text-muted">Still in development</p>
                  <p className="text-small text-text-secondary mt-2">Will be based on correlation score and real-time model predictions once that scoring is built.</p>
                </div>
                <div className="card-mission bg-glass-surface border-fire-border/50 p-5">
                  <p className="text-label uppercase text-text-muted mb-2">Response Readiness</p>
                  <p className="text-display text-text-primary">
                    {isLoading || responseReadiness === null ? '—' : `${responseReadiness}%`}
                  </p>
                  <p className="text-small text-text-secondary mt-2">Share of open alerts with an assigned owner, ready for response.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Header Info */}
          <div className="flex items-end justify-between mb-2">
            <div>
              <h1 className="text-h1 text-text-primary">Operational Overview</h1>
              <p className="text-small text-text-secondary mt-1">Mission-critical infrastructure health</p>
            </div>
            <div className="flex items-center gap-4 bg-surface-2 border border-fire-border px-4 py-2.5 rounded-lg">
              <div className="flex flex-col items-end">
                <span className="text-label uppercase text-text-muted leading-none mb-1">Grid Status</span>
                <span className={clsx(
                  "text-small font-semibold tabular-nums",
                  (stats?.criticalAlerts ?? 0) > 0 ? "text-danger" : "text-success"
                )}>
                  {isLoading ? '—' : (stats?.criticalAlerts ?? 0) > 0 ? `${stats!.criticalAlerts} Critical Active` : 'Secure'}
                </span>
              </div>
              <div className="w-px h-6 bg-border" />
              <Activity className="w-4 h-4 text-accent" />
            </div>
          </div>

          {/* KPI Row — real drill-down via KpiTile/useEntityPivot; the
              previous inline markup's "⋯" icon had no onClick at all. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiTile
              title="Events (24h)"
              value={isLoading ? '—' : stats?.events24h ?? null}
              loading={isLoading}
              trend={stats?.events24h != null ? { label: 'Live Feed', direction: 'up' } : undefined}
              onClick={() => navigate('/dashboard/logs')}
            />
            <KpiTile
              title="Notable Events"
              value={isLoading ? '—' : stats?.totalAlerts ?? null}
              loading={isLoading}
              trend={stats?.totalAlerts != null ? { label: 'Live Feed', direction: 'up' } : undefined}
              onClick={() => navigate('/dashboard/alerts')}
            />
            <KpiTile title="Mean Time to Detect" value={null} />
            <KpiTile title="Mean Time to Respond" value={null} />
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card-mission bg-surface-2 border-fire-border/60">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-h3 text-text-primary">Ingest Volume vs Errors</h3>
                  <p className="text-small text-text-secondary mt-1">Global collection nodes telemetry — last 8 hours</p>
                </div>
                <div className="flex items-center gap-5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
                    <span className="text-small font-medium text-text-secondary">Events</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm bg-danger" />
                    <span className="text-small font-medium text-text-secondary">Errors</span>
                  </div>
                </div>
              </div>

              <div className="h-[340px] w-full mt-4 flex items-center justify-center border border-dashed border-fire-border/60 rounded-xl relative">
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-50">
                  <span className="text-small font-semibold text-text-secondary">Still in development</span>
                  <span className="text-small text-text-muted mt-1">Real-time chart metric feed pending</span>
                </div>
              </div>
            </div>

            <div className="card-mission bg-surface-2 border-fire-border/60">
              <h3 className="text-h3 text-text-primary mb-8 text-center">Alert Severity Mix</h3>
              <div className="h-64 w-full flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Critical', value: severityCounts?.critical ?? 0, color: chartColors.danger },
                        { name: 'High', value: severityCounts?.high ?? 0, color: chartColors.severityHigh },
                        { name: 'Medium', value: severityCounts?.medium ?? 0, color: chartColors.severityMedium },
                        { name: 'Low', value: severityCounts?.low ?? 0, color: chartColors.info },
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
                        { color: chartColors.danger },
                        { color: chartColors.severityHigh },
                        { color: chartColors.severityMedium },
                        { color: chartColors.info },
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-h1 text-text-primary leading-none">{stats?.totalAlerts ?? 0}</span>
                  <span className="text-label uppercase text-text-secondary mt-1">Alerts</span>
                </div>
              </div>

              <div className="mt-8 space-y-2">
                {[
                  { name: 'Critical', value: severityCounts?.critical ?? 0, color: chartColors.danger },
                  { name: 'High', value: severityCounts?.high ?? 0, color: chartColors.severityHigh },
                  { name: 'Medium', value: severityCounts?.medium ?? 0, color: chartColors.severityMedium },
                  { name: 'Low', value: severityCounts?.low ?? 0, color: chartColors.info },
                ].map((item) => (
                  <div key={item.name} className="flex items-center gap-3 px-2 py-1.5 hover:bg-surface-3 rounded-lg transition-colors group">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="text-small font-medium text-text-secondary group-hover:text-text-primary transition-colors">{item.name}</span>
                    <span className="text-small font-semibold text-text-primary ml-auto tabular-nums">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Incidents Table */}
          <div className="card-mission bg-surface-2 border-fire-border/60">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-h3 text-text-primary">Open Incidents Queue</h3>
                <p className="text-small text-text-secondary mt-1">Prioritized active threats requiring analyst review</p>
              </div>
              <button
                className="btn-ghost text-accent"
                onClick={() => pivotTo('/dashboard/alerts', { type: 'severity', value: 'CRITICAL' })}
              >
                View All Criticals <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto min-h-[200px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-48 text-text-muted animate-pulse text-small font-medium">
                  Syncing with mission logs...
                </div>
              ) : incidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-text-muted border border-dashed border-fire-border/60 rounded-xl mx-4 mb-4">
                  <ShieldAlert className="w-8 h-8 mb-2 opacity-30" />
                  <span className="text-small font-medium">No active incidents detected</span>
                </div>
              ) : (
                <table className="table-enterprise">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Title</th>
                      <th>Severity</th>
                      <th>Source</th>
                      <th>Assignee</th>
                      <th>Status</th>
                      <th className="text-right">Elapsed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc, i) => (
                      <tr key={i} className="group">
                        <td className="font-mono text-small text-text-muted whitespace-nowrap">{inc.id}</td>
                        <td>
                          <p className="text-small font-semibold text-text-primary leading-tight max-w-md">{inc.title}</p>
                        </td>
                        <td>
                          <span className={clsx(
                            "px-2 py-0.5 rounded-md text-label uppercase border",
                            ['CRITICAL', 'HIGH', 'Critical', 'High'].includes(inc.severity) ? "bg-danger/10 text-danger border-danger/20" : "bg-warning/10 text-warning border-warning/20"
                          )}>
                            {inc.severity}
                          </span>
                        </td>
                        <td className="text-small text-text-secondary">{inc.source}</td>
                        <td className="text-small text-text-secondary">{inc.owner}</td>
                        <td>
                          <span className="text-label uppercase text-accent bg-accent/5 px-2 py-1 rounded-md border border-accent/20">
                            {inc.status}
                          </span>
                        </td>
                        <td className="text-small font-medium text-text-primary text-right font-mono tabular-nums whitespace-nowrap">{inc.updated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
