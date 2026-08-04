import React, { useState, useEffect, useRef, useMemo } from 'react'
import { ShieldCheck, FileSearch, Clock, Play, Pause, Trash2, Download, Search, Filter, Save, FileText, ChevronRight, Activity, Zap } from 'lucide-react'
import { AgGridReact } from 'ag-grid-react'
import { ColDef } from 'ag-grid-community'
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import { LogEntry, LogSearchFilters } from '@/types/log'
import { clsx } from 'clsx'
import { useChartColors } from '@/hooks/useChartColors'

export default function LogExplorerPage() {
  const chartColors = useChartColors()
  const [logs, setLogs] = useState<LogEntry[]>([])

  const [selectedSource, setSelectedSource] = useState('ALL')
  const [isLive, setIsLive] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [query, setQuery] = useState('service=acis-gateway | level=ERROR')

  const handleSourceChange = (src: string) => {
    setSelectedSource(src)
    if (src === 'ALL') {
      setQuery('')
    } else {
      setQuery(`service=${src}`)
    }
  }
  const [gridApi, setGridApi] = useState<any>(null)

  const [isTranslating, setIsTranslating] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [aiStatus, setAiStatus] = useState<'checking' | 'ready' | 'offline'>('checking')
  const [savedSearches, setSavedSearches] = useState<string[]>([])

  const columnDefs = useMemo<ColDef[]>(() => [
    {
      field: 'timestamp',
      headerName: '_TIME',
      sort: 'desc',
      width: 220,
      cellRenderer: (params: any) => (
        <span className="font-mono text-label text-text-muted">
          {params.value ? new Date(params.value).toISOString().replace('T', ' ').substring(0, 19) : '---'}
        </span>
      )
    },
    {
      field: 'message',
      headerName: 'RAW_MESSAGE',
      flex: 1,
      minWidth: 400,
      cellRenderer: (params: any) => (
        <span className="font-mono text-small font-medium text-text-primary line-clamp-1">{params.value}</span>
      )
    },
    {
      field: 'service',
      headerName: 'SERVICE_NODE',
      width: 160,
      cellRenderer: (params: any) => (
        <span className="font-mono text-label text-accent uppercase bg-accent/10 px-2 py-0.5 rounded border border-accent/20">{params.value || 'SYSTEM'}</span>
      )
    },
    {
      field: 'host',
      headerName: 'SOURCE_HOST',
      width: 180,
      cellRenderer: (params: any) => (
        <span className="font-mono text-label text-text-secondary uppercase bg-surface-3 px-2 py-0.5 rounded border border-fire-border">{params.value || 'UNKNOWN'}</span>
      )
    },
    {
      field: 'level',
      headerName: 'CRITICALITY',
      width: 140,
      cellRenderer: (params: any) => (
        <div className={clsx(
          "px-2 py-0.5 rounded text-label uppercase border border-current inline-block",
          ['ERROR', 'CRITICAL', 'FATAL'].includes(params.value?.toUpperCase()) ? "text-danger" : "text-info opacity-60"
        )}>
          {params.value || 'INFO'}
        </div>
      )
    },
    {
      field: 'assetName',
      headerName: 'ENRICHED_ASSET',
      width: 180,
      cellRenderer: (params: any) => (
        <div className="flex flex-col leading-none">
          <span className="text-label text-text-primary uppercase">{params.value || 'UNKNOWN'}</span>
          <span className="text-label text-text-muted mt-1 uppercase">{params.data.assetType || 'UNMAPPED'}</span>
        </div>
      )
    },
    {
      field: 'threatSeverity',
      headerName: 'THREAT_SIG',
      width: 120,
      cellRenderer: (params: any) => (
        params.value ? (
          <div className="flex items-center gap-2 text-danger animate-pulse">
            <Zap className="w-3 h-3" />
            <span className="text-label uppercase">{params.value}</span>
          </div>
        ) : (
          <ShieldCheck className="w-3.5 h-3.5 text-success opacity-20" />
        )
      )
    }
  ], [])

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
    setIsLive(false) // Manual run stops the live tail
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
    setDemoMode(false)
    try {
      const response = await apiClient.post('/api/logs/translate', { query })
      if (response.data.spl) {
        setQuery(response.data.spl)
      }
      if (response.headers['x-acis-ai-mode'] === 'mock') {
        setDemoMode(true)
      }
    } catch (e) {
      console.error('NLP Translation failed', e)
    } finally {
      setIsTranslating(false)
    }
  }

  const fetchLatest = async () => {
    try {
      const response = await apiClient.get<LogEntry[]>('/api/logs/latest')
      setLogs(response.data)
    } catch (e) {
      console.error('Failed to fetch latest logs:', e)
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
          setLogs(prev => [newLog, ...prev.slice(0, 499)]) // Buffer limited to 500 for reactivity
        } catch (e) {
          console.error('Log stream parse error:', e)
        }
      }, '/ws/logs')
    } else {
      fetchLogs()
    }
    return () => { if (sub) sub.then((s: any) => s?.unsubscribe()) }
  }, [isLive, selectedSource])


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
      .slice(-30)
      .map(([time, count]) => ({ time, count }))
  }, [logs])

  return (
    <div className="space-y-6 animate-fade-in flex flex-col min-h-[calc(100vh-160px)]">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-h1 text-text-primary">Log Explorer (SPL)</h1>
          <p className="text-small text-text-secondary mt-1">Elastic Telemetry & Multi-Source Indexing</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Source Dropdown Filter */}
          <div className="flex items-center bg-surface-2 px-4 py-2 rounded-full border border-fire-border gap-2">
            <Filter size={12} className="text-accent" />
            <select
              value={selectedSource}
              onChange={(e) => handleSourceChange(e.target.value)}
              className="bg-transparent text-small font-medium text-text-primary focus:outline-none cursor-pointer pr-3"
            >
              <option value="ALL" className="bg-surface text-text-primary">All Sources</option>
              <option value="firewall" className="bg-surface text-text-primary">Firewall</option>
              <option value="ids-ips" className="bg-surface text-text-primary">IDS/IPS</option>
              <option value="netcradus-waf" className="bg-surface text-text-primary">WAF</option>
              <option value="acis-gateway" className="bg-surface text-text-primary">Gateway</option>
              <option value="auth-service" className="bg-surface text-text-primary">Auth Service</option>
            </select>
          </div>

          <div className="flex bg-surface-2 p-1 rounded-full border border-fire-border">
            <button
              onClick={() => setIsLive(true)}
              className={clsx(
                "px-5 py-2 rounded-full text-small font-semibold transition-all inline-flex items-center gap-2",
                isLive ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
              )}
            >
              Live Stream
            </button>
            <button
              onClick={() => setIsLive(false)}
              className={clsx(
                "px-5 py-2 rounded-full text-small font-semibold transition-all inline-flex items-center gap-2",
                !isLive ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
              )}
            >
              Forensic Search
            </button>
          </div>
        </div>
      </div>

      {/* SPL Search Processor */}
      <div className="card-mission relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-0 group-focus-within:opacity-100 transition-opacity" />
        <div className="flex items-center justify-between mb-4">
          <span className="text-label text-text-muted uppercase">Search Processing — SPL-Like Pipeline</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTranslate}
              disabled={isTranslating || aiStatus !== 'ready'}
              className="flex items-center gap-2 bg-accent/10 px-3 py-1 rounded border border-accent/30 text-label text-accent uppercase hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTranslating ? 'Translating...' : 'Translate English to SPL'}
            </button>
            <div className={clsx(
              "w-1.5 h-1.5 rounded-full animate-pulse ml-2",
              aiStatus === 'checking' ? "bg-warning" :
              aiStatus === 'ready' ? "bg-success" : "bg-danger"
            )} />
            <span className={clsx(
              "text-label uppercase",
              aiStatus === 'checking' ? "text-warning" :
              aiStatus === 'ready' ? "text-success" : "text-danger"
            )}>
              {aiStatus === 'checking' ? 'Checking AI Agent...' :
               aiStatus === 'ready' ? 'AI Agent Ready' : 'AI Agent Offline'}
            </span>
          </div>
        </div>

        {demoMode && (
          <div className="bg-warning/10 border border-warning/30 text-warning px-4 py-2 rounded-lg text-small font-semibold flex items-center justify-center gap-2 mb-4">
            <ShieldCheck size={16} />
            Demo Mode — AI key not configured. Displaying simulated SPL.
          </div>
        )}

        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-24 bg-background border border-fire-border rounded-lg p-4 font-mono text-small text-text-secondary focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 placeholder:text-text-muted resize-none leading-relaxed selection:bg-accent selection:text-white transition-colors"
          spellCheck="false"
        />

        <div className="flex items-center gap-3 mt-6">
          <button onClick={fetchLogs} className="btn-fire min-w-[140px]">
            <Play className="w-4 h-4 fill-white" /> Run Search
          </button>
          <button onClick={handleExportCSV} className="btn-mission">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={handleSaveSearch} className="btn-mission">
            <Save className="w-4 h-4" /> Save Search
          </button>

          {savedSearches.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-label text-text-secondary uppercase">Saved:</span>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    setQuery(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="bg-surface border border-fire-border px-3 py-1.5 rounded-lg text-small font-medium text-text-secondary focus:outline-none cursor-pointer max-w-[200px]"
              >
                <option value="">Load Saved Search...</option>
                {savedSearches.map((s, idx) => (
                  <option key={idx} value={s}>
                    {s.length > 30 ? s.substring(0, 30) + '...' : s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Event Trend Chart */}
      <div className="card-mission">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-h3 text-text-primary">Event Trend — By Minute</h3>
          <span className="text-label text-success uppercase tabular-nums">Returned {logs.length.toLocaleString()} events</span>
        </div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} vertical={false} />
              <XAxis dataKey="time" stroke={chartColors.textMuted} fontSize={9} axisLine={false} tickLine={false} tickMargin={10} />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}
                contentStyle={{ backgroundColor: chartColors.surface2, border: `1px solid ${chartColors.border}`, borderRadius: '8px' }}
              />
              <Bar dataKey="count" fill={chartColors.accent} radius={[2, 2, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data Grid Table */}
      <div className="flex-1 min-h-[500px] bg-surface border border-fire-border rounded-xl overflow-hidden shadow-card relative">
        <div className="ag-theme-acis w-full h-full">
          <AgGridReact
            rowData={logs}
            columnDefs={columnDefs}
            animateRows={true}
            headerHeight={44}
            rowHeight={44}
            rowSelection="multiple"
            overlayNoRowsTemplate="<span class='text-text-muted text-label uppercase'>Scanning historical indexes...</span>"
          />
        </div>
      </div>
    </div>
  )
}
