import React, { useState, useEffect, useMemo } from 'react'
import { Layers, Plus, Search, Activity, Trash2, Power, Code2, ShieldCheck, RefreshCw, AlertCircle, Database, Zap } from 'lucide-react'
import { AgGridReact } from 'ag-grid-react'
import { ColDef } from 'ag-grid-community'
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
  lastRunAt: string
}

export default function CorrelationPage() {
  const [rules, setRules] = useState<CorrelationRule[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [gridApi, setGridApi] = useState<any>(null)

  const fetchRules = async () => {
    setIsLoading(true)
    try {
      const response = await apiClient.get('/api/correlation/rules')
      setRules(response.data)
    } catch (error) {
      console.error('Failed to fetch correlation rules:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleRule = async (id: string) => {
    try {
      await apiClient.put(`/api/correlation/rules/${id}/toggle`)
      // Optimistic update for better UX
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
    } catch (error) {
      console.error('Failed to toggle rule:', error)
      fetchRules() // Rollback
    }
  }

  useEffect(() => {
    fetchRules()
  }, [])

  const onFilterChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    gridApi?.setGridOption('quickFilterText', e.target.value)
  }

  const columnDefs = useMemo<ColDef[]>(() => [
    { 
      field: 'name', 
      headerName: 'DETECTION LOGIC NAME', 
      flex: 1,
      cellRenderer: (params: any) => (
        <div className="flex flex-col py-2.5 leading-tight">
          <span className="font-black text-white text-xs tracking-tight uppercase">{params.value}</span>
          <span className="text-[9px] text-text-muted font-bold uppercase tracking-[0.2em] mt-0.5 truncate max-w-xs">{params.data.description}</span>
        </div>
      )
    },
    { 
      field: 'splQuery', 
      headerName: 'SPL QUERY STRING', 
      width: 280,
      cellRenderer: (params: any) => (
        <div className="flex items-center gap-2 font-mono text-[10px] text-accent/80 bg-accent/5 px-2.5 py-1.5 rounded-lg border border-accent/20 overflow-hidden">
          <Code2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate tracking-tighter">{params.value}</span>
        </div>
      )
    },
    { 
      field: 'severity', 
      headerName: 'ALERT SEVERITY', 
      width: 130,
      cellRenderer: (params: any) => {
        const sev = params.value?.toUpperCase() || 'MEDIUM'
        return (
          <div className={clsx(
            "px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2 border",
            sev === 'CRITICAL' ? "bg-danger/10 text-danger border-danger/20" :
            sev === 'HIGH' ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
            sev === 'MEDIUM' ? "bg-warning/10 text-warning border-warning/20" :
            "bg-blue-500/10 text-blue-400 border-blue-500/20"
          )}>
            {sev}
          </div>
        )
      }
    },
    { 
      field: 'riskScore', 
      headerName: 'RISK SCORE', 
      width: 110,
      cellRenderer: (params: any) => (
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-1.5 bg-black border border-fire-border rounded-full overflow-hidden">
            <div 
              className={clsx("h-full rounded-full transition-all duration-1000", params.value > 70 ? "bg-danger shadow-lg shadow-danger/20" : "bg-accent shadow-accent-glow")} 
              style={{ width: `${params.value}%` }} 
            />
          </div>
          <span className="text-[10px] font-mono font-black text-white tabular-nums">{params.value}</span>
        </div>
      )
    },
    { 
      field: 'enabled', 
      headerName: 'LOGIC STATUS', 
      width: 140,
      cellRenderer: (params: any) => (
        <button 
          onClick={() => toggleRule(params.data.id)}
          className={clsx(
            "px-3 py-1.5 rounded-xl flex items-center gap-2.5 transition-all border",
            params.value 
              ? "text-success bg-success/5 border-success/20 hover:bg-success/10" 
              : "text-text-muted bg-white/5 border-fire-border hover:bg-white/10 hover:text-white"
          )}
        >
          <Power className={clsx("w-3 h-3", params.value && "shadow-success-glow")} />
          <span className="text-[10px] font-black uppercase tracking-widest">{params.value ? 'Active' : 'Standby'}</span>
        </button>
      )
    },
    { 
      field: 'lastRunAt', 
      headerName: 'LAST SCAN CYCLE', 
      width: 180,
      cellRenderer: (params: any) => (
        <div className="flex items-center gap-2 text-text-muted font-mono text-[10px] font-bold">
           <Activity className="w-3.5 h-3.5 opacity-50" />
           {params.value ? new Date(params.value).toISOString().replace('T', ' ').substring(0, 19) : 'IDLE_PENDING'}
        </div>
      )
    }
  ], [])

  return (
    <div className="space-y-8 animate-fade-in flex flex-col h-full bg-black">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
           <div className="flex items-center gap-3 mb-2">
             <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-accent-glow">
                <Layers className="w-6 h-6" />
             </div>
             <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Detection Engineering</h1>
           </div>
           <p className="text-[10px] text-text-secondary font-bold tracking-[0.4em] uppercase">Correlation Search Engine & Behavioral Logic</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group overflow-hidden rounded-xl border border-fire-border bg-surface-2">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
             <input 
              type="text" 
              placeholder="FILTER LOGIC..." 
              onChange={onFilterChanged}
              className="bg-transparent pl-10 pr-4 py-2.5 text-[10px] font-bold uppercase tracking-widest placeholder:text-text-muted focus:outline-none w-72"
             />
          </div>
          <button onClick={fetchRules} className="btn-mission px-3">
            <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
          </button>

          <button className="btn-fire">
            <Plus className="w-4 h-4" /> CREATE RULE
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Active Logic Nodes', value: rules.filter(r => r.enabled).length, icon: <ShieldCheck />, color: 'text-success' },
          { label: 'Signals Correlated (24h)', value: 42, icon: <Zap />, color: 'text-accent' },
          { label: 'Coverage Gaps Identified', value: 3, icon: <AlertCircle />, color: 'text-warning' }
        ].map((stat, i) => (
          <div key={i} className="card-mission bg-surface-2 group hover:border-accent/30">
            <div className="flex items-center gap-5">
              <div className={clsx("p-4 rounded-2xl bg-black border border-fire-border transition-transform group-hover:scale-110", stat.color)}>
                {React.cloneElement(stat.icon as React.ReactElement, { className: 'w-6 h-6' })}
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-widest font-black">{stat.label}</p>
                <p className="text-2xl font-black text-white mt-1 tracking-tighter tabular-nums">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid Table */}
      <div className="flex-1 min-h-[400px] bg-surface border border-fire-border rounded-3xl overflow-hidden shadow-2xl relative">
        <div className="ag-theme-alpine ag-theme-acis w-full h-full">
          <AgGridReact
            rowData={rules}
            columnDefs={columnDefs}
            animateRows={true}
            headerHeight={52}
            rowHeight={65}
            onGridReady={(params) => setGridApi(params.api)}
            overlayNoRowsTemplate="<span class='text-text-muted font-black uppercase tracking-[0.2em] text-[10px]'>Zero detection logic active.</span>"
          />
        </div>

      </div>
    </div>
  )
}
