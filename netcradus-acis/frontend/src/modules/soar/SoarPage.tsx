import React, { useEffect, useState, useMemo } from 'react'
import { Play, Edit2, Clock, CheckCircle2, XCircle, ChevronRight, Zap, Target, Shield, Server, Plus, MoreHorizontal, Activity, Search, X } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'

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
    if (name.includes('Isolate')) return 'bg-teal-400'
    if (name.includes('Reset')) return 'bg-red-500'
    return 'bg-orange-500'
  }

  const filteredPlaybooks = useMemo(() => {
    return playbooks.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [playbooks, searchTerm])

  const selectedExecution = executions.find(e => e.id === selectedExecutionId)

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full bg-[#050506] text-neutral-300 p-6 min-h-screen">
      
      {/* Search Header */}
      <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
        <h1 className="text-xl font-bold text-white tracking-tight uppercase">SOAR Playbooks</h1>
        <div className="relative w-80 bg-[#0C0C0D] border border-neutral-800 rounded-xl overflow-hidden">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input 
            type="text" 
            placeholder="Search playbooks..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent pl-10 pr-4 py-2 text-xs placeholder:text-neutral-600 text-white focus:outline-none focus:border-neutral-700"
          />
        </div>
      </div>

      {/* Main Orchestrator Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight leading-none uppercase">Playbooks</h2>
          <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider">Orchestrate multi-tool responses</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors focus:outline-none"
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
            <div key={pb.id} className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-sm h-[290px]">
              {/* Colored Top Bar */}
              <div className={clsx("absolute top-0 left-0 right-0 h-1.5", cardColor)} />

              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">{pb.name}</h3>
                <p className="text-[9px] text-neutral-500 font-semibold tracking-wider uppercase mt-0.5">{pb.description}</p>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 mt-4 border-b border-neutral-900 pb-3">
                  <div className="flex flex-col">
                    <span className={clsx("text-xs font-black", pb.name.includes('Reset') ? 'text-red-500' : 'text-emerald-400')}>{successRate}%</span>
                    <span className="text-[8px] text-neutral-600 font-bold uppercase tracking-wider mt-0.5">Success</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-white">{stepsCount}</span>
                    <span className="text-[8px] text-neutral-600 font-bold uppercase tracking-wider mt-0.5">Steps</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-white">{playbookDurations[pb.name] || '< 60s'}</span>
                    <span className="text-[8px] text-neutral-600 font-bold uppercase tracking-wider mt-0.5">Duration</span>
                  </div>
                </div>

                {/* Steps List */}
                <div className="mt-3 space-y-1 text-[11px] text-neutral-400 font-semibold">
                  {stepsList.slice(0, 3).map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-neutral-600" />
                      <span>{step}</span>
                    </div>
                  ))}
                  {stepsList.length > 3 && (
                    <span className="text-[10px] text-neutral-500 italic pl-3">... +{stepsList.length - 3} more steps</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button 
                  onClick={() => handleRunPlaybook(pb.id)}
                  className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 focus:outline-none"
                >
                  <Play className="w-3 h-3 fill-white" /> Run
                </button>
                <button 
                  onClick={() => alert('Editing playbook configurations is in development')}
                  className="border border-neutral-700 bg-neutral-800/40 hover:bg-neutral-800 text-neutral-300 font-bold py-2 rounded-xl text-xs transition-colors focus:outline-none flex items-center justify-center gap-1"
                >
                  Edit
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent Executions Table */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-white tracking-wider uppercase border-b border-neutral-900 pb-3">Recent Executions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-900 text-neutral-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 w-[35%]">Playbook</th>
                <th className="py-3 px-4 w-[25%]">Triggered By</th>
                <th className="py-3 px-4 w-[15%]">Status</th>
                <th className="py-3 px-4 w-[12%]">Duration</th>
                <th className="py-3 px-4 w-[13%]">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900/60">
              {executions.map(exec => (
                <tr 
                  key={exec.id}
                  onClick={() => setSelectedExecutionId(exec.id)}
                  className={clsx(
                    "hover:bg-[#121214] cursor-pointer transition-colors duration-150",
                    selectedExecutionId === exec.id ? "bg-[#121214]" : ""
                  )}
                >
                  <td className="py-4 px-4 font-bold text-neutral-200">
                    {getPlaybookName(exec.playbookId)}
                  </td>
                  <td className="py-4 px-4 font-semibold text-neutral-400 font-mono">
                    {exec.triggeredByName || 'auto-trigger'}
                  </td>
                  <td className="py-4 px-4 font-bold">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "w-1.5 h-1.5 rounded-full inline-block",
                        exec.status === 'completed' ? "bg-emerald-400" :
                        exec.status === 'failed' ? "bg-red-500" : "bg-orange-500 animate-ping"
                      )} />
                      <span className={clsx(
                        "uppercase text-[10px] tracking-wider",
                        exec.status === 'completed' ? "text-emerald-400" :
                        exec.status === 'failed' ? "text-red-500" : "text-orange-400"
                      )}>
                        {exec.status}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-neutral-300 font-mono">
                    {getDuration(exec)}
                  </td>
                  <td className="py-4 px-4 text-neutral-400 font-mono">
                    {formatTimeElapsed(exec.startedAt)}
                  </td>
                </tr>
              ))}
              {executions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-neutral-600 uppercase font-black tracking-widest text-[10px]">
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
        <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-3">
          <h4 className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
            Execution Detail — {getPlaybookName(selectedExecution.playbookId)} ({formatTimeElapsed(selectedExecution.startedAt)})
          </h4>
          <div className="bg-[#050505] border border-neutral-900 rounded-lg p-4 font-mono text-[11px] text-neutral-400 overflow-x-auto whitespace-pre leading-relaxed border-l-2 border-l-[#FF5A1F]">
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
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-neutral-900">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Create SOAR Playbook</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-white transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePlaybook} className="p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Playbook Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Block Port on Cisco Switch"
                  value={newPbName}
                  onChange={(e) => setNewPbName(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Description Header</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. 3 steps • run on suspicious egress triggers"
                  value={newPbDesc}
                  onChange={(e) => setNewPbDesc(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Playbook Steps (comma-separated)</label>
                <textarea 
                  required
                  rows={4}
                  placeholder="e.g. Identify target port, Disable port via SSH, Log activity payload"
                  value={newPbSteps}
                  onChange={(e) => setNewPbSteps(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-900 mt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="border border-neutral-800 bg-[#0C0C0D] hover:bg-neutral-800 text-neutral-400 hover:text-white font-bold px-4 py-2 rounded-xl focus:outline-none transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl focus:outline-none transition-colors"
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
