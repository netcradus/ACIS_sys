import { useEffect, useState, useMemo } from 'react'
import { 
  LayoutDashboard, 
  Activity, 
  ShieldAlert, 
  Zap, 
  Layers, 
  ArrowUpRight, 
  ArrowDownRight, 
  MoreHorizontal, 
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
  AlertTriangle
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
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

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'architecture' | 'overview'>('architecture')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [incidents, setIncidents] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Simulation State Machine
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

  const fetchData = async () => {
    try {
      const [statsRes, alertsRes] = await Promise.all([
        apiClient.get('/api/alerts/dashboard/summary'),
        apiClient.get('/api/alerts')
      ])

      setStats(statsRes.data)
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
    const dashSub = wsClient.subscribe('/topic/dashboard', () => fetchData())
    const alertSub = wsClient.subscribe('/topic/alerts', () => fetchData())

    return () => {
      dashSub.then(s => s?.unsubscribe())
      alertSub.then(s => s?.unsubscribe())
    }
  }, [])

  // Add Log Entry Utility
  const logMsg = (sender: string, text: string) => {
    const time = new Date().toLocaleTimeString()
    setSimLogs(prev => [`[${time}] [${sender}] ${text}`, ...prev])
  }

  // Trigger Simulation Step Sequence
  const runSimulation = (vector: string) => {
    if (simState === 'simulating') return

    setSimState('simulating')
    setSimVector(vector)
    setSimStep(1)
    setSimRisk(25)
    setSimLogs([])

    // Highlight node grid on red team simulator
    const vectorNodes = [...gridNodes]
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor(Math.random() * 24)
      vectorNodes[idx] = 'probing'
    }
    setGridNodes(vectorNodes)
    
    logMsg('RED TEAM', `Initiating validated campaign: '${vector}' mapping to MITRE ATT&CK matrix...`)
  }

  useEffect(() => {
    if (simState !== 'simulating') return

    const interval = setTimeout(() => {
      const nextStep = simStep + 1
      setSimStep(nextStep)

      if (nextStep === 2) {
        // Step 2: Layer 1 - SIEM Detection
        setSimRisk(85)
        logMsg('SIEM PIPELINE', 'Kafka buffer populated. JSON Log Normalizer outputting structural events...')
        logMsg('SIEM AI MODEL', 'Anomaly detected by Isolation Forest. LSTM sequence matches privilege drift behavior.')
        
        // Update nodes to compromised (red)
        setGridNodes(prev => prev.map(n => n === 'probing' ? 'compromised' : n))

      } else if (nextStep === 3) {
        // Step 3: Layer 2 - SOAR Decisions
        logMsg('SOAR ENGINE', 'Critical risk score evaluated (85). Automating incident containment protocol...')
        logMsg('SOAR ENGINE', `Selecting response playbook: 'Isolate Endpoint & Block IP' (Latency < 2.5s)`)
        
      } else if (nextStep === 4) {
        // Step 4: Layer 4 - Healing & Deception
        setSimRisk(12)
        logMsg('HEALING ENGINE', 'Releasing automatic containment. Rollback sequence triggered on target nodes.')
        logMsg('HEALING ENGINE', 'Configuration restored to healthy state from cached Docker/VSS snapshots.')
        logMsg('DECEPTION', 'Honeypots deployed. Fake credentials seeded on adjacent network subnets.')
        
        // Nodes isolated/contained (blue)
        setGridNodes(prev => prev.map(n => n === 'compromised' ? 'contained' : n))

      } else if (nextStep === 5) {
        // Step 5: Layer 5 - Threat Intel Swarm
        logMsg('INTEL SWARM', 'Aggregating localized detection vectors. Activating federated learning parameters loop...')
        logMsg('INTEL SWARM', 'Federated sync completed (+1,204 new parameters). Distributing updated model weights.')

      } else if (nextStep === 6) {
        // Step 6: Secure State / Idle
        setSimRisk(20)
        setSimState('idle')
        setSimVector(null)
        setSimStep(0)
        setGridNodes(Array(24).fill('secure'))
        logMsg('SYSTEM', 'Closed-loop cycle complete. Model refreshed. Grid state: 100% SECURE.')
      }
    }, 3000)

    return () => clearTimeout(interval)
  }, [simState, simStep])

  const activeVectorLabel = useMemo(() => {
    switch (simVector) {
      case 'phishing': return 'Phishing Simulation'
      case 'privilege': return 'Privilege Escalation'
      case 'lateral': return 'Lateral Movement'
      case 'cloud': return 'Cloud Attack'
      default: return 'Campaign Verification'
    }
  }, [simVector])

  return (
    <div className="space-y-6 animate-fade-in relative min-h-screen text-white pb-12">
      {/* Top Banner and Navigation Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between border-b border-white/5 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse shadow-accent-glow" />
            <h1 className="text-2xl font-black uppercase tracking-wider text-white">Autonomous Cyber Immune System</h1>
          </div>
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-[0.25em] mt-1">
            Real-time closed-loop security automation & validation console
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center bg-black/60 p-1 border border-white/5 rounded-2xl w-fit">
          <button 
            onClick={() => setActiveTab('architecture')}
            className={clsx(
              "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200",
              activeTab === 'architecture' ? "bg-accent text-white shadow-accent-glow" : "text-text-secondary hover:text-white"
            )}
          >
            Immune Architecture
          </button>
          <button 
            onClick={() => setActiveTab('overview')}
            className={clsx(
              "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200",
              activeTab === 'overview' ? "bg-accent text-white shadow-accent-glow" : "text-text-secondary hover:text-white"
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
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-surface-2 p-6 shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,77,0,0.08),transparent_40%)] pointer-events-none" />
            
            <div className="relative z-10 flex flex-col xl:flex-row gap-6 items-start xl:items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="badge-mission bg-accent/10 border-accent text-accent">Active Sandbox Mode</span>
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Closed-loop simulator</span>
                </div>
                <h2 className="text-xl font-extrabold text-white uppercase tracking-tight">Closed-Loop Attack & Remediation Simulator</h2>
                <p className="max-w-2xl text-[11px] uppercase tracking-[0.1em] text-text-secondary">
                  Select a threat vector to trigger a simulated red-team attack campaign. Watch as the system moves automatically through the defense lifecycle.
                </p>
              </div>

              {/* Simulation Selectors */}
              <div className="flex flex-wrap gap-2 w-full xl:w-auto">
                {[
                  { id: 'phishing', label: 'Phishing' },
                  { id: 'privilege', label: 'Privilege Escalation' },
                  { id: 'lateral', label: 'Lateral Movement' },
                  { id: 'cloud', label: 'Cloud Attacks' }
                ].map(v => (
                  <button
                    key={v.id}
                    onClick={() => runSimulation(v.id)}
                    disabled={simState === 'simulating'}
                    className={clsx(
                      "btn-mission text-[9px] font-black uppercase tracking-widest py-3 px-4 flex-1 xl:flex-none border border-white/10 hover:border-accent/40 rounded-xl",
                      simVector === v.id ? "border-accent text-accent bg-accent/5 font-extrabold" : "text-white bg-black/40 hover:bg-black/60"
                    )}
                  >
                    {v.label}
                  </button>
                ))}

                <button
                  onClick={() => {
                    setSimState('idle');
                    setSimVector(null);
                    setSimStep(0);
                    setSimRisk(20);
                    setGridNodes(Array(24).fill('secure'));
                    setSimLogs([`[${new Date().toLocaleTimeString()}] [SYSTEM] Telemetry reset. System secure.`]);
                  }}
                  disabled={simState !== 'simulating'}
                  className="bg-black/40 border border-white/10 hover:border-danger/40 hover:text-danger text-text-muted rounded-xl p-3 flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                  title="Reset System State"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            {/* Visual Steps Tracker */}
            <div className="mt-6 border-t border-white/5 pt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { step: 1, label: 'TEST / TRIGGER', desc: 'Campaign Launch', status: simStep === 1 },
                { step: 2, label: 'DETECT (L1)', desc: 'AI-Powered SIEM', status: simStep === 2 },
                { step: 3, label: 'ANALYZE / RESPOND (L2)', desc: 'Autonomous SOAR', status: simStep === 3 },
                { step: 4, label: 'HEAL & DECEIVE (L4)', desc: 'State Snapshot Restore', status: simStep === 4 },
                { step: 5, label: 'LEARN (L5)', desc: 'Swarm Retraining', status: simStep === 5 }
              ].map(item => (
                <div 
                  key={item.step}
                  className={clsx(
                    "p-3 rounded-xl border transition-all duration-300 relative",
                    item.status 
                      ? "bg-accent/10 border-accent/70 shadow-lg shadow-accent/5 scale-102" 
                      : simStep > item.step 
                        ? "bg-success/5 border-success/30 opacity-70"
                        : "bg-surface-3/30 border-white/5 opacity-40"
                  )}
                >
                  {simStep > item.step && (
                    <div className="absolute right-2 top-2 bg-success text-black rounded-full p-0.5">
                      <ShieldCheck className="h-3 w-3" />
                    </div>
                  )}
                  <span className="text-[9px] font-black uppercase text-text-secondary tracking-widest leading-none">Step {item.step}</span>
                  <div className="text-xs font-black text-white mt-1 uppercase tracking-tight">{item.label}</div>
                  <div className="text-[9px] text-text-secondary mt-1">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Flow Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Column: Layer 1 (Detect) */}
            <div className="space-y-6">
              
              {/* Layer 1 Module Box */}
              <div className={clsx(
                "card-mission relative transition-all duration-300",
                simStep === 2 ? "border-info/80 shadow-[0_0_20px_rgba(0,194,255,0.15)] bg-surface-2" : "border-white/5 bg-black/40"
              )}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="badge-mission bg-info/10 border-info text-info">Layer 1</span>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white mt-1">AI-Powered SIEM</h3>
                  </div>
                  <Activity className={clsx("h-5 w-5", simStep === 2 ? "text-info animate-pulse" : "text-text-muted")} />
                </div>

                <div className="space-y-4">
                  {/* Log Ingestion Path */}
                  <div className="rounded-xl border border-white/5 bg-black/50 p-3">
                    <div className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-2">Ingestion Telemetry</div>
                    <div className="space-y-1.5 text-[10px] font-bold text-text-secondary uppercase">
                      <div className="flex items-center justify-between">
                        <span>Network Logs</span>
                        <span className={clsx(simStep === 2 ? "text-info" : "text-text-muted")}>Active</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Cloud Telemetry</span>
                        <span className={clsx(simStep === 2 ? "text-info" : "text-text-muted")}>Active</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Application Logs</span>
                        <span className={clsx(simStep === 2 ? "text-info" : "text-text-muted")}>Active</span>
                      </div>
                    </div>
                  </div>

                  {/* Flow Steps */}
                  <div className="flex items-center justify-between gap-1 text-[9px] font-black text-center">
                    <div className="flex-1 p-2 rounded bg-surface-3 border border-white/5 text-text-secondary">Kafka/Fluentd</div>
                    <span className="text-text-muted">➔</span>
                    <div className="flex-1 p-2 rounded bg-surface-3 border border-white/5 text-text-secondary">Normalization</div>
                    <span className="text-text-muted">➔</span>
                    <div className="flex-1 p-2 rounded bg-surface-3 border border-white/5 text-text-secondary">Correlation</div>
                  </div>

                  {/* Models State */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                      <div className="text-[9px] font-black uppercase text-text-muted">LSTM Predictor</div>
                      <div className="text-xs font-black text-white mt-1">ACTIVE</div>
                    </div>
                    <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                      <div className="text-[9px] font-black uppercase text-text-muted">Isolation Forest</div>
                      <div className="text-xs font-black text-white mt-1">MONITORING</div>
                    </div>
                  </div>

                  {/* Holographic Ingestion HUD */}
                  <div className="p-4 bg-black border border-white/5 rounded-xl flex items-center justify-between relative overflow-hidden">
                    <div>
                      <div className="text-[9px] font-black uppercase text-text-muted tracking-widest">Ingest Lag</div>
                      <div className="text-xl font-black text-white mt-1 font-mono">&lt; 5s</div>
                    </div>

                    {/* Circular gauge */}
                    <div className="relative h-16 w-16 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-white/5"
                          strokeWidth="3.5"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="text-info transition-all duration-500"
                          strokeDasharray={`${simRisk}, 100`}
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-xs font-black font-mono text-white leading-none">{simRisk}%</span>
                        <span className="text-[6px] font-bold text-text-secondary uppercase mt-0.5">Risk</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Center Column: Layer 2 (Respond) & Layer 4 (Heal) */}
            <div className="space-y-6">
              
              {/* Layer 2 Module Box */}
              <div className={clsx(
                "card-mission relative transition-all duration-300",
                simStep === 3 ? "border-accent/80 shadow-[0_0_20px_rgba(255,77,0,0.15)] bg-surface-2" : "border-white/5 bg-black/40"
              )}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="badge-mission bg-accent/10 border-accent text-accent">Layer 2</span>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white mt-1 font-bold">Autonomous SOAR</h3>
                  </div>
                  <Zap className={clsx("h-5 w-5", simStep === 3 ? "text-accent animate-pulse" : "text-text-muted")} />
                </div>

                <div className="space-y-4">
                  {/* Architecture & Orchestration tags */}
                  <div className="flex items-center gap-2">
                    <span className="badge-mission border-white/5 bg-black/50 text-text-muted">Python Microservices</span>
                    <span className="badge-mission border-white/5 bg-black/50 text-text-muted">K8s Orchestration</span>
                  </div>

                  {/* Flow logic */}
                  <div className="p-3 bg-black/40 border border-white/5 rounded-xl text-center text-[10px] uppercase font-bold text-text-secondary">
                    Playbooks ➔ Automated Actions
                  </div>

                  {/* Action HUD list */}
                  <div className="space-y-2">
                    {[
                      { key: 'block', name: 'Block IP Range', active: simStep === 3 && simVector === 'cloud' },
                      { key: 'isolate', name: 'Isolate Endpoint Node', active: simStep === 3 && (simVector === 'privilege' || simVector === 'lateral') },
                      { key: 'script', name: 'Execute Containment Script', active: simStep === 3 && simVector === 'phishing' }
                    ].map(a => (
                      <div 
                        key={a.key}
                        className={clsx(
                          "px-3 py-2.5 rounded-xl border text-xs font-black uppercase flex items-center justify-between transition-all duration-300",
                          a.active ? "bg-accent/10 border-accent text-white scale-102" : "bg-black/30 border-white/5 text-text-secondary"
                        )}
                      >
                        <span>{a.name}</span>
                        {a.active ? (
                          <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* SOAR Telemetry HUD */}
                  <div className="p-3 bg-black border border-white/5 rounded-xl flex items-center justify-between text-xs font-black uppercase text-text-muted">
                    <span>Remediation Lag</span>
                    <span className="font-mono text-white">&lt; 10s</span>
                  </div>
                </div>
              </div>

              {/* Layer 4 Module Box */}
              <div className={clsx(
                "card-mission relative transition-all duration-300",
                simStep === 4 ? "border-success/80 shadow-[0_0_20px_rgba(0,255,153,0.15)] bg-surface-2" : "border-white/5 bg-black/40"
              )}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="badge-mission bg-success/10 border-success text-success">Layer 4</span>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white mt-1">Healing & Deception</h3>
                  </div>
                  <ShieldCheck className={clsx("h-5 w-5", simStep === 4 ? "text-success animate-pulse" : "text-text-muted")} />
                </div>

                <div className="space-y-4">
                  {/* Dynamic behavior flag */}
                  <div className="flex items-center justify-between text-[10px] font-black text-text-muted uppercase">
                    <span>Engine Behavior</span>
                    <span className="text-success tracking-widest font-extrabold">Dynamic</span>
                  </div>

                  {/* Engine Split layout */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Self Healing */}
                    <div className="p-3 bg-black/40 border border-white/5 rounded-xl flex flex-col justify-between min-h-[100px]">
                      <div>
                        <div className="text-[9px] font-black uppercase text-success tracking-widest">Self-Healing</div>
                        <p className="text-[9px] text-text-secondary mt-1 uppercase leading-tight font-medium">Rollback configuration to cached snapshots</p>
                      </div>
                      <div className="text-xs font-mono font-black text-white mt-3 flex items-center gap-1.5">
                        <Sliders className="h-3 w-3 text-success" /> Snapshot VSS
                      </div>
                    </div>

                    {/* Deception */}
                    <div className="p-3 bg-black/40 border border-white/5 rounded-xl flex flex-col justify-between min-h-[100px]">
                      <div>
                        <div className="text-[9px] font-black uppercase text-warning tracking-widest">Deception</div>
                        <p className="text-[9px] text-text-secondary mt-1 uppercase leading-tight font-medium">Activate honeypots and generate fake credentials</p>
                      </div>
                      <div className="text-xs font-mono font-black text-white mt-3 flex items-center gap-1.5">
                        <KeyRound className="h-3 w-3 text-warning" /> Honeypots
                      </div>
                    </div>
                  </div>

                  {/* Restored confirmation popup animation */}
                  {simStep === 4 && (
                    <div className="p-2 border border-success/30 bg-success/5 rounded-xl text-center text-[10px] font-black uppercase text-success animate-pulse">
                      Docker snapshot rollback complete. Config verified.
                    </div>
                  )}

                  {/* Telemetry info */}
                  <div className="p-3 bg-black border border-white/5 rounded-xl flex items-center justify-between text-xs font-black uppercase text-text-muted">
                    <span>Containment lag</span>
                    <span className="font-mono text-white">&lt; 5s</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Column: Layer 3 (Test) & Layer 5 (Learn) */}
            <div className="space-y-6">
              
              {/* Layer 3 Module Box */}
              <div className={clsx(
                "card-mission relative transition-all duration-300",
                simStep === 1 ? "border-accent/80 shadow-[0_0_20px_rgba(255,77,0,0.15)] bg-surface-2" : "border-white/5 bg-black/40"
              )}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="badge-mission bg-accent/10 border-accent text-accent">Layer 3</span>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white mt-1">AI Red Team Simulator</h3>
                  </div>
                  <Crosshair className={clsx("h-5 w-5", simStep === 1 ? "text-accent animate-pulse" : "text-text-muted")} />
                </div>

                <div className="space-y-4">
                  {/* Framework indicator */}
                  <div className="flex items-center justify-between text-[10px] font-black text-text-muted uppercase">
                    <span>Methodology</span>
                    <span className="badge-mission border-accent bg-accent/5 text-accent font-extrabold tracking-widest">MITRE Framework</span>
                  </div>

                  {/* Holographic matrix nodes */}
                  <div className="bg-black border border-white/5 rounded-xl p-4">
                    <div className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-3 text-center">Interactive Grid Map</div>
                    
                    <div className="grid grid-cols-6 gap-2 w-fit mx-auto">
                      {gridNodes.map((state, idx) => (
                        <div
                          key={idx}
                          className={clsx(
                            "h-5 w-5 rounded-md border transition-all duration-500",
                            state === 'secure' && "bg-[#111] border-white/5 hover:border-accent/30",
                            state === 'probing' && "bg-warning/20 border-warning animate-pulse shadow-lg shadow-warning/20",
                            state === 'compromised' && "bg-danger/25 border-danger animate-pulse shadow-lg shadow-danger/20",
                            state === 'contained' && "bg-info/20 border-info shadow-lg shadow-info/20"
                          )}
                          title={`Node ${idx + 1}: ${state.toUpperCase()}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Telemetry info */}
                  <div className="p-3 bg-black border border-white/5 rounded-xl flex items-center justify-between text-xs font-black uppercase text-text-muted">
                    <span>Propagation lag</span>
                    <span className="font-mono text-white">&lt; 10s</span>
                  </div>
                </div>
              </div>

              {/* Layer 5 Module Box */}
              <div className={clsx(
                "card-mission relative transition-all duration-300",
                simStep === 5 ? "border-success/80 shadow-[0_0_20px_rgba(0,255,153,0.15)] bg-surface-2" : "border-white/5 bg-black/40"
              )}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="badge-mission bg-success/10 border-success text-success">Layer 5</span>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white mt-1">Threat Intelligence Swarm</h3>
                  </div>
                  <Share2 className={clsx("h-5 w-5", simStep === 5 ? "text-success animate-pulse" : "text-text-muted")} />
                </div>

                <div className="space-y-4">
                  {/* Swarm details */}
                  <div className="flex items-center justify-between text-[10px] font-black text-text-muted uppercase">
                    <span>Sync Scope</span>
                    <span className="text-success font-extrabold tracking-widest">Global & Edge</span>
                  </div>

                  {/* Collective Intelligence Model */}
                  <div className="p-3 bg-black/40 border border-white/5 rounded-xl text-center text-[10px] uppercase font-bold text-text-secondary">
                    Collective Intelligence Loop
                  </div>

                  {/* Swarm Architecture Details */}
                  <div className="rounded-xl border border-white/5 bg-black/50 p-3 space-y-2">
                    <div className="text-[9px] font-black text-text-muted uppercase tracking-widest">Framework Architecture</div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-text-secondary uppercase">
                      <span>Federated Learning</span>
                      <span className="text-white font-black">Sync-On-Alert</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-text-secondary uppercase">
                      <span>Edge-Cloud Architecture</span>
                      <span className="text-white font-black">Hybrid Swarm</span>
                    </div>
                  </div>

                  {/* Sync node count or mesh indicator */}
                  <div className="p-3 bg-black border border-white/5 rounded-xl">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-text-secondary">
                      <span className="flex items-center gap-1.5">
                        <Dna className={clsx("h-3.5 w-3.5 text-success", simStep === 5 && "animate-spin")} /> 
                        Swarm Updates
                      </span>
                      <span className={clsx("font-mono font-black transition-all", simStep === 5 ? "text-success" : "text-text-muted")}>
                        {simStep === 5 ? "+1,204 Param Sync" : "Idle"}
                      </span>
                    </div>
                  </div>

                  {/* Telemetry Info */}
                  <div className="p-3 bg-black border border-white/5 rounded-xl flex items-center justify-between text-xs font-black uppercase text-text-muted">
                    <span>Propagation lag</span>
                    <span className="font-mono text-white">&lt; 10s</span>
                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* Terminal Console Log */}
          <div className="card-mission border-white/5 bg-black p-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-accent animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Closed-Loop Campaign Logs</h3>
              </div>
              <div className="text-[9px] font-bold text-text-secondary uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded">
                {simState === 'simulating' ? `${activeVectorLabel} Running` : 'System Monitoring'}
              </div>
            </div>

            <div className="h-32 overflow-y-auto font-mono text-[10px] text-text-secondary space-y-2 custom-scrollbar">
              {simLogs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className={clsx(
                    "font-bold shrink-0",
                    log.includes('RED TEAM') && "text-accent",
                    log.includes('SIEM') && "text-info",
                    log.includes('SOAR') && "text-warning",
                    log.includes('HEALING') && "text-success",
                    log.includes('SWARM') && "text-success",
                    log.includes('SYSTEM') && "text-white"
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

          {/* KPI Row */}
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
                </div>
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
                        { name: 'Low', value: 0, color: '#00C2FF' },
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
      )}
    </div>
  )
}
