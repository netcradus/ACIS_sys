import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Search, X, Trash2, Copy, Edit3 } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SeverityBadge, { toSeverity } from '@/components/viz/SeverityBadge'
import { toast } from '@/store/toastStore'
import { clsx } from 'clsx'
import './CorrelationPage.css'

function HeroGlobe() {
  const cx = 200;
  const cy = 200;
  const r = 190;

  // Horizontal ellipses (latitudes)
  const latitudes = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => {
      const yy = cy - r + (i + 1) * (2 * r / 7);
      const rx = Math.sqrt(Math.max(r * r - Math.pow(cy - yy, 2), 0));
      return { yy, rx };
    });
  }, []);

  // Vertical ellipses (longitudes)
  const longitudes = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => {
      const ang = i * 22.5;
      const rx = Math.abs(r * Math.cos((ang * Math.PI) / 180)) + 2;
      return rx;
    });
  }, []);

  // Static dots
  const dots = useMemo(() => {
    return Array.from({ length: 160 }).map((_, i) => {
      const a = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * r * 0.9;
      return {
        cx: cx + Math.cos(a) * rad,
        cy: cy + Math.sin(a) * rad * 0.9,
        r: Math.random() < 0.2 ? 1.3 : 0.7,
      };
    });
  }, []);

  return (
    <svg viewBox="0 0 400 400" width="100%" height="100%">
      {/* Outer circle */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--globe-outer)" />

      {/* Latitudes */}
      {latitudes.map((lat, idx) => (
        <ellipse
          key={`lat-${idx}`}
          cx={cx}
          cy={lat.yy}
          rx={lat.rx}
          ry={5}
          fill="none"
          stroke="var(--globe-lat)"
        />
      ))}

      {/* Longitudes */}
      {longitudes.map((rx, idx) => (
        <ellipse
          key={`long-${idx}`}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={r}
          fill="none"
          stroke="var(--globe-long)"
        />
      ))}

      {/* Dots */}
      {dots.map((dot, idx) => (
        <circle
          key={`dot-${idx}`}
          cx={dot.cx}
          cy={dot.cy}
          r={dot.r}
          fill="var(--globe-dot)"
        />
      ))}
    </svg>
  );
}

// Threshold and SPL query synchronizers
const THRESHOLD_CLAUSE_RE = /\s*\|\s*where\s+count\s*>\s*\d+/gi

function stripThresholdClause(spl: string): string {
  return spl.replace(THRESHOLD_CLAUSE_RE, '').trim()
}

function buildSplWithThreshold(baseSpl: string, threshold: string): string {
  const stripped = stripThresholdClause(baseSpl)
  if (threshold.trim() === '') return stripped
  return `${stripped} | where count > ${threshold.trim()}`
}

interface CorrelationRule {
  id: string
  name: string
  description: string
  splQuery: string
  severity: string
  riskScore: number
  enabled: boolean
  scheduleCron: string | null
  windowMinutes: number | null
  threshold: number | null
  lastRunAt: string | null
}

interface RuleActivity {
  ruleId: string
  name: string
  enabled: boolean
  matchCount: number
  lastRunAt: string | null
  avgProcessingMs: number | null
}

interface CorrelationStats {
  activeRules: number
  disabledRules: number
  avgRiskScore: number
  totalEvents: number
  eventsSeries: number[]
  ruleActivity: RuleActivity[]
}

export default function CorrelationPage() {
  const canWrite = useCanWrite(MODULES.ALERTS_CORRELATION)
  const [rules, setRules] = useState<CorrelationRule[]>([])
  const [stats, setStats] = useState<CorrelationStats | null>(null)
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [alertsToday, setAlertsToday] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Form State for New/Edit Rule
  const [newRuleName, setNewRuleName] = useState('')
  const [newRuleDesc, setNewRuleDesc] = useState('')
  const [newRuleSpl, setNewRuleSpl] = useState('')
  const [newRuleSeverity, setNewRuleSeverity] = useState('HIGH')
  const [newRuleRisk, setNewRuleRisk] = useState(70)
  const [newRuleWindow, setNewRuleWindow] = useState(5)
  const [newRuleThreshold, setNewRuleThreshold] = useState<string>('')
  const [newRuleSchedule, setNewRuleSchedule] = useState('')

  // Checkbox states for table selection
  const [selectedRuleIds, setSelectedRuleIds] = useState<Record<string, boolean>>({})

  // Sorting state
  const [sortField, setSortField] = useState<string>('priority')
  const [sortAsc, setSortAsc] = useState<boolean>(false)

  // Pagination page state
  const [currentPage, setCurrentPage] = useState<number>(1)
  const itemsPerPage = 5

  const fetchRulesAndStats = async () => {
    setIsLoading(true)
    setRulesError(null)
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
        setAlertsToday(alertsSummaryRes.data.totalAlerts ?? 0)
      }

      if (rulesRes.data.length > 0 && !selectedRuleId) {
        setSelectedRuleId(rulesRes.data[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
      setRulesError('Unable to load correlation rules. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Periodic stats polling
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
    e.stopPropagation()
    try {
      await apiClient.put(`/api/correlation/rules/${id}/toggle`)
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
      if (stats) {
        const rulesCopy = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
        const active = rulesCopy.filter(r => r.enabled).length
        const disabled = rulesCopy.filter(r => !r.enabled).length
        setStats({ ...stats, activeRules: active, disabledRules: disabled })
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error)
      toast.error('Failed to toggle correlation rule.')
    }
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteTarget(id)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await apiClient.delete(`/api/correlation/rules/${deleteTarget}`)
      setRules(prev => prev.filter(r => r.id !== deleteTarget))
      if (selectedRuleId === deleteTarget) {
        setSelectedRuleId(null)
      }
      fetchRulesAndStats()
      setDeleteTarget(null)
    } catch (error) {
      console.error('Failed to delete rule:', error)
      toast.error('Failed to delete correlation rule.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleDuplicate = async (rule: CorrelationRule, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const payload = {
        name: `${rule.name} (Copy)`,
        description: rule.description,
        splQuery: rule.splQuery,
        severity: rule.severity,
        riskScore: rule.riskScore,
        windowMinutes: rule.windowMinutes,
        scheduleCron: rule.scheduleCron,
      }
      await apiClient.post('/api/correlation/rules', payload)
      fetchRulesAndStats()
    } catch (error) {
      console.error('Failed to duplicate rule:', error)
      toast.error('Failed to duplicate correlation rule.')
    }
  }

  const handleSubmitRule = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        name: newRuleName,
        description: newRuleDesc,
        splQuery: buildSplWithThreshold(newRuleSpl, newRuleThreshold),
        severity: newRuleSeverity,
        riskScore: newRuleRisk,
        windowMinutes: newRuleWindow,
        scheduleCron: newRuleSchedule.trim() === '' ? null : newRuleSchedule.trim(),
      }
      if (editingRuleId) {
        await apiClient.put(`/api/correlation/rules/${editingRuleId}`, payload)
      } else {
        await apiClient.post('/api/correlation/rules', payload)
      }

      closeModal()
      fetchRulesAndStats()
    } catch (error) {
      console.error('Failed to save rule:', error)
      toast.error(editingRuleId ? 'Failed to save changes to correlation rule.' : 'Failed to create correlation rule.')
    }
  }

  const openCreateModal = () => {
    setEditingRuleId(null)
    setNewRuleName('')
    setNewRuleDesc('')
    setNewRuleSpl('')
    setNewRuleSeverity('HIGH')
    setNewRuleRisk(70)
    setNewRuleWindow(5)
    setNewRuleThreshold('')
    setNewRuleSchedule('')
    setIsModalOpen(true)
  }

  const openEditModal = (rule: CorrelationRule) => {
    setEditingRuleId(rule.id)
    setNewRuleName(rule.name)
    setNewRuleDesc(rule.description)
    setNewRuleSpl(stripThresholdClause(rule.splQuery))
    setNewRuleSeverity(rule.severity)
    setNewRuleRisk(rule.riskScore)
    setNewRuleWindow(rule.windowMinutes ?? 5)
    setNewRuleThreshold(rule.threshold != null ? String(rule.threshold) : '')
    setNewRuleSchedule(rule.scheduleCron ?? '')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingRuleId(null)
  }

  useEffect(() => {
    if (!isModalOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isModalOpen])

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

  const selectedRule = rules.find(r => r.id === selectedRuleId)
  
  const filteredRules = useMemo(() => {
    return rules.filter(r => 
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      r.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [rules, searchTerm])

  // Sorting Logic
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  const sortedRules = useMemo(() => {
    const sorted = [...filteredRules]
    sorted.sort((a, b) => {
      let valA: any = ''
      let valB: any = ''

      if (sortField === 'priority') {
        const severityOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
        valA = severityOrder[a.severity] || 0
        valB = severityOrder[b.severity] || 0
      } else if (sortField === 'name') {
        valA = a.name.toLowerCase()
        valB = b.name.toLowerCase()
      } else if (sortField === 'riskScore') {
        valA = a.riskScore
        valB = b.riskScore
      } else if (sortField === 'lastRun') {
        valA = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0
        valB = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0
      }

      if (valA < valB) return sortAsc ? -1 : 1
      if (valA > valB) return sortAsc ? 1 : -1
      return 0
    })
    return sorted
  }, [filteredRules, sortField, sortAsc])

  // Pagination calculations
  const totalPages = Math.ceil(sortedRules.length / itemsPerPage) || 1
  const paginatedRules = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return sortedRules.slice(start, start + itemsPerPage)
  }, [sortedRules, currentPage])

  // Select all checkboxes
  const isAllSelected = useMemo(() => {
    return paginatedRules.length > 0 && paginatedRules.every(r => selectedRuleIds[r.id])
  }, [paginatedRules, selectedRuleIds])

  const toggleSelectAll = () => {
    const updated = { ...selectedRuleIds }
    const allChecked = !isAllSelected
    paginatedRules.forEach(r => {
      updated[r.id] = allChecked
    })
    setSelectedRuleIds(updated)
  }

  const toggleSelectRule = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    setSelectedRuleIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  // Dynamic disabled rules display
  const disabledRuleNames = useMemo(() => rules.filter(r => !r.enabled).map(r => r.name), [rules])

  // Gauge risk score coordinate calculations
  const avgRisk = stats?.avgRiskScore ?? 0
  const needleAngle = useMemo(() => {
    const score = Math.min(Math.max(avgRisk, 0), 100)
    return 180 - (score / 100) * 180
  }, [avgRisk])

  const needleCoords = useMemo(() => {
    const angleRad = (needleAngle * Math.PI) / 180
    const len = 65
    return {
      x2: 100 + len * Math.cos(angleRad),
      y2: 90 - len * Math.sin(angleRad)
    }
  }, [needleAngle])

  // Category donut charts calculations (Search Efficiency)
  const categories = useMemo(() => {
    let auth = 0, malware = 0, access = 0, persistence = 0, other = 0
    rules.forEach(r => {
      const name = r.name.toLowerCase()
      const spl = r.splQuery.toLowerCase()
      if (name.includes('auth') || name.includes('login') || spl.includes('auth') || spl.includes('login') || name.includes('brute')) {
        auth++
      } else if (name.includes('malware') || name.includes('virus') || name.includes('ransom') || name.includes('trojan')) {
        malware++
      } else if (name.includes('access') || name.includes('port') || name.includes('privilege') || name.includes('bypass')) {
        access++
      } else if (name.includes('persist') || name.includes('cron') || name.includes('registry') || name.includes('startup')) {
        persistence++
      } else {
        other++
      }
    })
    return { auth, malware, access, persistence, other }
  }, [rules])

  const donutSlices = useMemo(() => {
    const total = categories.auth + categories.malware + categories.access + categories.persistence + categories.other
    const totalVal = total > 0 ? total : 1
    const circ = 2 * Math.PI * 52 // ~326.72

    const authPct = categories.auth / totalVal
    const malwarePct = categories.malware / totalVal
    const accessPct = categories.access / totalVal
    const persistencePct = categories.persistence / totalVal
    const otherPct = categories.other / totalVal

    const authDash = authPct * circ
    const malwareDash = malwarePct * circ
    const accessDash = accessPct * circ
    const persistenceDash = persistencePct * circ
    const otherDash = otherPct * circ

    return {
      circ,
      auth: { dash: authDash, offset: 0 },
      malware: { dash: malwareDash, offset: -authDash },
      access: { dash: accessDash, offset: -(authDash + malwareDash) },
      persistence: { dash: persistenceDash, offset: -(authDash + malwareDash + accessDash) },
      other: { dash: otherDash, offset: -(authDash + malwareDash + accessDash + persistenceDash) }
    }
  }, [categories])

  const eventsSeries = stats?.eventsSeries ?? []

  return (
    <div className="correlation-page">
      <div className="hero-wrap">
        <div className="hero-globe">
          <HeroGlobe />
        </div>

        <div className="page-head">
          <h1>Correlation Searches</h1>
          <div className="search-rules">
            <Search width={15} height={15} />
            <input
              type="text"
              placeholder="Search correlation rules…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Top stat cards */}
        <div className="stat-row">
          <div className="stat-card amber">
            <div className="l">Active Rules</div>
            <div className="v">{stats?.activeRules ?? 0}</div>
            <div className="sub">ACTIVE RULES</div>
          </div>

          <div className="stat-card blue">
            <div className="l">Alerts Fired Today</div>
            <div className="v">{alertsToday}</div>
            <svg viewBox="0 0 220 60" width="100%" height="55">
              <g fill="var(--alerts-bar-fill)">
                {eventsSeries.map((v, i) => {
                  const max = Math.max(...eventsSeries, 1)
                  const h = Math.max(2, (v / max) * 46)
                  return <rect key={i} x={i * (220 / eventsSeries.length)} y={54 - h} width={220 / eventsSeries.length - 4} height={h} />
                })}
              </g>
            </svg>
            <div style={{ fontSize: '9.5px', color: 'var(--dim)', fontWeight: 700, marginTop: '2px' }}>
              LAST ~80S EVENT VOLUME
            </div>
          </div>

          <div className="stat-card red">
            <div className="l">Rules Disabled</div>
            <div className="v">{stats?.disabledRules ?? 0}</div>
            <div className="rule-list">
              {disabledRuleNames.map((name, idx) => (
                <div key={idx} className="truncate">{name}</div>
              ))}
            </div>
          </div>

          <div className="stat-card" style={{ borderLeft: 'none' }}>
            <div className="l">Avg Risk Score</div>
            <div className="v">{avgRisk}</div>
            <div className="gauge-mini">
              <svg viewBox="0 0 200 110">
                <path
                  d="M15,95 A85,85 0 0 1 185,95"
                  fill="none"
                  stroke="url(#riskGrad)"
                  strokeWidth="14"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="riskGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="var(--green)" />
                    <stop offset="0.5" stopColor="var(--amber)" />
                    <stop offset="1" stopColor="var(--red)" />
                  </linearGradient>
                </defs>
                <line
                  x1="100"
                  y1="90"
                  x2={needleCoords.x2}
                  y2={needleCoords.y2}
                  stroke="var(--text)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="100" cy="90" r="5" fill="var(--text)" />
              </svg>
              <div className="lbls">
                <span>0</span>
                <span>{avgRisk}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Correlation Searches table */}
        <div className="table-panel">
          <div className="table-head">
            <div>
              <h3>Correlation Searches</h3>
              <p>Risk-based alerting — schedule &amp; throttling</p>
            </div>
            <div className="table-actions">
              <div className="search-box">
                <Search width={14} height={14} />
                <input
                  type="text"
                  placeholder="Search…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button
                className="new-rule-btn"
                onClick={openCreateModal}
                disabled={!canWrite}
              >
                <Plus className="w-3.5 h-3.5" /> New Rule
              </button>
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all rules"
                    />
                  </th>
                  <th className="sortable" onClick={() => handleSort('priority')} aria-sort={sortField === 'priority' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                    PRIORITY {sortField === 'priority' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th className="sortable" onClick={() => handleSort('name')} aria-sort={sortField === 'name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                    RULE NAME {sortField === 'name' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th className="sortable" onClick={() => handleSort('riskScore')} aria-sort={sortField === 'riskScore' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                    RISK SCORE {sortField === 'riskScore' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th>ENABLED</th>
                  <th className="sortable" onClick={() => handleSort('lastRun')} aria-sort={sortField === 'lastRun' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                    LAST RUN {sortField === 'lastRun' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={7} className="text-center text-text-muted py-6">Loading...</td></tr>
                )}
                {!isLoading && rulesError && (
                  <tr>
                    <td colSpan={7}>
                      <div className="flex flex-col items-center gap-2 py-4">
                        <span>Unable to load correlation rules. Please try again.</span>
                        <button className="btn-mission text-small px-3 py-1.5" onClick={fetchRulesAndStats}>Retry</button>
                      </div>
                    </td>
                  </tr>
                )}
                {!isLoading && !rulesError && paginatedRules.length > 0 ? (
                  paginatedRules.map((rule) => {
                    const isSelected = selectedRuleId === rule.id
                    const isChecked = !!selectedRuleIds[rule.id]
                    return (
                      <tr
                        key={rule.id}
                        onClick={() => setSelectedRuleId(rule.id)}
                        className={clsx(isSelected && "selected")}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => toggleSelectRule(rule.id, e)}
                            aria-label={`Select rule ${rule.name}`}
                          />
                        </td>
                        <td>
                          <SeverityBadge
                            severity={toSeverity(rule.severity)}
                            label={rule.severity ? rule.severity.charAt(0) + rule.severity.slice(1).toLowerCase() : 'Info'}
                            size="sm"
                          />
                        </td>
                        <td style={{ fontWeight: 700 }}>{rule.name}</td>
                        <td>{rule.riskScore}</td>
                        <td>
                          <button
                            onClick={(e) => handleToggle(rule.id, e)}
                            disabled={!canWrite}
                            className="toggle-btn-wrap"
                            role="switch"
                            aria-checked={rule.enabled}
                            aria-label={`${rule.enabled ? 'Disable' : 'Enable'} rule ${rule.name}`}
                          >
                            <span className={clsx("toggle", rule.enabled && "active")} />
                          </button>
                        </td>
                        <td>{formatLastRun(rule.lastRunAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="action-icons" style={{ justifyContent: 'end' }}>
                            <button
                              className="action-icon-btn"
                              title="Edit Rule"
                              aria-label={`Edit rule ${rule.name}`}
                              onClick={() => openEditModal(rule)}
                              disabled={!canWrite}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="action-icon-btn"
                              title="Duplicate Rule"
                              aria-label={`Duplicate rule ${rule.name}`}
                              onClick={(e) => handleDuplicate(rule, e)}
                              disabled={!canWrite}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="action-icon-btn"
                              title="Delete Rule"
                              aria-label={`Delete rule ${rule.name}`}
                              onClick={(e) => handleDelete(rule.id, e)}
                              disabled={!canWrite}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  !isLoading && !rulesError && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--dim)' }}>
                        No correlation rules found
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <div className="page-nums">
              <button type="button" className="page-arrow" aria-label="First page" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>⏮</button>
              <button type="button" className="page-arrow" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}>‹</button>
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx}
                  className={clsx("page-btn", currentPage === idx + 1 && "active")}
                  aria-label={`Page ${idx + 1}`}
                  aria-current={currentPage === idx + 1 ? 'page' : undefined}
                  onClick={() => setCurrentPage(idx + 1)}
                >
                  {idx + 1}
                </button>
              ))}
              <button type="button" className="page-arrow" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}>›</button>
              <button type="button" className="page-arrow" aria-label="Last page" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>⏭</button>
            </div>
            <div>Paging : {currentPage} / {totalPages} pages</div>
          </div>
        </div>

        {/* middle row: Search Efficiency / Rule Match / Metadata */}
        <div className="mid-grid">
          <div className="mid-card">
            <h3>Search Efficiency</h3>
            <div className="sub-h">Rules by Category</div>
            <div className="eff-row">
              <svg viewBox="0 0 140 140" width="130" height="130" style={{ transform: 'rotate(-90deg)' }}>
                {/* Donut sectors using dynamic stroke-dasharray and offsets */}
                <circle cx="70" cy="70" r="52" fill="none" stroke="var(--red)" strokeWidth="20" strokeDasharray={`${donutSlices.auth.dash} ${donutSlices.circ - donutSlices.auth.dash}`} strokeDashoffset={donutSlices.auth.offset} />
                <circle cx="70" cy="70" r="52" fill="none" stroke="var(--pink)" strokeWidth="20" strokeDasharray={`${donutSlices.malware.dash} ${donutSlices.circ - donutSlices.malware.dash}`} strokeDashoffset={donutSlices.malware.offset} />
                <circle cx="70" cy="70" r="52" fill="none" stroke="var(--amber)" strokeWidth="20" strokeDasharray={`${donutSlices.access.dash} ${donutSlices.circ - donutSlices.access.dash}`} strokeDashoffset={donutSlices.access.offset} />
                <circle cx="70" cy="70" r="52" fill="none" stroke="var(--purple)" strokeWidth="20" strokeDasharray={`${donutSlices.persistence.dash} ${donutSlices.circ - donutSlices.persistence.dash}`} strokeDashoffset={donutSlices.persistence.offset} />
                <circle cx="70" cy="70" r="52" fill="none" stroke="var(--green)" strokeWidth="20" strokeDasharray={`${donutSlices.other.dash} ${donutSlices.circ - donutSlices.other.dash}`} strokeDashoffset={donutSlices.other.offset} />
              </svg>
              <div className="donut-legend">
                <div><span className="d" style={{ background: 'var(--red)' }}></span>Authentication<span className="n">{categories.auth}</span></div>
                <div><span className="d" style={{ background: 'var(--pink)' }}></span>Malware<span className="n">{categories.malware}</span></div>
                <div><span className="d" style={{ background: 'var(--amber)' }}></span>Access<span className="n">{categories.access}</span></div>
                <div><span className="d" style={{ background: 'var(--purple)' }}></span>Persistence<span className="n">{categories.persistence}</span></div>
                <div><span className="d" style={{ background: 'var(--green)' }}></span>Other<span className="n">{categories.other}</span></div>
              </div>
            </div>

            <div className="avg-proc">
              <div className="sub-h">Average Processing Time by Rule</div>
              {(() => {
                const timed = (stats?.ruleActivity ?? []).filter(r => r.avgProcessingMs != null)
                if (timed.length === 0) {
                  return <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--dim)', fontSize: '12px' }}>No timed rule evaluations yet.</div>
                }
                const maxMs = Math.max(...timed.map(r => r.avgProcessingMs!), 0.01)
                return (
                  <>
                    <div className="bars2">
                      {timed.slice(0, 7).map((r) => (
                        <div key={r.ruleId} className="bcol" title={`${r.name}: ${r.avgProcessingMs!.toFixed(2)}ms`}>
                          <div className="bar" style={{ height: `${(r.avgProcessingMs! / maxMs) * 100}%` }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                      {timed.slice(0, 7).map((r) => (
                        <span key={r.ruleId} className="lbl truncate" style={{ flex: 1, textAlign: 'center', fontSize: '9px' }}>{r.avgProcessingMs!.toFixed(1)}ms</span>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

          <div className="mid-card">
            <div className="match-head">
              <h3>Rule Match Activity</h3>
              <span className="live-badge">LIVE</span>
            </div>
            <div className="match-sub">MATCHES SINCE ENGINE START</div>
            {(!stats?.ruleActivity || stats.ruleActivity.length === 0) ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--dim)' }}>
                No rule activity recorded yet.
              </div>
            ) : (
              <div className="rule-list" style={{ marginTop: '10px' }}>
                {[...stats.ruleActivity]
                  .sort((a, b) => b.matchCount - a.matchCount)
                  .slice(0, 6)
                  .map((r) => (
                    <div key={r.ruleId} className="truncate" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <span className="truncate">{r.name}</span>
                      <span style={{ color: 'var(--dim)', fontWeight: 700 }}>{r.matchCount}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="mid-card">
            <h3>Rule Metadata</h3>
            {selectedRule ? (
              <div style={{ marginTop: '16px' }}>
                <div className="meta-item">
                  <div className="l2">Description</div>
                  <div className="v2">
                    {selectedRule.description || 'No description provided.'}
                  </div>
                </div>
                <div className="meta-item">
                  <div className="l2">Schedule</div>
                  <div className="v2">
                    {selectedRule.scheduleCron || 'Continuous real-time stream evaluation.'}
                  </div>
                </div>
                <div className="meta-item">
                  <div className="l2">Suppression</div>
                  <div className="v2">
                    Throttled by limit 1 per <b>{selectedRule.windowMinutes ?? 5} min</b> sliding window.
                  </div>
                </div>
                <div className="meta-item">
                  <div className="l2">Linked Tactics (MITRE ATT&amp;CK)</div>
                  <div className="v2" style={{ textTransform: 'uppercase', fontSize: '10.5px', color: 'var(--blue)', fontWeight: 700 }}>
                    {selectedRule.severity === 'CRITICAL' || selectedRule.severity === 'HIGH' ? 'Credential Access, Discovery' : 'Defense Evasion, Execution'}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ margin: 'auto', color: 'var(--dim)', fontSize: '13px' }}>
                Select a rule to view metadata
              </div>
            )}
          </div>
        </div>

        {/* bottom row */}
        <div className="bottom-grid">
          <div className="bottom-card">
            <h3>Recent Alert Timeline (Correlation)</h3>
            <div className="timeline">
              <div className="tl-line">
                {[
                  { left: 5, bg: 'var(--red)', icon: '⚠', style: { top: '-52px', background: 'rgba(239,68,68,0.18)', color: '#f87171' } },
                  { left: 19, bg: 'var(--amber)', icon: '⚠', style: { top: '-52px', background: 'rgba(245,158,11,0.18)', color: '#fbbf24' } },
                  { left: 33, bg: 'var(--green)', icon: '⚠', style: { top: '32px', background: 'rgba(74,222,128,0.18)', color: '#4ade80' } },
                  { left: 47, bg: 'var(--red)', icon: '⊙', style: { top: '-52px', background: 'rgba(239,68,68,0.18)', color: '#f87171' } },
                  { left: 61, bg: 'var(--blue)', icon: '⚙', style: { top: '32px', background: 'rgba(59,130,246,0.18)', color: '#60a5fa' } },
                  { left: 75, bg: 'var(--red)', icon: '⚠', style: { top: '-52px', background: 'rgba(239,68,68,0.18)', color: '#f87171' } },
                  { left: 89, bg: 'var(--purple)', icon: '⚙', style: { top: '32px', background: 'rgba(168,85,247,0.18)', color: '#c084fc' } }
                ].map((item, idx) => (
                  <React.Fragment key={idx}>
                    <div className="tl-dot" style={{ left: `${item.left}%`, background: item.bg }} />
                    <div className="tl-icon" style={{ left: `${item.left}%`, ...item.style }}>
                      {item.icon}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className="bottom-card">
            <h3>Remediation Workflow Status</h3>
            <div className="network-wrap">
              <svg viewBox="0 0 260 220" style={{ width: '100%', height: '220px' }}>
                {[
                  { x1: 130, y1: 100, x2: 70, y2: 60 },
                  { x1: 130, y1: 100, x2: 190, y2: 60 },
                  { x1: 130, y1: 100, x2: 50, y2: 140 },
                  { x1: 130, y1: 100, x2: 130, y2: 40 },
                  { x1: 130, y1: 100, x2: 210, y2: 140 },
                  { x1: 130, y1: 100, x2: 90, y2: 180 },
                  { x1: 130, y1: 100, x2: 170, y2: 180 }
                ].map((edge, idx) => (
                  <line
                    key={idx}
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    stroke="var(--net-edge-stroke)"
                    strokeWidth="1.4"
                  />
                ))}
                {[
                  { cx: 130, cy: 100, r: 16, fill: 'var(--net-main-node-fill)', stroke: 'var(--net-main-node-stroke)', strokeWidth: '1.5' },
                  { cx: 70, cy: 60, r: 7, fill: 'var(--net-sub-node-even-fill)', stroke: 'var(--net-sub-node-even-stroke)', strokeWidth: '1.4' },
                  { cx: 190, cy: 60, r: 5.5, fill: 'var(--net-main-node-fill)', stroke: 'var(--net-main-node-stroke)', strokeWidth: '1.4' },
                  { cx: 50, cy: 140, r: 7, fill: 'var(--net-sub-node-even-fill)', stroke: 'var(--net-sub-node-even-stroke)', strokeWidth: '1.4' },
                  { cx: 130, cy: 40, r: 5.5, fill: 'var(--net-main-node-fill)', stroke: 'var(--net-main-node-stroke)', strokeWidth: '1.4' },
                  { cx: 210, cy: 140, r: 7, fill: 'var(--net-sub-node-even-fill)', stroke: 'var(--net-sub-node-even-stroke)', strokeWidth: '1.4' },
                  { cx: 90, cy: 180, r: 5.5, fill: 'var(--net-main-node-fill)', stroke: 'var(--net-main-node-stroke)', strokeWidth: '1.4' },
                  { cx: 170, cy: 180, r: 7, fill: 'var(--net-sub-node-even-fill)', stroke: 'var(--net-sub-node-even-stroke)', strokeWidth: '1.4' }
                ].map((node, idx) => (
                  <circle
                    key={idx}
                    cx={node.cx}
                    cy={node.cy}
                    r={node.r}
                    fill={node.fill}
                    stroke={node.stroke}
                    strokeWidth={node.strokeWidth}
                  />
                ))}
              </svg>
            </div>
          </div>

          <div className="bottom-card">
            <h3>Recently Evaluated Rules</h3>
            <div className="log-list">
              {(!stats?.ruleActivity || stats.ruleActivity.filter(r => r.lastRunAt).length === 0) ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--dim)' }}>
                  No rule evaluations recorded yet.
                </div>
              ) : (
                [...stats.ruleActivity]
                  .filter(r => r.lastRunAt)
                  .sort((a, b) => new Date(b.lastRunAt!).getTime() - new Date(a.lastRunAt!).getTime())
                  .slice(0, 6)
                  .map((r) => (
                    <div key={r.ruleId} className="log-row">
                      <div className={clsx('log-tag', r.enabled ? 'ok' : 'fail')}>{r.enabled ? 'Enabled' : 'Disabled'}</div>
                      <div className="log-desc">{r.name} · {r.matchCount} matches · last run {formatLastRun(r.lastRunAt)}</div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* New/Edit Rule Modal */}
      {isModalOpen && (
        <div className="correlation-page-modal-overlay" onClick={closeModal}>
          <div
            className="correlation-page-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={editingRuleId ? 'Edit Correlation Rule' : 'Create Correlation Rule'}
          >
            <div className="modal-head">
              <h3>{editingRuleId ? 'Edit Correlation Rule' : 'Create Correlation Rule'}</h3>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close dialog"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X className="w-5 h-5 text-text-muted" />
              </button>
            </div>
            <form onSubmit={handleSubmitRule}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Rule Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Impossible Travel Detection"
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Risk-based alerting — schedule & throttling"
                    value={newRuleDesc}
                    onChange={(e) => setNewRuleDesc(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>SPL Query</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="index=auth sourcetype=okta:login | stats values(src_ip) as ips by user"
                    value={newRuleSpl}
                    onChange={(e) => setNewRuleSpl(e.target.value)}
                    className="form-control mono-input"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Alert Severity</label>
                    <select
                      value={newRuleSeverity}
                      onChange={(e) => setNewRuleSeverity(e.target.value)}
                      className="form-control"
                    >
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Risk Score ({newRuleRisk})</label>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={newRuleRisk}
                      onChange={(e) => setNewRuleRisk(Number(e.target.value))}
                      style={{ width: '100%', marginTop: '12px' }}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Window (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={newRuleWindow}
                      onChange={(e) => setNewRuleWindow(Number(e.target.value))}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label>Threshold (optional)</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="e.g. 5"
                      value={newRuleThreshold}
                      onChange={(e) => setNewRuleThreshold(e.target.value)}
                      className="form-control"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Schedule (cron, optional)</label>
                  <input
                    type="text"
                    placeholder="Leave blank for continuous real-time stream"
                    value={newRuleSchedule}
                    onChange={(e) => setNewRuleSchedule(e.target.value)}
                    className="form-control mono-input"
                  />
                </div>
              </div>

              <div className="modal-foot">
                <button type="button" onClick={closeModal} className="btn-ghost text-small">
                  Cancel
                </button>
                <button type="submit" className="btn-fire text-small">
                  {editingRuleId ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Correlation Rule"
        message="Are you sure you want to delete this correlation rule? This cannot be undone."
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
