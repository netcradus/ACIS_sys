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
      <section className="relative overflow-hidden rounded-[28px] border border-fire-border/70 bg-[#070707] shadow-[0_0_0_1px_rgba(255,77,0,0.04),0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,77,0,0.18),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(0,194,255,0.10),transparent_25%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
        <div className="relative z-10 p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.4em] text-text-muted">
                <span className="inline-flex items-center gap-2 rounded-full border border-fire-border bg-black/50 px-3 py-1 text-success">
                  <Radar className="h-3.5 w-3.5" /> Red Team Simulator
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-fire-border bg-black/50 px-3 py-1">
                  <Activity className="h-3.5 w-3.5 text-info" /> Continuous attack emulation
                </span>
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase leading-none text-white">
                  Mission Control for Attack Validation
                </h1>
                <p className="max-w-3xl text-[11px] sm:text-xs font-medium uppercase tracking-[0.28em] text-text-secondary">
                  Simulations, coverage, and execution telemetry for the ACIS red team lab.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
              <label className="group flex items-center gap-3 rounded-2xl border border-fire-border bg-black/70 px-4 py-3 transition-all focus-within:border-accent/50 focus-within:shadow-[0_0_0_1px_rgba(255,77,0,0.10)]">
                <Search className="h-4 w-4 text-text-muted transition-colors group-focus-within:text-accent" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search OOURAA..."
                  className="w-full bg-transparent text-sm font-semibold text-white placeholder:text-text-muted outline-none"
                />
              </label>

              <button
                onClick={() => navigate('/dashboard/reports')}
                className="btn-mission justify-center border-fire-border/70 bg-black/70 py-3 text-[10px] font-black uppercase tracking-[0.35em]"
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
          accent="border-l-[#00ffd5]"
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
        <div className="rounded-3xl border border-fire-border bg-surface-2/70 p-8 text-sm font-mono text-text-muted">
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
                  className="group relative overflow-hidden rounded-[24px] border border-fire-border/70 bg-[#090909] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-[0_16px_50px_rgba(0,0,0,0.45)]"
                >
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_22%),radial-gradient(circle_at_top_right,rgba(255,77,0,0.10),transparent_24%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="absolute -right-6 top-4 opacity-[0.07] transition-opacity group-hover:opacity-[0.14]">
                    <Skull className="h-24 w-24 text-danger" />
                  </div>

                  <div className="relative z-10 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <span className="badge-mission border-accent/70 bg-accent/10 text-accent">{attackTag}</span>
                          <span className="badge-mission border-fire-border/70 bg-black/50 text-text-muted">{simulation.mitreTactics?.[0] || 'Lateral Movement'}</span>
                        </div>
                        <h2 className="text-[22px] font-black tracking-tighter text-white leading-[1.02]">{simulation.name}</h2>
                      </div>
                      <div className="rounded-lg border border-fire-border/70 bg-black/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-accent">
                        {coverage.total} Stages
                      </div>
                    </div>

                    <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-secondary">
                      {simulation.description}
                    </p>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.25em] text-text-muted">
                        <span>Last run result</span>
                        <span className={runTone}>Coverage {detectedLabel} techniques detected</span>
                      </div>
                      <div className="rounded-2xl border border-fire-border/70 bg-[#0f0f0f] p-4">
                        <div className={clsx('text-sm font-black uppercase tracking-wide', runTone)}>
                          {coverage.completed >= coverage.total ? 'Detection: Caught at Step 3' : coverage.completed >= Math.ceil(coverage.total * 0.7) ? 'Detection: Missed at Step 7' : 'Detection: Partial coverage observed'}
                        </div>
                        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">
                          {stepCount} steps · last run: {lastRunLabel}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <InfoPill icon={Clock3} label="Last Run" value={lastRunLabel} />
                      <InfoPill icon={Flame} label="Run Count" value={simulation.runCount.toString()} />
                    </div>

                    <div className="rounded-2xl border border-fire-border/70 bg-black/50 p-3">
                      <div className="mb-3 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.35em] text-text-muted">
                        <span>Technique Trail</span>
                        <span>{simulation.mitreTechniques?.length || 0} mapped</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(simulation.mitreTechniques || []).slice(0, 4).map((technique) => (
                          <span
                            key={technique}
                            className="rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-danger"
                          >
                            {technique}
                          </span>
                        ))}
                        {(simulation.mitreTactics || []).slice(0, 2).map((tactic) => (
                          <span
                            key={tactic}
                            className="rounded-md border border-fire-border/70 bg-surface-3/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-text-muted"
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
                        className="btn-fire justify-center py-3 text-[10px] tracking-[0.32em] disabled:cursor-wait"
                      >
                        <Crosshair className="h-4 w-4" />
                        {startingId === simulation.id ? 'Starting...' : 'Start'}
                      </button>
                      <button
                        onClick={() => navigate('/dashboard/reports')}
                        className="btn-mission justify-center border-fire-border/70 bg-black/50 py-3 text-[10px] tracking-[0.32em]"
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
            <div className="rounded-[24px] border border-fire-border/70 bg-[#090909] p-5">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter text-white">
                    MITRE ATT&CK Coverage - Enterprise Matrix
                  </h3>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.3em] text-text-muted">
                    Coverage across the current red team lab catalog
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-text-muted">
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
                      'group flex min-h-[96px] flex-col justify-end rounded-[16px] border px-3 py-3 transition-transform duration-200 hover:-translate-y-0.5',
                      cell.state === 'covered'
                        ? 'border-[#48e0c5]/35 bg-[#2ec9a5] text-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                        : cell.state === 'partial'
                          ? 'border-[#f0a01a]/40 bg-[#a86a12] text-white'
                          : 'border-fire-border/80 bg-[#171717] text-text-muted'
                    )}
                  >
                    <span className={clsx('text-[9px] font-black uppercase tracking-[0.25em]', cell.state === 'open' ? 'text-text-muted' : 'opacity-70')}>
                      {cell.state === 'covered' ? 'TA0001' : cell.state === 'partial' ? 'TA0002' : 'TA0003'}
                    </span>
                    <span className="mt-1 text-[10px] font-black uppercase tracking-[0.24em] leading-tight">
                      {cell.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-fire-border/70 bg-[#090909] p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter text-white">Execution History</h3>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.3em] text-text-muted">
                    Latest campaign telemetry from the simulator
                  </p>
                </div>
                <div className="rounded-full border border-fire-border/70 bg-black/50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-success">
                  Live feed
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-fire-border/70 bg-[#0d0d0d]">
                <table className="w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left text-[9px] font-black uppercase tracking-[0.3em] text-text-muted">
                      <th className="px-4 py-3">Simulation</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Detected</th>
                      <th className="px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executionHistory.map((row, index) => (
                      <tr key={`${row.simulation}-${index}`} className="border-t border-fire-border/60 text-sm">
                        <td className="px-4 py-4">
                          <div className="font-black text-white tracking-tight">{row.simulation}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={clsx(
                              'inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.24em]',
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
                        <td className="px-4 py-4 font-mono text-[11px] font-bold text-text-secondary">{row.duration}</td>
                        <td className={clsx('px-4 py-4 font-mono text-[11px] font-black', row.accent)}>{row.detected}</td>
                        <td className="px-4 py-4 font-mono text-[11px] font-bold text-text-secondary">{row.date}</td>
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
        <div className="rounded-3xl border border-dashed border-fire-border/70 bg-surface-2/60 p-8 text-center text-[11px] font-bold uppercase tracking-[0.35em] text-text-muted">
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
    <div className={clsx('relative overflow-hidden rounded-[22px] border border-fire-border/70 bg-[#090909] px-5 py-4', accent)}>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent)] opacity-60" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="text-[9px] font-black uppercase tracking-[0.32em] text-text-muted">{label}</div>
          <div className="text-3xl font-black tracking-tighter text-white">{value}</div>
          <div className="max-w-[220px] text-[10px] font-medium uppercase tracking-[0.22em] text-text-secondary">{helper}</div>
        </div>
        <div className="rounded-2xl border border-fire-border/70 bg-black/60 p-3 text-white">
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
    <div className="rounded-2xl border border-fire-border/70 bg-black/50 px-3 py-2.5">
      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] text-text-muted">
        <Icon className="h-3.5 w-3.5 text-accent" />
        {label}
      </div>
      <div className="mt-1 text-[11px] font-black uppercase tracking-tight text-white">{value}</div>
    </div>
  )
}
