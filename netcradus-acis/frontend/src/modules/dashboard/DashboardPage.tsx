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
  
  // Tabs: architecture (Immune Architecture) vs overview (SOC Operational View)
  const [activeTab, setActiveTab] = useState<'architecture' | 'overview'>('architecture')
  
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
              <div className="radar-wrap">
                <svg viewBox="0 0 220 220">
                  <polygon points="110,20 200,110 110,200 20,110" fill="none" stroke="var(--soc-radar-grid-stroke)" strokeWidth="1"/>
                  <polygon points="110,55 175,110 110,165 55,110" fill="none" stroke="var(--soc-radar-grid-stroke)" strokeWidth="1"/>
                  <line x1="110" y1="10" x2="110" y2="210" stroke="var(--soc-radar-axis-stroke)"/>
                  <line x1="10" y1="110" x2="210" y2="110" stroke="var(--soc-radar-axis-stroke)"/>
                  <polygon points="110,32 168,105 122,178 48,118" fill="var(--soc-radar-area-fill)" stroke="var(--soc-blue)" strokeWidth="2"/>
                </svg>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '10.5px', color: 'var(--soc-muted)', fontWeight: 700, textAlign: 'center', rowGap: '6px' }}>
                <div>Accuracy</div>
                <div>Latency</div>
                <div>Novelty</div>
                <div>Recall</div>
              </div>
            </div>

            {/* SOC Operative Status */}
            <div className="card-panel">
              <h3 style={{ fontSize: '14.5px', fontWeight: 800, marginBottom: '2px', color: 'var(--soc-threat-head-color)' }}>
                SOC Operative Status
              </h3>
              <div className="op-list">
                <div className="op-row">
                  <div className="avatar" style={{ width: '30px', height: '30px', fontSize: '11px' }}>SP</div>
                  <div>
                    <div className="op-name">Security Operator</div>
                    <div className="op-sub">Active Duty</div>
                  </div>
                  <span className="avail">Available</span>
                </div>
                <div className="op-row">
                  <div className="avatar" style={{ width: '30px', height: '30px', fontSize: '11px' }}>AP</div>
                  <div>
                    <div className="op-name">AI Copilot</div>
                    <div className="op-sub">Monitoring Stream</div>
                  </div>
                  <span className="avail">Active</span>
                </div>
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
        <div className="space-y-8 animate-fade-in relative">
          
          {/* Original SOC Operational Overview Tab */}
          <div className="relative overflow-hidden rounded-2xl border border-fire-border bg-surface-2 p-8 shadow-card">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_28%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--info)_8%,transparent),transparent_30%)] pointer-events-none" />
            <div className="relative z-10 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
              <div className="space-y-4">
                <p className="text-label uppercase text-accent">Command Center</p>
                <h1 className="text-display text-text-primary">Secure operations at the speed of threat.</h1>
                <p className="max-w-2xl text-body text-text-secondary">
                  Monitor live alerts, correlate threats, and act on critical incidents with a unified cyber defense console built for advanced SOC workflows.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
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

          <div className="flex items-end justify-between mb-2">
            <div>
              <h1 className="text-h1 text-text-primary">Operational Overview</h1>
              <p className="text-small text-text-secondary mt-1">Mission-critical infrastructure health</p>
            </div>
            <div className="flex items-center gap-4 bg-surface-2 border border-fire-border px-4 py-2.5 rounded-lg">
              <div className="flex flex-col items-end">
                <span className="text-label uppercase text-text-muted leading-none mb-1">Grid Status</span>
                <span className={`text-small font-semibold tabular-nums ${ (stats?.criticalAlerts ?? 0) > 0 ? "text-danger" : "text-success" }`}>
                  {isLoading ? '—' : (stats?.criticalAlerts ?? 0) > 0 ? `${stats!.criticalAlerts} Critical Active` : 'Secure'}
                </span>
              </div>
            </div>
          </div>

          {/* KPI Row */}
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
            
            <div className="lg:col-span-2 card-mission bg-surface-2 border-fire-border/60 p-6 rounded-2xl">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-h3 text-text-primary">Ingest Volume vs Errors</h3>
                  <p className="text-small text-text-secondary mt-1">Global collection nodes telemetry — last 8 hours</p>
                </div>
              </div>

              <div className="h-[340px] w-full mt-4 flex items-center justify-center border border-dashed border-fire-border/60 rounded-xl relative">
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-50">
                  <span className="text-small font-semibold text-text-secondary">Still in development</span>
                  <span className="text-small text-text-muted mt-1">Real-time chart metric feed pending</span>
                </div>
              </div>
            </div>

            <div className="card-mission bg-surface-2 border-fire-border/60 p-6 rounded-2xl">
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
            </div>

          </div>

        </div>
      )}
    </div>
  )
}
