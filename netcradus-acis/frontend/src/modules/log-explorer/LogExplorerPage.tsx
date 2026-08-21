import React, { useState, useEffect, useMemo } from 'react'
import { ShieldCheck, Download, Save } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import keycloak from '@/lib/keycloak'
import { LogEntry, FieldSummary, SavedSearch } from '@/types/log'
import { clsx } from 'clsx'
import { usePivotSeed, useEntityPivot } from '@/hooks/useEntityPivot'
import { toast } from '@/store/toastStore'
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

export default function LogExplorerPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selectedSource, setSelectedSource] = useState('ALL')
  const [isLive, setIsLive] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [query, setQuery] = useState('service=acis-gateway | level=ERROR')

  const [isTranslating, setIsTranslating] = useState(false)
  const [aiTranslateError, setAiTranslateError] = useState<string | null>(null)
  const [aiStatus, setAiStatus] = useState<'checking' | 'ready' | 'offline'>('checking')
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [isSavingSearch, setIsSavingSearch] = useState(false)
  const [savedSearchesOpen, setSavedSearchesOpen] = useState(false)
  const [fieldExplorerOpen, setFieldExplorerOpen] = useState(false)
  const [fieldSummaries, setFieldSummaries] = useState<FieldSummary[]>([])
  const [isLoadingFields, setIsLoadingFields] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
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
      } else if (part.startsWith('assetName=')) {
        filters.assetName = part.replace('assetName=', '').trim()
      } else if (part.startsWith('assetType=')) {
        filters.assetType = part.replace('assetType=', '').trim()
      } else if (part.startsWith('threatSeverity=')) {
        filters.threatSeverity = part.replace('threatSeverity=', '').trim()
      } else if (part.startsWith('threatSource=')) {
        filters.threatSource = part.replace('threatSource=', '').trim()
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

  /**
   * Real server-side export — hits /api/logs/export with the CURRENT parsed
   * query filters, so the CSV always reflects a live, filter-matching query
   * (not whatever happened to already be sitting in the `logs` React state).
   * Raw fetch + Bearer token (not apiClient) since this is a binary blob
   * response, not JSON — same pattern as AuditLogsPage's downloadExport.
   */
  const handleExportCSV = async () => {
    setIsExporting(true)
    try {
      const filters = parseQuery(query)
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') params.set(k, String(v))
      })
      const url = `/api/logs/export?${params.toString()}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${keycloak.token}` } })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)

      const rowCount = res.headers.get('X-Export-Row-Count')
      const truncated = res.headers.get('X-Export-Truncated') === 'true'
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.setAttribute('download', `acis_logs_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)

      if (truncated) {
        toast.info(`Export capped at ${rowCount} rows — narrow your query to export the rest.`)
      } else {
        toast.success(`Exported ${rowCount ?? ''} log${rowCount === '1' ? '' : 's'} to CSV.`)
      }
    } catch (e: any) {
      console.error('Export failed:', e)
      toast.error(e?.message || 'Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  /** Real backend-persisted saved searches — see SavedSearchController. Personal to the current user, survives refresh/device switch. */
  const fetchSavedSearches = async () => {
    try {
      const response = await apiClient.get<SavedSearch[]>('/api/logs/saved-searches')
      setSavedSearches(response.data || [])
    } catch (e) {
      console.error('Failed to load saved searches:', e)
    }
  }

  const handleSaveSearch = async () => {
    if (!query.trim()) return
    const name = window.prompt('Name this search:')
    if (!name || !name.trim()) return
    setIsSavingSearch(true)
    try {
      await apiClient.post('/api/logs/saved-searches', { name: name.trim(), query: query.trim() })
      toast.success(`Saved search "${name.trim()}"`)
      await fetchSavedSearches()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save search')
    } finally {
      setIsSavingSearch(false)
    }
  }

  const handleLoadSaved = (saved: SavedSearch) => {
    setQuery(saved.query)
    setSavedSearchesOpen(false)
  }

  const handleDeleteSaved = async (e: React.MouseEvent, saved: SavedSearch) => {
    e.stopPropagation()
    try {
      await apiClient.delete(`/api/logs/saved-searches/${saved.id}`)
      setSavedSearches(prev => prev.filter(s => s.id !== saved.id))
      toast.success(`Deleted "${saved.name}"`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete saved search')
    }
  }

  /**
   * Real per-field top-value discovery — fetches /api/logs/fields scoped by
   * the CURRENT query's filters (not the tenant's whole unfiltered history),
   * so the values shown match what Run Search would actually return.
   */
  const toggleFieldExplorer = async () => {
    const next = !fieldExplorerOpen
    setFieldExplorerOpen(next)
    if (!next) return
    setIsLoadingFields(true)
    try {
      const filters = parseQuery(query)
      const response = await apiClient.get<FieldSummary[]>('/api/logs/fields', { params: filters })
      setFieldSummaries(response.data || [])
    } catch (e) {
      console.error('Failed to load fields:', e)
      setFieldSummaries([])
    } finally {
      setIsLoadingFields(false)
    }
  }

  const handleFieldValueClick = (field: string, value: string) => {
    const term = `${field}=${value}`
    setQuery(prev => {
      const trimmed = prev.trim()
      if (!trimmed) return term
      const parts = trimmed.split('|').map(p => p.trim())
      if (parts.includes(term)) return prev
      return `${trimmed} | ${term}`
    })
    setFieldExplorerOpen(false)
  }

  const fetchLogs = async () => {
    setIsLoading(true)
    setIsLive(false)
    setLogsError(null)
    try {
      const filters = parseQuery(query)
      // /api/logs/search now filters/sorts/paginates at the Elasticsearch
      // level (was fetching a tenant's whole log history into memory before
      // the production-readiness audit) - real content/totalElements envelope.
      const response = await apiClient.get<{ content: LogEntry[]; totalElements: number }>('/api/logs/search', { params: { ...filters, size: 200 } })
      setLogs(response.data?.content || [])
    } catch (error: any) {
      console.error('Failed to fetch logs:', error)
      setLogs([])
      setLogsError(error?.message || 'Unable to load logs. Please try again.')
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

    fetchSavedSearches()

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let sub: any = null
    if (isLive) {
      const loadLiveLogs = async () => {
        try {
          const params: Record<string, string | number> = selectedSource !== 'ALL' ? { service: selectedSource, size: 200 } : { size: 200 }
          const response = await apiClient.get<{ content: LogEntry[] }>('/api/logs/search', { params })
          setLogs(response.data?.content || [])
        } catch (e) {
          console.error('Failed to load initial live logs:', e)
          toast.error('Unable to load live logs. Please try again.')
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

  const values = useMemo(() => trendData.map(d => d.count), [trendData])

  const times = useMemo(() => trendData.map((d, i) => (i % 4 === 0 ? d.time : '')), [trendData])

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

  const hasTooltip = (idx: number) => hoveredIndex === idx

  const getTooltipText = (idx: number) => {
    if (hoveredIndex !== idx || !trendData[idx]) return ''
    return `${trendData[idx].time} - ${trendData[idx].count} Events`
  }

  const displayEventsCount = logs.length

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
            <div className="field-explorer-wrap">
              <div className="field-explorer" onClick={toggleFieldExplorer}>
                Field Explorer <span>{fieldExplorerOpen ? '⌃' : '⌄'}</span>
              </div>
              {fieldExplorerOpen && (
                <div className="field-explorer-panel">
                  {isLoadingFields ? (
                    <div className="field-explorer-empty">Discovering fields...</div>
                  ) : fieldSummaries.length === 0 ? (
                    <div className="field-explorer-empty">No field data for the current query.</div>
                  ) : (
                    fieldSummaries.map(fs => (
                      <div key={fs.field} className="field-group">
                        <div className="field-group-name">{fs.field}</div>
                        <div className="field-group-values">
                          {fs.topValues.length === 0 ? (
                            <span className="field-value-empty">No values</span>
                          ) : (
                            fs.topValues.map(tv => (
                              <span
                                key={tv.value}
                                className="field-value-chip"
                                onClick={() => handleFieldValueClick(fs.field, tv.value)}
                                title={`Filter ${fs.field}=${tv.value}`}
                              >
                                {tv.value} <span className="field-value-count">{tv.count}</span>
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="spl-buttons">
            <button onClick={fetchLogs} className="spl-btn run">▶ Run Search</button>
            <button onClick={handleExportCSV} className="spl-btn outline" disabled={isExporting} style={{ opacity: isExporting ? 0.6 : 1 }}>
              ⬇ {isExporting ? 'Exporting...' : 'Export CSV'}
            </button>
            <button onClick={handleSaveSearch} className="spl-btn outline" disabled={isSavingSearch} style={{ opacity: isSavingSearch ? 0.6 : 1 }}>
              💾 {isSavingSearch ? 'Saving...' : 'Save Search'}
            </button>

            {savedSearches.length > 0 && (
              <div className="saved-searches-wrap" style={{ marginLeft: 'auto' }}>
                <div className="select-pill source-select-wrap" onClick={() => setSavedSearchesOpen(o => !o)}>
                  <span>▽</span>
                  <span style={{ padding: '0 4px', cursor: 'pointer' }}>Load Saved ({savedSearches.length})</span>
                  <span>{savedSearchesOpen ? '⌃' : '⌄'}</span>
                </div>
                {savedSearchesOpen && (
                  <div className="saved-searches-panel">
                    {savedSearches.map(s => (
                      <div key={s.id} className="saved-search-row" onClick={() => handleLoadSaved(s)}>
                        <div className="saved-search-info">
                          <div className="saved-search-name">{s.name}</div>
                          <div className="saved-search-query">{s.query}</div>
                        </div>
                        <button
                          className="saved-search-delete"
                          onClick={(e) => handleDeleteSaved(e, s)}
                          title="Delete saved search"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
                            {getTooltipText(idx)}
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
                ) : isLoading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                      Scanning historical indexes...
                    </td>
                  </tr>
                ) : logsError ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                      <div className="flex flex-col items-center gap-2">
                        <span>Unable to load logs. Please try again.</span>
                        <button className="btn-mission text-small px-3 py-1.5" onClick={fetchLogs}>Retry</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                      No logs found for the current filters.
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
