import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock3,
  Crosshair,
  FileText,
  Flame,
  Gauge,
  LayoutGrid,
  Play,
  Radar,
  Search,
  ShieldAlert,
  Skull,
  Target,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import apiClient from '@/lib/apiClient'
import { useNavigate } from 'react-router-dom'

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
  const [query, setQuery] = useState('')
  const [startingId, setStartingId] = useState<string | null>(null)
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

  /** Most recent execution per simulation, keyed by simulationId — executions
   * arrive newest-first from the backend, so the first match per key wins. */
  const latestExecutionBySimulation = useMemo(() => {
    const map = new Map<string, ExecutionView>()
    for (const execution of executions) {
      if (!map.has(execution.simulationId)) {
        map.set(execution.simulationId, execution)
      }
    }
    return map
  }, [executions])

  /** A MITRE technique counts as "executed" only once a real run has logged
   * a step tagged with it — declaring a technique on a simulation that has
   * never been run does not count as coverage. */
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

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <section className="relative overflow-hidden rounded-2xl border border-fire-border bg-surface-2">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-label text-text-muted uppercase">
                <span className="inline-flex items-center gap-2 rounded-full border border-fire-border bg-background px-3 py-1 text-success">
                  <Radar className="h-3.5 w-3.5" /> Red Team Simulator
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-fire-border bg-background px-3 py-1">
                  <Activity className="h-3.5 w-3.5 text-info" /> Continuous attack emulation
                </span>
              </div>
              <div className="space-y-2">
                <h1 className="text-display text-text-primary">
                  Mission Control for Attack Validation
                </h1>
                <p className="max-w-3xl text-small text-text-secondary">
                  Simulations, coverage, and execution telemetry for the ACIS red team lab.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
              <label className="group flex items-center gap-3 rounded-lg border border-fire-border bg-background px-4 py-3 transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10">
                <Search className="h-4 w-4 text-text-muted transition-colors group-focus-within:text-accent" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search simulations..."
                  className="w-full bg-transparent text-small font-medium text-text-primary placeholder:text-text-muted outline-none"
                />
              </label>

              <button
                onClick={() => navigate('/dashboard/reports')}
                className="btn-mission justify-center py-3 text-small"
              >
                View Reports <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <StatCard
          icon={LayoutGrid}
          accent="border-l-info"
          label="Simulations Available"
          value={summary.simulationsAvailable.toString()}
          helper={`${Math.max(summary.simulationsAvailable, 1)} active templates loaded`}
        />
        <StatCard
          icon={Target}
          accent="border-l-success"
          label="MITRE Techniques Executed"
          value={summary.techniquesCovered.toString()}
          helper="Techniques with at least one completed run"
        />
        <StatCard
          icon={Gauge}
          accent="border-l-info"
          label="Active Simulations Running"
          value={summary.activeSimulations.toString()}
          helper={summary.activeSimulations > 0 ? "Live execution jobs in progress" : "No live execution jobs in progress"}
        />
        <StatCard
          icon={TriangleAlert}
          accent="border-l-warning"
          label="Techniques Not Yet Validated"
          value={summary.techniquesNotYetValidated.toString()}
          helper="Declared on a simulation but never run to completion"
        />
      </section>

      {loading && simulations.length === 0 ? (
        <div className="rounded-xl border border-fire-border bg-surface-2 p-8 text-small font-mono text-text-muted">
          Loading red team telemetry...
        </div>
      ) : (
        <>
          <section className="grid gap-5 xl:grid-cols-3">
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
                  className="group relative overflow-hidden rounded-xl border border-fire-border bg-surface-2 p-5 shadow-card transition-colors hover:border-accent/40"
                >
                  <div className="absolute -right-6 top-4 opacity-[0.05] transition-opacity group-hover:opacity-[0.1]">
                    <Skull className="h-24 w-24 text-danger" />
                  </div>

                  <div className="relative z-10 space-y-4">
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
                      <InfoPill icon={Clock3} label="Last Run" value={lastRunLabel} />
                      <InfoPill icon={Flame} label="Run Count" value={simulation.runCount.toString()} />
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
                        onClick={() => startSimulation(simulation.id)}
                        disabled={startingId === simulation.id || !canWrite}
                        title={!canWrite ? "Your role doesn't have write access to SOAR Playbooks" : undefined}
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
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="card-mission">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-h3 text-text-primary">
                    MITRE ATT&CK Coverage — Enterprise Matrix
                  </h3>
                  <p className="mt-1 text-label text-text-muted uppercase">
                    Techniques declared across this tenant's simulation library
                  </p>
                </div>
                <div className="flex items-center gap-2 text-label text-text-muted uppercase">
                  <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Executed
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-warning">
                    <ShieldAlert className="h-3.5 w-3.5" /> Declared only
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {matrixCells.map((cell) => (
                  <div
                    key={cell.id}
                    className={clsx(
                      'group flex min-h-[88px] flex-col justify-end rounded-lg border px-3 py-3 transition-transform duration-200 hover:-translate-y-0.5',
                      cell.state === 'executed'
                        ? 'border-success/30 bg-success/15 text-success'
                        : cell.state === 'running'
                          ? 'border-info/30 bg-info/15 text-info'
                          : 'border-warning/30 bg-warning/15 text-warning'
                    )}
                  >
                    <span className="text-label uppercase opacity-70">
                      {cell.state === 'executed' ? 'Executed' : cell.state === 'running' ? 'Running' : 'Declared'}
                    </span>
                    <span className="mt-1 text-label uppercase leading-tight">
                      {cell.label}
                    </span>
                  </div>
                ))}
                {matrixCells.length === 0 && (
                  <div className="col-span-full py-6 text-center text-label text-text-muted uppercase">
                    No MITRE techniques declared on any simulation yet
                  </div>
                )}
              </div>
            </div>

            <div className="card-mission">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-h3 text-text-primary">Execution History</h3>
                  <p className="mt-1 text-label text-text-muted uppercase">
                    Latest campaign telemetry from the simulator
                  </p>
                </div>
                <div className="rounded-full border border-fire-border bg-background px-3 py-1 text-label text-success uppercase whitespace-nowrap">
                  Live feed
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="table-enterprise">
                  <thead>
                    <tr>
                      <th>Simulation</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Detected</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executionHistory.map((row) => (
                      <tr key={row.id}>
                        <td className="font-semibold text-text-primary">{row.simulation}</td>
                        <td>
                          <span
                            className={clsx(
                              'inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-label uppercase',
                              row.status === 'completed'
                                ? 'border-success/30 bg-success/10 text-success'
                                : row.status === 'failed'
                                  ? 'border-danger/30 bg-danger/10 text-danger'
                                  : 'border-info/30 bg-info/10 text-info'
                            )}
                          >
                            {row.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : row.status === 'failed' ? <TriangleAlert className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
                            {row.status}
                          </span>
                        </td>
                        <td className="font-mono text-text-secondary">{row.duration}</td>
                        <td className={clsx('font-mono font-semibold', row.accent)}>{row.detected}</td>
                        <td className="font-mono text-text-secondary">{row.date}</td>
                      </tr>
                    ))}
                    {executionHistory.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-label text-text-muted uppercase">
                          No executions recorded yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {filteredSimulations.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-fire-border bg-surface-2 p-8 text-center text-label text-text-muted uppercase">
          No simulations match the current search.
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  accent,
  label,
  value,
  helper,
}: {
  icon: React.ComponentType<{ className?: string }>
  accent: string
  label: string
  value: string
  helper: string
}) {
  return (
    <div className={clsx('relative overflow-hidden rounded-xl border border-l-4 border-fire-border bg-surface-2 px-5 py-4 shadow-sm', accent)}>
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="text-label text-text-muted uppercase">{label}</div>
          <div className="text-h1 text-text-primary">{value}</div>
          <div className="max-w-[220px] text-small text-text-secondary font-medium">{helper}</div>
        </div>
        <div className="rounded-lg border border-fire-border bg-background p-3 text-text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function InfoPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-fire-border bg-background px-3 py-2.5">
      <div className="flex items-center gap-2 text-label text-text-muted uppercase">
        <Icon className="h-3.5 w-3.5 text-accent" />
        {label}
      </div>
      <div className="mt-1 text-small font-semibold text-text-primary">{value}</div>
    </div>
  )
}
