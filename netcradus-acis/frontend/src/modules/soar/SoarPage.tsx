import React, { useEffect, useState, useMemo } from 'react'
import { Play, Edit2, Clock, CheckCircle2, XCircle, ChevronRight, Zap, Target, Shield, Server, Plus, MoreHorizontal, Activity, Search, X, GripVertical, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import StepExecutionTimeline, { type ExecutionStep, type StepStatus } from '@/components/viz/StepExecutionTimeline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import './SoarPage.css'

function normalizeSoarStatus(raw: string | undefined): StepStatus {
  const s = (raw || '').toLowerCase()
  if (s === 'success' || s === 'completed') return 'success'
  if (s === 'failed') return 'failed'
  if (s === 'skipped') return 'skipped'
  if (s === 'running') return 'running'
  return 'pending'
}

function parseSoarSteps(stepLogsJson: string): ExecutionStep[] {
  try {
    const parsed = JSON.parse(stepLogsJson)
    if (!Array.isArray(parsed)) return []
    return parsed.map((s: any) => ({
      name: s.step || s.name || 'Step',
      status: normalizeSoarStatus(s.status),
      timestamp: s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : undefined,
      output: s.message || undefined,
    }))
  } catch {
    return []
  }
}

interface Playbook {
  id: string
  name: string
  description: string
  steps: string // JSON string
  enabled: boolean
  successCount: number
  runCount: number
  lastRunAt: string | null
  triggerPlaybookId: string | null
}

interface DependencyGraph {
  nodes: { id: string; name: string; enabled: boolean; runCount: number }[]
  edges: { from: string; to: string }[]
}

interface Execution {
  id: string
  playbookId: string
  triggeredBy: string
  triggeredByName: string | null
  status: string // running, completed, failed
  startedAt: string
  completedAt: string | null
  stepLogs: string // JSON string
}

export default function SoarPage() {
  const canWrite = useCanWrite(MODULES.SOAR_PLAYBOOKS)
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [executions, setExecutions] = useState<Execution[]>([])
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form states for New/Edit Playbook
  const [newPbName, setNewPbName] = useState('')
  const [newPbDesc, setNewPbDesc] = useState('')
  const [newPbStepsList, setNewPbStepsList] = useState<string[]>([''])
  const [newPbTriggerId, setNewPbTriggerId] = useState<string>('')
  const [editingPlaybookId, setEditingPlaybookId] = useState<string | null>(null)
  const [dependencyGraph, setDependencyGraph] = useState<DependencyGraph>({ nodes: [], edges: [] })
  const [iocStats, setIocStats] = useState<{ total: number; highPriority: number; sources: number }>({ total: 0, highPriority: 0, sources: 0 })

  // Run Playbook gated by confirm modal
  const [confirmingRunPlaybookId, setConfirmingRunPlaybookId] = useState<string | null>(null)
  const [runBusy, setRunBusy] = useState(false)

  const fetchData = async () => {
    try {
      const [playbooksRes, executionsRes, dependenciesRes, indicatorsRes] = await Promise.all([
        apiClient.get('/api/soar/playbooks'),
        apiClient.get('/api/soar/executions'),
        apiClient.get('/api/soar/playbooks/dependencies').catch(() => null),
        // /api/threat-intel now returns a real paginated envelope (was
        // unbounded before the production-readiness audit).
        apiClient.get('/api/threat-intel', { params: { size: 200 } }).catch(() => null)
      ])

      const pbs = playbooksRes.data || []
      const execs = executionsRes.data || []

      setPlaybooks(pbs)
      setExecutions(execs)
      if (dependenciesRes?.data) {
        setDependencyGraph({
          nodes: dependenciesRes.data.nodes || [],
          edges: dependenciesRes.data.edges || []
        })
      }
      const indicatorsPage = indicatorsRes?.data
      if (indicatorsPage && Array.isArray(indicatorsPage.content)) {
        const indicators = indicatorsPage.content
        setIocStats({
          total: typeof indicatorsPage.totalElements === 'number' ? indicatorsPage.totalElements : indicators.length,
          highPriority: indicators.filter((i: any) => i.severity === 'CRITICAL' || i.severity === 'HIGH').length,
          sources: new Set(indicators.map((i: any) => i.source).filter(Boolean)).size
        })
      }

      if (execs.length > 0 && !selectedExecutionId) {
        setSelectedExecutionId(execs[0].id)
      }
    } catch (err) {
      console.error("Failed to fetch SOAR data", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleRunPlaybook = async (pbId: string) => {
    setRunBusy(true)
    try {
      await apiClient.post(`/api/soar/playbooks/${pbId}/execute`)
      fetchData()
    } catch (err) {
      console.error("Failed to trigger playbook:", err)
    } finally {
      setRunBusy(false)
      setConfirmingRunPlaybookId(null)
    }
  }

  const handleSubmitPlaybook = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const cleanSteps = newPbStepsList.map(s => s.trim()).filter(Boolean)
      const payload = {
        name: newPbName,
        description: newPbDesc,
        steps: JSON.stringify(cleanSteps.map(step => ({ step, status: 'Completed' }))),
        enabled: true,
        successCount: 0,
        runCount: 0,
        triggerPlaybookId: newPbTriggerId || null
      }
      if (editingPlaybookId) {
        await apiClient.put(`/api/soar/playbooks/${editingPlaybookId}`, payload)
      } else {
        await apiClient.post('/api/soar/playbooks', payload)
      }

      closePlaybookModal()
      fetchData()
    } catch (e) {
      console.error("Failed to save playbook:", e)
    }
  }

  const openCreatePlaybookModal = () => {
    setEditingPlaybookId(null)
    setNewPbName('')
    setNewPbDesc('')
    setNewPbStepsList([''])
    setNewPbTriggerId('')
    setIsModalOpen(true)
  }

  const openEditPlaybookModal = (pb: Playbook) => {
    setEditingPlaybookId(pb.id)
    setNewPbName(pb.name)
    setNewPbDesc(pb.description)
    const names = getStepNames(pb.steps)
    setNewPbStepsList(names.length > 0 ? names : [''])
    setNewPbTriggerId(pb.triggerPlaybookId || '')
    setIsModalOpen(true)
  }

  const closePlaybookModal = () => {
    setIsModalOpen(false)
    setEditingPlaybookId(null)
  }

  const updateStepAt = (index: number, value: string) => {
    setNewPbStepsList(prev => prev.map((s, i) => (i === index ? value : s)))
  }
  const addStep = () => setNewPbStepsList(prev => [...prev, ''])
  const removeStep = (index: number) => {
    setNewPbStepsList(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }
  const moveStep = (index: number, direction: -1 | 1) => {
    setNewPbStepsList(prev => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const getStepNames = (stepsJson: string): string[] => {
    try {
      const parsed = JSON.parse(stepsJson)
      if (!Array.isArray(parsed)) return []
      return parsed.map((s: any) => s?.step || s?.name || 'Step').filter(Boolean)
    } catch {
      return []
    }
  }

  const getAvgDuration = (playbookId: string): string => {
    const completed = executions.filter(e => e.playbookId === playbookId && e.completedAt && e.status !== 'running')
    if (completed.length === 0) return '—'
    const totalMs = completed.reduce((sum, e) => sum + (new Date(e.completedAt!).getTime() - new Date(e.startedAt).getTime()), 0)
    const avgSeconds = Math.round(totalMs / completed.length / 1000)
    return avgSeconds < 60 ? `~${avgSeconds}s` : `~${Math.round(avgSeconds / 60)}m`
  }

  const getStepCount = (stepsJson: string) => {
    try {
      const parsed = JSON.parse(stepsJson)
      return Array.isArray(parsed) ? parsed.length : 0
    } catch {
      return 0
    }
  }

  const formatTimeElapsed = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return new Date(dateStr).toLocaleDateString()
  }

  const getDuration = (exec: Execution) => {
    if (!exec.completedAt) return '—'
    const diff = new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()
    return `${Math.ceil(diff / 1000)}s`
  }

  const getPlaybookName = (pbId: string) => {
    return playbooks.find(p => p.id === pbId)?.name || 'Custom Playbook'
  }

  const filteredPlaybooks = useMemo(() => {
    return playbooks.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [playbooks, searchTerm])

  const selectedExecution = executions.find(e => e.id === selectedExecutionId)

  // Real dependency graph layout: nodes placed on a circle sized to the actual node count,
  // edges drawn only for real triggerPlaybookId links returned by the backend.
  const depsLayout = useMemo(() => {
    const nodes = dependencyGraph.nodes
    const cx = 500, cy = 150, radius = Math.min(420, 90 + nodes.length * 22)
    const positioned = nodes.map((n, idx) => {
      const angle = (idx / Math.max(nodes.length, 1)) * 2 * Math.PI
      const isHub = dependencyGraph.edges.some(e => e.to === n.id)
      return {
        id: n.id,
        name: n.name,
        enabled: n.enabled,
        x: nodes.length === 1 ? cx : cx + radius * Math.cos(angle),
        y: nodes.length === 1 ? cy : cy + radius * 0.5 * Math.sin(angle),
        r: isHub ? 16 : 10,
      }
    })
    const byId = new Map(positioned.map(n => [n.id, n]))
    const edges = dependencyGraph.edges
      .map(e => ({ from: byId.get(e.from), to: byId.get(e.to) }))
      .filter((e): e is { from: typeof positioned[number]; to: typeof positioned[number] } => !!e.from && !!e.to)
    return { positioned, edges }
  }, [dependencyGraph])

  return (
    <div className="soar-page">
      {/* Atmospheric Background for Dark Mode */}
      <div className="bg-fixed">
        <div className="nebula1" />
        <div className="nebula2" />
        <div className="nebula3" />
        <div className="grid" />
        <div className="stars" />
      </div>

      <div className="content">
        <div className="page-head">
          <h1>SOAR Playbooks</h1>
        </div>

        {/* Summary Bar widgets */}
        <div className="summary-bar">
          <div>
            <div className="summary-title">Playbooks</div>
            <div className="summary-sub">Orchestrate Multi-Tool Responses</div>
          </div>
          <div className="sum-stat">
            <div className="v">{iocStats.total}</div>
            <div className="l">Total IOCs</div>
          </div>
          <div className="sum-stat">
            <div className="v">{iocStats.highPriority}</div>
            <div className="l">Critical/High</div>
          </div>
          <div className="sum-stat">
            <div className="v">{iocStats.sources}</div>
            <div className="l">Sources</div>
          </div>
          <button
            onClick={openCreatePlaybookModal}
            disabled={!canWrite}
            className="new-playbook-btn"
          >
            + New Playbook
          </button>
        </div>

        {/* Search tool block */}
        <div className="flex items-center gap-4 mb-5 max-w-sm">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search playbooks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--border-soft)',
                borderRadius: '8px',
                padding: '8px 12px 8px 34px',
                color: 'var(--text)',
                width: '100%',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Playbooks table panel */}
        <div className="table-panel">
          <table>
            <thead>
              <tr>
                <th>ASSET</th>
                <th>TYPE</th>
                <th>OWNER</th>
                <th>TRIGGERED BY</th>
                <th>PRIORITY</th>
                <th>STATUS</th>
                <th>DURATION</th>
                <th>COMPLETED</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredPlaybooks.map((pb) => {
                const isHigh = pb.name.includes('Isolate') || pb.name.includes('Reset')
                const isSuccess = pb.successCount === pb.runCount && pb.runCount > 0
                return (
                  <tr key={pb.id}>
                    <td className="font-semibold">{pb.name}</td>
                    <td>{pb.description}</td>
                    <td className="owner-name">—</td>
                    <td>{pb.lastRunAt ? formatTimeElapsed(pb.lastRunAt) : '—'}</td>
                    <td>
                      <span className={clsx("priority-dot", isHigh ? "high" : "medium")} />
                      {isHigh ? 'High' : 'Medium'}
                    </td>
                    <td>
                      <span className="status-badge">
                        <span className={clsx("status-dot2", isSuccess ? "success" : "failed")} />
                        {isSuccess ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td>
                      <svg viewBox="0 0 60 22" width="60" height="20" style={{ display: 'inline', marginRight: '6px' }}>
                        <polyline points={isSuccess ? "0,16 10,10 20,14 30,6 40,12 50,4 60,8" : "0,10 10,16 20,8 30,12 40,4 50,10 60,6"} fill="none" stroke={isSuccess ? "#22d3ee" : "#a855f7"} strokeWidth="1.6" />
                      </svg>
                      {getAvgDuration(pb.id)}
                    </td>
                    <td>{pb.successCount} / {pb.runCount}</td>
                    <td>
                      <button
                        onClick={() => setConfirmingRunPlaybookId(pb.id)}
                        disabled={!canWrite}
                        className="run-btn"
                      >
                        Run ▶
                      </button>
                    </td>
                  </tr>
                )}
              )}
            </tbody>
          </table>
        </div>

        {/* Playbook dependencies visualizer */}
        <div className="deps-panel">
          <div className="deps-head">
            <h3>Playbook Dependencies</h3>
          </div>
          {depsLayout.positioned.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--dim)' }}>
              No playbooks configured yet.
            </div>
          ) : depsLayout.edges.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--dim)' }}>
              No playbook chains configured. Set "Triggers Next Playbook" on a playbook to link it to another.
            </div>
          ) : (
            <div className="deps-box">
              <svg viewBox="0 0 1000 300">
                {depsLayout.edges.map((edge, idx) => (
                  <line
                    key={idx}
                    x1={edge.from.x}
                    y1={edge.from.y}
                    x2={edge.to.x}
                    y2={edge.to.y}
                    stroke="var(--deps-edge-active)"
                    strokeWidth="1.4"
                    markerEnd="url(#deps-arrow)"
                  />
                ))}
                <defs>
                  <marker id="deps-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" fill="var(--deps-edge-active)" />
                  </marker>
                </defs>

                {depsLayout.positioned.map((node) => {
                  const gradId = `ng-deps-${node.id}`
                  const isHub = node.r > 10
                  return (
                    <g key={node.id}>
                      <defs>
                        <radialGradient id={gradId}>
                          <stop offset="0%" stopColor={isHub ? 'var(--deps-center-fill)' : 'var(--deps-node-stroke)'} stopOpacity="0.9" />
                          <stop offset="100%" stopColor={isHub ? 'var(--deps-center-fill)' : 'var(--deps-node-stroke)'} stopOpacity="0.15" />
                        </radialGradient>
                      </defs>
                      <circle cx={node.x} cy={node.y} r={node.r + 8} fill={`url(#${gradId})`} opacity="0.4" />
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.r}
                        fill={isHub ? 'var(--deps-center-fill)' : 'var(--deps-node-fill)'}
                        stroke="var(--deps-node-stroke)"
                        strokeWidth="1.5"
                        opacity={node.enabled ? 1 : 0.4}
                      />
                    </g>
                  )
                })}
              </svg>
              {depsLayout.positioned.map((node) => (
                <div
                  key={node.id}
                  className="deps-label"
                  style={{
                    left: `${(node.x / 1000) * 100}%`,
                    top: `${((node.y + node.r + 16) / 300) * 100}%`
                  }}
                >
                  {node.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Executions */}
        <div>
          <div className="recent-panel">
            <h3>Recent Executions</h3>
            <table>
              <thead>
                <tr>
                  <th>STARTED ↑</th>
                  <th>PLAYBOOK</th>
                  <th>TYPE</th>
                  <th>TRIGGERED BY</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((exec) => {
                  const pbName = getPlaybookName(exec.playbookId)
                  return (
                    <tr
                      key={exec.id}
                      onClick={() => setSelectedExecutionId(exec.id)}
                      className={clsx("cursor-pointer", selectedExecutionId === exec.id && "bg-slate-800/40")}
                    >
                      <td>{formatTimeElapsed(exec.startedAt)}</td>
                      <td className="font-semibold">{pbName}</td>
                      <td>Playbook</td>
                      <td className="owner-name">{exec.triggeredByName || 'auto-trigger'}</td>
                      <td>
                        <span className={clsx(
                          "status-pill",
                          exec.status === 'completed' ? "success" :
                          exec.status === 'failed' ? "failed" : "progress"
                        )}>
                          {exec.status === 'completed' ? 'Success' :
                           exec.status === 'failed' ? 'Failed' : 'In Progress'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Execution Detail Logs Box */}
        {selectedExecution && (
          <div style={{ marginTop: '24px', background: 'var(--card-bg)', border: '1px solid var(--border-soft)', padding: '20px', borderRadius: '14px', boxShadow: 'var(--box-shadow)' }}>
            <h4 className="text-label text-text-muted uppercase mb-3">
              Execution Detail — {getPlaybookName(selectedExecution.playbookId)} ({formatTimeElapsed(selectedExecution.startedAt)})
            </h4>
            <StepExecutionTimeline
              steps={parseSoarSteps(selectedExecution.stepLogs)}
              mode={selectedExecution.status === 'running' ? 'live' : 'historical'}
            />
          </div>
        )}

        {/* Form Modal for creating/editing playbooks */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-soft)',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '460px',
                boxShadow: '0 24px 60px -14px rgba(0,0,0,0.7)',
                overflow: 'hidden'
              }}
            >
              <div className="flex items-center justify-between p-5 border-b border-border-soft">
                <h3 className="font-bold text-lg" style={{ color: 'var(--heading-color)' }}>
                  {editingPlaybookId ? 'Edit SOAR Playbook' : 'Create SOAR Playbook'}
                </h3>
                <button onClick={closePlaybookModal} style={{ color: 'var(--muted)', background: 'none', border: 'none' }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmitPlaybook} className="p-5 space-y-4">
                <div>
                  <label style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Playbook Name</label>
                  <input
                    type="text"
                    required
                    value={newPbName}
                    onChange={(e) => setNewPbName(e.target.value)}
                    placeholder="e.g. Block Port on Cisco Switch"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '10px 14px', width: '100%', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Description Header</label>
                  <input
                    type="text"
                    required
                    value={newPbDesc}
                    onChange={(e) => setNewPbDesc(e.target.value)}
                    placeholder="e.g. 3 steps • run on suspicious egress triggers"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '10px 14px', width: '100%', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Playbook Steps</label>
                  <div className="space-y-2">
                    {newPbStepsList.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-text-muted shrink-0" />
                        <input
                          type="text"
                          required
                          value={step}
                          onChange={(e) => updateStepAt(idx, e.target.value)}
                          placeholder={`Step ${idx + 1} — e.g. Disable port via SSH`}
                          style={{ background: 'var(--input-bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '8px 12px', flex: 1, color: 'var(--text)', fontSize: '12.5px' }}
                        />
                        <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0} style={{ color: 'var(--muted)', background: 'none', border: 'none' }}>
                          <ChevronRight className="w-4 h-4 -rotate-90" />
                        </button>
                        <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === newPbStepsList.length - 1} style={{ color: 'var(--muted)', background: 'none', border: 'none' }}>
                          <ChevronRight className="w-4 h-4 rotate-90" />
                        </button>
                        <button type="button" onClick={() => removeStep(idx)} disabled={newPbStepsList.length === 1} style={{ color: 'var(--muted)', background: 'none', border: 'none' }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addStep}
                      style={{ background: 'none', border: '1px dashed var(--border-soft)', color: 'var(--text)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Step
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Triggers Next Playbook (optional)</label>
                  <select
                    value={newPbTriggerId}
                    onChange={(e) => setNewPbTriggerId(e.target.value)}
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '10px 14px', width: '100%', color: 'var(--text)' }}
                  >
                    <option value="">None — run standalone</option>
                    {playbooks.filter(p => p.id !== editingPlaybookId).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '4px' }}>
                    When this playbook completes successfully, the selected playbook runs automatically.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-border-soft">
                  <button type="button" onClick={closePlaybookModal} style={{ background: 'none', border: '1px solid var(--border-soft)', color: 'var(--text)', padding: '8px 16px', borderRadius: '8px', fontSize: '12.5px' }}>
                    Cancel
                  </button>
                  <button type="submit" className="run-btn" style={{ fontSize: '12.5px' }}>
                    {editingPlaybookId ? 'Save Changes' : 'Create Playbook'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={!!confirmingRunPlaybookId}
          title="Run Playbook"
          message={`This will execute "${confirmingRunPlaybookId ? getPlaybookName(confirmingRunPlaybookId) : ''}" now, running its real automated response steps against live targets. Continue?`}
          confirmLabel="Run Playbook"
          busy={runBusy}
          onConfirm={() => confirmingRunPlaybookId && handleRunPlaybook(confirmingRunPlaybookId)}
          onCancel={() => setConfirmingRunPlaybookId(null)}
        />

        <div style={{ height: '340px' }} />
      </div>
    </div>
  )
}
