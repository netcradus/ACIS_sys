import React, { useEffect, useState, useMemo } from 'react'
import { Play, Edit2, Clock, CheckCircle2, XCircle, ChevronRight, Zap, Target, Shield, Server, Plus, MoreHorizontal, Activity, Search, X } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'

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

const playbookStepsList: Record<string, string[]> = {
  "Isolate Endpoint (EDR)": [
    "Check endpoint health",
    "Quarantine via EDR API",
    "Block outbound firewall"
  ],
  "Reset Compromised Account": [
    "Disable AD account",
    "Revoke all OAuth tokens",
    "Force MFA re-enrollment"
  ],
  "Block Domain on FW & Proxy": [
    "Add domain to block list",
    "Push policy to Palo Alto",
    "Update proxy ACL"
  ]
}

const playbookDurations: Record<string, string> = {
  "Isolate Endpoint (EDR)": "< 45s",
  "Reset Compromised Account": "< 30s",
  "Block Domain on FW & Proxy": "< 15s"
}

export default function SoarPage() {
  const canWrite = useCanWrite(MODULES.SOAR_PLAYBOOKS)
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [executions, setExecutions] = useState<Execution[]>([])
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form states for New Playbook
  const [newPbName, setNewPbName] = useState('')
  const [newPbDesc, setNewPbDesc] = useState('')
  const [newPbSteps, setNewPbSteps] = useState('')

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

      // Auto select first execution for detail view
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
    // Poll for updates every 5 seconds to show real-time execution transitions
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleRunPlaybook = async (pbId: string) => {
    try {
      await apiClient.post(`/api/soar/playbooks/${pbId}/execute`)
      // Refresh immediately
      fetchData()
      alert("SOAR Playbook started. It will process async tasks and update the execution queue in real-time.")
    } catch (err) {
      console.error("Failed to trigger playbook:", err)
    }
  }

  const handleCreatePlaybook = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        name: newPbName,
        description: newPbDesc,
        steps: JSON.stringify(newPbSteps.split(',').map(s => ({ step: s.trim(), status: 'Completed' }))),
        enabled: true,
        successCount: 0,
        runCount: 0
      }
      await apiClient.post('/api/soar/playbooks', payload)
      
      setNewPbName('')
      setNewPbDesc('')
      setNewPbSteps('')
      setIsModalOpen(false)

      fetchData()
    } catch (e) {
      console.error("Failed to create playbook:", e)
    }
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

  const getPlaybookCardColor = (name: string) => {
    if (name.includes('Isolate')) return 'bg-info'
    if (name.includes('Reset')) return 'bg-danger'
    return 'bg-severity-high'
  }

  const filteredPlaybooks = useMemo(() => {
    return playbooks.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [playbooks, searchTerm])

  const selectedExecution = executions.find(e => e.id === selectedExecutionId)

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full text-text-secondary min-h-screen">

      {/* Search Header */}
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <h1 className="text-h1 text-text-primary">SOAR Playbooks</h1>
        <div className="relative w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search playbooks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Main Orchestrator Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-h3 text-text-primary">Playbooks</h2>
          <p className="text-label text-text-muted mt-1 uppercase">Orchestrate multi-tool responses</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={!canWrite}
          title={!canWrite ? "Your role doesn't have write access to SOAR Playbooks" : undefined}
          className="btn-fire text-small py-2 px-4 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" /> New Playbook
        </button>
      </div>

      {/* Playbooks Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {filteredPlaybooks.map(pb => {
          const cardColor = getPlaybookCardColor(pb.name)
          const stepsCount = getStepCount(pb.steps)
          const successRate = pb.runCount > 0 ? Math.round((pb.successCount / pb.runCount) * 100) : 0
          const stepsList = playbookStepsList[pb.name] || ["Process payload steps", "Trigger target alert enrichment"]
          
          return (
            <div key={pb.id} className="bg-surface-2 border border-fire-border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-sm h-[290px]">
              {/* Colored Top Bar */}
              <div className={clsx("absolute top-0 left-0 right-0 h-1", cardColor)} />

              <div>
                <h3 className="text-h3 text-text-primary">{pb.name}</h3>
                <p className="text-label text-text-muted uppercase mt-0.5">{pb.description}</p>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 mt-4 border-b border-fire-border pb-3">
                  <div className="flex flex-col">
                    <span className={clsx("text-h3", pb.name.includes('Reset') ? 'text-danger' : 'text-success')}>{successRate}%</span>
                    <span className="text-label text-text-muted uppercase mt-0.5">Success</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-h3 text-text-primary">{stepsCount}</span>
                    <span className="text-label text-text-muted uppercase mt-0.5">Steps</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-h3 text-text-primary">{playbookDurations[pb.name] || '< 60s'}</span>
                    <span className="text-label text-text-muted uppercase mt-0.5">Duration</span>
                  </div>
                </div>

                {/* Steps List */}
                <div className="mt-3 space-y-1 text-small text-text-secondary font-medium">
                  {stepsList.slice(0, 3).map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-text-muted" />
                      <span>{step}</span>
                    </div>
                  ))}
                  {stepsList.length > 3 && (
                    <span className="text-label text-text-muted italic pl-3">... +{stepsList.length - 3} more steps</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  onClick={() => handleRunPlaybook(pb.id)}
                  disabled={!canWrite}
                  title={!canWrite ? "Your role doesn't have write access to SOAR Playbooks" : undefined}
                  className="btn-fire py-2 text-small disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-3 h-3 fill-white" /> Run
                </button>
                <button
                  onClick={() => alert('Editing playbook configurations is in development')}
                  className="btn-mission py-2 text-small"
                >
                  Edit
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent Executions Table */}
      <div className="card-mission space-y-4">
        <h3 className="text-h3 text-text-primary border-b border-fire-border pb-3">Recent Executions</h3>
        <div className="overflow-x-auto">
          <table className="table-enterprise">
            <thead>
              <tr>
                <th className="w-[35%]">Playbook</th>
                <th className="w-[25%]">Triggered By</th>
                <th className="w-[15%]">Status</th>
                <th className="w-[12%]">Duration</th>
                <th className="w-[13%]">Completed</th>
              </tr>
            </thead>
            <tbody>
              {executions.map(exec => (
                <tr
                  key={exec.id}
                  onClick={() => setSelectedExecutionId(exec.id)}
                  className={clsx(
                    "cursor-pointer",
                    selectedExecutionId === exec.id ? "bg-surface-3" : ""
                  )}
                >
                  <td className="font-semibold text-text-secondary">
                    {getPlaybookName(exec.playbookId)}
                  </td>
                  <td className="text-text-secondary font-mono">
                    {exec.triggeredByName || 'auto-trigger'}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "w-1.5 h-1.5 rounded-full inline-block",
                        exec.status === 'completed' ? "bg-success" :
                        exec.status === 'failed' ? "bg-danger" : "bg-severity-high animate-ping"
                      )} />
                      <span className={clsx(
                        "text-label uppercase",
                        exec.status === 'completed' ? "text-success" :
                        exec.status === 'failed' ? "text-danger" : "text-severity-high"
                      )}>
                        {exec.status}
                      </span>
                    </div>
                  </td>
                  <td className="text-text-secondary font-mono">
                    {getDuration(exec)}
                  </td>
                  <td className="text-text-secondary font-mono">
                    {formatTimeElapsed(exec.startedAt)}
                  </td>
                </tr>
              ))}
              {executions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-text-muted text-label uppercase">
                    No SOAR executions logged
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Execution Detail Logs Box (Bottom Panel) */}
      {selectedExecution && (
        <div className="card-mission space-y-3">
          <h4 className="text-label text-text-muted uppercase">
            Execution Detail — {getPlaybookName(selectedExecution.playbookId)} ({formatTimeElapsed(selectedExecution.startedAt)})
          </h4>
          <div className="bg-surface border border-fire-border rounded-lg p-4 font-mono text-small text-text-secondary overflow-x-auto whitespace-pre leading-relaxed border-l-2 border-l-accent">
            {(() => {
              try {
                const logs = JSON.parse(selectedExecution.stepLogs)
                return JSON.stringify(logs, null, 2)
              } catch (e) {
                return selectedExecution.stepLogs
              }
            })()}
          </div>
        </div>
      )}

      {/* Create Playbook Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-fire-border rounded-xl w-full max-w-md overflow-hidden shadow-card animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-fire-border">
              <h3 className="text-h3 text-text-primary">Create SOAR Playbook</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-text-primary transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePlaybook} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Playbook Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Block Port on Cisco Switch"
                  value={newPbName}
                  onChange={(e) => setNewPbName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Description Header</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 3 steps • run on suspicious egress triggers"
                  value={newPbDesc}
                  onChange={(e) => setNewPbDesc(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Playbook Steps (comma-separated)</label>
                <textarea
                  required
                  rows={4}
                  placeholder="e.g. Identify target port, Disable port via SSH, Log activity payload"
                  value={newPbSteps}
                  onChange={(e) => setNewPbSteps(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-fire-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-mission py-2 px-4 text-small"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-fire py-2 px-4 text-small"
                >
                  Create Playbook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
