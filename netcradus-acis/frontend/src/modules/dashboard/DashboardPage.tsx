import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import { useCanRead, MODULES } from '@/store/permissionsStore'
import { useEntityPivot } from '@/hooks/useEntityPivot'
import KpiTile from '@/components/ui/KpiTile'
import { Zap, PauseCircle } from 'lucide-react'

interface DashboardStats {
  totalAlerts: number
  criticalAlerts: number
  highAlerts: number
  openIncidents: number
  events24h: number | null
}

interface TenantMember {
  id: string
  name: string
  email: string
  // Real FK relation (UserMember.role -> ConsoleRole), serialized as a full
  // object by the backend - never render this directly, only role?.name.
  role: { id: string; name: string } | null
  status: string
  lastLogin: string | null
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

interface SoarPlaybook {
  id: string
  name: string
  enabled: boolean
  successCount: number
  runCount: number
  lastRunAt: string | null
}

interface SoarExecution {
  id: string
  playbookId: string
  status: string
  startedAt: string
  completedAt: string | null
  stepLogs: string
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { pivotTo } = useEntityPivot()
  const canReadSoarPlaybooks = useCanRead(MODULES.SOAR_PLAYBOOKS)

  // Memoized elements for SOC Operational View
  const globeEllipsesLat = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => {
      const yy = 200 - 190 + (i + 1) * (2 * 190 / 7)
      const rx = Math.sqrt(Math.max(190 * 190 - Math.pow(200 - yy, 2), 0))
      return { yy, rx }
    })
  }, [])

  const globeEllipsesLong = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => {
      const ang = i * 22.5
      const rx = Math.abs(190 * Math.cos(ang * Math.PI / 180)) + 2
      return { rx }
    })
  }, [])

  const globeDots = useMemo(() => {
    return Array.from({ length: 200 }).map(() => {
      const a = Math.random() * Math.PI * 2
      const rad = Math.sqrt(Math.random()) * 190 * 0.9
      const cx = 200 + Math.cos(a) * rad
      const cy = 200 + Math.sin(a) * rad * 0.9
      const rVal = Math.random() < 0.2 ? 1.3 : 0.7
      return { cx, cy, rVal }
    })
  }, [])

  const netNodes = useMemo(() => [
    { x: 130, y: 100, type: 'main' },
    { x: 70, y: 60, type: 'sub' },
    { x: 190, y: 60, type: 'sub' },
    { x: 50, y: 140, type: 'sub' },
    { x: 130, y: 40, type: 'sub' },
    { x: 210, y: 140, type: 'sub' },
    { x: 90, y: 180, type: 'sub' },
    { x: 170, y: 180, type: 'sub' }
  ], [])

  const netEdges = useMemo(() => [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]
  ], [])
  
  // Tabs: architecture (Immune Architecture) vs overview (SOC Operational View)
  const [activeTab, setActiveTab] = useState<'architecture' | 'overview'>('overview')
  
  // Telemetry metric states
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [incidents, setIncidents] = useState<any[]>([])
  // Full real alert list — Owner Breakdown, MTTD, MTTR, Incident Timeline all
  // need real per-alert fields (ownerId, eventOccurredAt, createdAt, updatedAt)
  // that the 5-item "incidents" summary above doesn't carry.
  const [alerts, setAlerts] = useState<any[]>([])
  const [severityCounts, setSeverityCounts] = useState<{ critical: number; high: number; medium: number; low: number } | null>(null)
  const [responseReadiness, setResponseReadiness] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)

  // Simulation State Machine
  const [simState, setSimState] = useState<'idle' | 'simulating'>('idle')
  const [simVector, setSimVector] = useState<string | null>(null)
  const [simStep, setSimStep] = useState<number>(0)
  const [simLogs, setSimLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] [SYSTEM] Monitoring system telemetry. State: 100% SECURE.`
  ])
  const [gridNodes, setGridNodes] = useState<('secure' | 'probing' | 'compromised' | 'contained')[]>(
    Array(24).fill('secure')
  )
  const [redTeamSimulations, setRedTeamSimulations] = useState<RedTeamSimulation[]>([])
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null)
  const [loggedStages, setLoggedStages] = useState<number>(0)

  // Real SOAR playbooks/executions for the Layer 2 panel
  const [soarPlaybooks, setSoarPlaybooks] = useState<SoarPlaybook[]>([])
  const [soarExecutions, setSoarExecutions] = useState<SoarExecution[]>([])
  const [actionTab, setActionTab] = useState<'suggested' | 'auto'>('suggested')

  // Ingest metric stats
  const [ingestStats, setIngestStats] = useState<{ lagSeriesMs: number[]; cpuUsagePercent: number } | null>(null)
  const [teamMembers, setTeamMembers] = useState<TenantMember[]>([])
  const [aiMetrics, setAiMetrics] = useState<{
    totalRequests: number
    successCount: number
    failedCount: number
    successRatePercent: number | null
    avgLatencyMs: number | null
    p95LatencyMs: number | null
    providerBreakdown: Record<string, number>
    recentSampleSize: number
  } | null>(null)

  useEffect(() => {
    const fetchAiMetrics = async () => {
      try {
        const res = await apiClient.get('/api/logs/ai-metrics')
        setAiMetrics(res.data)
      } catch (e) {
        console.error('Failed to fetch AI metrics:', e)
      }
    }
    fetchAiMetrics()
    const interval = setInterval(fetchAiMetrics, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        const res = await apiClient.get('/api/soar/settings/users')
        setTeamMembers(Array.isArray(res.data) ? res.data : [])
      } catch (e) {
        console.error('Failed to fetch team members:', e)
      }
    }
    fetchTeamMembers()
  }, [])

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

  // Real AI classifier retraining status — replaces the old hardcoded
  // "MONITORING" chip text.
  const [modelStatus, setModelStatus] = useState<{ isTraining: boolean; usingRealTrainedModel: boolean } | null>(null)
  useEffect(() => {
    const fetchModelStatus = async () => {
      try {
        const res = await apiClient.get('/api/logs/ai-model-status')
        setModelStatus(res.data)
      } catch (e) {
        console.error('Failed to fetch AI model status:', e)
      }
    }
    fetchModelStatus()
    const interval = setInterval(fetchModelStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  // Real per-category (Endpoint/Network/Application) live log event counts.
  const [categoryCounts, setCategoryCounts] = useState<{
    endpoint: number; network: number; application: number
    services: { serviceName: string; count: number; category: string }[]
  } | null>(null)
  useEffect(() => {
    const fetchCategoryCounts = async () => {
      try {
        const res = await apiClient.get('/api/logs/category-counts')
        setCategoryCounts(res.data)
      } catch (e) {
        console.error('Failed to fetch log category counts:', e)
      }
    }
    fetchCategoryCounts()
    const interval = setInterval(fetchCategoryCounts, 5000)
    return () => clearInterval(interval)
  }, [])

  // Real enrolled agent connectivity (Grid Status, Operational Readiness).
  const [agents, setAgents] = useState<{ id: string; hostname: string; status: string; lastHeartbeatAt: string | null }[]>([])
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await apiClient.get('/api/soar/settings/agents')
        // This endpoint wraps its payload in {success, data, timestamp} (ApiResponse<T>) — unwrap it.
        setAgents(res.data?.data || [])
      } catch (e) {
        console.error('Failed to fetch agents:', e)
      }
    }
    fetchAgents()
    const interval = setInterval(fetchAgents, 15000)
    return () => clearInterval(interval)
  }, [])

  // Real configured vendor-integration poll health (Operational Readiness, Live Threat Feed availability).
  const [integrationStatuses, setIntegrationStatuses] = useState<{ name: string; enabled: boolean; healthy: boolean; lastPolledAt: string | null; lastPollError: string | null }[]>([])
  useEffect(() => {
    const fetchIntegrationStatuses = async () => {
      try {
        const res = await apiClient.get('/api/soar/settings/integrations/status')
        setIntegrationStatuses(res.data || [])
      } catch (e) {
        console.error('Failed to fetch integration statuses:', e)
      }
    }
    fetchIntegrationStatuses()
    const interval = setInterval(fetchIntegrationStatuses, 30000)
    return () => clearInterval(interval)
  }, [])

  // Real threat indicators (VirusTotal/AbuseIPDB enrichment + vendor feeds) — Live Threat Feed.
  const [threatIndicators, setThreatIndicators] = useState<{ id: string; value: string; type: string; severity: string; description: string | null; source: string | null; lastSeen: string }[]>([])
  useEffect(() => {
    const fetchThreatIndicators = async () => {
      try {
        // /api/threat-intel now returns a real paginated envelope (was
        // unbounded before the production-readiness audit) - this feed only
        // ever shows the most recent items, so a normal page is enough.
        const res = await apiClient.get('/api/threat-intel', { params: { size: 50 } })
        setThreatIndicators(res.data?.content || [])
      } catch (e) {
        console.error('Failed to fetch threat indicators:', e)
      }
    }
    fetchThreatIndicators()
    const interval = setInterval(fetchThreatIndicators, 15000)
    return () => clearInterval(interval)
  }, [])

  // Real time-bucketed ingest volume vs pipeline errors — Ingest Volume vs Errors chart, zoomable.
  const [ingestRangeHours, setIngestRangeHours] = useState<number>(24)
  const [ingestVolumeErrors, setIngestVolumeErrors] = useState<{
    buckets: { bucketStart: string; volume: number; errors: number }[]
    totalVolume: number; totalErrors: number
  } | null>(null)
  useEffect(() => {
    const fetchIngestVolumeErrors = async () => {
      try {
        const to = Date.now()
        const from = to - ingestRangeHours * 3600_000
        const bucketMinutes = ingestRangeHours <= 2 ? 5 : ingestRangeHours <= 24 ? 60 : ingestRangeHours <= 168 ? 240 : 1440
        const res = await apiClient.get('/api/logs/ingest-volume-errors', { params: { fromEpochMs: from, toEpochMs: to, bucketMinutes } })
        setIngestVolumeErrors(res.data)
      } catch (e) {
        console.error('Failed to fetch ingest volume/errors:', e)
      }
    }
    fetchIngestVolumeErrors()
    const interval = setInterval(fetchIngestVolumeErrors, 30000)
    return () => clearInterval(interval)
  }, [ingestRangeHours])

  const ingestLagHistory = (ingestStats?.lagSeriesMs ?? []).map((v, i) => ({ t: i, v }))
  const cpuUsage = Math.round(ingestStats?.cpuUsagePercent ?? 0)

  const fetchData = async () => {
    setDataError(null)
    try {
      const [statsRes, alertsRes] = await Promise.all([
        apiClient.get('/api/alerts/dashboard/summary'),
        apiClient.get('/api/alerts')
      ])

      setStats(statsRes.data)
      const allAlerts = alertsRes.data as any[]
      setAlerts(allAlerts)
      setSeverityCounts({
        critical: allAlerts.filter(a => a.severity === 'CRITICAL').length,
        high: allAlerts.filter(a => a.severity === 'HIGH').length,
        medium: allAlerts.filter(a => a.severity === 'MEDIUM').length,
        low: allAlerts.filter(a => a.severity === 'LOW').length,
      })

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
      setDataError('Unable to load dashboard data. Please try again.')
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

  const fetchSoarData = async () => {
    try {
      const [playbooksRes, executionsRes] = await Promise.all([
        apiClient.get<SoarPlaybook[]>('/api/soar/playbooks'),
        apiClient.get<SoarExecution[]>('/api/soar/executions'),
      ])
      setSoarPlaybooks(playbooksRes.data || [])
      setSoarExecutions(executionsRes.data || [])
    } catch (error) {
      console.error('Failed to fetch SOAR data:', error)
    }
  }

  useEffect(() => {
    fetchData()
    if (canReadSoarPlaybooks) {
      fetchRedTeamSimulations()
      fetchSoarData()
      const soarInterval = setInterval(fetchSoarData, 8000)
      const dashSub = wsClient.subscribe('/topic/dashboard', () => fetchData())
      const alertSub = wsClient.subscribe('/topic/alerts', () => fetchData())
      return () => {
        clearInterval(soarInterval)
        dashSub.then(s => s?.unsubscribe())
        alertSub.then(s => s?.unsubscribe())
      }
    }
    const dashSub = wsClient.subscribe('/topic/dashboard', () => fetchData())
    const alertSub = wsClient.subscribe('/topic/alerts', () => fetchData())
    return () => {
      dashSub.then(s => s?.unsubscribe())
      alertSub.then(s => s?.unsubscribe())
    }
  }, [canReadSoarPlaybooks])

  const logMsg = (sender: string, text: string) => {
    const time = new Date().toLocaleTimeString()
    setSimLogs(prev => [`[${time}] [${sender}] ${text}`, ...prev])
  }

  // Real SOAR data for the Layer 2 panel - "suggested" = enabled, never-run
  // playbooks; "auto" = playbooks with real prior executions, most-recent first.
  const suggestedPlaybooks = useMemo(
    () => soarPlaybooks.filter(p => p.enabled && p.runCount === 0).slice(0, 5),
    [soarPlaybooks]
  )
  const autoActionPlaybooks = useMemo(
    () => soarPlaybooks
      .filter(p => p.runCount > 0)
      .sort((a, b) => new Date(b.lastRunAt || 0).getTime() - new Date(a.lastRunAt || 0).getTime())
      .slice(0, 5),
    [soarPlaybooks]
  )

  // Real average remediation duration across the most recent completed executions.
  const avgRemediationLag = useMemo(() => {
    const completed = soarExecutions.filter(e => e.completedAt).slice(0, 20)
    if (completed.length === 0) return null
    const totalMs = completed.reduce((sum, e) => sum + (new Date(e.completedAt!).getTime() - new Date(e.startedAt).getTime()), 0)
    const avgSeconds = totalMs / completed.length / 1000
    return avgSeconds < 60 ? `~${Math.round(avgSeconds)}s` : `~${Math.round(avgSeconds / 60)}m`
  }, [soarExecutions])

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

  const runSimulation = async (simulationId: string) => {
    if (simState === 'simulating') return
    const simulation = redTeamSimulations.find(s => s.id === simulationId)
    if (!simulation) return

    setSimState('simulating')
    setSimVector(simulationId)
    setSimStep(1)
    setLoggedStages(0)
    setSimLogs([])
    setGridNodes(Array(24).fill('secure'))
    logMsg('RED TEAM', `Initiating campaign: '${simulation.name}'...`)

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
            : 'Campaign execution failed — see logs.')
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

  // Real ingest-pipeline lag samples (IngestMetricsService's rolling window),
  // scaled to bar heights. No fabricated fallback - an empty/short series
  // just renders fewer/shorter bars rather than being padded with fake ones.
  const ingestBars = useMemo(() => {
    const series = ingestStats?.lagSeriesMs ?? []
    if (series.length === 0) return []
    const maxLag = Math.max(...series, 1)
    return series.map(v => 8 + (v / maxLag) * 47)
  }, [ingestStats])

  // Real AI provider-chain metrics, normalized to a 0-100 radar scale.
  // Deliberately no accuracy/recall/novelty axes — those need labeled ground
  // truth this system has none of; these four are all genuinely measured.
  const aiRadarAxes = useMemo(() => {
    if (!aiMetrics || aiMetrics.totalRequests === 0) {
      return { successRate: 0, speed: 0, primaryAvailability: 0, coverage: 0, hasData: false }
    }
    const successRate = aiMetrics.successRatePercent ?? 0
    const speed = aiMetrics.avgLatencyMs != null
      ? Math.max(0, 100 - (aiMetrics.avgLatencyMs / 8000) * 100)
      : 0
    const primaryServed = aiMetrics.providerBreakdown['nvidia'] || 0
    const primaryAvailability = aiMetrics.successCount > 0 ? (primaryServed / aiMetrics.successCount) * 100 : 0
    const coverage = Math.min(100, (aiMetrics.recentSampleSize / 200) * 100)
    return { successRate, speed, primaryAvailability, coverage, hasData: true }
  }, [aiMetrics])

  const radarCenter = 110
  const radarRadius = 90
  const radarPoint = (value: number, direction: [number, number]) => ({
    x: radarCenter + (Math.max(0, Math.min(100, value)) / 100) * radarRadius * direction[0],
    y: radarCenter + (Math.max(0, Math.min(100, value)) / 100) * radarRadius * direction[1],
  })
  const aiRadarPolygon = [
    radarPoint(aiRadarAxes.successRate, [0, -1]),
    radarPoint(aiRadarAxes.speed, [1, 0]),
    radarPoint(aiRadarAxes.primaryAvailability, [0, 1]),
    radarPoint(aiRadarAxes.coverage, [-1, 0]),
  ].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  // Donut chart calculations — real severity counts only; no fabricated
  // fallback numbers when data hasn't loaded yet (donutTotal guards div/0).
  const donutTotal = Math.max(1, (severityCounts?.critical ?? 0) + (severityCounts?.high ?? 0) + (severityCounts?.medium ?? 0) + (severityCounts?.low ?? 0))
  const hasSeverityData = donutTotal > 1 || (severityCounts !== null && (severityCounts.critical + severityCounts.high + severityCounts.medium + severityCounts.low) > 0)
  const donutCirc = 259
  const donutCritDash = Math.round(((severityCounts?.critical ?? 0) / donutTotal) * donutCirc)
  const donutHighDash = Math.round(((severityCounts?.high ?? 0) / donutTotal) * donutCirc)
  const donutMedDash = Math.round(((severityCounts?.medium ?? 0) / donutTotal) * donutCirc)
  const donutLowDash = Math.round(((severityCounts?.low ?? 0) / donutTotal) * donutCirc)

  const donutHighOffset = -donutCritDash
  const donutMedOffset = -(donutCritDash + donutHighDash)
  const donutLowOffset = -(donutCritDash + donutHighDash + donutMedDash)

  // Timeline dots calculations
  // Real Incident Timeline — every real alert from the actual past 24 hours,
  // positioned by its real createdAt time within that window (not evenly
  // spaced placeholder positions).
  const timelineDots = useMemo(() => {
    const windowMs = 24 * 60 * 60 * 1000
    const now = Date.now()
    return alerts
      .filter(a => now - new Date(a.createdAt).getTime() <= windowMs)
      .map(a => {
        const ageMs = now - new Date(a.createdAt).getTime()
        const percentage = Math.max(2, Math.min(98, 100 - (ageMs / windowMs) * 100))
        const isWarning = a.severity === 'CRITICAL' || a.severity === 'HIGH'
        const color = a.severity === 'CRITICAL' ? 'var(--soc-red)' : a.severity === 'HIGH' ? 'var(--soc-amber)' : 'var(--soc-blue)'
        const symbol = isWarning ? '⚠' : '⚙'
        return { id: a.id, title: a.title, percentage, color, symbol }
      })
      .sort((a, b) => a.percentage - b.percentage)
  }, [alerts])

  // Real Owner Breakdown — every alert's actual ownerId, including unassigned.
  const ownerBreakdown = useMemo(() => {
    if (alerts.length === 0) return null
    const assigned = alerts.filter(a => a.ownerId).length
    const unassigned = alerts.length - assigned
    return {
      total: alerts.length,
      assigned,
      unassigned,
      assignedPercent: Math.round((assigned / alerts.length) * 100),
      unassignedPercent: Math.round((unassigned / alerts.length) * 100),
    }
  }, [alerts])

  // Real Mean Time to Detect — createdAt (alert fired) minus eventOccurredAt
  // (the source event's own real timestamp — see CorrelationEngine). Alerts
  // with no traceable source event (eventOccurredAt null) are excluded, not
  // counted as zero.
  const mttdMinutes = useMemo(() => {
    const withEvent = alerts.filter(a => a.eventOccurredAt)
    if (withEvent.length === 0) return null
    const totalMs = withEvent.reduce((sum, a) => sum + Math.max(0, new Date(a.createdAt).getTime() - new Date(a.eventOccurredAt).getTime()), 0)
    return totalMs / withEvent.length / 60000
  }, [alerts])

  // Real Mean Time to Respond — updatedAt (last status change) minus
  // createdAt, for alerts an analyst has actually resolved (MITIGATED/CLOSED).
  // Same definition ReportsPage uses for incidents.
  const mttrMinutes = useMemo(() => {
    const resolved = alerts.filter(a => a.status === 'MITIGATED' || a.status === 'CLOSED')
    if (resolved.length === 0) return null
    const totalMs = resolved.reduce((sum, a) => sum + (new Date(a.updatedAt).getTime() - new Date(a.createdAt).getTime()), 0)
    return totalMs / resolved.length / 60000
  }, [alerts])

  // Real Operational Readiness — composite of the 4 signals confirmed for
  // this dashboard. Each factor is excluded (not zeroed) when there's
  // nothing real to measure yet, so a tenant with e.g. no agents enrolled
  // isn't unfairly penalized for a factor that doesn't apply to them.
  const agentConnectivityPercent = agents.length > 0
    ? Math.round((agents.filter(a => a.status === 'ONLINE').length / agents.length) * 100)
    : null
  const integrationConnectivityPercent = integrationStatuses.length > 0
    ? Math.round((integrationStatuses.filter(i => i.healthy).length / integrationStatuses.length) * 100)
    : null
  const pipelineHealthPercent = useMemo(() => {
    if (!ingestVolumeErrors) return null
    const total = ingestVolumeErrors.totalVolume + ingestVolumeErrors.totalErrors
    if (total === 0) return null
    const errorRate = ingestVolumeErrors.totalErrors / total
    return Math.round(Math.max(0, 100 - errorRate * 1000))
  }, [ingestVolumeErrors])
  const readinessFactors = useMemo(() => ({
    agentConnectivityPercent, integrationConnectivityPercent, responseReadiness, pipelineHealthPercent,
  }), [agentConnectivityPercent, integrationConnectivityPercent, responseReadiness, pipelineHealthPercent])
  const readinessValues = Object.values(readinessFactors).filter((v): v is number => v !== null)
  const operationalReadinessPercent = readinessValues.length > 0
    ? Math.round(readinessValues.reduce((a, b) => a + b, 0) / readinessValues.length)
    : null

  // Real Grid Status — agents + configured integrations, never simulated.
  const agentsOnline = agents.filter(a => a.status === 'ONLINE').length
  const integrationsHealthy = integrationStatuses.filter(i => i.healthy).length
  const gridHasAnyMonitoredSystem = agents.length > 0 || integrationStatuses.length > 0
  const gridDegraded = (agents.length > 0 && agentsOnline < agents.length) || (integrationStatuses.length > 0 && integrationsHealthy < integrationStatuses.length)

  // Real Network Telemetry state — driven by actual NETWORK-category log
  // services (see Log Categorization) and actual open high-severity alerts,
  // never a permanently-hardcoded "nominal" claim.
  const networkServices = categoryCounts?.services.filter(s => s.category === 'NETWORK') ?? []
  const hasNetworkTelemetry = networkServices.length > 0
  const openHighSeverityAlerts = alerts.filter(a => (a.severity === 'CRITICAL' || a.severity === 'HIGH') && (a.status === 'OPEN' || a.status === 'INVESTIGATING'))
  const networkTickerMessage = !hasNetworkTelemetry
    ? 'NO NETWORK TELEMETRY SOURCE CONNECTED — configure a firewall, syslog, or network integration in Settings › Data Sources…'
    : openHighSeverityAlerts.length > 0
      ? `ACTIVE THREAT STATE: ${openHighSeverityAlerts.length} open ${openHighSeverityAlerts.length === 1 ? 'alert' : 'alerts'} matching correlation rules (${openHighSeverityAlerts.filter(a => a.severity === 'CRITICAL').length} critical)…`
      : `SCANNING NETWORK TELEMETRY (${networkServices.length} real ${networkServices.length === 1 ? 'source' : 'sources'})… NO ACTIVE THREATS MATCHING CORRELATION RULES… SYSTEM STATUS NOMINAL…`
  const gridStatusTickerLabel = !gridHasAnyMonitoredSystem ? 'NO SYSTEMS MONITORED' : gridDegraded ? 'DEGRADED' : 'NOMINAL'

  // Real Closed-Loop Remediation Logs — every real step from real
  // PlaybookExecution.stepLogs (see PlaybookService), never a simulated log.
  const remediationLogs = useMemo(() => {
    const playbookNames = new Map(soarPlaybooks.map(p => [p.id, p.name]))
    type Step = { step?: string; status?: string; message?: string; timestamp?: string }
    const entries: { text: string; failed: boolean; timestamp: string }[] = []
    for (const exec of soarExecutions) {
      let steps: Step[] = []
      try {
        const parsed = JSON.parse(exec.stepLogs)
        if (Array.isArray(parsed)) steps = parsed
      } catch { /* not parseable - skip this execution's steps */ }
      const playbookName = playbookNames.get(exec.playbookId) || 'Playbook'
      for (const s of steps) {
        const failed = (s.status || '').toLowerCase().includes('fail')
        entries.push({
          text: `${playbookName} — ${s.step || 'step'}${s.message ? `: ${s.message}` : ''}`,
          failed,
          timestamp: s.timestamp || exec.startedAt,
        })
      }
    }
    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [soarExecutions, soarPlaybooks])

  return (
    <div className="space-y-6 animate-fade-in relative min-h-screen text-[var(--soc-text)]">
      
      {/* acis-hero row */}
      <div className="acis-hero">
        <div className="acis-brand">
          <svg className="acis-shield" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L21 5 V11 C21 16.5 17 20.5 12 22 C7 20.5 3 16.5 3 11 V5 Z" fill="url(#gg)" stroke="var(--soc-blue)" strokeWidth="1"/>
            <circle cx="12" cy="11" r="4" stroke="#fff" strokeWidth="1.4" fill="none"/>
            <line x1="15" y1="14" x2="18" y2="17" stroke="#fff" strokeWidth="1.4"/>
            <defs>
              <linearGradient id="gg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--soc-shield-stop-0)"/>
                <stop offset="1" stopColor="var(--soc-shield-stop-1)"/>
              </linearGradient>
            </defs>
          </svg>
          <div>
            <div className="acis-name">ACIS</div>
            <div className="acis-sub">Autonomous Cyber Immune System</div>
          </div>
        </div>
        <div className="hero-actions">
          <button 
            onClick={() => setActiveTab('architecture')}
            className={`btn ${activeTab === 'architecture' ? 'primary' : 'ghost'}`}
          >
            Immune Architecture
          </button>
          <button 
            onClick={() => setActiveTab('overview')}
            className={`btn ${activeTab === 'overview' ? 'primary' : 'ghost'}`}
          >
            SOC Operational View
          </button>
        </div>
      </div>

      {dataError && (
        <div className="panel flex flex-wrap items-center justify-between gap-3" style={{ borderColor: 'var(--soc-red, #f43f5e)' }}>
          <span className="text-small text-[var(--soc-red,#f43f5e)]">{dataError}</span>
          <button className="btn-mission text-small px-3 py-1.5" onClick={fetchData}>Retry</button>
        </div>
      )}

      {activeTab === 'architecture' ? (
        <div className="space-y-6">
          
          {/* Simulator Panel */}
          <div className="panel simulator">
            <div className="pill-row">
              <span className="pill">ACTIVE SCENARIO MODE</span>
              <span className="pill gray">Closed-Loop Simulator</span>
            </div>
            
            <div className="sim-note">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              {redTeamSimulations.length === 0 && 'No red team campaigns configured yet — add one on the Red Team page'}
              {redTeamSimulations.length > 0 && `Loaded campaigns: ${redTeamSimulations.length}`}
            </div>
            
            <h2>Closed-Loop Attack &amp; Remediation Simulator</h2>
            <p>Select a real red team campaign to run against ACIS, and watch as the system moves through the defense lifecycle using the campaign's actual persisted kill-chain data.</p>

            {/* Campaign Selectors */}
            <div className="flex flex-wrap gap-2.5 mt-4">
              {redTeamSimulations.map(sim => (
                <button
                  key={sim.id}
                  onClick={() => runSimulation(sim.id)}
                  disabled={simState === 'simulating'}
                  className={`btn ${simVector === sim.id ? 'primary' : 'ghost'}`}
                >
                  {sim.name}
                </button>
              ))}
            </div>

            {/* Steps Visual Grid */}
            <div className="steps">
              {[
                { step: 1, label: 'Ingest / Trigger', sub: 'Campaign & scope selected', symbol: '◎' },
                { step: 2, label: 'Detect', sub: 'AI-powered anomaly match', symbol: '🛡' },
                { step: 3, label: 'Analyse / Respond', sub: 'Correlation across signals', symbol: '◈' },
                { step: 4, label: 'Heal & Reassess', sub: 'Auto-remediation applied', symbol: '🛡' },
                { step: 5, label: 'Close', sub: 'Run complete', symbol: '▶' }
              ].map(item => (
                <div 
                  key={item.step} 
                  className={`step-card ${simStep === item.step ? 'active' : ''}`}
                >
                  <div className="step-icon">{item.symbol}</div>
                  <div className="step-label">STEP {item.step}</div>
                  <div className="step-title">{item.label}</div>
                  <div className="step-sub">{item.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Three Column Grid */}
          <div className="grid3">
            
            {/* SIEM Panel */}
            <div className="card-panel">
              <div className="card-tag blue">LAYER 1</div>
              <div className="card-head">
                <div className="card-title">AI Powered SIEM</div>
                <svg className="gear animate-spin" style={{ animationDuration: simStep === 2 ? '3s' : '0s' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12h4l3 8 4-16 3 8h4"/>
                </svg>
              </div>

              <div className="telemetry-box">
                <div className="telemetry-row"><span>Ingestion Telemetry</span><span className="val">{ingestStats ? `${cpuUsage}% CPU` : '—'}</span></div>
                <div className="telemetry-row"><span>Endpoint Logs</span><span className="val">{categoryCounts ? categoryCounts.endpoint.toLocaleString() : '—'}</span></div>
                <div className="telemetry-row"><span>Network Logs</span><span className="val">{categoryCounts ? categoryCounts.network.toLocaleString() : '—'}</span></div>
                <div className="telemetry-row"><span>Application Logs</span><span className="val">{categoryCounts ? categoryCounts.application.toLocaleString() : '—'}</span></div>
                {ingestBars.length === 0 ? (
                  <div className="text-label text-text-muted" style={{ padding: '8px 0' }}>No ingest lag samples yet.</div>
                ) : (
                  <div className="bars">
                    {ingestBars.map((h, i) => (
                      <div key={i} style={{ height: `${h}px` }} />
                    ))}
                  </div>
                )}
              </div>

              <div className="pipeline">
                <div className={`pipe-node ${simState === 'simulating' && simStep === 1 ? 'active' : ''}`}>Auth / Parse</div>
                <div className="pipe-arrow">→</div>
                <div className={`pipe-node ${simState === 'simulating' && simStep === 3 ? 'active' : ''}`}>Correlation Gen</div>
                <div className="pipe-arrow">→</div>
                <div className={`pipe-node ${simState === 'simulating' && simStep === 2 ? 'active' : ''}`}>Classify</div>
              </div>

              <div className="status-pair">
                <div className="status-chip green">
                  <div className="l">LINEAGE PROJECTION</div>
                  {simState === 'simulating' ? 'STREAMING' : 'ACTIVE'}
                </div>
                <div className={`status-chip ${modelStatus?.isTraining ? 'amber' : (modelStatus?.usingRealTrainedModel ? 'green' : 'amber')}`}>
                  <div className="l">MODEL RETRAINING</div>
                  {!modelStatus ? '—' : modelStatus.isTraining ? 'TRAINING' : modelStatus.usingRealTrainedModel ? 'MONITORING' : 'BOOTSTRAP'}
                </div>
              </div>

              <div className="mini-flow">
                <div style={{ flex: 1 }}>
                  <div className="mini-flow-title">INGEST LAB — IDS</div>
                  <div className="flow-diagram">
                    {['Firewall', 'Raw Signal', 'Flow A', 'Anomalies', 'Rewind', 'Flow B'].map((label, idx) => (
                      <div
                        key={label}
                        className={`flow-node ${simState === 'simulating' && idx === Math.min(5, simStep - 1) ? 'active' : ''}`}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ai-agent-box">
                  <div className="ring">
                    <span>{aiRadarAxes.hasData ? `${Math.round(aiRadarAxes.successRate)}%` : '—'}</span>
                  </div>
                  <div className="t">AI Agent</div>
                </div>
              </div>
            </div>

            {/* SOAR Panel */}
            <div className="card-panel">
              <div className="card-tag teal">LAYER 2</div>
              <div className="card-head">
                <div className="card-title">Autonomous SOAR</div>
                <svg className="gear animate-pulse" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l2.4 6.9L21 12l-6.6 3.1L12 22l-2.4-6.9L3 12l6.6-3.1z"/>
                </svg>
              </div>

              <div className="action-tabs">
                <button type="button" className={`action-tab ${actionTab === 'suggested' ? 'on' : ''}`} onClick={() => setActionTab('suggested')}>Suggested Actions</button>
                <button type="button" className={`action-tab ${actionTab === 'auto' ? 'on' : ''}`} onClick={() => setActionTab('auto')}>Auto Actions</button>
              </div>

              <div className="action-bar">PLAYBOOK · AUTOMATIC ACTIONS</div>

              <div className="action-list">
                {(actionTab === 'suggested' ? suggestedPlaybooks : autoActionPlaybooks).length === 0 ? (
                  <div className="text-small text-text-muted" style={{ padding: '16px 0', textAlign: 'center' }}>
                    {actionTab === 'suggested' ? 'No enabled playbooks awaiting a first run.' : 'No playbooks have executed yet.'}
                  </div>
                ) : (
                  (actionTab === 'suggested' ? suggestedPlaybooks : autoActionPlaybooks).map(pb => (
                    <div
                      key={pb.id}
                      className="action-item"
                      onClick={() => navigate('/dashboard/soar')}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="ai">{pb.enabled ? <Zap size={13} /> : <PauseCircle size={13} />}</span>
                      {pb.name}
                      <span className="chev-r">›</span>
                    </div>
                  ))
                )}
                <div className="action-item count">
                  Remediation Lag
                  <span className="count-val">{avgRemediationLag ?? '—'}</span>
                </div>
              </div>
            </div>

            {/* Red Team / Globe Panel */}
            <div className="card-panel globe-panel">
              <div className="card-tag teal">LAYER 3</div>
              <div className="card-head">
                <div className="card-title">AI Red Team Simulator</div>
              </div>

              <div className="globe-box" id="globeBox">
                <svg viewBox="0 0 400 400" id="globeSvg">
                  <circle cx={200} cy={200} r={150} fill="none" stroke="var(--soc-globe-outer-stroke)" />
                  
                  {/* Lat Lines */}
                  {Array.from({ length: 4 }).map((_, i) => {
                    const step = i + 1;
                    const yVal = 200 - 150 + step * 60;
                    const rxVal = Math.sqrt(150 * 150 - Math.pow(200 - yVal, 2)) || 1;
                    return (
                      <ellipse
                        key={`lat-${step}`}
                        cx={200}
                        cy={yVal}
                        rx={rxVal}
                        ry={6}
                        fill="none"
                        stroke="var(--soc-globe-lat-stroke)"
                      />
                    );
                  })}

                  {/* Long Lines */}
                  {Array.from({ length: 6 }).map((_, i) => {
                    const ang = i * 30;
                    const rxVal = Math.abs(150 * Math.cos(ang * Math.PI / 180)) + 2;
                    return (
                      <ellipse
                        key={`long-${i}`}
                        cx={200}
                        cy={200}
                        rx={rxVal}
                        ry={150}
                        fill="none"
                        stroke="var(--soc-globe-long-stroke)"
                      />
                    );
                  })}

                </svg>

                {/* Real active-campaign readout - no fabricated geo data exists
                    for these executions, so this shows real execution state
                    instead of invented location pins. */}
                <div className="geo-tag" style={{ top: '46%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                  {simState === 'simulating' && activeSimulation ? (
                    <>
                      <div>{activeSimulation.name}</div>
                      <div style={{ fontSize: '10px', opacity: 0.75, marginTop: '2px' }}>{loggedStages} step{loggedStages === 1 ? '' : 's'} logged</div>
                    </>
                  ) : (
                    <div>Standing by</div>
                  )}
                </div>
              </div>

              <div className="globe-footer">
                <span>STATUS: <span className="status">{simState === 'simulating' ? 'RUNNING' : 'IDLE'}</span></span>
                <span>{redTeamSimulations.length} campaign{redTeamSimulations.length === 1 ? '' : 's'} configured</span>
              </div>
            </div>

          </div>

          {/* Bottom row */}
          <div className="grid-bottom">
            
            {/* Live Threat Feed */}
            <div className="card-panel">
              <div className="threat-table-head">
                <h3><span className="dot-red"></span>Live Threat Feed</h3>
                <button type="button" className="view-all" onClick={() => navigate('/dashboard/alerts')}>View All</button>
              </div>

              {incidents.length === 0 ? (
                <div className="text-center py-8 text-text-muted">No active incidents detected.</div>
              ) : (
                incidents.map((inc, i) => (
                  <div key={inc.id || i} className="threat-row">
                    <div className="t-icon">🛰</div>
                    <div className="t-name truncate">{inc.title}</div>
                    <div className="t-desc truncate">
                      {inc.source} · Owner: <b>{inc.owner}</b>
                    </div>
                    <div className="t-status">{inc.status}</div>
                    <div className="t-cve">{inc.severity}</div>
                    <div className="t-updated">{inc.updated}</div>
                  </div>
                ))
              )}
            </div>

            {/* Performance Radar */}
            <div className="card-panel">
              <h3 style={{ fontSize: '14.5px', fontWeight: 800, marginBottom: '4px', color: 'var(--soc-threat-head-color)' }}>
                Real-Time AI Model Performance
              </h3>
              {!aiRadarAxes.hasData ? (
                <div className="text-small text-text-muted" style={{ padding: '24px 0', textAlign: 'center' }}>
                  No AI requests recorded yet.
                </div>
              ) : (
                <>
                  <div className="radar-wrap">
                    <svg viewBox="0 0 220 220">
                      <polygon points="110,20 200,110 110,200 20,110" fill="none" stroke="var(--soc-radar-grid-stroke)" strokeWidth="1"/>
                      <polygon points="110,55 175,110 110,165 55,110" fill="none" stroke="var(--soc-radar-grid-stroke)" strokeWidth="1"/>
                      <line x1="110" y1="10" x2="110" y2="210" stroke="var(--soc-radar-axis-stroke)"/>
                      <line x1="10" y1="110" x2="210" y2="110" stroke="var(--soc-radar-axis-stroke)"/>
                      <polygon points={aiRadarPolygon} fill="var(--soc-radar-area-fill)" stroke="var(--soc-blue)" strokeWidth="2"/>
                    </svg>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '10.5px', color: 'var(--soc-muted)', fontWeight: 700, textAlign: 'center', rowGap: '6px' }}>
                    <div>Success Rate {Math.round(aiRadarAxes.successRate)}%</div>
                    <div>Speed {Math.round(aiRadarAxes.speed)}%</div>
                    <div>Primary Uptime {Math.round(aiRadarAxes.primaryAvailability)}%</div>
                    <div>Coverage {Math.round(aiRadarAxes.coverage)}%</div>
                  </div>
                </>
              )}
            </div>

            {/* SOC Operative Status */}
            <div className="card-panel">
              <h3 style={{ fontSize: '14.5px', fontWeight: 800, marginBottom: '2px', color: 'var(--soc-threat-head-color)' }}>
                SOC Team
              </h3>
              <div className="op-list">
                {teamMembers.length === 0 ? (
                  <div className="text-small text-text-muted" style={{ padding: '12px 0' }}>No team members found.</div>
                ) : (
                  teamMembers.slice(0, 4).map((m) => {
                    const initials = m.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
                    return (
                      <div className="op-row" key={m.id}>
                        <div className="avatar" style={{ width: '30px', height: '30px', fontSize: '11px' }}>{initials}</div>
                        <div>
                          <div className="op-name">{m.name}</div>
                          <div className="op-sub">{m.role?.name || 'No role assigned'}</div>
                        </div>
                        <span className="avail">{m.lastLogin || 'Never'}</span>
                      </div>
                    )
                  })
                )}
              </div>
              <button type="button" className="view-all-btn" onClick={() => navigate('/dashboard/settings')}>View All →</button>
            </div>

          </div>

          {/* Campaign Logs */}
          <div className="campaign-log">
            <div className="log-head">
              <span className="dot-blue"></span>
              Closed-Loop Campaign Logs
            </div>
            <div className="h-32 overflow-y-auto font-mono text-[11px] text-text-secondary space-y-1.5 custom-scrollbar">
              {simLogs.map((log, index) => (
                <div key={index} className="log-line">
                  {log}
                </div>
              ))}
            </div>
          </div>

          {/* Footer status */}
          <div className="footer-status">
            <span>LIVE THREAT FEED ({threatIndicators.length}) &nbsp;·&nbsp; SYSTEM STATUS: {openHighSeverityAlerts.length > 0 ? `${openHighSeverityAlerts.length} OPEN` : 'NOMINAL'}</span>
            <span>{simState === 'simulating' ? 'SIMULATION RUNNING' : 'STANDING BY'} &nbsp;·&nbsp; {simState === 'simulating' ? `${loggedStages} STEPS LOGGED` : 'SEC_OPS IDLE'}</span>
          </div>

        </div>
      ) : (
        <div className="space-y-8 animate-fade-in relative text-[var(--soc-text)]">
          
          {/* ================ HERO / COMMAND CENTER ================ */}
          <div className="hero-wrap">
            <div className="hero-globe">
              <svg viewBox="0 0 400 400" id="globeSvg">
                <circle cx={200} cy={200} r={190} fill="none" stroke="rgba(120,160,230,0.3)" />
                {globeEllipsesLat.map((e, idx) => (
                  <ellipse key={`lat-${idx}`} cx={200} cy={e.yy} rx={e.rx} ry={5} fill="none" stroke="rgba(120,160,230,0.15)" />
                ))}
                {globeEllipsesLong.map((e, idx) => (
                  <ellipse key={`long-${idx}`} cx={200} cy={200} rx={e.rx} ry={190} fill="none" stroke="rgba(120,160,230,0.1)" />
                ))}
                {globeDots.map((dot, idx) => (
                  <circle key={`dot-${idx}`} cx={dot.cx} cy={dot.cy} r={dot.rVal} fill="rgba(140,175,235,0.3)" />
                ))}
              </svg>
            </div>

            <div className="command-panel">
              <div className="command-left">
                <div className="eyebrow">COMMAND CENTER</div>
                <h1>Secure operations at the speed of threat.</h1>
                <p>Monitor live alerts, correlate threats, and act on critical incidents with a unified cyber defense console built for advanced SOC workflows.</p>
              </div>
              <div className="command-right">
                <div className="readiness">
                  <div className="lbl">OPERATIONAL READINESS</div>
                  <div className="big">
                    {isLoading || operationalReadinessPercent === null ? '—' : `${operationalReadinessPercent}%`}
                    <div className="mini-bars">
                      {[agentConnectivityPercent, integrationConnectivityPercent, responseReadiness, pipelineHealthPercent].map((v, i) => (
                        <div key={i} style={{ height: `${v === null ? 3 : 4 + (v / 100) * 22}px`, opacity: v === null ? 0.25 : 1 }} />
                      ))}
                    </div>
                  </div>
                  <div className="desc">
                    {readinessValues.length === 0 ? 'No readiness signals available yet.' : (
                      <>
                        Agents {agentConnectivityPercent ?? '—'}% · Integrations {integrationConnectivityPercent ?? '—'}% · Response {responseReadiness ?? '—'}% · Pipeline {pipelineHealthPercent ?? '—'}%
                      </>
                    )}
                  </div>
                </div>
                <div className="owner">
                  <div className="lbl">OWNER BREAKDOWN</div>
                  {ownerBreakdown ? (
                    <>
                      <div className="owner-row">
                        <span className="d blue"></span>Assigned
                        <b>{ownerBreakdown.assignedPercent}%</b>
                      </div>
                      <div className="owner-row">
                        <span className="d cyan"></span>Unassigned
                        <b>{ownerBreakdown.unassignedPercent}%</b>
                      </div>
                      <div className="desc">{ownerBreakdown.assigned} of {ownerBreakdown.total} alerts have a real assigned owner.</div>
                    </>
                  ) : (
                    <div className="desc">No alerts to attribute ownership to yet.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ================ OPERATIONAL OVERVIEW ================ */}
          <div>
            <div className="ov-head">
              <div>
                <h2>Operational Overview</h2>
                <p>Mission-critical infrastructure health</p>
              </div>
              <div className="grid-status-pill">
                <div className="l">GRID STATUS</div>
                <div className="v">
                  {!gridHasAnyMonitoredSystem ? 'No Systems' : gridDegraded ? 'Degraded' : 'Secure'}
                </div>
              </div>
            </div>

            <div className="ov-grid">
              {/* Ingest Volume vs Errors */}
              <div className="ov-card card-cyan">
                <h3>
                  Ingest Volume vs Errors
                  <button
                    type="button"
                    className="zoom-btn"
                    onClick={() => setIngestRangeHours(h => (h === 1 ? 24 : h === 24 ? 168 : 1))}
                  >
                    {ingestRangeHours}h ⌄
                  </button>
                </h3>
                <div className="zoom-tabs">
                  {[1, 24, 168].map(h => (
                    <button
                      type="button"
                      key={h}
                      className={ingestRangeHours === h ? 'on' : ''}
                      onClick={() => setIngestRangeHours(h)}
                    >
                      {h === 1 ? '1H' : h === 24 ? '1D' : '7D'}
                    </button>
                  ))}
                </div>
                {(() => {
                  const buckets = ingestVolumeErrors?.buckets ?? []
                  if (buckets.length === 0) {
                    return <div className="text-small text-text-muted" style={{ padding: '24px 0', textAlign: 'center' }}>No ingest activity in this window.</div>
                  }
                  const maxVal = Math.max(1, ...buckets.map(b => Math.max(b.volume, b.errors)))
                  const w = 300, h = 150, n = buckets.length
                  const volPoints = buckets.map((b, i) => `${(i / Math.max(1, n - 1)) * w},${h - (b.volume / maxVal) * h}`).join(' ')
                  const errPoints = buckets.map((b, i) => `${(i / Math.max(1, n - 1)) * w},${h - (b.errors / maxVal) * h}`).join(' ')
                  return (
                    <>
                      <svg viewBox={`0 0 ${w} ${h + 10}`} width="100%" height="150">
                        <polyline points={volPoints} fill="none" stroke="#22d3ee" strokeWidth="2" />
                        <polygon points={`${volPoints} ${w},${h} 0,${h}`} fill="rgba(34,211,238,0.15)" />
                        <polyline points={errPoints} fill="none" stroke="#ef4444" strokeWidth="2" />
                      </svg>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--soc-dim)', marginTop: '2px' }}>
                        <span>{new Date(buckets[0].bucketStart).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: ingestRangeHours > 24 ? 'short' : undefined, day: ingestRangeHours > 24 ? 'numeric' : undefined })}</span>
                        <span>{new Date(buckets[buckets.length - 1].bucketStart).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: ingestRangeHours > 24 ? 'short' : undefined, day: ingestRangeHours > 24 ? 'numeric' : undefined })}</span>
                      </div>
                      <div className="mtr-legend">
                        <span><span className="d" style={{ background: '#22d3ee' }}></span>Volume ({ingestVolumeErrors?.totalVolume ?? 0})</span>
                        <span><span className="d" style={{ background: '#ef4444' }}></span>Errors ({ingestVolumeErrors?.totalErrors ?? 0})</span>
                      </div>
                    </>
                  )
                })()}
              </div>

              {/* Notable Events */}
              <div className="ov-card card-purple">
                <h3>Notable Events <span className="chev-r">›</span></h3>
                <div className="big-num">{openHighSeverityAlerts.length}</div>
                <button type="button" className="live-feed-link" onClick={() => navigate('/dashboard/alerts')}>↗ Live Feed</button>
                <div className="notable-list">
                  {openHighSeverityAlerts.slice(0, 5).map((a, i) => (
                    <div key={a.id || i}>{a.title}</div>
                  ))}
                  {openHighSeverityAlerts.length === 0 && <div>No open high/critical severity alerts.</div>}
                </div>
              </div>

              {/* Mean Time to Detect */}
              <div className="ov-card card-teal">
                <h3>Mean Time to Detect</h3>
                {(() => {
                  const scaleMax = 120 // minutes, matches the dial's 0-120 labels
                  const clamped = mttdMinutes === null ? 0 : Math.min(scaleMax, mttdMinutes)
                  const angleDeg = 180 - (clamped / scaleMax) * 180
                  const rad = (angleDeg * Math.PI) / 180
                  const needleX = 100 + 50 * Math.cos(rad)
                  const needleY = 110 - 50 * Math.sin(rad)
                  return (
                    <div className="gauge-wrap">
                      <svg viewBox="0 0 200 120">
                        <path d="M20,110 A80,80 0 0 1 180,110" fill="none" stroke="var(--soc-gauge-bg)" strokeWidth="14"/>
                        <path d="M20,110 A80,80 0 0 1 180,110" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeDasharray={`${mttdMinutes === null ? 0 : (clamped / scaleMax) * 251} 251`} strokeLinecap="round"/>
                        <defs>
                          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0" stopColor="#22d3ee"/><stop offset="1" stopColor="#5eead4"/>
                          </linearGradient>
                        </defs>
                        <line x1="100" y1="105" x2={needleX} y2={needleY} stroke="var(--soc-text)" strokeWidth="3" strokeLinecap="round"/>
                        <circle cx="100" cy="105" r="5" fill="var(--soc-text)"/>
                        <text x="26" y="108" fontSize="10" fill="var(--soc-muted)">0</text>
                        <text x="42" y="70" fontSize="10" fill="var(--soc-muted)">20</text>
                        <text x="75" y="42" fontSize="10" fill="var(--soc-muted)">40</text>
                        <text x="112" y="35" fontSize="10" fill="var(--soc-muted)">60 80</text>
                        <text x="160" y="70" fontSize="10" fill="var(--soc-muted)">100</text>
                        <text x="170" y="108" fontSize="10" fill="var(--soc-muted)">120</text>
                      </svg>
                      <div className="gauge-val">{mttdMinutes === null ? 'No data' : mttdMinutes < 1 ? `${Math.round(mttdMinutes * 60)}s` : `${mttdMinutes.toFixed(1)}m`}</div>
                    </div>
                  )
                })()}
              </div>

              {/* Mean Time to Respond */}
              <div className="ov-card card-teal">
                <h3>Mean Time to Respond <span className="chev-r">›</span></h3>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', gap: '8px' }}>
                  <div className="gauge-val" style={{ fontSize: '28px' }}>
                    {mttrMinutes === null ? 'No data' : mttrMinutes < 60 ? `${mttrMinutes.toFixed(1)}m` : `${(mttrMinutes / 60).toFixed(1)}h`}
                  </div>
                  <div className="text-small text-text-muted">
                    {alerts.filter(a => a.status === 'MITIGATED' || a.status === 'CLOSED').length} resolved alerts (createdAt → last status update)
                  </div>
                </div>
              </div>

              {/* Alert Severity Mix */}
              <div className="ov-card card-amber">
                <h3>Alert Severity Mix</h3>
                {hasSeverityData ? (
                  <div className="donut-wrap">
                    <svg viewBox="0 0 140 140" width="120" height="120">
                      <circle cx="70" cy="70" r="55" fill="none" stroke="var(--soc-border-soft)" strokeWidth="20"/>
                      <circle cx="70" cy="70" r="55" fill="none" stroke="#ef4444" strokeWidth="20" strokeDasharray={`${donutCritDash} 259`} strokeDashoffset="0" transform="rotate(-90 70 70)"/>
                      <circle cx="70" cy="70" r="55" fill="none" stroke="#f97316" strokeWidth="20" strokeDasharray={`${donutHighDash} 259`} strokeDashoffset={donutHighOffset} transform="rotate(-90 70 70)"/>
                      <circle cx="70" cy="70" r="55" fill="none" stroke="#facc15" strokeWidth="20" strokeDasharray={`${donutMedDash} 259`} strokeDashoffset={donutMedOffset} transform="rotate(-90 70 70)"/>
                      <circle cx="70" cy="70" r="55" fill="none" stroke="#4ade80" strokeWidth="20" strokeDasharray={`${donutLowDash} 259`} strokeDashoffset={donutLowOffset} transform="rotate(-90 70 70)"/>
                    </svg>
                    <div className="donut-legend">
                      <div><span className="d" style={{ background: '#ef4444' }}></span>Critical<span className="n">{severityCounts?.critical ?? 0}</span></div>
                      <div><span className="d" style={{ background: '#f97316' }}></span>High<span className="n">{severityCounts?.high ?? 0}</span></div>
                      <div><span className="d" style={{ background: '#facc15' }}></span>Medium<span className="n">{severityCounts?.medium ?? 0}</span></div>
                      <div><span className="d" style={{ background: '#4ade80' }}></span>Low<span className="n">{severityCounts?.low ?? 0}</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="text-small text-text-muted" style={{ padding: '24px 0', textAlign: 'center' }}>No alerts yet.</div>
                )}
              </div>
            </div>
          </div>

          {/* ================ BOTTOM GRID ================ */}
          <div className="bottom-grid">
            <div className="bottom-card">
              <h3>Incident Timeline (Past 24h)</h3>
              <div className="timeline">
                <div style={{ position: 'relative', height: '2px', background: 'var(--soc-border-soft)', margin: '10px 6px 0' }}>
                  {timelineDots.map((dot, i) => (
                    <div key={dot.id}>
                      <div className="tl-dot" title={dot.title} style={{ left: `${dot.percentage}%`, background: dot.color }} />
                      <div className="tl-icon" title={dot.title} style={{ left: `${dot.percentage}%`, top: i % 2 === 0 ? '-52px' : '32px', background: `${dot.color}2e`, color: dot.color }}>
                        {dot.symbol}
                      </div>
                    </div>
                  ))}
                  {timelineDots.length === 0 && (
                    <div className="text-center text-small text-text-muted mt-4">No incidents in the past 24 hours.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bottom-card">
              <h3>Grid Status</h3>
              {!gridHasAnyMonitoredSystem ? (
                <div className="text-small text-text-muted" style={{ padding: '20px 0', textAlign: 'center' }}>
                  No agents or integrations configured yet.
                </div>
              ) : (
                <div className="log-list">
                  {agents.map(a => (
                    <div key={a.id} className="log-row">
                      <div className={`log-tag ${a.status === 'ONLINE' ? 'ok' : 'fail'}`}>{a.status}</div>
                      <div className="log-desc">Agent — {a.hostname}</div>
                    </div>
                  ))}
                  {integrationStatuses.map(integ => (
                    <div key={integ.name} className="log-row">
                      <div className={`log-tag ${integ.healthy ? 'ok' : 'fail'}`}>{integ.enabled ? (integ.healthy ? 'Healthy' : 'Degraded') : 'Disabled'}</div>
                      <div className="log-desc">Integration — {integ.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bottom-card">
              <h3>Closed-Loop Remediation Logs</h3>
              <div className="log-list">
                {remediationLogs.slice(0, 6).map((entry, i) => (
                  <div key={i} className="log-row">
                    <div className={`log-tag ${entry.failed ? 'fail' : 'ok'}`}>
                      {entry.failed ? 'Failed' : 'Success'}
                    </div>
                    <div className="log-desc">{entry.text}</div>
                  </div>
                ))}
                {remediationLogs.length === 0 && (
                  <div className="text-small text-text-muted" style={{ padding: '12px 0' }}>No playbook executions yet.</div>
                )}
              </div>
            </div>
          </div>

          {/* ================ TICKER ================ */}
          <div className="ticker">
            <span className="live"><span className="dot"></span>LIVE THREAT FEED{threatIndicators.length > 0 ? ` (${threatIndicators.length})` : ''}</span>
            <span className="msg">
              {threatIndicators.length > 0
                ? threatIndicators.slice(0, 5).map(t => `${t.severity} ${t.type} ${t.value} (${t.source || 'enrichment'})`).join('   •   ') + '   •   '
                : ''}
              {networkTickerMessage}
            </span>
            <span className="grid-r">GRID STATUS: {gridStatusTickerLabel}</span>
          </div>

        </div>
      )}
    </div>
  )
}
