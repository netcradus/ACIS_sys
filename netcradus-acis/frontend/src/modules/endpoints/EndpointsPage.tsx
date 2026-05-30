import React, { useEffect, useState } from 'react'
import { Server, Cpu, Shield, ShieldAlert, ShieldCheck, Activity, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'

interface Asset {
  id: string;
  name: string;
  type: string;
  status: string; // Active, Inactive, Quarantined
  ipAddress: string;
  os: string;
  criticality: string;
}

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [isolating, setIsolating] = useState<string | null>(null)

  const fetchEndpoints = async () => {
    try {
      const response = await apiClient.get('/api/assets')
      const assets = response.data || []
      // Filter only WORKSTATION or SERVER
      setEndpoints(assets.filter((a: Asset) => a.type === 'WORKSTATION' || a.type === 'SERVER'))
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

  const handleIsolate = async (id: string) => {
    setIsolating(id)
    try {
      await apiClient.put(`/api/assets/${id}/status`, { status: 'QUARANTINED', health: 'QUARANTINED', isolated: true })
      fetchEndpoints()
    } catch (err) {
      console.error(err)
    } finally {
      setIsolating(null)
    }
  }

  const handleRollback = async (id: string) => {
    try {
      await apiClient.put(`/api/assets/${id}/status`, { status: 'ACTIVE', health: 'OK', isolated: false })
      fetchEndpoints()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in bg-black pb-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Endpoints & Network</h1>
          <p className="text-[10px] text-text-secondary font-bold tracking-[0.4em] uppercase mt-2">Auto-isolation · rollback · policy drift repair</p>
        </div>
      </div>

      <div className="card-mission bg-surface-2 border-border/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Endpoint Name</th>
                <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Health</th>
                <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">OS / IP</th>
                <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Isolation</th>
                <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && endpoints.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-muted text-xs font-mono">Loading endpoints...</td>
                </tr>
              ) : endpoints.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-muted text-xs font-mono">No endpoints found.</td>
                </tr>
              ) : (
                endpoints.map((ep) => {
                  const isQuarantined = ep.status === 'QUARANTINED';
                  return (
                    <tr key={ep.id} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <Server className="w-4 h-4 text-accent" />
                          <span className="text-xs font-bold text-white tracking-tight uppercase">{ep.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          {isQuarantined ? (
                            <ShieldAlert className="w-4 h-4 text-danger" />
                          ) : (
                            <ShieldCheck className="w-4 h-4 text-success" />
                          )}
                          <span className={clsx(
                            "text-[10px] font-black uppercase tracking-widest",
                            isQuarantined ? "text-danger" : "text-success"
                          )}>
                            {isQuarantined ? 'Quarantined' : 'OK'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-white uppercase">{ep.os || 'Unknown OS'}</span>
                          <span className="text-[10px] font-mono text-text-muted">{ep.ipAddress || 'No IP'}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={clsx(
                          "text-[10px] font-black uppercase tracking-widest",
                          isQuarantined ? "text-danger" : "text-text-muted"
                        )}>
                          {isQuarantined ? 'Isolated' : 'No'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isQuarantined ? (
                            <button onClick={() => handleRollback(ep.id)} className="btn-mission py-1.5 px-3 text-[9px] flex items-center gap-1 border-success text-success hover:bg-success hover:text-black">
                              <RefreshCw className="w-3 h-3" /> ROLLBACK
                            </button>
                          ) : (
                            <button onClick={() => handleIsolate(ep.id)} disabled={isolating === ep.id} className="btn-mission py-1.5 px-3 text-[9px] flex items-center gap-1 border-danger text-danger hover:bg-danger hover:text-white">
                              {isolating === ep.id ? <Activity className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />} 
                              ISOLATE
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
