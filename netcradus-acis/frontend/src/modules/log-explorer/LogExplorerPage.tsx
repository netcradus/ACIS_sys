import React, { useState, useEffect, useMemo } from 'react'
import { ShieldCheck, Download, Save } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import { LogEntry } from '@/types/log'
import { clsx } from 'clsx'
import { usePivotSeed, useEntityPivot } from '@/hooks/useEntityPivot'
import './LogExplorerPage.css'

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
    return Array.from({ length: 200 }).map((_, i) => {
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
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(120,160,230,0.3)" />

      {/* Latitudes */}
      {latitudes.map((lat, idx) => (
        <ellipse
          key={`lat-${idx}`}
          cx={cx}
          cy={lat.yy}
          rx={lat.rx}
          ry={5}
          fill="none"
          stroke="rgba(120,160,230,0.15)"
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
          stroke="rgba(120,160,230,0.1)"
        />
      ))}

      {/* Dots */}
      {dots.map((dot, idx) => (
        <circle
          key={`dot-${idx}`}
          cx={dot.cx}
          cy={dot.cy}
          r={dot.r}
          fill="rgba(140,175,235,0.3)"
        />
      ))}
    </svg>
  );
}

export default function LogExplorerPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selectedSource, setSelectedSource] = useState('ALL')
  const [isLive, setIsLive] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [query, setQuery] = useState('service=acis-gateway | level=ERROR')

  const [isTranslating, setIsTranslating] = useState(false)
  const [aiTranslateError, setAiTranslateError] = useState<string | null>(null)
  const [aiStatus, setAiStatus] = useState<'checking' | 'ready' | 'offline'>('checking')
  const [savedSearches, setSavedSearches] = useState<string[]>([])
  const { pivotTo } = useEntityPivot()

  // Trend chart and tooltip interactions
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Sorting state for the table
  const [sortField, setSortField] = useState<string>('timestamp')
  const [sortAsc, setSortAsc] = useState<boolean>(false)

  // Real pivot target from other screens
  const pivotSeed = usePivotSeed()
  useEffect(() => {
    if (!pivotSeed) return
    if (pivotSeed.type === 'host') {
      setQuery(`host=${pivotSeed.value}`)
    } else {
      setQuery(`search "${pivotSeed.value}"`)
    }
    setIsLive(false)
  }, [pivotSeed])

  const handleSourceChange = (src: string) => {
    setSelectedSource(src)
    if (src === 'ALL') {
      setQuery('')
    } else {
      setQuery(`service=${src}`)
    }
  }

  const parseQuery = (q: string) => {
    const filters: any = {}
    const parts = q.split('|').map(p => p.trim())
    const textTerms: string[] = []

    parts.forEach(part => {
      if (part.startsWith('service=')) {
        filters.service = part.replace('service=', '').trim()
      } else if (part.startsWith('level=')) {
        filters.level = part.replace('level=', '').trim()
      } else if (part.startsWith('host=')) {
        filters.host = part.replace('host=', '').trim()
      } else if (part.startsWith('search ')) {
        const term = part.substring(7).replace(/"/g, '').trim()
        if (term) textTerms.push(term)
      } else if (part.startsWith('index=') || part.startsWith('sourcetype=')) {
        const val = part.split('=')[1]?.trim()
        if (val) textTerms.push(val)
      } else if (!part.startsWith('stats ')) {
        if (part) textTerms.push(part)
      }
    })

    if (textTerms.length > 0) {
      filters.query = textTerms.join(' ')
    }
    return filters
  }

  const handleExportCSV = () => {
    if (logs.length === 0) return
    const headers = ['timestamp', 'service', 'level', 'message', 'host', 'threatSeverity']
    const csvContent = [
      headers.join(','),
      ...logs.map(log => headers.map(header => {
        const val = log[header as keyof LogEntry] || ''
        return `"${String(val).replace(/"/g, '""')}"`
      }).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `acis_logs_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleSaveSearch = () => {
    if (!query.trim()) return
    const updated = Array.from(new Set([query.trim(), ...savedSearches]))
    setSavedSearches(updated)
    localStorage.setItem('acis_saved_searches', JSON.stringify(updated))
  }

  const fetchLogs = async () => {
    setIsLoading(true)
    setIsLive(false)
    try {
      const filters = parseQuery(query)
      const response = await apiClient.get<LogEntry[]>('/api/logs/search', { params: filters })
      setLogs(response.data)
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTranslate = async () => {
    if (!query) return
    setIsTranslating(true)
    setAiTranslateError(null)
    try {
      const response = await apiClient.post('/api/logs/translate', { query })
      if (response.data.spl) {
        setQuery(response.data.spl)
      } else {
        setAiTranslateError('AI translation unavailable. Please try again.')
      }
    } catch (e: any) {
      console.error('NLP Translation failed', e)
      setAiTranslateError(e?.response?.data?.error || 'AI translation unavailable. Please try again.')
    } finally {
      setIsTranslating(false)
    }
  }

  useEffect(() => {
    const checkAiStatus = async () => {
      try {
        const response = await apiClient.get<{ status: string }>('/api/logs/ai-health')
        if (response.data.status === 'UP') {
          setAiStatus('ready')
        } else {
          setAiStatus('offline')
        }
      } catch (e) {
        setAiStatus('offline')
      }
    }

    checkAiStatus()
    const interval = setInterval(checkAiStatus, 15000)

    const saved = localStorage.getItem('acis_saved_searches')
    if (saved) {
      setSavedSearches(JSON.parse(saved))
    }

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let sub: any = null
    if (isLive) {
      const loadLiveLogs = async () => {
        try {
          const params = selectedSource !== 'ALL' ? { service: selectedSource } : {}
          const response = await apiClient.get<LogEntry[]>('/api/logs/search', { params })
          setLogs(response.data)
        } catch (e) {
          console.error('Failed to load initial live logs:', e)
        }
      }
      loadLiveLogs()

      sub = wsClient.subscribe('/topic/logs', (msg) => {
        try {
          const newLog = JSON.parse(msg.body)
          if (selectedSource !== 'ALL' && newLog.service?.toLowerCase() !== selectedSource.toLowerCase()) {
            return
          }
          setLogs(prev => [newLog, ...prev.slice(0, 499)])
        } catch (e) {
          console.error('Log stream parse error:', e)
        }
      }, '/ws/logs')
    } else {
      fetchLogs()
    }
    return () => { if (sub) sub.then((s: any) => s?.unsubscribe()) }
  }, [isLive, selectedSource])

  // Trend computation
  const trendData = useMemo(() => {
    const buckets: Record<string, number> = {}
    logs.forEach(log => {
      if (!log.timestamp) return
      const d = new Date(log.timestamp)
      if (isNaN(d.getTime())) return
      const key = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      buckets[key] = (buckets[key] || 0) + 1
    })
    return Object.entries(buckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-24)
      .map(([time, count]) => ({ time, count }))
  }, [logs])

  const values = useMemo(() => {
    if (trendData.length > 0) {
      return trendData.map(d => d.count)
    }
    return [55, 68, 95, 80, 55, 105, 50, 70, 88, 45, 150, 90, 190, 120, 110, 95, 138, 60, 150, 142, 90, 42, 55, 75]
  }, [trendData])

  const times = useMemo(() => {
    if (trendData.length > 0) {
      return trendData.map((d, i) => (i % 4 === 0 ? d.time : ''))
    }
    return ['14:20', '', '14:25', '', '14:30', '', '16:15', '', '14:20', '', '14:35', '', '14:25', '', '14:30', '', '15:45', '', '20:00', '', '', '', '', '']
  }, [trendData])

  const maxV = useMemo(() => {
    const peak = Math.max(...values, 0)
    return peak > 0 ? peak : 200
  }, [values])

  const yAxisValues = useMemo(() => {
    return [
      maxV,
      Math.round(maxV * 0.75),
      Math.round(maxV * 0.5),
      Math.round(maxV * 0.25),
      0
    ]
  }, [maxV])

  const hasTooltip = (idx: number) => {
    if (hoveredIndex === idx) return true
    if (hoveredIndex === null && trendData.length === 0) {
      return idx === 4 || idx === 12
    }
    return false
  }

  const getTooltipText = (idx: number, val: number) => {
    if (hoveredIndex === idx) {
      if (trendData.length > 0) {
        return `${trendData[idx].time} - ${trendData[idx].count} Events`
      }
      return `${times[idx] || '14:23'} - ${val} Events`
    }
    if (idx === 4) return '14:23 - 10 Events'
    if (idx === 12) return '14:23 - 10 Events'
    return ''
  }

  const displayEventsCount = useMemo(() => {
    return logs.length > 0 ? logs.length : 245
  }, [logs])

  // Sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  const sortedLogs = useMemo(() => {
    const sorted = [...logs]
    sorted.sort((a, b) => {
      let valA = a[sortField as keyof LogEntry] || ''
      let valB = b[sortField as keyof LogEntry] || ''
      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()
      if (valA < valB) return sortAsc ? -1 : 1
      if (valA > valB) return sortAsc ? 1 : -1
      return 0
    })
    return sorted
  }, [logs, sortField, sortAsc])

  return (
    <div className="log-explorer-page">
      <div className="hero-wrap">
        <div className="hero-globe">
          <HeroGlobe />
        </div>

        <div className="page-head">
          <div>
            <h1>Log Explorer (SPL)</h1>
            <p>Elastic Telemetry &amp; Multi-Source Indexing</p>
          </div>
          <div className="head-actions">
            <div className="select-pill source-select-wrap">
              <span>▽</span>
              <select
                value={selectedSource}
                onChange={(e) => handleSourceChange(e.target.value)}
              >
                <option value="ALL">All Sources</option>
                <option value="firewall">Firewall</option>
                <option value="ids-ips">IDS/IPS</option>
                <option value="netcradus-waf">WAF</option>
                <option value="acis-gateway">Gateway</option>
                <option value="auth-service">Auth Service</option>
              </select>
              <span>⌄</span>
            </div>
            <button
              className={clsx("btn", isLive ? "blue" : "ghost")}
              onClick={() => setIsLive(true)}
            >
              Live Stream
            </button>
            <button
              className={clsx("btn", !isLive ? "blue" : "ghost")}
              onClick={() => setIsLive(false)}
            >
              Forensic Search
            </button>
          </div>
        </div>

        {/* SPL Search Panel */}
        <div className="spl-panel">
          <div className="spl-head">
            <div className="spl-eyebrow">SEARCH PROCESSING — SPL-LIKE PIPELINE</div>
            <div className="spl-actions">
              <span
                className="translate-btn"
                onClick={handleTranslate}
                style={{
                  opacity: isTranslating || aiStatus !== 'ready' ? 0.6 : 1,
                  cursor: isTranslating || aiStatus !== 'ready' ? 'not-allowed' : 'pointer'
                }}
              >
                {isTranslating ? 'TRANSLATING...' : 'TRANSLATE ENGLISH TO SPL'}
              </span>
              <span className="ai-online">
                <span
                  className="d"
                  style={{
                    backgroundColor: aiStatus === 'checking' ? '#fb923c' : aiStatus === 'ready' ? '#22c55e' : '#ef4444',
                    boxShadow: aiStatus === 'checking' ? '0 0 8px #fb923c' : aiStatus === 'ready' ? '0 0 8px #22c55e' : '0 0 8px #ef4444'
                  }}
                />
                {aiStatus === 'checking' ? 'CHECKING AGENT...' : aiStatus === 'ready' ? 'AI AGENT ONLINE' : 'AI AGENT OFFLINE'}
              </span>
            </div>
          </div>

          {aiTranslateError && (
            <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-2 rounded-lg text-small font-semibold flex items-center justify-center gap-2 mb-4" style={{ marginTop: '-10px', marginBottom: '15px' }}>
              AI Unavailable — {aiTranslateError}
            </div>
          )}

          <div className="spl-input-row">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="spl-input"
              placeholder="service=acis-gateway | level=ERROR"
              spellCheck="false"
            />
            <div className="field-explorer">Field Explorer <span>⌄</span></div>
          </div>

          <div className="spl-buttons">
            <button onClick={fetchLogs} className="spl-btn run">▶ Run Search</button>
            <button onClick={handleExportCSV} className="spl-btn outline">⬇ Export CSV</button>
            <button onClick={handleSaveSearch} className="spl-btn outline">💾 Save Search</button>

            {savedSearches.length > 0 && (
              <div className="select-pill source-select-wrap" style={{ marginLeft: 'auto' }}>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      setQuery(e.target.value)
                      e.target.value = ''
                    }
                  }}
                >
                  <option value="">Load Saved...</option>
                  {savedSearches.map((s, idx) => (
                    <option key={idx} value={s}>
                      {s.length > 20 ? s.substring(0, 20) + '...' : s}
                    </option>
                  ))}
                </select>
                <span>⌄</span>
              </div>
            )}
          </div>
        </div>

        {/* Event Trend */}
        <div className="trend-panel">
          <div className="trend-head">
            <h3>Event Trend — By Minute</h3>
            <div className="ret">RETURNED {logs.length} EVENTS</div>
          </div>

          <div className="trend-body">
            <div className="chart-box">
              <div className="bars-chart">
                {/* Y Axis */}
                <div className="y-axis">
                  {yAxisValues.map((v, i) => (
                    <span key={i}>{v}</span>
                  ))}
                </div>

                {/* Grid Lines */}
                <div className="grid-lines">
                  {[0, 25, 50, 75].map((p, i) => (
                    <div key={i} style={{ top: `${p}%` }} />
                  ))}
                </div>

                {/* Bars Row */}
                <div className="bars-row">
                  {values.map((v, idx) => {
                    const heightPercent = (v / maxV) * 100
                    return (
                      <div
                        key={idx}
                        className="bar-col"
                        onMouseEnter={() => setHoveredIndex(idx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      >
                        <div className="bar" style={{ height: `${heightPercent}%` }} />
                        {hasTooltip(idx) && (
                          <div className="tooltip" style={{ left: '50%', top: '0' }}>
                            {getTooltipText(idx, v)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* X Labels */}
              <div className="x-labels">
                {times.map((t, idx) => (
                  <span key={idx}>{t}</span>
                ))}
              </div>
            </div>

            <div className="events-hour">
              <div className="l">Events (Past Hour):</div>
              <div className="v">{displayEventsCount}</div>
            </div>
          </div>
        </div>

        {/* Log Data */}
        <div className="log-panel">
          <div className="log-head">
            <h3>Log Data</h3>
            <div className="cols-btn">Columns: ⌄</div>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => handleSort('timestamp')}>
                    Timestamp {sortField === 'timestamp' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th className="sortable" onClick={() => handleSort('level')}>
                    Level {sortField === 'level' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th className="sortable" onClick={() => handleSort('service')}>
                    Service {sortField === 'service' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th className="sortable" onClick={() => handleSort('host')}>
                    Source_IP {sortField === 'host' ? (sortAsc ? '▲' : '▼') : '↕'}
                  </th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {sortedLogs.length > 0 ? (
                  sortedLogs.map((log, idx) => {
                    const formattedTime = log.timestamp
                      ? new Date(log.timestamp).toLocaleTimeString()
                      : '---'
                    const lvlClass = `lvl-${(log.level || 'info').toLowerCase()}`
                    return (
                      <tr
                        key={log.id || idx}
                        style={{ cursor: 'pointer' }}
                        onClick={() => pivotTo('/dashboard/assets', { type: 'host', value: log.host || '' })}
                      >
                        <td>
                          <span className="chev-icon">›</span>
                          {formattedTime}
                        </td>
                        <td className={lvlClass}>
                          {(log.level || 'INFO').toUpperCase()}
                        </td>
                        <td className="mono-td">
                          {log.service || 'SYSTEM'}
                        </td>
                        <td className="mono-td">
                          {log.host || 'UNKNOWN'}
                        </td>
                        <td>
                          {log.message}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                      Scanning historical indexes...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
