import React, { useEffect, useState, useMemo } from 'react'
import { Server, Cpu, Shield, ShieldAlert, ShieldCheck, Activity, RefreshCw, Search } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'

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

interface AgentEndpointView {
  id: string
  agentId: string
  hostname: string
  os: string
  ipAddress: string
  agentVersion: string
  status: 'ONLINE' | 'OFFLINE'
}

export default function EndpointsPage() {
  const canWrite = useCanWrite(MODULES.ASSETS_THREAT_INTEL)
  const [endpoints, setEndpoints] = useState<Asset[]>([])
  const [agents, setAgents] = useState<AgentEndpointView[]>([])
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

  const fetchAgents = async () => {
    try {
      const response = await apiClient.get('/api/soar/settings/agents')
      setAgents(response.data || [])
    } catch (err) {
      console.error("Failed to fetch agent fleet", err)
    }
  }

  useEffect(() => {
    fetchEndpoints()
    fetchAgents()
    const interval = setInterval(() => {
      fetchEndpoints()
      fetchAgents()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  /** Real deployed-agent record for this endpoint, matched by IP (the field
   * both Asset and the heartbeat-reported AgentEndpoint reliably carry) or
   * hostname — no agent enrolled means no agent record, shown honestly
   * rather than guessed from the asset's name. */
  const agentForEndpoint = (ep: Asset) =>
    agents.find(a => (ep.ipAddress && a.ipAddress === ep.ipAddress) || a.hostname?.toLowerCase() === ep.name.toLowerCase())

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

  // Clear a real DEGRADED flag (set by the backend's drift detector once the
  // correlated high-severity alert has been triaged/resolved).
  const handleRollback = async (id: string) => {
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
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Live Stats calculations
  const totalCount = endpoints.length
  const healthyCount = endpoints.filter(ep => ep.health === 'OK' && ep.status === 'ACTIVE').length
  const degradedCount = endpoints.filter(ep => ep.health === 'DEGRADED').length
  const quarantinedCount = endpoints.filter(ep => ep.status === 'INACTIVE' || ep.isolationStatus).length
  const pendingRollbackCount = endpoints.filter(ep => ep.health === 'DEGRADED').length

  const filteredEndpoints = useMemo(() => {
    return endpoints.filter(ep => ep.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [endpoints, searchTerm])

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full text-text-secondary min-h-screen">

      {/* Search Header */}
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <h1 className="text-h1 text-text-primary">Endpoints & Network — Self-Healing</h1>
        <div className="relative w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search endpoints..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Stats Cards Layout (5 Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Endpoints', value: totalCount.toLocaleString(), border: 'border-fire-border' },
          { label: 'Healthy', value: healthyCount.toLocaleString(), border: 'border-l-4 border-l-success' },
          { label: 'Degraded', value: degradedCount.toLocaleString(), border: 'border-l-4 border-l-severity-medium' },
          { label: 'Quarantined', value: quarantinedCount.toLocaleString(), border: 'border-l-4 border-l-danger' },
          { label: 'Pending Rollback', value: pendingRollbackCount.toLocaleString(), border: 'border-l-4 border-l-text-muted' }
        ].map((stat, i) => (
          <div key={i} className={clsx("bg-surface-2 border border-fire-border rounded-lg p-4 flex flex-col justify-between h-24 shadow-sm", stat.border)}>
            <span className="text-h1 text-text-primary leading-none tabular-nums">{stat.value}</span>
            <span className="text-label text-text-muted uppercase mt-2">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Table Section */}
      <div className="card-mission space-y-4">

        {/* Section Header */}
        <div className="flex items-center justify-between border-b border-fire-border pb-3">
          <div>
            <h2 className="text-h3 text-text-primary">Self-Healing Status</h2>
            <p className="text-label text-text-muted mt-1 uppercase">Auto-isolation • rollback • policy drift repair</p>
          </div>
          <button
            onClick={handleRollbackAll}
            className="btn-fire text-small py-2 px-4"
          >
            Rollback All Pending
          </button>
        </div>

        {/* Endpoints Table */}
        <div className="overflow-x-auto">
          <table className="table-enterprise">
            <thead>
              <tr>
                <th className="w-[22%]">Endpoint</th>
                <th className="w-[13%]">Health</th>
                <th className="w-[10%]">Isolation</th>
                <th className="w-[15%]">Agent Status</th>
                <th className="w-[15%]">Agent Ver</th>
                <th className="w-[25%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEndpoints.map(ep => {
                const isIsolated = ep.status === 'INACTIVE' || ep.isolationStatus
                const health = isIsolated ? 'Quarantined' : ep.health === 'DEGRADED' ? 'Degraded' : 'OK'
                const agent = agentForEndpoint(ep)

                return (
                  <tr key={ep.id}>
                    <td className="font-semibold text-text-secondary">
                      {ep.name}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={clsx(
                          "w-1.5 h-1.5 rounded-full inline-block",
                          health === 'OK' ? "bg-success" :
                          health === 'Degraded' ? "bg-severity-medium animate-pulse" : "bg-danger animate-ping"
                        )} />
                        <span className={clsx(
                          "text-label uppercase",
                          health === 'OK' ? "text-success" :
                          health === 'Degraded' ? "text-severity-medium" : "text-danger"
                        )}>
                          {health}
                        </span>
                      </div>
                    </td>
                    <td className="font-medium">
                      <span className={clsx(
                        isIsolated ? "text-danger" : "text-text-muted"
                      )}>
                        {isIsolated ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="font-mono font-medium">
                      {agent ? (
                        <span className={clsx(agent.status === 'ONLINE' ? "text-success" : "text-danger")}>
                          {agent.status}
                        </span>
                      ) : (
                        <span className="text-text-muted">Not Enrolled</span>
                      )}
                    </td>
                    <td className="text-text-secondary font-mono">
                      {agent?.agentVersion || '—'}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isIsolated ? (
                          <button
                            onClick={() => handleRelease(ep.id)}
                            disabled={processingId === ep.id || !canWrite}
                            title={!canWrite ? "Your role doesn't have write access to Assets & Threat Intel" : undefined}
                            className="border border-success/30 bg-success/10 hover:bg-success/20 text-success font-semibold px-3 py-1.5 rounded-lg text-label uppercase transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Release
                          </button>
                        ) : ep.health === 'DEGRADED' ? (
                          <button
                            onClick={() => handleRollback(ep.id)}
                            disabled={processingId === ep.id || !canWrite}
                            title={!canWrite ? "Your role doesn't have write access to Assets & Threat Intel" : undefined}
                            className="border border-severity-high/30 bg-severity-high/10 hover:bg-severity-high/20 text-severity-high font-semibold px-3 py-1.5 rounded-lg text-label uppercase transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Clear & Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => handleIsolate(ep.id)}
                            disabled={processingId === ep.id || !canWrite}
                            title={!canWrite ? "Your role doesn't have write access to Assets & Threat Intel" : undefined}
                            className="border border-danger/30 bg-danger/10 hover:bg-danger/20 text-danger font-semibold px-3 py-1.5 rounded-lg text-label uppercase transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <td colSpan={6} className="py-12 text-center text-text-muted text-label uppercase">
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
