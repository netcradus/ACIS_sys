import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Search, X, Trash2, Copy, Edit3, AlertTriangle, CheckCircle, Sliders } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)

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
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to delete this correlation rule?')) return
    try {
      await apiClient.delete(`/api/correlation/rules/${id}`)
      setRules(prev => prev.filter(r => r.id !== id))
      if (selectedRuleId === id) {
        setSelectedRuleId(null)
      }
      fetchRulesAndStats()
    } catch (error) {
      console.error('Failed to delete rule:', error)
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

  const toggleSelectRule = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedRuleIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  // Dynamic disabled rules display
  const disabledRuleNames = useMemo(() => {
    const disabled = rules.filter(r => !r.enabled).map(r => r.name)
    return disabled.length > 0
      ? disabled
      : ['Brute Force Attempt', 'Lateral Movement Detect', 'Lateral Movement Detect-Attempt']
  }, [rules])

  // Gauge risk score coordinate calculations
  const avgRisk = stats?.avgRiskScore ?? 85
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
    if (rules.length > 0) {
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
    } else {
      auth = 19; malware = 27; access = 16; persistence = 18; other = 9
    }
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

  // Events Processed last 10 min
  const now = new Date()
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000)
  const formatTimeHM = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

  const eventsSeries = useMemo(() => {
    return stats?.eventsSeries && stats.eventsSeries.length > 0
      ? stats.eventsSeries
      : [80, 60, 85, 150, 50, 90, 95, 110, 80, 130, 90, 100, 140, 105, 95]
  }, [stats])

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
            <div className="v">{stats?.activeRules ?? 28}</div>
            <svg viewBox="0 0 220 70" width="100%" height="60">
              <polyline
                points="0,50 30,35 60,42 90,20 120,32 150,10 180,25 220,15"
                fill="none"
                stroke="var(--sparkline-stroke)"
                strokeWidth="2"
              />
              <circle cx="90" cy="20" r="3" fill="var(--sparkline-stroke)" />
              <circle cx="150" cy="10" r="3" fill="var(--sparkline-stroke)" />
            </svg>
            <div className="sub">ACTIVE RULES</div>
          </div>

          <div className="stat-card blue">
            <div className="l">Alerts Fired Today</div>
            <div className="v">{alertsToday || 14}</div>
            <svg viewBox="0 0 220 60" width="100%" height="55">
              <g fill="var(--alerts-bar-fill)">
                <rect x="0" y="46" width="8" height="8" />
                <rect x="12" y="40" width="8" height="14" />
                <rect x="24" y="34" width="8" height="20" />
                <rect x="36" y="30" width="8" height="24" />
                <rect x="48" y="28" width="8" height="26" />
                <rect x="60" y="20" width="8" height="34" />
                <rect x="72" y="10" width="8" height="44" />
                <rect x="84" y="18" width="8" height="36" />
                <rect x="96" y="24" width="8" height="30" />
                <rect x="108" y="28" width="8" height="26" />
                <rect x="120" y="22" width="8" height="32" />
                <rect x="132" y="16" width="8" height="38" />
                <rect x="144" y="8" width="8" height="46" />
                <rect x="156" y="20" width="8" height="34" />
                <rect x="168" y="30" width="8" height="24" />
                <rect x="180" y="26" width="8" height="28" />
                <rect x="192" y="34" width="8" height="20" />
                <rect x="204" y="30" width="8" height="24" />
              </g>
            </svg>
            <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--dim)', fontWeight: 700, marginTop: '2px' }}>
              <span>00</span><span>01</span><span>02</span><span>03</span><span>04</span><span>06</span><span>08</span><span>10</span><span>12</span><span>14</span><span>16</span><span>18</span>
            </div>
          </div>

          <div className="stat-card red">
            <div className="l">Rules Disabled</div>
            <div className="v">{stats?.disabledRules ?? 3}</div>
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
              <div className="filter-btn">▽ Filter ⌄</div>
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
                + New Rule
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
                    />
                  </th>
                  <th className="sortable" onClick={() => handleSort('priority')}>
                    PRIORITY {sortField === 'priority' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th className="sortable" onClick={() => handleSort('name')}>
                    RULE NAME {sortField === 'name' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th className="sortable" onClick={() => handleSort('riskScore')}>
                    RISK SCORE {sortField === 'riskScore' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th>ENABLED</th>
                  <th className="sortable" onClick={() => handleSort('lastRun')}>
                    LAST RUN {sortField === 'lastRun' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRules.length > 0 ? (
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
                          />
                        </td>
                        <td>
                          <span className={clsx("pr-dot", (rule.severity || 'info').toLowerCase())} />
                          <span className={clsx("pr-text", (rule.severity || 'info').toLowerCase())}>
                            {rule.severity ? rule.severity.charAt(0) + rule.severity.slice(1).toLowerCase() : 'Info'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{rule.name}</td>
                        <td>{rule.riskScore}</td>
                        <td>
                          <button
                            onClick={(e) => handleToggle(rule.id, e)}
                            disabled={!canWrite}
                            className="toggle-btn-wrap"
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
                              onClick={() => openEditModal(rule)}
                              disabled={!canWrite}
                            >
                              ✎
                            </button>
                            <button
                              className="action-icon-btn"
                              title="Duplicate Rule"
                              onClick={(e) => handleDuplicate(rule, e)}
                              disabled={!canWrite}
                            >
                              ⧉
                            </button>
                            <button
                              className="action-icon-btn"
                              title="Delete Rule"
                              onClick={(e) => handleDelete(rule.id, e)}
                              disabled={!canWrite}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--dim)' }}>
                      No correlation rules found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <div className="page-nums">
              <span className="page-arrow" onClick={() => setCurrentPage(1)}>⏮</span>
              <span className="page-arrow" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}>‹</span>
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx}
                  className={clsx("page-btn", currentPage === idx + 1 && "active")}
                  onClick={() => setCurrentPage(idx + 1)}
                >
                  {idx + 1}
                </button>
              ))}
              <span className="page-arrow" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}>›</span>
              <span className="page-arrow" onClick={() => setCurrentPage(totalPages)}>⏭</span>
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
              <div className="bars2">
                {[80, 60, 85, 150, 50, 90, 95].map((v, i) => (
                  <div key={i} className="bcol">
                    <div className="bar" style={{ height: `${(v / 200) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span className="lbl" style={{ flex: 1, textAlign: 'center' }}>14:30</span>
                <span className="lbl" style={{ flex: 1, textAlign: 'center' }}>14:30</span>
                <span className="lbl" style={{ flex: 1, textAlign: 'center' }}>14:30</span>
                <span className="lbl" style={{ flex: 1, textAlign: 'center' }}>14:00</span>
                <span className="lbl" style={{ flex: 1, textAlign: 'center' }}>14:50</span>
                <span className="lbl" style={{ flex: 1, textAlign: 'center' }}>20:00</span>
                <span className="lbl" style={{ flex: 1, textAlign: 'center' }}>20:00</span>
              </div>
            </div>
          </div>

          <div className="mid-card">
            <div className="match-head">
              <h3>Rule Match Activity</h3>
              <span className="live-badge">LIVE</span>
            </div>
            <div className="match-sub">EVENT PROCESSING</div>
            <div className="match-line">
              {[
                { left: 2, top: 0, color: 'var(--dim)', size: 5 },
                { left: 15, top: 0, color: '#3b82f6', size: 7 },
                { left: 26, top: 0, color: '#3b82f6', size: 7 },
                { left: 35, top: 0, color: 'var(--dim)', size: 5 },
                { left: 42, top: -14, color: '#60a5fa', size: 6 },
                { left: 48, top: 0, color: 'var(--dim)', size: 5 },
                { left: 55, top: -16, color: '#1e40af', size: 7 },
                { left: 60, top: -14, color: '#1e40af', size: 7 },
                { left: 67, top: 14, color: 'var(--dim)', size: 5 },
                { left: 71, top: 14, color: 'var(--dim)', size: 5 },
                { left: 76, top: 14, color: 'var(--dim)', size: 5 },
                { left: 84, top: -14, color: '#1e40af', size: 7 },
                { left: 89, top: -16, color: '#1e40af', size: 7 },
                { left: 95, top: 0, color: '#60a5fa', size: 6 },
                { left: 99, top: 14, color: 'var(--dim)', size: 5 }
              ].map((dot, idx) => (
                <div
                  key={idx}
                  className="match-dot"
                  style={{
                    left: `${dot.left}%`,
                    top: `calc(50% + ${dot.top}px)`,
                    background: dot.color,
                    width: `${dot.size}px`,
                    height: `${dot.size}px`,
                    transform: 'translate(-50%,-50%)'
                  }}
                />
              ))}
            </div>
            <div className="match-time">
              <span>{formatTimeHM(tenMinAgo)}</span>
              <span>{formatTimeHM(now)}</span>
            </div>
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
            <h3>Closed-Loop Remediation Logs</h3>
            <div className="log-list">
              <div className="log-row">
                <div className="log-tag ok">Success/Success</div>
                <div className="log-desc">Logs in losted habit from the collect, suss…</div>
              </div>
              <div className="log-row">
                <div className="log-tag ok">Success/Success</div>
                <div className="log-desc">Logs in iwaa,TURL_DLS.zarakrrmlack_N0O…</div>
              </div>
              <div className="log-row">
                <div className="log-tag fail">Success/Failure</div>
                <div className="log-desc">Logs acis-gateway threat the constexr-trin…</div>
              </div>
              <div className="log-row">
                <div className="log-tag fail">Success/Failure</div>
                <div className="log-desc">Logs acis-gateway threat the under. trinvii…</div>
              </div>
              <div className="log-row">
                <div className="log-tag ok">Success/Failure</div>
                <div className="log-desc">Logs acis-gateway threat the edited RKYS…</div>
              </div>
              <div className="log-row">
                <div className="log-tag fail">Success/Failure</div>
                <div className="log-desc">Logs timesdic habit from the addested hii…</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New/Edit Rule Modal */}
      {isModalOpen && (
        <div className="correlation-page-modal-overlay">
          <div className="correlation-page-modal">
            <div className="modal-head">
              <h3>{editingRuleId ? 'Edit Correlation Rule' : 'Create Correlation Rule'}</h3>
              <button onClick={closeModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
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
                <button type="button" onClick={closeModal} className="btn ghost" style={{ padding: '8px 16px' }}>
                  Cancel
                </button>
                <button type="submit" className="btn blue" style={{ padding: '8px 20px' }}>
                  {editingRuleId ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
