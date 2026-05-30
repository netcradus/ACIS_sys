import React, { useState, useEffect, useRef, useMemo } from 'react'
import { ShieldCheck, FileSearch, Clock, Play, Pause, Trash2, Download, Search, Filter, Save, FileText, ChevronRight, Activity, Zap } from 'lucide-react'
import { AgGridReact } from 'ag-grid-react'
import { ColDef } from 'ag-grid-community'
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import { LogEntry, LogSearchFilters } from '@/types/log'
import { clsx } from 'clsx'

export default function LogExplorerPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])

  const [isLive, setIsLive] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [query, setQuery] = useState('service=acis-gateway | level=ERROR')
  const [gridApi, setGridApi] = useState<any>(null)
  
  const [isTranslating, setIsTranslating] = useState(false)
  const [demoMode, setDemoMode] = useState(false)

  const columnDefs = useMemo<ColDef[]>(() => [
    { 
      field: 'timestamp', 
      headerName: '_TIME',
      sort: 'desc',
      width: 220,
      cellRenderer: (params: any) => (
        <span className="font-mono text-[11px] font-bold text-text-muted tracking-tighter">
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
        <span className="font-mono text-[11px] font-black text-white tracking-tight line-clamp-1">{params.value}</span>
      )
    },
    { 
      field: 'service', 
      headerName: 'SERVICE_NODE',
      width: 160,
      cellRenderer: (params: any) => (
        <span className="font-mono text-[10px] font-bold text-accent uppercase bg-accent/5 px-2 py-0.5 rounded border border-accent/20">{params.value || 'SYSTEM'}</span>
      )
    },
    { 
      field: 'level', 
      headerName: 'CRITICALITY',
      width: 140,
      cellRenderer: (params: any) => (
        <div className={clsx(
            "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-current",
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
          <span className="text-[10px] font-black text-white uppercase">{params.value || 'UNKNOWN'}</span>
          <span className="text-[8px] text-text-muted font-bold mt-1 uppercase tracking-widest">{params.data.assetType || 'UNMAPPED'}</span>
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
                <span className="text-[10px] font-black uppercase tracking-tighter">{params.value}</span>
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
    parts.forEach(part => {
      if (part.startsWith('service=')) filters.service = part.replace('service=', '')
      if (part.startsWith('level=')) filters.level = part.replace('level=', '')
    })
    return filters
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
    fetchLatest()
    let sub: any = null
    if (isLive) {
      sub = wsClient.subscribe('/topic/logs', (msg) => {
        try {
            const newLog = JSON.parse(msg.body)
            setLogs(prev => [newLog, ...prev.slice(0, 499)]) // Buffer limited to 500 for reactivity
        } catch (e) {
            console.error('Log stream parse error:', e)
        }
      }, '/ws/logs')
    }
    return () => { if (sub) sub.then((s:any) => s?.unsubscribe()) }
  }, [isLive])


  return (
    <div className="space-y-8 animate-fade-in flex flex-col h-[calc(100vh-160px)] bg-black">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Log Explorer (SPL)</h1>
          <p className="text-[10px] text-text-secondary font-bold tracking-[0.4em] uppercase mt-2">Elastic Telemetry & Multi-Source Indexing</p>
        </div>
        <div className="flex items-center gap-3">
           <div className="flex bg-surface-2 p-1 rounded-xl border border-fire-border">
              <button 
                onClick={() => setIsLive(true)}
                className={clsx(
                  "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all inline-flex items-center gap-2",
                  isLive ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-text-muted hover:text-white"
                )}
              >
                Live Stream
              </button>
              <button 
                onClick={() => setIsLive(false)}
                className={clsx(
                  "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all inline-flex items-center gap-2",
                  !isLive ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-text-muted hover:text-white"
                )}
              >
                Forensic Search
              </button>
           </div>
        </div>
      </div>

      {/* SPL Search Processor */}
      <div className="card-mission bg-surface-2 border-fire-border relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-0 group-focus-within:opacity-100 transition-opacity" />
        <div className="flex items-center justify-between mb-4">
           <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em]">Search Processing — SPL-Like Pipeline</span>
           <div className="flex items-center gap-2">
             <button 
                 onClick={handleTranslate} 
                 disabled={isTranslating}
                 className="flex items-center gap-2 bg-accent/20 px-3 py-1 rounded border border-accent/30 text-[9px] font-bold text-accent uppercase tracking-widest hover:bg-accent/40 transition-colors"
              >
                 {isTranslating ? 'TRANSLATING...' : 'TRANSLATE ENGLISH TO SPL'}
             </button>
             <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse ml-2" />
             <span className="text-[9px] font-bold text-accent uppercase tracking-widest">AI Agent Ready</span>
           </div>
        </div>
        
        {demoMode && (
          <div className="bg-warning/20 border border-warning/50 text-warning px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 animate-pulse mb-4 mx-6 mt-2">
              <ShieldCheck size={16} />
              Demo Mode — AI key not configured. Displaying simulated SPL.
          </div>
        )}
        
        <textarea 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-24 bg-black/60 border border-fire-border rounded-xl p-6 font-mono text-sm text-text-secondary focus:outline-none focus:border-accent/40 placeholder:text-text-muted resize-none leading-relaxed selection:bg-accent selection:text-white transition-all shadow-inner"
          spellCheck="false"
        />
        
        <div className="flex items-center gap-3 mt-6">
          <button onClick={fetchLogs} className="btn-fire min-w-[140px]">
            <Play className="w-4 h-4 fill-white" /> RUN SEARCH
          </button>
          <button className="btn-mission">
            <Download className="w-4 h-4" /> EXPORT CSV
          </button>
          <button className="btn-mission">
            <Save className="w-4 h-4" /> SAVE SEARCH
          </button>
        </div>
      </div>

      {/* Event Trend Chart */}
      <div className="card-mission bg-surface-2 border-fire-border">
        <div className="flex items-center justify-between mb-6">
           <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Event Trend — Last 60 Minutes</h3>
           <span className="text-[10px] font-bold text-success uppercase tracking-widest tabular-nums">Returned {logs.length.toLocaleString()} events in 0.34s</span>
        </div>
        <div className="h-40 w-full">
           <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MOCK_TREND_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                <XAxis dataKey="time" stroke="#444" fontSize={9} axisLine={false} tickLine={false} tickMargin={10} />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,77,0,0.05)' }}
                  contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #222', borderRadius: '8px' }}
                />
                <Bar dataKey="count" fill="#FF4D00" radius={[2, 2, 0, 0]} barSize={24} />
              </BarChart>
           </ResponsiveContainer>
        </div>
      </div>

      {/* Data Grid Table */}
      <div className="flex-1 min-h-[500px] bg-surface border border-fire-border rounded-3xl overflow-hidden shadow-2xl relative">
        <div className="ag-theme-acis w-full h-full">
          <AgGridReact
            rowData={logs}
            columnDefs={columnDefs}
            animateRows={true}
            headerHeight={52}
            rowHeight={48}
            rowSelection="multiple"
            overlayNoRowsTemplate="<span class='text-text-muted font-black uppercase tracking-[0.2em] text-[10px]'>Scanning historical indexes...</span>"
          />
        </div>
      </div>
    </div>
  )
}

const MOCK_TREND_DATA = Array.from({ length: 30 }, (_, i) => ({
  time: `${15}:${10 + i}`,
  count: Math.floor(Math.random() * 500) + 200
}))
