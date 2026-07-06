import React, { useState, useEffect } from 'react'
import { Plus, Search, RefreshCw, Layers, ShieldCheck, Zap, AlertCircle, Play, Edit2, X } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import { clsx } from 'clsx'

interface CorrelationRule {
  id: string
  name: string
  description: string
  splQuery: string
  severity: string
  riskScore: number
  enabled: boolean
  lastRunAt: string | null
}

interface FlinkJob {
  name: string
  status: string
  rate: number
}

interface CorrelationStats {
  activeRules: number
  disabledRules: number
  avgRiskScore: number
  totalEvents: number
  eventsSeries: number[]
  flinkJobs: FlinkJob[]
}

const ruleConfigs: Record<string, { schedule: string, threshold: string, severity: string, throttle: string }> = {
  "Impossible Travel Detection": {
    schedule: "Every 5 minutes",
    threshold: "2+ countries in 4 hours",
    severity: "High",
    throttle: "1 alert per user per hour"
  },
  "Privilege Escalation on DC": {
    schedule: "Every 1 minute",
    threshold: "Admin group modification",
    severity: "Critical",
    throttle: "No throttling"
  },
  "Excessive 401 Failures (Brute Force)": {
    schedule: "Every 5 minutes",
    threshold: "10+ failures in 1 minute",
    severity: "High",
    throttle: "1 alert per source IP per hour"
  },
  "Suspicious ASR Bypass via LOLBin": {
    schedule: "Every 10 minutes",
    threshold: "Process execution pattern",
    severity: "High",
    throttle: "No throttling"
  },
  "Beaconing to Rare External Domain": {
    schedule: "Every 1 hour",
    threshold: "Periodic egress connections",
    severity: "Medium",
    throttle: "1 alert per domain per day"
  },
  "Data Exfiltration via DNS Tunneling": {
    schedule: "Every 15 minutes",
    threshold: "High TXT query volume",
    severity: "High",
    throttle: "1 alert per client IP per day"
  }
}

export default function CorrelationPage() {
  const [rules, setRules] = useState<CorrelationRule[]>([])
  const [stats, setStats] = useState<CorrelationStats | null>(null)
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [alertsToday, setAlertsToday] = useState<number>(221) // fallback default
  const [isLoading, setIsLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form State for New Rule
  const [newRuleName, setNewRuleName] = useState('')
  const [newRuleDesc, setNewRuleDesc] = useState('')
  const [newRuleSpl, setNewRuleSpl] = useState('')
  const [newRuleSeverity, setNewRuleSeverity] = useState('HIGH')
  const [newRuleRisk, setNewRuleRisk] = useState(70)

  const fetchRulesAndStats = async () => {
    setIsLoading(true)
    try {
      const [rulesRes, statsRes, alertsSummaryRes] = await Promise.all([
        apiClient.get('/api/correlation/rules'),
        apiClient.get('/api/correlation/stats'),
        apiClient.get('/api/alerts/dashboard/summary').catch(() => null)
      ])

      setRules(rulesRes.data)
      
      if (statsRes.data) {
        setStats(statsRes.data)
      }
      
      if (alertsSummaryRes?.data) {
        setAlertsToday(alertsSummaryRes.data.totalAlerts || 221)
      }

      // Default selection to first rule if not set
      if (rulesRes.data.length > 0 && !selectedRuleId) {
        setSelectedRuleId(rulesRes.data[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Periodic polling for real-time stats (every 5 seconds)
  useEffect(() => {
    fetchRulesAndStats()
    const interval = setInterval(async () => {
      try {
        const statsRes = await apiClient.get('/api/correlation/stats')
        if (statsRes.data) {
          setStats(statsRes.data)
        }
      } catch (e) {
        console.error('Stats poll failed:', e)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleToggle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row selection
    try {
      await apiClient.put(`/api/correlation/rules/${id}/toggle`)
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
      // Update local stats
      if (stats) {
        const rulesCopy = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
        const active = rulesCopy.filter(r => r.enabled).length
        const disabled = rulesCopy.filter(r => !r.enabled).length
        setStats({ ...stats, activeRules: active, disabledRules: disabled })
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error)
    }
  }

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        tenantId: 'demo-tenant',
        name: newRuleName,
        description: newRuleDesc,
        splQuery: newRuleSpl,
        severity: newRuleSeverity,
        riskScore: newRuleRisk
      }
      await apiClient.post('/api/correlation/rules', payload)
      
      // Reset form
      setNewRuleName('')
      setNewRuleDesc('')
      setNewRuleSpl('')
      setNewRuleSeverity('HIGH')
      setNewRuleRisk(70)
      setIsModalOpen(false)
      
      // Reload
      fetchRulesAndStats()
    } catch (error) {
      console.error('Failed to create rule:', error)
    }
  }

  const formatLastRun = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins} min ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} hours ago`
    return new Date(dateStr).toLocaleDateString()
  }

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'border-red-500/40 text-red-500 bg-red-500/10'
    if (score >= 60) return 'border-orange-500/40 text-orange-500 bg-orange-500/10'
    return 'border-yellow-500/40 text-yellow-500 bg-yellow-500/10'
  }

  const selectedRule = rules.find(r => r.id === selectedRuleId)
  
  const filteredRules = rules.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Time labels for events chart
  const now = new Date()
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000)
  const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full bg-[#050506] text-neutral-300 p-6 min-h-screen">
      
      {/* Search Header */}
      <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
        <h1 className="text-xl font-bold text-white tracking-tight uppercase">Correlation Searches</h1>
        <div className="relative w-80 bg-[#0C0C0D] border border-neutral-800 rounded-xl overflow-hidden">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input 
            type="text" 
            placeholder="Search OOURAA..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent pl-10 pr-4 py-2 text-xs placeholder:text-neutral-600 text-white focus:outline-none focus:border-neutral-700"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Rules', value: stats?.activeRules ?? 4, borderColor: 'border-l-orange-500' },
          { label: 'Alerts Fired Today', value: alertsToday, borderColor: 'border-l-teal-400' },
          { label: 'Rules Disabled', value: stats?.disabledRules ?? 2, borderColor: 'border-l-yellow-500' },
          { label: 'Avg Risk Score', value: stats?.avgRiskScore ?? 94, borderColor: 'border-l-red-500' }
        ].map((c, i) => (
          <div key={i} className={clsx("bg-[#0C0C0D] border border-neutral-800 rounded-lg p-5 flex flex-col justify-between h-28 border-l-4 shadow-sm", c.borderColor)}>
            <span className="text-3xl font-bold text-white tracking-tight leading-none">{c.value}</span>
            <span className="text-[10px] text-neutral-500 font-semibold tracking-wider uppercase mt-2">{c.label}</span>
          </div>
        ))}
      </div>

      {/* Table Section */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight leading-none">Correlation Searches</h2>
            <p className="text-[11px] text-neutral-500 mt-1">Risk-based alerting - schedule & throttling</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors focus:outline-none"
          >
            <Plus className="w-3.5 h-3.5" /> New Rule
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-800/80 text-neutral-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 w-[40%]">Name</th>
                <th className="py-3 px-4 w-[15%]">Enabled</th>
                <th className="py-3 px-4 w-[15%]">Last Run</th>
                <th className="py-3 px-4 w-[15%] text-center">Risk Score</th>
                <th className="py-3 px-4 w-[15%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900/60">
              {filteredRules.map((rule) => (
                <tr 
                  key={rule.id}
                  onClick={() => setSelectedRuleId(rule.id)}
                  className={clsx(
                    "hover:bg-[#121214] cursor-pointer transition-colors duration-150",
                    selectedRuleId === rule.id ? "bg-[#121214]/80" : ""
                  )}
                >
                  <td className="py-4 px-4 font-bold text-neutral-200">
                    {rule.name}
                  </td>
                  <td className="py-4 px-4">
                    <button 
                      onClick={(e) => handleToggle(rule.id, e)}
                      className="flex items-center focus:outline-none"
                    >
                      <div className={clsx(
                        "relative w-12 h-6 rounded-full transition-colors duration-200 p-0.5 flex items-center justify-between px-2",
                        rule.enabled ? "bg-teal-400 text-black font-black" : "bg-neutral-800 text-neutral-500 font-bold"
                      )}>
                        <span className="text-[8px] uppercase tracking-wider">{rule.enabled ? 'ON' : 'OFF'}</span>
                        <div className={clsx(
                          "absolute w-4 h-4 bg-white rounded-full transition-transform duration-200 shadow-sm",
                          rule.enabled ? "right-1" : "left-1"
                        )} />
                      </div>
                    </button>
                  </td>
                  <td className="py-4 px-4 text-neutral-400">
                    {formatLastRun(rule.lastRunAt)}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className={clsx("px-3 py-1.5 rounded-lg font-mono font-bold text-[11px] border inline-block w-12 text-center", getRiskColor(rule.riskScore))}>
                      {rule.riskScore}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <button 
                      onClick={(e) => { e.stopPropagation(); alert(`Editing ${rule.name} is in development`); }}
                      className="border border-neutral-700 bg-neutral-800/40 hover:bg-neutral-800 text-neutral-300 font-bold px-3 py-1 rounded-lg text-xs transition-colors focus:outline-none"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRules.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-neutral-600 uppercase font-black tracking-widest text-[10px]">
                    No correlation searches found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail & Flink Section */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        
        {/* Selected Rule Details */}
        <div className="md:col-span-7 bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
          {selectedRule ? (
            <>
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-bold text-white">{selectedRule.name}</h3>
                  <span className={clsx(
                    "px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase inline-flex items-center gap-1.5 border",
                    selectedRule.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-neutral-800 text-neutral-500 border-neutral-700/50"
                  )}>
                    <span className={clsx("w-1.5 h-1.5 rounded-full", selectedRule.enabled ? "bg-emerald-400 animate-pulse" : "bg-neutral-600")} />
                    {selectedRule.enabled ? 'Active' : 'Standby'}
                  </span>
                </div>
                
                <div className="mt-4 space-y-2">
                  <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider block">SPL Query</span>
                  <div className="bg-[#050505] border border-neutral-900 rounded-lg p-4 font-mono text-[11px] text-orange-400/90 whitespace-pre-wrap leading-relaxed border-l-2 border-l-orange-500 overflow-x-auto">
                    {selectedRule.splQuery}
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-neutral-900 pt-4 space-y-3">
                <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider block">Configuration</span>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-xs">
                  {[
                    { label: 'Schedule', val: ruleConfigs[selectedRule.name]?.schedule || 'Every 5 minutes' },
                    { label: 'Threshold', val: ruleConfigs[selectedRule.name]?.threshold || 'Matching event occurrence' },
                    { label: 'Severity', val: selectedRule.severity },
                    { label: 'Throttle', val: ruleConfigs[selectedRule.name]?.throttle || 'No throttling' }
                  ].map((cfg, i) => (
                    <div key={i} className="flex justify-between border-b border-neutral-900/60 pb-1.5">
                      <span className="text-neutral-500 font-semibold">{cfg.label}:</span>
                      <span className="text-neutral-300 font-bold">{cfg.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-600 text-xs py-10 uppercase tracking-widest font-black">
              Select a rule to view details
            </div>
          )}
        </div>

        {/* Flink Jobs and event throughput */}
        <div className="md:col-span-5 bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-neutral-900 pb-2.5">
              <h3 className="text-xs font-bold text-white tracking-wider uppercase">Active Flink Jobs</h3>
              <span className="px-2 py-0.5 rounded-full text-[8px] font-black tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Running
              </span>
            </div>

            <div className="divide-y divide-neutral-900 mt-2">
              {(stats?.flinkJobs || []).map((job, idx) => (
                <div key={idx} className="flex items-center justify-between py-2.5 text-xs">
                  <span className="font-mono text-neutral-400">{job.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black tracking-wider uppercase bg-emerald-500/5 text-emerald-400 border border-emerald-500/20">
                      Running
                    </span>
                    <span className="font-mono font-bold text-neutral-300 tabular-nums">
                      {job.rate.toLocaleString()} events/sec
                    </span>
                  </div>
                </div>
              ))}
              {(!stats?.flinkJobs || stats.flinkJobs.length === 0) && (
                <div className="py-6 text-center text-neutral-600 text-[10px] uppercase font-bold tracking-wider">
                  No active Flink streaming instances detected
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Events Processed - Last 10 Min</h4>
            <div className="flex items-end justify-between h-20 px-2 bg-[#050505] rounded-lg border border-neutral-900 pt-4 gap-1.5">
              {(stats?.eventsSeries || []).map((val, idx) => {
                const max = Math.max(...(stats?.eventsSeries || [100]));
                const pct = max > 0 ? (val / max) * 100 : 0;
                return (
                  <div key={idx} className="flex-1 flex flex-col justify-end items-center h-full group relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 bg-black text-white text-[8px] font-mono rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap border border-neutral-800">
                      {val.toLocaleString()}
                    </div>
                    <div 
                      style={{ height: `${Math.max(5, pct)}%` }} 
                      className="w-full bg-[#FF5A1F] rounded-t-sm group-hover:bg-[#ff723f] transition-all duration-300"
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between text-[9px] text-neutral-600 font-mono">
              <span>{formatTime(tenMinAgo)}</span>
              <span>{formatTime(now)}</span>
            </div>
          </div>

        </div>

      </div>

      {/* New Rule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-neutral-900">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Create Correlation Rule</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-white transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRule} className="p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Rule Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Impossible Travel Detection"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Description</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Risk-based alerting - schedule & throttling"
                  value={newRuleDesc}
                  onChange={(e) => setNewRuleDesc(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">SPL Query</label>
                <textarea 
                  required
                  rows={4}
                  placeholder="index=auth sourcetype=okta:login | stats values(src_ip) as ips by user"
                  value={newRuleSpl}
                  onChange={(e) => setNewRuleSpl(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 font-mono text-[11px] focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-neutral-500 font-bold uppercase tracking-wider block">Alert Severity</label>
                  <select 
                    value={newRuleSeverity}
                    onChange={(e) => setNewRuleSeverity(e.target.value)}
                    className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-neutral-700"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-neutral-500 font-bold uppercase tracking-wider block">Risk Score ({newRuleRisk})</label>
                  <input 
                    type="range" 
                    min="1" 
                    max="100"
                    value={newRuleRisk}
                    onChange={(e) => setNewRuleRisk(Number(e.target.value))}
                    className="w-full accent-[#FF5A1F] bg-[#050505] h-2 rounded-lg appearance-none cursor-pointer mt-3"
                  />
                </div>
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
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
