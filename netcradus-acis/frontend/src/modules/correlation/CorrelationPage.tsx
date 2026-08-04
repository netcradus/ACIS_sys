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

interface RuleActivity {
  ruleId: string
  name: string
  enabled: boolean
  matchCount: number
  lastRunAt: string | null
}

interface CorrelationStats {
  activeRules: number
  disabledRules: number
  avgRiskScore: number
  totalEvents: number
  eventsSeries: number[]
  ruleActivity: RuleActivity[]
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
      // tenantId is derived server-side from the X-Tenant-ID header (JWT
      // claim), not the request body — the backend ignores a client-supplied
      // value here, so it's not sent.
      const payload = {
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
    if (score >= 80) return 'border-danger/40 text-danger bg-danger/10'
    if (score >= 60) return 'border-severity-high/40 text-severity-high bg-severity-high/10'
    return 'border-severity-medium/40 text-severity-medium bg-severity-medium/10'
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
    <div className="space-y-6 animate-fade-in flex flex-col h-full text-text-secondary min-h-screen">

      {/* Search Header */}
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <h1 className="text-h1 text-text-primary">Correlation Searches</h1>
        <div className="relative w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search correlation rules..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10 text-small"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Rules', value: stats?.activeRules ?? 4, borderColor: 'border-l-severity-high' },
          { label: 'Alerts Fired Today', value: alertsToday, borderColor: 'border-l-info' },
          { label: 'Rules Disabled', value: stats?.disabledRules ?? 2, borderColor: 'border-l-severity-medium' },
          { label: 'Avg Risk Score', value: stats?.avgRiskScore ?? 94, borderColor: 'border-l-danger' }
        ].map((c, i) => (
          <div key={i} className={clsx("card-mission flex flex-col justify-between h-28 border-l-4", c.borderColor)}>
            <span className="text-h1 text-text-primary leading-none">{c.value}</span>
            <span className="text-label uppercase text-text-muted mt-2">{c.label}</span>
          </div>
        ))}
      </div>

      {/* Table Section */}
      <div className="card-mission space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-h3 text-text-primary">Correlation Searches</h2>
            <p className="text-small text-text-muted mt-1">Risk-based alerting — schedule & throttling</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn-fire"
          >
            <Plus className="w-3.5 h-3.5" /> New Rule
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="table-enterprise">
            <thead>
              <tr>
                <th className="w-[40%]">Name</th>
                <th className="w-[15%]">Enabled</th>
                <th className="w-[15%]">Last Run</th>
                <th className="w-[15%] text-center">Risk Score</th>
                <th className="w-[15%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRules.map((rule) => (
                <tr
                  key={rule.id}
                  onClick={() => setSelectedRuleId(rule.id)}
                  className={clsx(
                    "cursor-pointer",
                    selectedRuleId === rule.id && "bg-surface-3/80"
                  )}
                >
                  <td className="text-small font-semibold text-text-primary">
                    {rule.name}
                  </td>
                  <td>
                    <button
                      onClick={(e) => handleToggle(rule.id, e)}
                      className="flex items-center focus:outline-none"
                    >
                      <div className={clsx(
                        "relative w-11 h-6 rounded-full transition-colors duration-200 p-0.5 flex items-center justify-between px-1.5",
                        rule.enabled ? "bg-success" : "bg-surface-3"
                      )}>
                        <span className={clsx("text-[8px] font-bold uppercase", rule.enabled ? "text-white" : "text-text-muted")}>{rule.enabled ? 'On' : 'Off'}</span>
                        <div className={clsx(
                          "absolute w-4 h-4 bg-white rounded-full transition-transform duration-200 shadow-sm",
                          rule.enabled ? "right-1" : "left-1"
                        )} />
                      </div>
                    </button>
                  </td>
                  <td className="text-small text-text-secondary">
                    {formatLastRun(rule.lastRunAt)}
                  </td>
                  <td className="text-center">
                    <span className={clsx("px-3 py-1.5 rounded-lg font-mono font-semibold text-small border inline-block w-12 text-center", getRiskColor(rule.riskScore))}>
                      {rule.riskScore}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); alert(`Editing ${rule.name} is in development`); }}
                      className="btn-mission py-1.5 px-3 text-label uppercase"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRules.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-small font-medium text-text-muted">
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
        <div className="md:col-span-7 card-mission space-y-4 flex flex-col justify-between">
          {selectedRule ? (
            <>
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-h3 text-text-primary">{selectedRule.name}</h3>
                  <span className={clsx(
                    "px-2.5 py-0.5 rounded-full text-label uppercase inline-flex items-center gap-1.5 border",
                    selectedRule.enabled ? "bg-success/10 text-success border-success/20" : "bg-surface-3 text-text-muted border-fire-border/50"
                  )}>
                    <span className={clsx("w-1.5 h-1.5 rounded-full", selectedRule.enabled ? "bg-success animate-pulse" : "bg-text-muted")} />
                    {selectedRule.enabled ? 'Active' : 'Standby'}
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  <span className="text-label uppercase text-text-muted block">SPL Query</span>
                  <div className="bg-surface-2 border border-fire-border rounded-lg p-4 font-mono text-small text-accent whitespace-pre-wrap leading-relaxed border-l-2 border-l-accent overflow-x-auto">
                    {selectedRule.splQuery}
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-fire-border pt-4 space-y-3">
                <span className="text-label uppercase text-text-muted block">Configuration</span>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-small">
                  {[
                    { label: 'Schedule', val: ruleConfigs[selectedRule.name]?.schedule || 'Every 5 minutes' },
                    { label: 'Threshold', val: ruleConfigs[selectedRule.name]?.threshold || 'Matching event occurrence' },
                    { label: 'Severity', val: selectedRule.severity },
                    { label: 'Throttle', val: ruleConfigs[selectedRule.name]?.throttle || 'No throttling' }
                  ].map((cfg, i) => (
                    <div key={i} className="flex justify-between border-b border-fire-border/60 pb-1.5">
                      <span className="text-text-muted font-medium">{cfg.label}:</span>
                      <span className="text-text-primary font-semibold">{cfg.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted text-small font-medium py-10">
              Select a rule to view details
            </div>
          )}
        </div>

        {/* Rule activity and event throughput */}
        <div className="md:col-span-5 card-mission space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-fire-border pb-2.5">
              <h3 className="text-h3 text-text-primary">Rule Match Activity</h3>
              <span className="px-2 py-0.5 rounded-full text-label uppercase bg-success/10 text-success border border-success/20 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping" />
                Live
              </span>
            </div>

            <div className="divide-y divide-fire-border mt-2">
              {(stats?.ruleActivity || []).filter(r => r.enabled).map((rule) => (
                <div key={rule.ruleId} className="flex items-center justify-between py-2.5 text-small">
                  <span className="font-medium text-text-secondary truncate max-w-[55%]">{rule.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-text-primary tabular-nums">
                      {rule.matchCount.toLocaleString()} matches
                    </span>
                  </div>
                </div>
              ))}
              {(!stats?.ruleActivity || stats.ruleActivity.filter(r => r.enabled).length === 0) && (
                <div className="py-6 text-center text-small font-medium text-text-muted">
                  No enabled rules
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-label uppercase text-text-muted">Events Processed — last 10 min</h4>
            <div className="flex items-end justify-between h-20 px-2 bg-surface-2 rounded-lg border border-fire-border pt-4 gap-1.5">
              {(stats?.eventsSeries || []).map((val, idx) => {
                const max = Math.max(...(stats?.eventsSeries || [100]));
                const pct = max > 0 ? (val / max) * 100 : 0;
                return (
                  <div key={idx} className="flex-1 flex flex-col justify-end items-center h-full group relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 bg-surface-3 text-text-primary text-[8px] font-mono rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap border border-fire-border">
                      {val.toLocaleString()}
                    </div>
                    <div
                      style={{ height: `${Math.max(5, pct)}%` }}
                      className="w-full bg-accent rounded-t-sm group-hover:bg-accent-light transition-all duration-300"
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between text-small text-text-muted font-mono">
              <span>{formatTime(tenMinAgo)}</span>
              <span>{formatTime(now)}</span>
            </div>
          </div>

        </div>

      </div>

      {/* New Rule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-fire-border rounded-xl w-full max-w-lg overflow-hidden shadow-card animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-fire-border">
              <h3 className="text-h3 text-text-primary">Create Correlation Rule</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-text-primary transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRule} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-label uppercase text-text-muted block">Rule Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Impossible Travel Detection"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-label uppercase text-text-muted block">Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Risk-based alerting — schedule & throttling"
                  value={newRuleDesc}
                  onChange={(e) => setNewRuleDesc(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-label uppercase text-text-muted block">SPL Query</label>
                <textarea
                  required
                  rows={4}
                  placeholder="index=auth sourcetype=okta:login | stats values(src_ip) as ips by user"
                  value={newRuleSpl}
                  onChange={(e) => setNewRuleSpl(e.target.value)}
                  className="input-field font-mono text-small"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-label uppercase text-text-muted block">Alert Severity</label>
                  <select
                    value={newRuleSeverity}
                    onChange={(e) => setNewRuleSeverity(e.target.value)}
                    className="input-field"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-label uppercase text-text-muted block">Risk Score ({newRuleRisk})</label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={newRuleRisk}
                    onChange={(e) => setNewRuleRisk(Number(e.target.value))}
                    className="w-full accent-accent bg-surface-2 h-2 rounded-lg appearance-none cursor-pointer mt-3"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-fire-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-mission"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-fire"
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
