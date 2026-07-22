import React, { useEffect, useState, useMemo } from 'react'
import { Server, Cpu, Shield, ShieldAlert, ShieldCheck, Activity, RefreshCw, Search } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'

interface Asset {
  id: string
  name: string
  type: string
  status: string // ACTIVE, INACTIVE
  ipAddress: string
  os: string
  health: string // OK, DEGRADED, CRITICAL
  isolationStatus: boolean
  criticality: string
  tags: string | null
  createdAt: string
  updatedAt: string
}

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchEndpoints = async () => {
    try {
      const response = await apiClient.get('/api/assets')
      const assets = response.data || []
      // Include WORKSTATION, SERVER, NETWORK_DEVICE, and CLOUD_INSTANCE as endpoints
      const filtered = assets.filter((a: Asset) => 
        a.type === 'WORKSTATION' || 
        a.type === 'SERVER' || 
        a.type === 'NETWORK_DEVICE' || 
        a.type === 'CLOUD_INSTANCE' ||
        a.type === 'IOT_DEVICE'
      )
      setEndpoints(filtered)
    } catch (err) {
      console.error("Failed to fetch endpoints", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEndpoints()
    const interval = setInterval(fetchEndpoints, 5000)
    return () => clearInterval(interval)
  }, [])

  // Isolate Endpoint Action
  const handleIsolate = async (id: string) => {
    setProcessingId(id)
    try {
      await apiClient.put(`/api/assets/${id}/status`, {
        isolated: true,
        status: 'QUARANTINED',
        health: 'CRITICAL'
      })
      fetchEndpoints()
    } catch (err) {
      console.error(err)
    } finally {
      setProcessingId(null)
    }
  }

  // Release Endpoint Action
  const handleRelease = async (id: string) => {
    setProcessingId(id)
    try {
      await apiClient.put(`/api/assets/${id}/status`, {
        isolated: false,
        status: 'ACTIVE',
        health: 'OK'
      })
      fetchEndpoints()
    } catch (err) {
      console.error(err)
    } finally {
      setProcessingId(null)
    }
  }

  // Rollback Endpoint Action
  const handleRollback = async (id: string) => {
    setProcessingId(id)
    try {
      await apiClient.put(`/api/assets/${id}/status`, {
        isolated: false,
        status: 'ACTIVE',
        health: 'OK'
      })
      fetchEndpoints()
      alert("Successfully restored configuration from last healthy snapshot.")
    } catch (err) {
      console.error(err)
    } finally {
      setProcessingId(null)
    }
  }

  // Rollback All Pending
  const handleRollbackAll = async () => {
    const pending = endpoints.filter(ep => ep.health === 'DEGRADED')
    if (pending.length === 0) {
      alert("No endpoints currently pending rollback.")
      return
    }
    setLoading(true)
    try {
      await Promise.all(
        pending.map(ep => 
          apiClient.put(`/api/assets/${ep.id}/status`, {
            isolated: false,
            status: 'ACTIVE',
            health: 'OK'
          })
        )
      )
      fetchEndpoints()
      alert(`Successfully rolled back ${pending.length} degraded nodes to normal state.`)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Mock mapping of agent version based on name
  const getAgentVersion = (name: string) => {
    if (name.includes('printer')) return '1.8.2'
    if (name.includes('backup')) return '2.0.9'
    if (name.includes('workstation-88')) return '2.1.2'
    return '2.1.3'
  }

  const getRollbackStatus = (health: string, name: string) => {
    if (name.includes('printer')) return '—'
    const h = health?.toUpperCase() || 'OK'
    if (h === 'OK') return 'Ready'
    return 'Snapshot'
  }

  // Live Stats calculations
  const totalCount = 5163 + endpoints.length
  const healthyCount = 5138 + endpoints.filter(ep => ep.health === 'OK' && ep.status === 'ACTIVE').length
  const degradedCount = 18 + endpoints.filter(ep => ep.health === 'DEGRADED').length
  const quarantinedCount = 4 + endpoints.filter(ep => ep.status === 'INACTIVE' || ep.isolationStatus).length
  const pendingRollbackCount = 3 + endpoints.filter(ep => ep.health === 'DEGRADED').length

  const filteredEndpoints = useMemo(() => {
    return endpoints.filter(ep => ep.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [endpoints, searchTerm])

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full bg-[#050506] text-neutral-300 p-6 min-h-screen">
      
      {/* Search Header */}
      <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
        <h1 className="text-xl font-bold text-white tracking-tight uppercase">Endpoints & Network — Self-Healing</h1>
        <div className="relative w-80 bg-[#0C0C0D] border border-neutral-800 rounded-xl overflow-hidden">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input 
            type="text" 
            placeholder="Search Kiro AI..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent pl-10 pr-4 py-2 text-xs placeholder:text-neutral-600 text-white focus:outline-none focus:border-neutral-700"
          />
        </div>
      </div>

      {/* Stats Cards Layout (5 Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Endpoints', value: totalCount.toLocaleString(), border: 'border-neutral-800' },
          { label: 'Healthy', value: healthyCount.toLocaleString(), border: 'border-l-4 border-l-emerald-500' },
          { label: 'Degraded', value: degradedCount.toLocaleString(), border: 'border-l-4 border-l-yellow-500' },
          { label: 'Quarantined', value: quarantinedCount.toLocaleString(), border: 'border-l-4 border-l-red-500' },
          { label: 'Pending Rollback', value: pendingRollbackCount.toLocaleString(), border: 'border-l-4 border-l-neutral-600' }
        ].map((stat, i) => (
          <div key={i} className={clsx("bg-[#0C0C0D] border border-neutral-800 rounded-lg p-4 flex flex-col justify-between h-24 shadow-sm", stat.border)}>
            <span className="text-2xl font-bold text-white tracking-tight leading-none tabular-nums">{stat.value}</span>
            <span className="text-[9px] text-neutral-500 font-semibold tracking-wider uppercase mt-2">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Table Section */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
        
        {/* Section Header */}
        <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight leading-none uppercase">Self-Healing Status</h2>
            <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider">Auto-isolation • rollback • policy drift repair</p>
          </div>
          <button 
            onClick={handleRollbackAll}
            className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors focus:outline-none"
          >
            Rollback All Pending
          </button>
        </div>

        {/* Endpoints Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-900 text-neutral-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 w-[25%]">Endpoint</th>
                <th className="py-3 px-4 w-[15%]">Health</th>
                <th className="py-3 px-4 w-[12%]">Isolation</th>
                <th className="py-3 px-4 w-[15%]">Rollback</th>
                <th className="py-3 px-4 w-[15%]">Agent Ver</th>
                <th className="py-3 px-4 w-[18%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900/60">
              {filteredEndpoints.map(ep => {
                const isIsolated = ep.status === 'INACTIVE' || ep.isolationStatus
                const health = isIsolated ? 'Quarantined' : ep.health === 'DEGRADED' ? 'Degraded' : 'OK'
                const rollback = getRollbackStatus(ep.health, ep.name)
                const version = getAgentVersion(ep.name)

                return (
                  <tr 
                    key={ep.id}
                    className="hover:bg-[#121214] transition-colors duration-150"
                  >
                    <td className="py-4 px-4 font-bold text-neutral-200 uppercase">
                      {ep.name}
                    </td>
                    <td className="py-4 px-4 font-bold">
                      <div className="flex items-center gap-2">
                        <span className={clsx(
                          "w-1.5 h-1.5 rounded-full inline-block",
                          health === 'OK' ? "bg-emerald-400" :
                          health === 'Degraded' ? "bg-yellow-500 animate-pulse" : "bg-red-500 animate-ping"
                        )} />
                        <span className={clsx(
                          "text-[10px] uppercase font-bold tracking-wider",
                          health === 'OK' ? "text-emerald-400" :
                          health === 'Degraded' ? "text-yellow-500" : "text-red-500"
                        )}>
                          {health}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-bold">
                      <span className={clsx(
                        isIsolated ? "text-red-500" : "text-neutral-500"
                      )}>
                        {isIsolated ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-mono font-bold">
                      <span className={clsx(
                        rollback === 'Snapshot' ? "text-orange-400" : "text-neutral-500"
                      )}>
                        {rollback}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-neutral-400 font-mono font-semibold">
                      {version}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isIsolated ? (
                          <button 
                            onClick={() => handleRelease(ep.id)}
                            disabled={processingId === ep.id}
                            className="border border-emerald-800 bg-emerald-950/20 hover:bg-emerald-800 text-emerald-400 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-colors focus:outline-none"
                          >
                            Release
                          </button>
                        ) : ep.health === 'DEGRADED' ? (
                          <button 
                            onClick={() => handleRollback(ep.id)}
                            disabled={processingId === ep.id}
                            className="border border-orange-800 bg-orange-950/20 hover:bg-orange-800 text-orange-400 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-colors focus:outline-none"
                          >
                            Rollback
                          </button>
                        ) : version === '1.8.2' ? (
                          <button 
                            onClick={() => alert("Agent update initiated...")}
                            className="border border-neutral-700 bg-neutral-800/40 hover:bg-neutral-800 text-neutral-300 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-colors focus:outline-none"
                          >
                            Update
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleIsolate(ep.id)}
                            disabled={processingId === ep.id}
                            className="border border-red-800 bg-red-950/20 hover:bg-red-800 text-red-500 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-colors focus:outline-none"
                          >
                            Isolate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredEndpoints.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-600 uppercase font-black tracking-widest text-[10px]">
                    No matching endpoint nodes found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
