import React, { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, ShieldAlert, Bell, Clock, User, Filter, RefreshCw, X, ChevronRight, Zap, Target, Search } from 'lucide-react'
import { AgGridReact } from 'ag-grid-react'
import { ColDef, GridApi } from 'ag-grid-community'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import { clsx } from 'clsx'

interface Alert {
  id: string
  severity: string
  source: string
  status: string
  ownerName: string
  createdAt: string
  updatedAt: string
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'ALERTS' | 'INCIDENTS'>('ALERTS')
  const [gridApi, setGridApi] = useState<GridApi | null>(null)
  
  const [isExplaining, setIsExplaining] = useState(false)
  const [aiExplanation, setAiExplanation] = useState<any>(null)
  const [demoMode, setDemoMode] = useState(false)

  const fetchAlerts = async () => {
    setIsLoading(true)
    try {
      const response = await apiClient.get('/api/alerts')
      setAlerts(response.data)
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAlerts()
    
    // Subscribe to new alerts via WebSocket
    const sub = wsClient.subscribe('/topic/alerts', (message) => {
      try {
        const newAlert = JSON.parse(message.body)
        setAlerts(prev => [newAlert, ...prev])
      } catch (e) {
        console.error('Malformed WebSocket message:', e)
        fetchAlerts() // Fallback to re-fetch
      }
    })
    
    return () => { 
        sub.then(s => s?.unsubscribe())
    }
  }, [])

  const onSelectionChanged = () => {
    const selectedRows = gridApi?.getSelectedRows()
    if (selectedRows && selectedRows.length > 0) {
      setSelectedAlert(selectedRows[0])
      setAiExplanation(null)
      setDemoMode(false)
    }
  }

  const handleExplain = async () => {
    if (!selectedAlert) return
    setIsExplaining(true)
    setDemoMode(false)
    try {
      const response = await apiClient.post(`/api/alerts/${selectedAlert.id}/explain`, { raw_alert: selectedAlert })
      setAiExplanation(response.data)
      if (response.headers['x-acis-ai-mode'] === 'mock') {
         setDemoMode(true)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsExplaining(false)
    }
  }

  const columnDefs = useMemo<ColDef[]>(() => [
    { 
      field: 'id', 
      headerName: 'ID', 
      width: 110,
      checkboxSelection: true,
      cellRenderer: (params: any) => (
        <span className="font-mono text-[11px] font-black text-accent tracking-tighter">{params.value}</span>
      )
    },
    { 
      field: 'title', 
      headerName: 'Detection Title', 
      flex: 1,
      cellRenderer: (params: any) => (
        <div className="flex flex-col py-2.5 leading-tight">
          <span className="font-black text-white text-xs tracking-tight uppercase line-clamp-1">{params.value}</span>
          <span className="text-[9px] text-text-muted font-bold uppercase tracking-[0.2em] mt-0.5">{params.data.source || 'INTERNAL'}</span>
        </div>
      )
    },
    { 
      field: 'severity', 
      headerName: 'Severity', 
      width: 120,
      cellRenderer: (params: any) => {
        const sev = params.value?.toUpperCase() || 'LOW'
        return (
          <div className={clsx(
            "px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2 border",
            sev === 'CRITICAL' ? "bg-danger/10 text-danger border-danger/20" :
            sev === 'HIGH' ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
            sev === 'MEDIUM' ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
            "bg-blue-500/10 text-blue-400 border-blue-500/20"
          )}>
            <div className={clsx("w-1 h-1 rounded-full", sev === 'CRITICAL' && "bg-danger animate-pulse")} />
            {sev}
          </div>
        )
      }
    },
    { 
      field: 'status', 
      headerName: 'Workflow State', 
      width: 140,
      cellRenderer: (params: any) => (
        <span className="text-[10px] font-black text-accent uppercase tracking-tighter bg-accent/5 px-2 py-1 rounded-md border border-accent/20 underline decoration-dotted underline-offset-4">
          {params.value || 'OPEN'}
        </span>
      )
    },
    { 
      field: 'ownerName', 
      headerName: 'Assignee', 
      width: 140,
      cellRenderer: (params: any) => (
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-surface-3 flex items-center justify-center border border-fire-border">
            <User className="w-3 h-3 text-text-secondary" />
          </div>
          <span className="text-[11px] font-bold text-text-secondary uppercase tracking-tight">{params.value || 'UNASSIGNED'}</span>
        </div>
      )
    },
    { 
      field: 'createdAt', 
      headerName: 'Detection Time', 
      width: 180,
      cellRenderer: (params: any) => (
        <div className="flex items-center gap-2 text-text-muted font-mono text-[10px] font-bold">
          <Clock className="w-3 h-3 opacity-50" />
          {params.value ? new Date(params.value).toISOString().replace('T', ' ').substring(0, 19) : '---'}
        </div>
      )
    }
  ], [])


  return (
    <div className="h-[calc(100vh-180px)] flex flex-col gap-6 animate-fade-in">
      {/* Module Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex bg-surface-2 p-1 rounded-xl border border-fire-border">
            <button 
              onClick={() => setActiveTab('ALERTS')}
              className={clsx(
                "px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all inline-flex items-center gap-2",
                activeTab === 'ALERTS' ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-text-muted hover:text-white"
              )}
            >
              Alerts <span className="opacity-50">• {alerts.length}</span>
            </button>
            <button 
              onClick={() => setActiveTab('INCIDENTS')}
              className={clsx(
                "px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all inline-flex items-center gap-2",
                activeTab === 'INCIDENTS' ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-text-muted hover:text-white"
              )}
            >
              Incidents <span className="opacity-50">• 5</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group overflow-hidden rounded-xl border border-fire-border bg-surface-2">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
             <input 
              type="text" 
              placeholder="FILTER ALERTS..." 
              className="bg-transparent pl-10 pr-4 py-2 text-[10px] font-bold uppercase tracking-widest placeholder:text-text-muted focus:outline-none w-64"
             />
          </div>
          <button onClick={fetchAlerts} className="btn-mission px-3">
            <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Main Grid Table */}
        <div className="flex-1 min-w-0 bg-surface border border-fire-border rounded-3xl overflow-hidden shadow-2xl">
          <div className="ag-theme-alpine ag-theme-acis w-full h-full">
            <AgGridReact
              rowData={alerts}
              columnDefs={columnDefs}
              animateRows={true}
              headerHeight={52}
              rowHeight={58}
              rowSelection="single"
              onGridReady={(params) => setGridApi(params.api)}
              onSelectionChanged={onSelectionChanged}
              overlayNoRowsTemplate="<span class='text-text-muted font-bold uppercase tracking-[0.2em] text-[10px]'>Scanning for threats...</span>"
            />
          </div>
        </div>

        {/* Detail Inspection Drawer (Right Side) */}
        {selectedAlert && (
          <div className="w-[450px] bg-surface-2 border border-fire-border rounded-3xl flex flex-col overflow-hidden animate-slide-in shadow-2xl">
            <div className="p-6 border-b border-fire-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-black text-accent">{selectedAlert.id}</span>
                <span className={clsx(
                  "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border",
                  selectedAlert.severity === 'CRITICAL' ? "bg-danger/10 text-danger border-danger/20" : "bg-warning/10 text-warning border-warning/20"
                )}>
                  {selectedAlert.severity}
                </span>
              </div>
              <button onClick={() => setSelectedAlert(null)} className="p-2 hover:bg-surface-3 rounded-xl transition-colors text-text-muted hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              <section>
                <h2 className="text-xl font-black text-white tracking-tight uppercase mb-2">{selectedAlert.title}</h2>
                <div className="flex items-center gap-4 text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                  <span>{new Date(selectedAlert.createdAt).toUTCString()}</span>
                  <span>•</span>
                  <span>Source: {selectedAlert.source}</span>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-[10px] font-black text-accent uppercase tracking-[0.3em]">Risk Indicators</h3>
                <div className="space-y-2">
                  {[
                    { label: '847 failed authentications in 60 seconds', icon: ShieldAlert, color: 'text-danger' },
                    { label: 'Source IP 10.0.12.44 — 1st appearance', icon: Target, color: 'text-warning' },
                    { label: 'Target: dc-prod-01 (Domain Controller)', icon: Zap, color: 'text-accent' }
                  ].map((risk, i) => (
                    <div key={i} className="flex items-start gap-4 p-4 bg-black/40 border-l-2 border-accent rounded-r-xl">
                      <risk.icon className={clsx("w-4 h-4 mt-0.5", risk.color)} />
                      <span className="text-xs font-bold text-white leading-tight">{risk.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                   <h3 className="text-[10px] font-black text-accent uppercase tracking-[0.3em]">AI Analysis</h3>
                   {isExplaining ? (
                     <span className="text-[10px] text-accent animate-pulse uppercase font-bold tracking-widest">Generating...</span>
                   ) : (
                     <button onClick={handleExplain} className="text-[9px] font-bold text-accent hover:text-white transition-colors uppercase tracking-widest border border-accent/30 rounded px-2 py-1 bg-accent/5">Explain Alert</button>
                   )}
                </div>
                
                {aiExplanation && (
                  <div className="bg-black p-5 rounded-2xl border border-accent/40 space-y-3">
                    {demoMode && (
                        <div className="bg-warning/20 border border-warning/50 text-warning px-3 py-1 rounded text-[10px] font-black uppercase flex items-center justify-center gap-2 mb-2 animate-pulse">
                            <AlertTriangle size={12} />
                            Demo Mode — Displaying simulated results
                        </div>
                    )}
                    <h4 className="text-xs font-black text-white uppercase">Analysis:</h4>
                    <p className="text-[11px] text-text-secondary leading-relaxed">{aiExplanation.explanation}</p>
                    <h4 className="text-xs font-black text-white uppercase mt-4">Recommended Action:</h4>
                    <p className="text-[11px] text-text-secondary leading-relaxed text-accent">{aiExplanation.recommended_action}</p>
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                   <h3 className="text-[10px] font-black text-accent uppercase tracking-[0.3em]">Raw Event (Sample)</h3>
                   <button className="text-[9px] font-bold text-text-muted hover:text-white transition-colors uppercase tracking-widest">Copy JSON</button>
                </div>
                <div className="bg-black p-5 rounded-2xl border border-fire-border">
                  <pre className="text-[11px] font-mono text-text-secondary overflow-x-auto selection:bg-accent selection:text-white">
                    {JSON.stringify({
                      eventId: 4625,
                      src_ip: "10.0.12.44",
                      user: "j.singh",
                      target: "dc-prod-01",
                      failures: 847,
                      window: "60s"
                    }, null, 2)}
                  </pre>
                </div>
              </section>
            </div>

            <div className="p-6 bg-black/20 border-t border-fire-border grid grid-cols-2 gap-3">
              <button className="btn-fire py-3">Assign to Me</button>
              <button onClick={() => {
                const runPb = async () => {
                  try {
                    const pbs = await apiClient.get('/api/soar/playbooks');
                    if (pbs.data && pbs.data.length > 0) {
                      await apiClient.post(`/api/soar/playbooks/${pbs.data[0].id}/execute`, { alertId: selectedAlert?.id });
                      alert(`Playbook '${pbs.data[0].name}' executed successfully!`);
                    } else {
                      alert('No playbooks found in backend.');
                    }
                  } catch(e) {
                    alert('Error executing playbook');
                  }
                };
                runPb();
              }} className="btn-mission py-3">Run Playbook</button>
              <button className="btn-mission col-span-2 py-2.5 text-[9px] opacity-70">Escalate to Tier 3</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
