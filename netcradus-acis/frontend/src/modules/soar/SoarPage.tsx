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
  const [editingPlaybookId, setEditingPlaybookId] = useState<string | null>(null)

  // Run Playbook gated by confirm modal
  const [confirmingRunPlaybookId, setConfirmingRunPlaybookId] = useState<string | null>(null)
  const [runBusy, setRunBusy] = useState(false)

  const fetchData = async () => {
    try {
      const [playbooksRes, executionsRes] = await Promise.all([
        apiClient.get('/api/soar/playbooks'),
        apiClient.get('/api/soar/executions')
      ])

      const pbs = playbooksRes.data || []
      const execs = executionsRes.data || []

      setPlaybooks(pbs)
      setExecutions(execs)

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
        runCount: 0
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
    setIsModalOpen(true)
  }

  const openEditPlaybookModal = (pb: Playbook) => {
    setEditingPlaybookId(pb.id)
    setNewPbName(pb.name)
    setNewPbDesc(pb.description)
    const names = getStepNames(pb.steps)
    setNewPbStepsList(names.length > 0 ? names : [''])
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

  // Node dependencies map data generator
  const nodePositions = [
    { x: 500, y: 150, type: 'center', r: 24, label: 'Playbook Dependencies' },
    { x: 350, y: 90, type: 'child', r: 12, label: 'Playbook Execution…' },
    { x: 420, y: 60, type: 'child', r: 10, label: 'Playbook Execution…' },
    { x: 610, y: 60, type: 'child', r: 10, label: 'Playbook Exec…' },
    { x: 700, y: 110, type: 'child', r: 10, label: 'Playbook Executie…' },
    { x: 300, y: 220, type: 'child', r: 10, label: 'Playbook Execution…' },
    { x: 420, y: 240, type: 'child', r: 13, label: 'Playbook Execution…' },
    { x: 600, y: 240, type: 'child', r: 13, label: 'Playbook Execution…' },
    { x: 680, y: 200, type: 'child', r: 10, label: 'Playbook Execuin…' }
  ] as const

  const cross = [[1, 5], [3, 4], [6, 7], [2, 1]] as const

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
            <div className="v">2,845</div>
            <svg viewBox="0 0 70 26" width="70" height="24">
              <polyline points="0,20 14,16 28,18 42,8 56,4 70,10" fill="none" stroke="var(--cyan)" strokeWidth="2" />
            </svg>
            <div className="l">Total IOCs</div>
          </div>
          <div className="sum-stat">
            <div className="v">142</div>
            <svg viewBox="0 0 70 26" width="70" height="24">
              <polyline points="0,14 14,18 28,10 42,16 56,6 70,12" fill="none" stroke="var(--cyan)" strokeWidth="2" />
            </svg>
            <div className="l">Quarantined</div>
          </div>
          <div className="sum-stat">
            <div className="v">10</div>
            <svg viewBox="0 0 70 26" width="70" height="24">
              <polyline points="0,20 14,14 28,18 42,6 56,10 70,2" fill="none" stroke="var(--cyan)" strokeWidth="2" />
            </svg>
            <div className="l">Severitys</div>
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
            <span style={{ color: 'var(--dim)', fontSize: '16px', cursor: 'pointer' }}>⤢</span>
          </div>
          <div className="deps-box">
            <svg viewBox="0 0 1000 300">
              {/* Edges from center */}
              {nodePositions.map((n, idx) => {
                if (idx === 0) return null
                return (
                  <line
                    key={idx}
                    x1={nodePositions[0].x}
                    y1={nodePositions[0].y}
                    x2={n.x}
                    y2={n.y}
                    stroke="var(--deps-edge-active)"
                    strokeWidth="1.2"
                  />
                )
              })}

              {/* Cross Connections */}
              {cross.map(([a, b], idx) => (
                <line
                  key={idx}
                  x1={nodePositions[a].x}
                  y1={nodePositions[a].y}
                  x2={nodePositions[b].x}
                  y2={nodePositions[b].y}
                  stroke="var(--deps-edge-cross)"
                  strokeWidth="1"
                />
              ))}

              {/* Nodes */}
              {nodePositions.map((node, idx) => {
                const gradId = `ng-deps-${idx}`
                const isCenter = node.type === 'center'
                return (
                  <g key={idx}>
                    <defs>
                      <radialGradient id={gradId}>
                        <stop offset="0%" stopColor={isCenter ? 'var(--deps-center-fill)' : 'var(--deps-node-stroke)'} stopOpacity="0.9" />
                        <stop offset="100%" stopColor={isCenter ? 'var(--deps-center-fill)' : 'var(--deps-node-stroke)'} stopOpacity="0.15" />
                      </radialGradient>
                    </defs>
                    <circle cx={node.x} cy={node.y} r={node.r + 8} fill={`url(#${gradId})`} opacity="0.4" />
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r}
                      fill={isCenter ? 'var(--deps-center-fill)' : 'var(--deps-node-fill)'}
                      stroke="var(--deps-node-stroke)"
                      strokeWidth="1.5"
                    />
                  </g>
                )
              })}
            </svg>
            {nodePositions.map((node, idx) => (
              <div
                key={idx}
                className="deps-label"
                style={{
                  left: `${(node.x / 1000) * 100}%`,
                  top: `${((node.y + node.r + 16) / 300) * 100}%`
                }}
              >
                {node.label}
              </div>
            ))}
          </div>
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
