import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import { useCanRead, MODULES } from '@/store/permissionsStore'
import { useEntityPivot } from '@/hooks/useEntityPivot'
import KpiTile from '@/components/ui/KpiTile'
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { useChartColors } from '@/hooks/useChartColors'

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
  role: string
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

  // Memoized elements for SOC Operational View
  const miniBarsHeights = useMemo(() => Array.from({ length: 14 }, () => 8 + Math.random() * 18), [])
  
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
  const [severityCounts, setSeverityCounts] = useState<{ critical: number; high: number; medium: number; low: number } | null>(null)
  const [responseReadiness, setResponseReadiness] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  const ingestLagHistory = (ingestStats?.lagSeriesMs ?? []).map((v, i) => ({ t: i, v }))
  const cpuUsage = Math.round(ingestStats?.cpuUsagePercent ?? 0)

  const fetchData = async () => {
    try {
      const [statsRes, alertsRes] = await Promise.all([
        apiClient.get('/api/alerts/dashboard/summary'),
        apiClient.get('/api/alerts')
      ])

      setStats(statsRes.data)
      const allAlerts = alertsRes.data as any[]
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

  // Generate 38 telemetry bar heights
  const generatedBars = useMemo(() => {
    return Array.from({ length: 38 }, (_, i) => 15 + Math.random() * 40 + (i > 30 ? 20 : 0))
  }, [])

  // Static Sparklines points
  const sparklinesPoints = useMemo(() => [
    "0,16 8,10 16,14 24,6 32,12 40,4 48,10 56,3",
    "0,10 8,16 16,8 24,12 32,4 40,10 48,6 56,14",
    "0,4 8,12 16,6 24,16 32,10 40,14 48,8 56,12",
    "0,14 8,6 16,12 24,4 32,10 40,16 48,8 56,4",
    "0,8 8,14 16,4 24,10 32,16 40,6 48,12 56,8"
  ], [])

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

  // Donut chart calculations
  const donutTotal = (severityCounts?.critical ?? 25) + (severityCounts?.high ?? 27) + (severityCounts?.medium ?? 16) + (severityCounts?.low ?? 10)
  const donutCirc = 259
  const donutCritDash = Math.round(((severityCounts?.critical ?? 25) / donutTotal) * donutCirc)
  const donutHighDash = Math.round(((severityCounts?.high ?? 27) / donutTotal) * donutCirc)
  const donutMedDash = Math.round(((severityCounts?.medium ?? 16) / donutTotal) * donutCirc)
  const donutLowDash = Math.round(((severityCounts?.low ?? 10) / donutTotal) * donutCirc)

  const donutHighOffset = -donutCritDash
  const donutMedOffset = -(donutCritDash + donutHighDash)
  const donutLowOffset = -(donutCritDash + donutHighDash + donutMedDash)

  // Timeline dots calculations
  const timelineDots = useMemo(() => {
    return incidents.slice(0, 7).map((inc, i) => {
      const percentage = 5 + i * 14
      const isWarning = inc.severity === 'Critical' || inc.severity === 'High'
      const color = inc.severity === 'Critical' ? 'var(--soc-red)' : inc.severity === 'High' ? 'var(--soc-amber)' : 'var(--soc-blue)'
      const symbol = isWarning ? '⚠' : '⚙'
      return { percentage, color, symbol }
    })
  }, [incidents])

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
                <div className="telemetry-row"><span>Ingestion Telemetry</span></div>
                <div className="telemetry-row"><span>Endpoint Log</span><span className="val">v07750</span></div>
                <div className="telemetry-row"><span>Network Log</span><span className="val">v07750</span></div>
                <div className="telemetry-row"><span>Application Log</span><span className="val">v07755</span></div>
                <div className="bars">
                  {generatedBars.map((h, i) => (
                    <div key={i} style={{ height: `${h}px` }} />
                  ))}
                </div>
              </div>

              <div className="pipeline">
                <div className="pipe-node">Auth / Parse</div>
                <div className="pipe-arrow">→</div>
                <div className="pipe-node">Correlation Gen</div>
                <div className="pipe-arrow">→</div>
                <div className="pipe-node">Classify</div>
              </div>

              <div className="status-pair">
                <div className="status-chip green">
                  <div className="l">LINEAGE PROJECTION</div>
                  {simState === 'simulating' ? 'STREAMING' : 'ACTIVE'}
                </div>
                <div className="status-chip amber">
                  <div className="l">MODEL RETRAINING</div>
                  MONITORING
                </div>
              </div>

              <div className="mini-flow">
                <div style={{ flex: 1 }}>
                  <div className="mini-flow-title">INGEST LAB — IDS</div>
                  <div className="flow-diagram">
                    <div className="flow-node">Firewall</div>
                    <div className="flow-node">Raw Signal</div>
                    <div className="flow-node">Flow A</div>
                    <div className="flow-node">Anomalies</div>
                    <div className="flow-node">Rewind</div>
                    <div className="flow-node">Flow B</div>
                  </div>
                </div>
                <div className="ai-agent-box">
                  <div className="ring">
                    <span>96%</span>
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
                <svg className="gear animate-pulse" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2l2.4 6.9L21 12l-6.6 3.1L12 22l-2.4-6.9L3 12l6.6-3.1z"/>
                </svg>
              </div>

              <div className="action-tabs">
                <span className="action-tab on">Suggested Actions</span>
                <span className="action-tab">Auto Actions</span>
              </div>

              <div className="action-bar">PLAYBOOK · AUTOMATIC ACTIONS</div>

              <div className="action-list">
                <div className={`action-item ${simStep === 3 && activeSimulation && simulationCategory(activeSimulation.name) === 'other' ? 'active' : ''}`}>
                  <span className="ai">⛔</span>Block IP Range
                  <span className="chev-r">›</span>
                </div>
                <div className={`action-item ${simStep === 3 && activeSimulation && simulationCategory(activeSimulation.name) === 'lateral' ? 'active' : ''}`}>
                  <span className="ai">▣</span>Isolate Endpoint Node
                  <span className="chev-r">›</span>
                </div>
                <div className={`action-item ${simStep === 3 && activeSimulation && simulationCategory(activeSimulation.name) === 'phishing' ? 'active' : ''}`}>
                  <span className="ai">◈</span>Execute Containment Script
                  <span className="chev-r">›</span>
                </div>
                <div className="action-item">
                  <span className="ai">☣</span>Kill Malicious Process
                  <span className="chev-r">›</span>
                </div>
                <div className="action-item">
                  <span className="ai">↺</span>Remediation Log
                  <span className="chev-r">›</span>
                </div>
                <div className="action-item count">
                  Remediation Lag
                  <span className="count-val">&lt; 10s</span>
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

                  {/* Heat Blobs */}
                  {[
                    { x: 170, y: 160, c: '#ef4444', rad: 26 },
                    { x: 210, y: 150, c: '#f59e0b', rad: 20 },
                    { x: 190, y: 180, c: '#22c55e', rad: 16 },
                    { x: 150, y: 200, c: '#a855f7', rad: 18 },
                    { x: 230, y: 190, c: '#3b82f6', rad: 14 },
                    { x: 175, y: 220, c: '#ec4899', rad: 15 },
                    { x: 220, y: 230, c: '#ef4444', rad: 18 },
                    { x: 140, y: 150, c: '#22d3ee', rad: 12 }
                  ].map((pt, idx) => (
                    <g key={`heat-${idx}`}>
                      <defs>
                        <radialGradient id={`g-heat-${idx}`} cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor={pt.c} stopOpacity="var(--soc-globe-heat-opacity)" />
                          <stop offset="100%" stopColor={pt.c} stopOpacity={0} />
                        </radialGradient>
                      </defs>
                      <circle cx={pt.x} cy={pt.y} r={pt.rad} fill={`url(#g-heat-${idx})`} className={simStep === 1 ? 'animate-ping' : ''} style={{ animationDuration: '3s' }} />
                    </g>
                  ))}

                  {/* Connection Arcs */}
                  {[
                    { x1: 170, y1: 160, x2: 210, y2: 150 },
                    { x1: 190, y1: 180, x2: 150, y2: 200 },
                    { x1: 210, y1: 150, x2: 230, y2: 190 },
                    { x1: 175, y1: 220, x2: 220, y2: 230 }
                  ].map((arc, idx) => {
                    const mx = (arc.x1 + arc.x2) / 2;
                    const my = (arc.y1 + arc.y2) / 2 - 24;
                    return (
                      <path
                        key={`arc-${idx}`}
                        d={`M${arc.x1},${arc.y1} Q${mx},${my} ${arc.x2},${arc.y2}`}
                        fill="none"
                        stroke="var(--soc-globe-arc-stroke)"
                        strokeWidth={1}
                      />
                    );
                  })}
                </svg>
                
                <div className="geo-tag" style={{ top: '28%', left: '48%' }}>US-01-A</div>
                <div className="geo-tag" style={{ top: '44%', left: '62%' }}>CN-A-04</div>
                <div className="geo-tag" style={{ top: '38%', left: '22%' }}>US-01-B</div>
                <div className="geo-tag" style={{ top: '62%', left: '38%' }}>CN-A-06</div>
              </div>

              <div className="globe-footer">
                <span>COIP STATUS: <span className="status">NOMINAL</span></span>
                <span>v2.1.07</span>
              </div>
            </div>

          </div>

          {/* Bottom row */}
          <div className="grid-bottom">
            
            {/* Live Threat Feed */}
            <div className="card-panel">
              <div className="threat-table-head">
                <h3><span className="dot-red"></span>Live Threat Feed</h3>
                <span className="view-all" onClick={() => navigate('/dashboard/alerts')}>View All</span>
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
                    <div className="t-tags">
                      <span>⛨</span>
                      <span>◈</span>
                      <span>Aₒ</span>
                    </div>
                    <div className="t-cve">{inc.severity}</div>
                    <svg className="t-spark" viewBox="0 0 60 22">
                      <polyline 
                        points={sparklinesPoints[i % sparklinesPoints.length]} 
                        fill="none" 
                        stroke={inc.severity === 'Critical' ? 'var(--soc-red)' : 'var(--soc-blue)'} 
                        strokeWidth="2"
                      />
                    </svg>
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
                          <div className="op-sub">{m.role}</div>
                        </div>
                        <span className="avail">{m.lastLogin || 'Never'}</span>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="view-all-btn" onClick={() => navigate('/dashboard/settings')}>View All →</div>
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
            <span>LIVE THREAT FEED &nbsp;·&nbsp; SYSTEM STATUS: NOMINAL</span>
            <span>ZONE SECURED &nbsp;·&nbsp; SEC_OPS COMPLETE</span>
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
                    {isLoading || responseReadiness === null ? '—' : `${responseReadiness}%`}
                    <div className="mini-bars">
                      {miniBarsHeights.map((h, i) => (
                        <div key={i} style={{ height: `${h}px` }} />
                      ))}
                    </div>
                  </div>
                  <div className="desc">Systems fully operational across all monitored zones.</div>
                </div>
                <div className="owner">
                  <div className="lbl">OWNER BREAKDOWN</div>
                  <div className="owner-row">
                    <span className="d cyan"></span>Open
                    <b>{stats ? `${Math.round(((stats.totalAlerts - stats.criticalAlerts) / Math.max(1, stats.totalAlerts)) * 100)}%` : '55%'}</b>
                  </div>
                  <div className="owner-row">
                    <span className="d blue"></span>Assigned
                    <b>{stats ? `${Math.round((stats.criticalAlerts / Math.max(1, stats.totalAlerts)) * 100)}%` : '25%'}</b>
                  </div>
                  <div className="desc">Share of open alerts with an assigned alertees, ready for response.</div>
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
                  {isLoading ? '—' : (stats?.criticalAlerts ?? 0) > 0 ? `${stats!.criticalAlerts} Critical` : 'Secure'}
                </div>
              </div>
            </div>

            <div className="ov-grid">
              {/* Ingest Volume vs Errors */}
              <div className="ov-card card-cyan">
                <h3>Ingest Volume vs Errors <span className="zoom-btn">Zoom ⌄</span></h3>
                <div className="zoom-tabs"><span className="on">1H</span><span>1D</span></div>
                <svg viewBox="0 0 300 160" width="100%" height="150">
                  <polyline points="0,90 20,70 40,80 60,50 80,65 100,40 120,55 140,35 160,50 180,30 200,45 220,25 240,40 260,20 280,35 300,15" fill="none" stroke="#22d3ee" strokeWidth="2"/>
                  <polygon points="0,90 20,70 40,80 60,50 80,65 100,40 120,55 140,35 160,50 180,30 200,45 220,25 240,40 260,20 280,35 300,15 300,160 0,160" fill="rgba(34,211,238,0.15)"/>
                  <polyline points="0,130 20,120 40,125 60,110 80,118 100,105 120,112 140,100 160,110 180,95 200,105 220,90 240,100 260,85 280,95 300,80" fill="none" stroke="#a855f7" strokeWidth="2"/>
                  <polyline points="0,150 20,148 40,150 60,145 80,148 100,142 120,146 140,140 160,144 180,138 200,142 220,135 240,140 260,132 280,137 300,128" fill="none" stroke="#f59e0b" strokeWidth="1.5"/>
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--soc-dim)', marginTop: '2px' }}>
                  <span>14:00</span><span>14:20</span><span>14:30</span><span>19:30</span><span>20:00</span>
                </div>
              </div>

              {/* Notable Events */}
              <div className="ov-card card-purple">
                <h3>Notable Events <span className="chev-r">›</span></h3>
                <div className="big-num">{stats?.totalAlerts ?? 0}</div>
                <div className="live-feed-link" onClick={() => navigate('/dashboard/alerts')}>↗ Live Feed</div>
                <div className="notable-list">
                  {incidents.slice(0, 5).map((inc, i) => (
                    <div key={inc.id || i}>{inc.title || 'CVE detection log'}</div>
                  ))}
                  {incidents.length === 0 && <div>No active notable alerts.</div>}
                </div>
              </div>

              {/* Mean Time to Detect */}
              <div className="ov-card card-teal">
                <h3>Mean Time to Detect</h3>
                <div className="gauge-wrap">
                  <svg viewBox="0 0 200 120">
                    <path d="M20,110 A80,80 0 0 1 180,110" fill="none" stroke="var(--soc-gauge-bg)" strokeWidth="14"/>
                    <path d="M20,110 A80,80 0 0 1 180,110" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeDasharray="200 251" strokeLinecap="round"/>
                    <defs>
                      <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor="#22d3ee"/><stop offset="1" stopColor="#5eead4"/>
                      </linearGradient>
                    </defs>
                    <line x1="100" y1="105" x2="150" y2="55" stroke="var(--soc-text)" strokeWidth="3" strokeLinecap="round"/>
                    <circle cx="100" cy="105" r="5" fill="var(--soc-text)"/>
                    <text x="26" y="108" font-size="10" fill="var(--soc-muted)">0</text>
                    <text x="42" y="70" font-size="10" fill="var(--soc-muted)">20</text>
                    <text x="75" y="42" font-size="10" fill="var(--soc-muted)">40</text>
                    <text x="112" y="35" font-size="10" fill="var(--soc-muted)">60 80</text>
                    <text x="160" y="70" font-size="10" fill="var(--soc-muted)">100</text>
                    <text x="170" y="108" font-size="10" fill="var(--soc-muted)">120</text>
                  </svg>
                  <div className="gauge-val">90s</div>
                </div>
              </div>

              {/* Mean Time to Respond */}
              <div className="ov-card card-teal">
                <h3>Mean Time to Respond <span className="chev-r">›</span></h3>
                <svg viewBox="0 0 300 160" width="100%" height="140">
                  <polyline points="0,50 40,20 80,35 120,55 160,45 200,65 240,50 280,70" fill="none" stroke="#22d3ee" strokeWidth="2"/>
                  <polyline points="0,90 40,105 80,95 120,80 160,90 200,95 240,80 280,90" fill="none" stroke="#f97316" strokeWidth="2"/>
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--soc-dim)' }}>
                  <span>14:00</span><span>14:20</span><span>14:30</span><span>19:30</span><span>20:00</span>
                </div>
                <div className="mtr-legend">
                  <span><span className="d" style={{ background: '#22d3ee' }}></span>Phishing</span>
                  <span><span className="d" style={{ background: '#f97316' }}></span>Lateral</span>
                </div>
              </div>

              {/* Alert Severity Mix */}
              <div className="ov-card card-amber">
                <h3>Alert Severity Mix</h3>
                <div className="donut-wrap">
                  <svg viewBox="0 0 140 140" width="120" height="120">
                    <circle cx="70" cy="70" r="55" fill="none" stroke="var(--soc-border-soft)" strokeWidth="20"/>
                    <circle cx="70" cy="70" r="55" fill="none" stroke="#ef4444" strokeWidth="20" strokeDasharray={`${donutCritDash} 259`} strokeDashoffset="0" transform="rotate(-90 70 70)"/>
                    <circle cx="70" cy="70" r="55" fill="none" stroke="#f97316" strokeWidth="20" strokeDasharray={`${donutHighDash} 259`} strokeDashoffset={donutHighOffset} transform="rotate(-90 70 70)"/>
                    <circle cx="70" cy="70" r="55" fill="none" stroke="#facc15" strokeWidth="20" strokeDasharray={`${donutMedDash} 259`} strokeDashoffset={donutMedOffset} transform="rotate(-90 70 70)"/>
                    <circle cx="70" cy="70" r="55" fill="none" stroke="#4ade80" stroke-width="20" strokeDasharray={`${donutLowDash} 259`} strokeDashoffset={donutLowOffset} transform="rotate(-90 70 70)"/>
                  </svg>
                  <div className="donut-legend">
                    <div><span className="d" style={{ background: '#ef4444' }}></span>Critical<span className="n">{severityCounts?.critical ?? 25}</span></div>
                    <div><span className="d" style={{ background: '#f97316' }}></span>High<span className="n">{severityCounts?.high ?? 27}</span></div>
                    <div><span className="d" style={{ background: '#facc15' }}></span>Medium<span className="n">{severityCounts?.medium ?? 16}</span></div>
                    <div><span className="d" style={{ background: '#4ade80' }}></span>Low<span className="n">{severityCounts?.low ?? 10}</span></div>
                  </div>
                </div>
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
                    <div key={i}>
                      <div className="tl-dot" style={{ left: `${dot.percentage}%`, background: dot.color }} />
                      <div className="tl-icon" style={{ left: `${dot.percentage}%`, top: i % 2 === 0 ? '-52px' : '32px', background: `${dot.color}2e`, color: dot.color }}>
                        {dot.symbol}
                      </div>
                    </div>
                  ))}
                  {timelineDots.length === 0 && (
                    <div className="text-center text-small text-text-muted mt-4">No recent incident signals.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bottom-card">
              <h3>Grid Status</h3>
              <div className="network-wrap">
                <svg viewBox="0 0 260 220" id="netSvg">
                  {netEdges.map(([a, b], idx) => (
                    <line
                      key={idx}
                      x1={netNodes[a].x}
                      y1={netNodes[a].y}
                      x2={netNodes[b].x}
                      y2={netNodes[b].y}
                      stroke="var(--soc-border-soft)"
                      strokeWidth="1.4"
                    />
                  ))}
                  {netNodes.map((node, i) => {
                    const isProbing = simState === 'simulating' && gridNodes[i % gridNodes.length] === 'probing'
                    const isCompromised = simState === 'simulating' && gridNodes[i % gridNodes.length] === 'compromised'
                    const isContained = simState === 'simulating' && gridNodes[i % gridNodes.length] === 'contained'
                    
                    const fill = isCompromised ? 'var(--soc-red)' : isContained ? 'var(--soc-green)' : isProbing ? 'var(--soc-amber)' : (node.type === 'main' || i % 3 === 0 ? '#0e2a3a' : '#0d1526')
                    const stroke = isCompromised ? 'var(--soc-red)' : isContained ? 'var(--soc-green)' : isProbing ? 'var(--soc-amber)' : (node.type === 'main' || i % 3 === 0 ? 'var(--soc-cyan)' : '#3b4568')
                    const radius = node.type === 'main' ? 16 : (i % 2 === 0 ? 7 : 5.5)
                    
                    return (
                      <circle
                        key={i}
                        cx={node.x}
                        cy={node.y}
                        r={radius}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth="1.4"
                      />
                    )
                  })}
                </svg>
              </div>
            </div>

            <div className="bottom-card">
              <h3>Closed-Loop Remediation Logs</h3>
              <div className="log-list">
                {simLogs.slice(0, 6).map((log, i) => {
                  const isFail = log.toLowerCase().includes('fail')
                  return (
                    <div key={i} className="log-row">
                      <div className={`log-tag ${isFail ? 'fail' : 'ok'}`}>
                        {isFail ? 'Success/Failure' : 'Success/Success'}
                      </div>
                      <div className="log-desc">{log}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ================ TICKER ================ */}
          <div className="ticker">
            <span className="live"><span className="dot"></span>LIVE THREAT FEED</span>
            <span className="msg">SCANNING NETWORK TELEMETRY… NO ACTIVE THREATS MATCHING CORRELATION RULES… SYSTEM STATUS NOMINAL…</span>
            <span className="grid-r">GRID STATUS: NOMINAL &nbsp;·&nbsp; T2: IBT</span>
          </div>

        </div>
      )}
    </div>
  )
}
