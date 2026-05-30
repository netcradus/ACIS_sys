import React, { useState, useEffect, useMemo } from 'react'
import { Monitor, UserCircle2, Server, Laptop, Network, Cloud, Cpu, Plus, RefreshCw, Search, ShieldCheck, Database, HardDrive, Smartphone } from 'lucide-react'
import { AgGridReact } from 'ag-grid-react'
import { ColDef } from 'ag-grid-community'
import apiClient from '@/lib/apiClient'
import { clsx } from 'clsx'

interface Asset {
  id: string
  type: string
  owner: string
  criticality: string // HIGH, MEDIUM, LOW
  tags?: string[]
  ipAddresses?: string[]
  lastSeen: string
  status?: string // Optional derived field
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [gridApi, setGridApi] = useState<any>(null)

  const fetchAssets = async () => {
    setIsLoading(true)
    try {
      const response = await apiClient.get('/api/assets')
      setAssets(response.data)
    } catch (error) {
      console.error('Failed to fetch assets:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAssets()
  }, [])

  const onFilterChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    gridApi?.setGridOption('quickFilterText', e.target.value)
  }

  const columnDefs = useMemo<ColDef[]>(() => [
    { 
      field: 'name', 
      headerName: 'ASSET IDENTIFIER', 
      flex: 1,
      cellRenderer: (params: any) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-3 border border-fire-border flex items-center justify-center text-accent">
            {getTypeIcon(params.data.type)}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-black text-white text-xs tracking-tight uppercase">{params.value}</span>
            <span className="text-[9px] text-text-muted font-bold uppercase tracking-[0.2em]">{params.data.type || 'ENTITY'}</span>
          </div>
        </div>
      )
    },
    { 
      field: 'ipAddresses', 
      headerName: 'NETWORK INTERFACES', 
      width: 180,
      cellRenderer: (params: any) => (
        <div className="flex flex-wrap gap-1">
          {params.value && params.value.length > 0 ? (
            params.value.map((ip: string) => (
              <span key={ip} className="font-mono text-[10px] font-bold text-text-secondary bg-surface-3 px-1.5 rounded">{ip}</span>
            ))
          ) : (
            <span className="text-[9px] text-text-muted italic lowercase">no ip bound</span>
          )}
        </div>
      )
    },
    { 
      field: 'criticality', 
      headerName: 'RISK PROFILE', 
      width: 140, 
      cellRenderer: (params: any) => {
        const crit = params.value?.toUpperCase() || 'MEDIUM'
        return (
          <div className={clsx(
            "px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2 border",
            crit === 'HIGH' ? "bg-danger/10 text-danger border-danger/20" :
            crit === 'MEDIUM' ? "bg-warning/10 text-warning border-warning/20" :
            "bg-blue-500/10 text-blue-400 border-blue-500/20"
          )}>
            <div className={clsx("w-1 h-1 rounded-full", crit === 'HIGH' && "bg-danger animate-pulse")} />
            {crit}
          </div>
        )
      }
    },
    { 
      field: 'owner', 
      headerName: 'CUSTODIAN', 
      width: 160,
      cellRenderer: (params: any) => (
        <div className="flex items-center gap-2">
          <UserCircle2 className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] font-bold text-text-secondary uppercase tracking-[0.05em]">{params.value || 'SYSTEM_OWNED'}</span>
        </div>
      )
    },
    { 
      field: 'lastSeen', 
      headerName: 'LAST SIGNAL', 
      width: 180,
      cellRenderer: (params: any) => (
        <span className="text-text-muted font-mono text-[10px] font-bold">
          {params.value ? new Date(params.value).toISOString().replace('T', ' ').substring(0, 19) : 'NEVER'}
        </span>
      )
    }
  ], [])


  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'SERVER': return <Server className="w-4 h-4" />
      case 'WORKSTATION': return <Laptop className="w-4 h-4" />
      case 'NETWORK_DEVICE': return <Network className="w-4 h-4" />
      case 'CLOUD_INSTANCE': return <Cloud className="w-4 h-4" />
      case 'DATABASE': return <Database className="w-4 h-4" />
      case 'STORAGE': return <HardDrive className="w-4 h-4" />
      case 'MOBILE': return <Smartphone className="w-4 h-4" />
      default: return <Monitor className="w-4 h-4" />
    }
  }

  return (
    <div className="space-y-8 animate-fade-in flex flex-col h-full bg-black">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
           <div className="flex items-center gap-3 mb-2">
             <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-accent-glow">
                <Database className="w-6 h-6" />
             </div>
             <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Resource Inventory</h1>
           </div>
           <p className="text-[10px] text-text-secondary font-bold tracking-[0.4em] uppercase">Unified IT / Security Asset Intelligence</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group overflow-hidden rounded-xl border border-fire-border bg-surface-2">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
             <input 
              type="text" 
              placeholder="SEARCH ENTITIES..." 
              onChange={onFilterChanged}
              className="bg-transparent pl-10 pr-4 py-2.5 text-[10px] font-bold uppercase tracking-widest placeholder:text-text-muted focus:outline-none w-72"
             />
          </div>
          <button onClick={fetchAssets} className="btn-mission px-3">
            <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
          </button>

          <button className="btn-fire">
            <Plus className="w-4 h-4" /> REGISTER NODE
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Managed Nodes', value: assets.length, icon: <Cpu />, color: 'text-accent' },
          { label: 'Unsecured Assets', value: 0, icon: <Network />, color: 'text-danger' },
          { label: 'Identity Mappings', value: assets.length, icon: <UserCircle2 />, color: 'text-info' },
          { label: 'Verified Integrity', value: '100%', icon: <ShieldCheck />, color: 'text-success' }
        ].map((stat, i) => (
          <div key={i} className="card-mission bg-surface-2 group hover:border-accent/30">
            <div className="flex items-center gap-4">
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

      <div className="flex-1 min-h-0 bg-surface border border-fire-border rounded-3xl overflow-hidden shadow-2xl relative">
        <div className="ag-theme-alpine ag-theme-acis w-full h-full">
          <AgGridReact
            rowData={assets}
            columnDefs={columnDefs}
            animateRows={true}
            headerHeight={52}
            rowHeight={64}
            onGridReady={(params) => setGridApi(params.api)}
            overlayNoRowsTemplate="<span class='text-text-muted font-black uppercase tracking-[0.2em] text-[10px]'>Zero assets discovered in current zone.</span>"
          />
        </div>

      </div>
    </div>
  )
}
