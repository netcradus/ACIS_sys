import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Crosshair,
  Flame,
  LayoutGrid,
  Radar,
  Search,
  ShieldAlert,
  Skull,
  Target,
  TriangleAlert,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import { useThemeStore } from '@/store/themeStore'
import apiClient from '@/lib/apiClient'
import { useNavigate } from 'react-router-dom'
import HeatmapGrid from '@/components/viz/HeatmapGrid'
import StepExecutionTimeline, { type ExecutionStep, type StepStatus } from '@/components/viz/StepExecutionTimeline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import './RedTeamPage.css'

interface Simulation {
  id: string
  name: string
  description: string
  mitreTechniques: string[]
  mitreTactics: string[]
  steps: string
  runCount: number
  lastRunAt: string | null
}

interface StepLogEntry {
  stage: number
  name: string
  status: string
  technique: string | null
  timestamp: string
}

interface ExecutionView {
  id: string
  simulationId: string
  simulationName: string
  mitreTechniques: string[]
  status: 'running' | 'completed' | 'failed'
  stepLogs: string
  startedAt: string | null
  completedAt: string | null
}

type MatrixCellState = 'executed' | 'declared' | 'running'

interface MatrixCell {
  id: string
  label: string
  state: MatrixCellState
}

function parseStepLogs(stepLogsJson: string): StepLogEntry[] {
  try {
    const parsed = JSON.parse(stepLogsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeRedTeamStatus(raw: string): StepStatus {
  const s = (raw || '').toLowerCase()
  if (s === 'success' || s === 'completed') return 'success'
  if (s === 'failed') return 'failed'
  if (s === 'skipped') return 'skipped'
  if (s === 'running') return 'running'
  return 'pending'
}

function parseExecutionSteps(stepLogsJson: string): ExecutionStep[] {
  return parseStepLogs(stepLogsJson).map((s) => ({
    name: s.name,
    status: normalizeRedTeamStatus(s.status),
    timestamp: s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : undefined,
    output: s.technique || undefined,
  }))
}

function parseSteps(stepsJson: string) {
  try {
    const parsed = JSON.parse(stepsJson)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function formatWhen(dateString: string | null) {
  if (!dateString) return 'Never'

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  const now = new Date()
  const isToday = now.toDateString() === date.toDateString()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')

  if (isToday) return `Today ${hours}:${minutes}`

  const isYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString() === date.toDateString()
  if (isYesterday) return `Yesterday ${hours}:${minutes}`

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return '—'
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`
}

function seedRandom(seed: number) {
  let s = seed
  return function() {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

export default function RedTeamPage() {
  const canWrite = useCanWrite(MODULES.SOAR_PLAYBOOKS)
  const { resolvedTheme } = useThemeStore()
  const isLight = resolvedTheme === 'light'

  const [simulations, setSimulations] = useState<Simulation[]>([])
  const [executions, setExecutions] = useState<ExecutionView[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [startingId, setStartingId] = useState<string | null>(null)
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [confirmingStartId, setConfirmingStartId] = useState<string | null>(null)
  const navigate = useNavigate()

  const fetchSimulations = async () => {
    try {
      const response = await apiClient.get<Simulation[]>('/api/red-team/simulations')
      setSimulations(response.data || [])
    } catch (err) {
      console.error("Failed to fetch simulations", err)
    } finally {
      setLoading(false)
    }
  }

  const fetchExecutions = async () => {
    try {
      const response = await apiClient.get<ExecutionView[]>('/api/red-team/executions')
      setExecutions(response.data || [])
    } catch (err) {
      console.error("Failed to fetch executions", err)
    }
  }

  useEffect(() => {
    fetchSimulations()
    fetchExecutions()
    const interval = setInterval(() => {
      fetchSimulations()
      fetchExecutions()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const startSimulation = async (id: string) => {
    try {
      setStartingId(id)
      await apiClient.post(`/api/red-team/simulations/${id}/start`)
      fetchSimulations()
    } catch (err) {
      console.error(err)
    } finally {
      setStartingId(null)
      setConfirmingStartId(null)
    }
  }

  const filteredSimulations = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return simulations

    return simulations.filter((simulation) => {
      const searchBlob = [
        simulation.name,
        simulation.description,
        ...(simulation.mitreTechniques || []),
        ...(simulation.mitreTactics || []),
      ]
        .join(' ')
        .toLowerCase()

      return searchBlob.includes(term)
    })
  }, [query, simulations])

  const latestExecutionBySimulation = useMemo(() => {
    const map = new Map<string, ExecutionView>()
    for (const execution of executions) {
      if (!map.has(execution.simulationId)) {
        map.set(execution.simulationId, execution)
      }
    }
    return map
  }, [executions])

  const executedTechniques = useMemo(() => {
    const set = new Set<string>()
    for (const execution of executions) {
      if (execution.status !== 'completed') continue
      for (const step of parseStepLogs(execution.stepLogs)) {
        if (step.technique) set.add(step.technique)
      }
    }
    return set
  }, [executions])

  const declaredTechniques = useMemo(
    () => new Set(simulations.flatMap((simulation) => simulation.mitreTechniques || [])),
    [simulations]
  )

  const summary = useMemo(() => {
    return {
      simulationsAvailable: filteredSimulations.length,
      techniquesCovered: executedTechniques.size,
      activeSimulations: executions.filter((e) => e.status === 'running').length,
      techniquesNotYetValidated: Math.max(0, declaredTechniques.size - executedTechniques.size),
    }
  }, [filteredSimulations, executedTechniques, declaredTechniques, executions])

  const matrixCells: MatrixCell[] = useMemo(() => {
    const runningTechniques = new Set<string>()
    for (const execution of executions) {
      if (execution.status !== 'running') continue
      const simulation = simulations.find((s) => s.id === execution.simulationId)
      simulation?.mitreTechniques?.forEach((t) => runningTechniques.add(t))
    }

    return Array.from(declaredTechniques)
      .slice(0, 20)
      .map((label, index) => ({
        id: `${label}-${index}`,
        label,
        state: runningTechniques.has(label) ? 'running' : executedTechniques.has(label) ? 'executed' : 'declared',
      }))
  }, [declaredTechniques, executedTechniques, executions, simulations])

  const executionHistory = useMemo(() => {
    const simulationIds = new Set(filteredSimulations.map((s) => s.id))
    return executions
      .filter((e) => simulationIds.has(e.simulationId))
      .slice(0, 8)
      .map((execution) => {
        const stepCount = parseStepLogs(execution.stepLogs).length
        return {
          id: execution.id,
          simulation: execution.simulationName,
          status: execution.status,
          duration: formatDuration(execution.startedAt, execution.completedAt),
          detected: `${stepCount} steps logged`,
          date: formatWhen(execution.startedAt),
          accent: execution.status === 'completed' ? 'text-success' : execution.status === 'failed' ? 'text-danger' : 'text-info',
        }
      })
  }, [executions, filteredSimulations])

  const selectedExecution = executions.find((e) => e.id === selectedExecutionId)
    || (executionHistory.length > 0 ? executions.find((e) => e.id === executionHistory[0].id) : undefined)

  // Map Data generator
  const mapData = useMemo(() => {
    const spots = [[90,140],[170,110],[230,130],[300,120],[340,170],[240,220],[130,230],[350,240]]
    const arcs = [[90,140,170,110],[170,110,230,130],[230,130,300,120],[300,120,340,170],[130,230,240,220],[240,220,350,240]]
    const dots = []
    const rng = seedRandom(9999)
    for (let i = 0; i < 600; i++) {
      const x = rng() * 400
      const y = 20 + rng() * 300
      const inLand = (x>20&&x<110&&y>90&&y<250) || (x>140&&x<230&&y>50&&y<240) || (x>250&&x<390&&y>70&&y<270)
      if (inLand && rng() < 0.4) {
        dots.push({ x, y })
      }
    }
    return { dots, spots, arcs }
  }, [])

  // MITRE coverage map grid SVG generator
  const mitreGridData = useMemo(() => {
    const rows = 5, cols = 6
    const colors = isLight
      ? ['#f97316','#d97706','#facc15','#94a3b8','#64748b']
      : ['#f97316','#f59e0b','#facc15','#94a3b8','#64748b']

    const nodePos = []
    for(let r=0;r<rows;r++){
      const y = 40 + r*70
      const rowNodes = []
      for(let c=0;c<cols;c++){
        const x = 40 + c*62 + (r%2===0?0:20)
        rowNodes.push({ x, y, color: colors[r] })
      }
      nodePos.push(rowNodes)
    }

    const lines = []
    const rng = seedRandom(4444)
    for (let r = 0; r < rows - 1; r++) {
      nodePos[r].forEach((n1) => {
        nodePos[r+1].forEach((n2) => {
          if (rng() < 0.22) {
            lines.push({ x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y })
          }
        })
      })
    }

    return { lines, nodes: nodePos.flat() }
  }, [isLight])

  return (
    <div className="red-team-page">
      {/* Atmospheric Background for Dark Mode */}
      <div className="bg-fixed">
        <div className="nebula1" />
        <div className="nebula2" />
        <div className="nebula3" />
        <div className="grid" />
        <div className="stars" />
      </div>

      <div className="content">
        {/* hero panel */}
        <div className="hero-panel">
          <div className="hero-left">
            <div className="hero-tags">
              <span className="hero-tag cyan">⊚ RED TEAM SIMULATOR</span>
              <span className="hero-tag blue">⚡ CONTINUOUS ATTACK EMULATION</span>
            </div>
            <h1>Mission Control for Validation</h1>
            <p>Simulations, coverage, and execution telemetry for the ACIS red team lab.</p>
          </div>
          <div className="hero-right">
            <div className="hero-search">
              <Search className="w-4.5 h-4.5 shrink-0" />
              <input
                type="text"
                placeholder="Search simulations…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => navigate('/dashboard/reports')}
              className="view-reports-btn"
            >
              View Reports ↗
            </button>
          </div>
        </div>

        {/* stats cards row */}
        <div className="stat-row">
          <div className="stat-card highlight">
            <div className="stat-left">
              <div className="lbl">SIMULATIONS AVAILABLE</div>
              <div className="v">{summary.simulationsAvailable}</div>
              <div className="desc">{Math.max(summary.simulationsAvailable, 1)} active templates loaded</div>
            </div>
            <div className="stat-icon-box">▦</div>
          </div>
          <div className="stat-card highlight">
            <div className="stat-left">
              <div className="lbl">MITRE TECHNIQUES EXECUTED</div>
              <div className="v">{summary.techniquesCovered}</div>
              <div className="desc">Techniques with at least one completed run</div>
            </div>
            <div className="stat-icon-box">◎</div>
          </div>
          <div className="stat-card highlight">
            <div className="stat-left">
              <div className="lbl">ACTIVE SIMULATIONS RUNNING</div>
              <div className="v">{summary.activeSimulations}</div>
              <div className="desc">{summary.activeSimulations > 0 ? "Live execution jobs in progress" : "No live execution jobs in progress"}</div>
            </div>
            <div className="stat-icon-box">↻</div>
          </div>
        </div>

        <div className="stat-row" style={{ gridTemplateColumns: '1fr 2.15fr' }}>
          <div className="stat-card warn-card">
            <div className="stat-left">
              <div className="lbl">TECHNIQUES NOT YET VALIDATED</div>
              <div className="v">{summary.techniquesNotYetValidated}</div>
              <div className="desc">Declared in a simulation but never run to completion</div>
            </div>
            <div className="stat-icon-box">⚠</div>
          </div>
          <div />
        </div>

        {loading && simulations.length === 0 ? (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-soft)', padding: '20px', borderRadius: '14px', fontStyle: 'italic', color: 'var(--dim)' }}>
            Loading red team telemetry...
          </div>
        ) : (
          <>
            {/* Simulations grid lists */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
              {filteredSimulations.map((simulation) => {
                const stepCount = parseSteps(simulation.steps)
                const lastRunLabel = formatWhen(simulation.lastRunAt)
                const latestExecution = latestExecutionBySimulation.get(simulation.id)
                const executedSteps = latestExecution ? parseStepLogs(latestExecution.stepLogs).length : 0
                const runTone = !latestExecution
                  ? 'text-text-muted'
                  : latestExecution.status === 'completed'
                    ? 'text-success'
                    : latestExecution.status === 'failed'
                      ? 'text-danger'
                      : 'text-info'
                const detectionLabel = !latestExecution
                  ? 'Not yet run'
                  : latestExecution.status === 'completed'
                    ? `Completed — ${executedSteps} of ${stepCount} steps logged`
                    : latestExecution.status === 'failed'
                      ? `Failed after ${executedSteps} of ${stepCount} steps`
                      : `Running — ${executedSteps} of ${stepCount} steps logged so far`

                return (
                  <article
                    key={simulation.id}
                    style={{
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: '12px',
                      padding: '20px',
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: 'var(--box-shadow)'
                    }}
                  >
                    <div style={{ position: 'absolute', right: '-12px', top: '16px', opacity: 0.05 }}>
                      <Skull className="h-24 w-24 text-danger" />
                    </div>

                    <div style={{ position: 'relative', zIndex: 1 }} className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <span className="badge-mission border-accent/70 bg-accent/10 text-accent">MITRE ATT&CK</span>
                            <span className="badge-mission border-fire-border bg-background text-text-muted">{simulation.mitreTactics?.[0] || 'Uncategorized'}</span>
                          </div>
                          <h2 className="text-h2 text-text-primary">{simulation.name}</h2>
                        </div>
                        <div className="rounded-lg border border-fire-border bg-background px-3 py-1.5 text-label text-accent uppercase whitespace-nowrap">
                          {stepCount} Stages
                        </div>
                      </div>

                      <p className="text-small text-text-secondary">
                        {simulation.description}
                      </p>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-label text-text-muted uppercase">
                          <span>Last run result</span>
                          {latestExecution && (
                            <span className={runTone}>{latestExecution.status}</span>
                          )}
                        </div>
                        <div className="rounded-lg border border-fire-border bg-surface-3 p-4">
                          <div className={clsx('text-small font-semibold', runTone)}>
                            {detectionLabel}
                          </div>
                          <div className="mt-1 text-label text-text-muted uppercase">
                            {stepCount} steps · last run: {lastRunLabel}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-fire-border bg-background px-3 py-2">
                          <div className="text-label text-text-muted uppercase flex items-center gap-1.5">
                            <Clock3 className="h-3.5 w-3.5 text-accent" /> Last Run
                          </div>
                          <div className="mt-1 text-small font-semibold text-text-primary">{lastRunLabel}</div>
                        </div>
                        <div className="rounded-lg border border-fire-border bg-background px-3 py-2">
                          <div className="text-label text-text-muted uppercase flex items-center gap-1.5">
                            <Flame className="h-3.5 w-3.5 text-accent" /> Run Count
                          </div>
                          <div className="mt-1 text-small font-semibold text-text-primary">{simulation.runCount}</div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-fire-border bg-background p-3">
                        <div className="mb-3 flex items-center justify-between text-label text-text-muted uppercase">
                          <span>Technique Trail</span>
                          <span>{simulation.mitreTechniques?.length || 0} mapped</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(simulation.mitreTechniques || []).slice(0, 4).map((technique) => (
                            <span
                              key={technique}
                              className="rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-label text-danger uppercase"
                            >
                              {technique}
                            </span>
                          ))}
                          {(simulation.mitreTactics || []).slice(0, 2).map((tactic) => (
                            <span
                              key={tactic}
                              className="rounded-md border border-fire-border bg-surface-3 px-2 py-1 text-label text-text-muted uppercase"
                            >
                              {tactic}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <button
                          onClick={() => setConfirmingStartId(simulation.id)}
                          disabled={startingId === simulation.id || !canWrite}
                          className="btn-fire justify-center py-3 text-small disabled:cursor-wait disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Crosshair className="h-4 w-4" />
                          {startingId === simulation.id ? 'Starting...' : 'Start'}
                        </button>
                        <button
                          onClick={() => navigate('/dashboard/reports')}
                          className="btn-mission justify-center py-3 text-small"
                        >
                          View Report
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            {/* MITRE Coverage + Execution history table columns */}
            <div className="two-col">
              
              <div className="mitre-panel">
                <h3>MITRE ATT&amp;CK Coverage</h3>
                <div className="sub">Techniques declared across this tenant's simulation library</div>
                <div className="mitre-box">
                  <svg viewBox="0 0 400 400">
                    {/* Connection lines */}
                    {mitreGridData.lines.map((line, idx) => (
                      <line
                        key={idx}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        stroke="var(--mitre-edge-color)"
                        strokeWidth="1"
                      />
                    ))}

                    {/* Nodes */}
                    {mitreGridData.nodes.map((node, idx) => (
                      <circle
                        key={idx}
                        cx={node.x}
                        cy={node.y}
                        r={9}
                        fill={node.color}
                        opacity="0.85"
                      />
                    ))}
                  </svg>
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <div className="exec-panel">
                  <h3>Execution History</h3>
                  <div className="exec-head-row">
                    <span>SIMULATION</span>
                    <span>STATUS</span>
                  </div>

                  {executionHistory.map((row) => (
                    <div
                      key={row.id}
                      onClick={() => setSelectedExecutionId(row.id)}
                      className={clsx("exec-row cursor-pointer", selectedExecutionId === row.id && "bg-slate-800/20")}
                    >
                      <div className="exec-left">
                        <div className="exec-icon blue">⚙</div>
                        <div>
                          <div className="exec-title">{row.simulation}</div>
                          <div className="exec-sub">{row.detected}</div>
                        </div>
                      </div>
                      <div className={clsx("exec-status", row.accent)}>
                        {row.status === 'completed' ? 'Success' :
                         row.status === 'failed' ? 'Failed' : 'Running'}
                      </div>
                    </div>
                  ))}

                  {executionHistory.length === 0 && (
                    <div style={{ padding: '24px 0', textAllign: 'center', color: 'var(--dim)' }}>
                      No executions recorded yet.
                    </div>
                  )}
                </div>

                {/* Floating Campaign hot-spot map */}
                <div className="map-float">
                  <div className="map-float-head">
                    <h3>📷 Global Attack Visualization Map</h3>
                    <div className="map-icons">⤢ ⚙ ⛶</div>
                  </div>
                  <div className="map-box">
                    <svg viewBox="0 0 400 340">
                      {/* Silhouette dots */}
                      {mapData.dots.map((dot, idx) => (
                        <circle key={idx} cx={dot.x} cy={dot.y} r={0.8} fill="var(--map-dot-color)" />
                      ))}

                      {/* Connection pathways */}
                      {mapData.arcs.map(([x1, y1, x2, y2], idx) => {
                        const mx = (x1 + x2) / 2
                        const my = (y1 + y2) / 2 - 30
                        return (
                          <path
                            key={idx}
                            d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                            fill="none"
                            stroke="var(--map-path-color)"
                            strokeWidth="1.3"
                          />
                        )
                      })}

                      {/* Hotspots */}
                      {mapData.spots.map(([x, y], idx) => {
                        const gradId = `ng-red-map-${idx}`
                        if (isLight) {
                          return (
                            <g key={idx}>
                              <circle cx={x} cy={y} r={9} fill="#fde3b8" stroke="#d97706" strokeWidth={1.5} />
                              <circle cx={x} cy={y} r={2.8} fill="#b45309" />
                            </g>
                          )
                        }
                        return (
                          <g key={idx}>
                            <defs>
                              <radialGradient id={gradId}>
                                <stop offset="0%" stopColor="var(--map-hotspot-color)" stopOpacity="0.85" />
                                <stop offset="100%" stopColor="var(--map-hotspot-color)" stopOpacity="0" />
                              </radialGradient>
                            </defs>
                            <circle cx={x} cy={y} r={16} fill={`url(#${gradId})`} />
                            <circle cx={x} cy={y} r={2.8} fill="var(--map-dot-center-color)" />
                          </g>
                        )
                      })}
                    </svg>
                  </div>
                </div>

              </div>

            </div>

            {/* Timelines block if selected execution is active */}
            {selectedExecution && (
              <div style={{ marginTop: '24px', background: 'var(--card-bg)', border: '1px solid var(--border-soft)', padding: '20px', borderRadius: '14px', boxShadow: 'var(--box-shadow)' }}>
                <h4 className="text-label text-text-muted uppercase mb-3">
                  Execution Detail — {selectedExecution.simulationName} ({formatWhen(selectedExecution.startedAt)})
                </h4>
                <StepExecutionTimeline
                  steps={parseExecutionSteps(selectedExecution.stepLogs)}
                  mode={selectedExecution.status === 'running' ? 'live' : 'historical'}
                />
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmingStartId}
        title="Start Simulation"
        message={`This will launch a real attack emulation run for "${simulations.find((s) => s.id === confirmingStartId)?.name || ''}" against the configured targets. Continue?`}
        confirmLabel="Start Simulation"
        busy={startingId === confirmingStartId}
        onConfirm={() => confirmingStartId && startSimulation(confirmingStartId)}
        onCancel={() => setConfirmingStartId(null)}
      />
    </div>
  )
}
