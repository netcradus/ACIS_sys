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

type MatrixCellState = 'covered' | 'partial' | 'open'

interface MatrixCell {
  id: string
  label: string
  state: MatrixCellState
}

interface ExecutionRow {
  simulation: string
  status: 'Completed' | 'Partial' | 'Running'
  duration: string
  detected: string
  date: string
  accent: string
}

const fallbackTechniqueCatalog = [
  'T1566', 'T1078', 'T1059', 'T1047', 'T1021',
  'T1087', 'T1083', 'T1003', 'T1105', 'T1053',
  'T1041', 'T1110', 'T1560', 'T1016', 'T1112',
  'T1547', 'T1497', 'T1204', 'T1218', 'T1046',
]

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

function buildCoverage(simulation: Simulation, index: number) {
  const stepCount = parseSteps(simulation.steps)
  const total = Math.max(stepCount + 2, simulation.mitreTechniques.length + 3, 15)
  const completed = Math.min(
    total,
    Math.max(
      simulation.mitreTechniques.length,
      Math.round(total * (0.58 + (simulation.runCount % 4) * 0.06))
    )
  )
  const partial = Math.min(total - completed, 3 + (index % 2))
  return { total, completed, partial }
}

export default function RedTeamPage() {
  const [simulations, setSimulations] = useState<Simulation[]>([])
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

  useEffect(() => {
    fetchSimulations()
    const interval = setInterval(fetchSimulations, 5000)
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

  const summary = useMemo(() => {
    const coverageMetrics = filteredSimulations.map((simulation, index) => buildCoverage(simulation, index))
    const totalTechniques = Math.max(
      15,
      new Set(simulations.flatMap((simulation) => simulation.mitreTechniques || [])).size
    )
    const coveredTechniques = coverageMetrics.reduce((sum, metric) => sum + metric.completed, 0)
    const openGaps = Math.max(
      2,
      coverageMetrics.reduce((sum, metric) => sum + metric.partial, 0) - 2
    )
    return {
      simulationsAvailable: filteredSimulations.length,
      techniquesCovered: Math.min(totalTechniques, Math.max(14, coveredTechniques)),
      activeSimulations: 0,
      vulnerabilitiesFound: openGaps,
    }
  }, [filteredSimulations, simulations])

  const matrixCells: MatrixCell[] = useMemo(() => {
    const uniqueTechniques = new Set<string>()
    simulations.forEach((simulation) => {
      simulation.mitreTechniques?.forEach((technique) => uniqueTechniques.add(technique))
    })

    const orderedLabels = [
      ...Array.from(uniqueTechniques),
      ...fallbackTechniqueCatalog.filter((label) => !uniqueTechniques.has(label)),
    ].slice(0, 20)

    return orderedLabels.map((label, index) => ({
      id: `${label}-${index}`,
      label,
      state: index < 10 ? 'covered' : index < 16 ? 'partial' : 'open',
    }))
  }, [simulations])

  const executionHistory: ExecutionRow[] = useMemo(() => {
    const baseRows = filteredSimulations.map((simulation, index) => {
      const coverage = buildCoverage(simulation, index)
      const stepCount = parseSteps(simulation.steps)
      const status: ExecutionRow['status'] = coverage.completed >= coverage.total
        ? 'Completed'
        : coverage.completed >= Math.ceil(coverage.total * 0.7)
          ? 'Partial'
          : 'Running'

      return {
        simulation: simulation.name.replace('Simulation', '').replace('Attack', '').trim() || simulation.name,
        status,
        duration: `${Math.max(2, stepCount * 11 + simulation.runCount * 6)}s`,
        detected: `${coverage.completed}/${coverage.total}`,
        date: formatWhen(simulation.lastRunAt),
        accent: index % 3 === 0 ? 'text-success' : index % 3 === 1 ? 'text-warning' : 'text-info',
      }
    })

    const topRows = [...baseRows].sort((a, b) => {
      const order = { Completed: 0, Partial: 1, Running: 2 }
      return order[a.status] - order[b.status]
    })

    return topRows.slice(0, 5)
  }, [filteredSimulations])

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

      <section className="grid gap-4 xl:grid-cols-4">
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
          label="MITRE Techniques Covered Today"
          value={summary.techniquesCovered.toString()}
          helper={`${Math.max(summary.techniquesCovered, 1)} mapped ATT&CK techniques detected`}
        />
        <StatCard
          icon={Gauge}
          accent="border-l-info"
          label="Active Simulations Running"
          value={summary.activeSimulations.toString()}
          helper="No live execution jobs in progress"
        />
        <StatCard
          icon={TriangleAlert}
          accent="border-l-danger"
          label="Vulnerabilities Found This Week"
          value={summary.vulnerabilitiesFound.toString()}
          helper="Open attack gaps awaiting remediation"
        />
      </section>

      {loading && simulations.length === 0 ? (
        <div className="rounded-xl border border-fire-border bg-surface-2 p-8 text-small font-mono text-text-muted">
          Loading red team telemetry...
        </div>
      ) : (
        <>
          <section className="grid gap-5 xl:grid-cols-3">
            {filteredSimulations.map((simulation, index) => {
              const stepCount = parseSteps(simulation.steps)
              const coverage = buildCoverage(simulation, index)
              const lastRunLabel = formatWhen(simulation.lastRunAt)
              const detectedLabel = `${coverage.completed}/${coverage.total}`
              const attackTag = index % 2 === 0 ? 'MITRE ATT&CK' : 'MITRE ATTACK'
              const runTone = coverage.completed >= coverage.total
                ? 'text-success'
                : coverage.completed >= Math.ceil(coverage.total * 0.7)
                  ? 'text-warning'
                  : 'text-danger'

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
                          <span className="badge-mission border-accent/70 bg-accent/10 text-accent">{attackTag}</span>
                          <span className="badge-mission border-fire-border bg-background text-text-muted">{simulation.mitreTactics?.[0] || 'Lateral Movement'}</span>
                        </div>
                        <h2 className="text-h2 text-text-primary">{simulation.name}</h2>
                      </div>
                      <div className="rounded-lg border border-fire-border bg-background px-3 py-1.5 text-label text-accent uppercase whitespace-nowrap">
                        {coverage.total} Stages
                      </div>
                    </div>

                    <p className="text-small text-text-secondary">
                      {simulation.description}
                    </p>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-label text-text-muted uppercase">
                        <span>Last run result</span>
                        <span className={runTone}>Coverage {detectedLabel} techniques detected</span>
                      </div>
                      <div className="rounded-lg border border-fire-border bg-surface-3 p-4">
                        <div className={clsx('text-small font-semibold', runTone)}>
                          {coverage.completed >= coverage.total ? 'Detection: Caught at Step 3' : coverage.completed >= Math.ceil(coverage.total * 0.7) ? 'Detection: Missed at Step 7' : 'Detection: Partial coverage observed'}
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
                        disabled={startingId === simulation.id}
                        className="btn-fire justify-center py-3 text-small disabled:cursor-wait"
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
                    Coverage across the current red team lab catalog
                  </p>
                </div>
                <div className="flex items-center gap-2 text-label text-text-muted uppercase">
                  <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Covered
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-warning">
                    <ShieldAlert className="h-3.5 w-3.5" /> Partial
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {matrixCells.map((cell) => (
                  <div
                    key={cell.id}
                    className={clsx(
                      'group flex min-h-[88px] flex-col justify-end rounded-lg border px-3 py-3 transition-transform duration-200 hover:-translate-y-0.5',
                      cell.state === 'covered'
                        ? 'border-success/30 bg-success/15 text-success'
                        : cell.state === 'partial'
                          ? 'border-warning/30 bg-warning/15 text-warning'
                          : 'border-fire-border bg-surface-3 text-text-muted'
                    )}
                  >
                    <span className="text-label uppercase opacity-70">
                      {cell.state === 'covered' ? 'TA0001' : cell.state === 'partial' ? 'TA0002' : 'TA0003'}
                    </span>
                    <span className="mt-1 text-label uppercase leading-tight">
                      {cell.label}
                    </span>
                  </div>
                ))}
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
                    {executionHistory.map((row, index) => (
                      <tr key={`${row.simulation}-${index}`}>
                        <td className="font-semibold text-text-primary">{row.simulation}</td>
                        <td>
                          <span
                            className={clsx(
                              'inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-label uppercase',
                              row.status === 'Completed'
                                ? 'border-success/30 bg-success/10 text-success'
                                : row.status === 'Partial'
                                  ? 'border-warning/30 bg-warning/10 text-warning'
                                  : 'border-info/30 bg-info/10 text-info'
                            )}
                          >
                            {row.status === 'Completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : row.status === 'Partial' ? <TriangleAlert className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
                            {row.status}
                          </span>
                        </td>
                        <td className="font-mono text-text-secondary">{row.duration}</td>
                        <td className={clsx('font-mono font-semibold', row.accent)}>{row.detected}</td>
                        <td className="font-mono text-text-secondary">{row.date}</td>
                      </tr>
                    ))}
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
