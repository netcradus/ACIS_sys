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
import apiClient from '@/lib/apiClient'
import { useNavigate } from 'react-router-dom'
import HeatmapGrid from '@/components/viz/HeatmapGrid'
import StepExecutionTimeline, { type ExecutionStep, type StepStatus } from '@/components/viz/StepExecutionTimeline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { toast } from '@/store/toastStore'
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
  totalTechniqueCount: number | null
  detectedTechniqueCount: number
  detectionLogs: string
  firstDetectedAt: string | null
  mttdSeconds: number | null
  detectionStatus: 'PENDING' | 'DETECTING' | 'UNDETECTED' | 'PARTIALLY_DETECTED' | 'FULLY_DETECTED'
}

/** A real, backend-recorded detection — written by RedTeamDetectionConsumer only when ACIS's own correlation engine actually raised a matching alert. Never fabricated client-side. */
interface DetectionLogEntry {
  technique: string | null
  alertId: string
  alertTitle: string
  severity: string
  detectedAt: string
  mttdSeconds?: number
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

function parseDetectionLogs(detectionLogsJson: string | null | undefined): DetectionLogEntry[] {
  if (!detectionLogsJson) return []
  try {
    const parsed = JSON.parse(detectionLogsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatMttd(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/** Real detected/total counts + MTTD from the backend's own detection-validation loop — replaces the old fabricated "N steps logged" indicator, which only ever reflected what the simulator emitted, not what ACIS actually detected. */
function formatDetectionLabel(e: ExecutionView): string {
  if (!e.totalTechniqueCount) {
    return e.detectedTechniqueCount > 0 ? `${e.detectedTechniqueCount} technique(s) detected` : 'No techniques declared'
  }
  if (e.status === 'running' && e.detectedTechniqueCount === 0) return 'No detections yet'
  const pct = `${e.detectedTechniqueCount}/${e.totalTechniqueCount} techniques detected`
  return e.mttdSeconds != null ? `${pct} · MTTD ${formatMttd(e.mttdSeconds)}` : pct
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

export default function RedTeamPage() {
  const canWrite = useCanWrite(MODULES.SOAR_PLAYBOOKS)

  const [simulations, setSimulations] = useState<Simulation[]>([])
  const [executions, setExecutions] = useState<ExecutionView[]>([])
  const [loading, setLoading] = useState(true)
  const [simulationsError, setSimulationsError] = useState<string | null>(null)
  const [executionsError, setExecutionsError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [startingId, setStartingId] = useState<string | null>(null)
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [confirmingStartId, setConfirmingStartId] = useState<string | null>(null)
  const navigate = useNavigate()

  const fetchSimulations = async () => {
    setSimulationsError(null)
    try {
      const response = await apiClient.get<Simulation[]>('/api/red-team/simulations')
      setSimulations(response.data || [])
    } catch (err) {
      console.error("Failed to fetch simulations", err)
      setSimulationsError('Unable to load red team simulations. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchExecutions = async () => {
    setExecutionsError(null)
    try {
      const response = await apiClient.get<ExecutionView[]>('/api/red-team/executions')
      setExecutions(response.data || [])
    } catch (err) {
      console.error("Failed to fetch executions", err)
      setExecutionsError('Unable to load execution history. Please try again.')
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
      toast.error('Failed to start simulation.')
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

  // Real detections only — sourced from detectionLogs (written by the
  // backend's RedTeamDetectionConsumer only when ACIS's own correlation
  // engine actually raised a matching alert), never from stepLogs (which
  // only records what the simulator emitted, not what was caught).
  const executedTechniques = useMemo(() => {
    const set = new Set<string>()
    for (const execution of executions) {
      for (const entry of parseDetectionLogs(execution.detectionLogs)) {
        if (entry.technique) set.add(entry.technique)
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
        return {
          id: execution.id,
          simulation: execution.simulationName,
          status: execution.status,
          duration: formatDuration(execution.startedAt, execution.completedAt),
          detected: formatDetectionLabel(execution),
          date: formatWhen(execution.startedAt),
          accent: execution.status === 'completed' ? 'text-success' : execution.status === 'failed' ? 'text-danger' : 'text-info',
        }
      })
  }, [executions, filteredSimulations])

  const selectedExecution = executions.find((e) => e.id === selectedExecutionId)
    || (executionHistory.length > 0 ? executions.find((e) => e.id === executionHistory[0].id) : undefined)

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
              <Search className="w-4 h-4 shrink-0" />
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
            {simulationsError ? (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-soft)', borderRadius: '14px', padding: '20px' }} className="mb-5">
                <div className="flex flex-col items-center gap-2 py-4">
                  <span style={{ color: 'var(--dim)' }}>Unable to load simulations. Please try again.</span>
                  <button className="btn-mission text-small px-3 py-1.5" onClick={fetchSimulations}>Retry</button>
                </div>
              </div>
            ) : filteredSimulations.length === 0 ? (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-soft)', borderRadius: '14px', padding: '24px 0', textAlign: 'center', color: 'var(--dim)' }} className="mb-5">
                No simulations yet — create one to get started.
              </div>
            ) : (
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
                // Real detection status (did ACIS's own correlation engine
                // actually catch this run), not the old step-count-only
                // indicator - execution progress (executedSteps/stepCount)
                // is a genuinely different concept, shown separately below.
                const detectionLabel = !latestExecution
                  ? 'Not yet run'
                  : latestExecution.status === 'failed'
                    ? `Failed after ${executedSteps} of ${stepCount} steps`
                    : formatDetectionLabel(latestExecution)

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
            )}

            {/* MITRE Coverage + Execution history table columns */}
            <div className="two-col">
              
              <div className="mitre-panel">
                <h3>MITRE ATT&amp;CK Coverage</h3>
                <div className="sub">Techniques declared across this tenant's simulation library</div>
                <div className="mitre-box">
                  {matrixCells.length === 0 ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--dim)' }}>
                      No MITRE techniques declared yet.
                    </div>
                  ) : (
                    <div className="mitre-chip-grid">
                      {matrixCells.map((cell) => (
                        <span key={cell.id} className={clsx('mitre-chip', cell.state)}>
                          {cell.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mitre-legend">
                    <span><span className="d running" />Running</span>
                    <span><span className="d executed" />Executed</span>
                    <span><span className="d declared" />Declared only</span>
                  </div>
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <div className="exec-panel">
                  <h3>Execution History</h3>
                  <div className="exec-head-row">
                    <span>SIMULATION</span>
                    <span>STATUS</span>
                  </div>

                  {executionsError && (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--dim)' }}>
                      <div className="flex flex-col items-center gap-2">
                        <span>Unable to load execution history. Please try again.</span>
                        <button className="btn-mission text-small px-3 py-1.5" onClick={fetchExecutions}>Retry</button>
                      </div>
                    </div>
                  )}

                  {!executionsError && executionHistory.map((row) => (
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

                  {!executionsError && executionHistory.length === 0 && (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--dim)' }}>
                      No executions recorded yet.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Timelines block if selected execution is active */}
            {selectedExecution && (
              <div style={{ marginTop: '24px', background: 'var(--card-bg)', border: '1px solid var(--border-soft)', padding: '20px', borderRadius: '14px', boxShadow: 'var(--box-shadow)' }}>
                <h4 className="text-label text-text-muted uppercase mb-3">
                  Execution Detail — {selectedExecution.simulationName} ({formatWhen(selectedExecution.startedAt)})
                </h4>

                {/* Real detection outcome — did ACIS's own correlation engine
                    actually catch this run, not just "did the simulator emit
                    steps" (that's StepExecutionTimeline below, a genuinely
                    different concept: stage-execution progress). Sourced
                    entirely from detectionLogs, written only when a real
                    alert with a matching redTeamExecutionId arrived. */}
                <div style={{ marginBottom: '18px', padding: '14px', borderRadius: '10px', background: 'var(--surface-2, rgba(255,255,255,0.03))', border: '1px solid var(--border-soft)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-label text-text-muted uppercase">Detection Validation</span>
                    <span className={clsx('mitre-chip', selectedExecution.detectedTechniqueCount > 0 ? 'executed' : 'declared')} style={{ fontSize: '0.72em' }}>
                      {selectedExecution.detectionStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-small text-text-secondary" style={{ margin: 0 }}>
                    {formatDetectionLabel(selectedExecution)}
                  </p>
                  {parseDetectionLogs(selectedExecution.detectionLogs).length > 0 && (
                    <div className="mitre-chip-grid" style={{ marginTop: '10px' }}>
                      {parseDetectionLogs(selectedExecution.detectionLogs).map((entry, idx) => (
                        <span
                          key={`${entry.alertId}-${idx}`}
                          className="mitre-chip executed"
                          title={`Alert ${entry.alertId}: ${entry.alertTitle} (${entry.severity})${entry.mttdSeconds != null ? ` — MTTD ${formatMttd(entry.mttdSeconds)}` : ''}`}
                        >
                          {entry.technique ?? 'Detected'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

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
