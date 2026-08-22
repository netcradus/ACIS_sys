import React, { useEffect, useState, useMemo } from 'react'
import { Server, Cpu, Shield, ShieldAlert, ShieldCheck, Activity, RefreshCw, Search } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { toast } from '@/store/toastStore'
import './EndpointsPage.css'

interface Asset {
  id: string
  name: string
  type: string
  status: string // ACTIVE, INACTIVE, QUARANTINED
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
  const [endpointsError, setEndpointsError] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentEndpointView[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)

  const [confirmTarget, setConfirmTarget] = useState<{ id: string; action: 'isolate' | 'release' | 'rollback' } | null>(null)
  const [confirmingRollbackAll, setConfirmingRollbackAll] = useState(false)
  const [rollbackAllBusy, setRollbackAllBusy] = useState(false)

  const fetchEndpoints = async () => {
    setEndpointsError(null)
    try {
      // /api/assets now returns a real paginated envelope (was unbounded
      // before the production-readiness audit).
      const response = await apiClient.get('/api/assets', { params: { size: 500 } })
      const assets = response.data?.content || []
      const filtered = assets.filter((a: Asset) =>
        a.type === 'WORKSTATION' ||
        a.type === 'SERVER' ||
        a.type === 'NETWORK_DEVICE' ||
        a.type === 'CLOUD_INSTANCE' ||
        a.type === 'IOT_DEVICE'
      )
      setEndpoints(filtered)
    } catch (err: any) {
      console.error("Failed to fetch endpoints", err)
      setEndpoints([])
      setEndpointsError(err?.message || 'Unable to load endpoints. Please try again.')
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

  interface RemediationEvent {
    id: string
    timestamp: string
    action: string
    resource: string
    status: string
  }
  const [remediationEvents, setRemediationEvents] = useState<RemediationEvent[]>([])

  const fetchRemediationEvents = async () => {
    try {
      const response = await apiClient.get('/api/compliance/audit-trail')
      const entries = Array.isArray(response.data) ? response.data : []
      setRemediationEvents(
        entries.filter((e: any) => typeof e.resource === 'string' && e.resource.startsWith('asset/'))
      )
    } catch (err) {
      console.error("Failed to fetch remediation history", err)
    }
  }

  useEffect(() => {
    fetchEndpoints()
    fetchAgents()
    fetchRemediationEvents()
    const interval = setInterval(() => {
      fetchEndpoints()
      fetchAgents()
      fetchRemediationEvents()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

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
      toast.error('Failed to isolate endpoint.')
    } finally {
      setProcessingId(null)
      setConfirmTarget(null)
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
      toast.error('Failed to release endpoint.')
    } finally {
      setProcessingId(null)
      setConfirmTarget(null)
    }
  }

  // Clear degraded status
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
      toast.error('Failed to roll back endpoint.')
    } finally {
      setProcessingId(null)
      setConfirmTarget(null)
    }
  }

  const confirmTargetEndpoint = confirmTarget ? endpoints.find(ep => ep.id === confirmTarget.id) : undefined

  const runConfirmedAction = () => {
    if (!confirmTarget) return
    if (confirmTarget.action === 'isolate') handleIsolate(confirmTarget.id)
    else if (confirmTarget.action === 'release') handleRelease(confirmTarget.id)
    else handleRollback(confirmTarget.id)
  }

  // Rollback All Pending
  const handleRollbackAll = async () => {
    const pending = endpoints.filter(ep => ep.health === 'DEGRADED')
    if (pending.length === 0) return
    setRollbackAllBusy(true)
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
      toast.error('Failed to roll back all pending endpoints.')
    } finally {
      setRollbackAllBusy(false)
      setConfirmingRollbackAll(false)
    }
  }

  // Live Stats calculations
  const totalCount = endpoints.length
  const healthyCount = endpoints.filter(ep => ep.health === 'OK' && ep.status === 'ACTIVE').length
  const degradedCount = endpoints.filter(ep => ep.health === 'DEGRADED').length
  const quarantinedCount = endpoints.filter(ep => ep.status === 'INACTIVE' || ep.status === 'QUARANTINED' || ep.isolationStatus).length
  const pendingRollbackCount = endpoints.filter(ep => ep.health === 'DEGRADED').length

  const filteredEndpoints = useMemo(() => {
    return endpoints.filter(ep => ep.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [endpoints, searchTerm])

  const successRatio = totalCount > 0 ? healthyCount / totalCount : 0
  const needleRotation = -90 + successRatio * 180

  return (
    <div className="endpoints-page">
      {/* Atmospheric Background for Dark Mode */}
      <div className="bg-fixed">
        <div className="nebula1" />
        <div className="nebula2" />
        <div className="nebula3" />
        <div className="stars" />
      </div>

      <div className="content">
        <div className="page-head">
          <h1>Endpoints &amp; Network — <span className="accent">Self-Healing</span></h1>
          <div className="search-endpoints">
            <Search className="w-4 h-4 shrink-0" />
            <input
              type="text"
              placeholder="Search endpoints…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* top 5 stat cards */}
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-num">{totalCount}</div>
            <div className="stat-lbl">Total Endpoints</div>
          </div>

          <div className="stat-card highlight">
            <div className="stat-num">{healthyCount}</div>
            <div className="stat-lbl">Healthy</div>
          </div>

          <div className="stat-card">
            <div className="stat-num">{degradedCount}</div>
            <div className="stat-lbl">Degraded</div>
          </div>

          <div className="stat-card">
            <div className="stat-num">{quarantinedCount}</div>
            <div className="stat-lbl">Quarantined</div>
          </div>

          <div className="stat-card">
            <div className="stat-num">{pendingRollbackCount}</div>
            <div className="stat-lbl">Pending Rollback</div>
          </div>
        </div>

        {/* Self-Healing Status panel */}
        <div className="heal-panel">
          <div className="heal-head">
            <div>
              <h3>Self-Healing Status</h3>
              <div className="sub">Auto-Isolation · Rollback · Policy Drift Repair</div>
            </div>
            <button
              onClick={() => setConfirmingRollbackAll(true)}
              disabled={pendingRollbackCount === 0 || !canWrite}
              className="rollback-btn"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Rollback All Pending
            </button>
          </div>

          <div className="table-scroll">
          <table className="ep-table">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>ENDPOINT</th>
                <th>HEALTH</th>
                <th>AGENT STATUS</th>
                <th>AGENT VER</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredEndpoints.map((ep) => {
                const isIsolated = ep.status === 'INACTIVE' || ep.status === 'QUARANTINED' || ep.isolationStatus
                const health = isIsolated ? 'Quarantined' : ep.health === 'DEGRADED' ? 'Degraded' : 'OK'
                const agent = agentForEndpoint(ep)

                const TypeIcon = ep.type === 'SERVER' ? Server
                  : ep.type === 'NETWORK_DEVICE' ? Shield
                  : ep.type === 'CLOUD_INSTANCE' ? Activity
                  : Cpu

                return (
                  <tr key={ep.id}>
                    <td>
                      <div className="ep-left">
                        <div className="ep-icon"><TypeIcon className="w-4 h-4" /></div>
                        <div>
                          <div className="ep-title">{ep.name} ({ep.os || 'OS'})</div>
                          <div className="ep-sub">{isIsolated ? 'Quarantined' : ep.status}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="ep-status">
                        {health === 'OK' ? '🟢 Secured' : health === 'Degraded' ? '🔴 Degraded' : '🔵 Quarantined'}
                      </span>
                    </td>
                    <td className="mono">
                      {agent ? (
                        <span className={agent.status === 'ONLINE' ? 'text-success' : 'text-danger'}>
                          {agent.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      ) : (
                        'Not Enrolled'
                      )}
                    </td>
                    <td className="mono">{agent?.agentVersion || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-2">
                        {isIsolated ? (
                          <button
                            onClick={() => setConfirmTarget({ id: ep.id, action: 'release' })}
                            disabled={processingId === ep.id || !canWrite}
                            className="rollback-btn py-1.5 px-3 text-small"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Release
                          </button>
                        ) : ep.health === 'DEGRADED' ? (
                          <button
                            onClick={() => setConfirmTarget({ id: ep.id, action: 'rollback' })}
                            disabled={processingId === ep.id || !canWrite}
                            className="rollback-btn py-1.5 px-3 text-small bg-amber border-amber"
                            style={{ background: 'var(--amber)', boxShadow: 'none' }}
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Clear &amp; Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmTarget({ id: ep.id, action: 'isolate' })}
                            disabled={processingId === ep.id || !canWrite}
                            className="rollback-btn py-1.5 px-3 text-small bg-red border-red"
                            style={{ background: 'var(--red)', boxShadow: 'none' }}
                          >
                            <ShieldAlert className="w-3.5 h-3.5" /> Isolate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && endpointsError && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-muted">
                    <div className="flex flex-col items-center gap-2">
                      <span>Unable to load endpoints. Please try again.</span>
                      <button className="btn-mission text-small px-3 py-1.5" onClick={fetchEndpoints}>Retry</button>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && !endpointsError && filteredEndpoints.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-muted">
                    No matching endpoint nodes found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* bottom widgets columns */}
        <div className="bottom-grid">

          <div className="panel-box">
            <h3>Recent Remediation Events</h3>
            {remediationEvents.length === 0 ? (
              <div className="text-small text-text-muted" style={{ padding: '16px 0' }}>No remediation events recorded yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                {remediationEvents.slice(0, 6).map((e) => (
                  <div key={e.id} style={{ fontSize: '11.5px', display: 'flex', justifyContent: 'space-between', gap: '8px', borderBottom: '1px solid var(--tr-border)', paddingBottom: '6px' }}>
                    <span className="truncate">{e.action} — {e.resource.replace('asset/', '')}</span>
                    <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>{new Date(e.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel-box">
            <h3>Rollback Success / Failure Gauge</h3>
            <div className="gauge-wrap">
              <svg viewBox="0 0 200 110">
                <path d="M15,95 A85,85 0 0 1 185,95" fill="none" stroke="var(--tr-border)" strokeWidth="14" />
                <path d="M15,95 A85,85 0 0 1 185,95" fill="none" stroke="var(--cyan)" strokeWidth="14" strokeDasharray="220 251" strokeLinecap="round" />
                <line x1="100" y1="90" x2="150" y2="45" stroke="var(--heading-color)" strokeWidth="3" strokeLinecap="round" style={{ transform: `rotate(${needleRotation}deg)`, transformOrigin: '100px 90px', transition: 'transform 0.5s ease' }} />
                <circle cx="100" cy="90" r="5" fill="var(--heading-color)" />
              </svg>
              <div className="gauge-val">{Math.round(successRatio * 100)}% Success</div>
              <div className="gauge-axis"><span>0</span><span>100</span></div>
            </div>
          </div>

        </div>

      </div>

      <ConfirmDialog
        open={!!confirmTarget}
        title={
          confirmTarget?.action === 'isolate' ? 'Isolate Endpoint'
          : confirmTarget?.action === 'release' ? 'Release Endpoint'
          : 'Clear & Restore Endpoint'
        }
        message={
          confirmTarget?.action === 'isolate'
            ? `This will quarantine "${confirmTargetEndpoint?.name || ''}" and cut it off from the network. Continue?`
            : confirmTarget?.action === 'release'
              ? `This will release "${confirmTargetEndpoint?.name || ''}" from quarantine and restore normal network access. Continue?`
              : `This will clear the DEGRADED flag on "${confirmTargetEndpoint?.name || ''}" and restore it to healthy status. Continue?`
        }
        confirmLabel={confirmTarget?.action === 'isolate' ? 'Isolate' : confirmTarget?.action === 'release' ? 'Release' : 'Clear & Restore'}
        danger={confirmTarget?.action === 'isolate'}
        busy={processingId === confirmTarget?.id}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmTarget(null)}
      />

      <ConfirmDialog
        open={confirmingRollbackAll}
        title="Rollback All Pending"
        message={`This will clear the DEGRADED flag on all ${pendingRollbackCount} endpoint(s) currently pending rollback and restore them to healthy status. Continue?`}
        confirmLabel="Rollback All"
        busy={rollbackAllBusy}
        onConfirm={handleRollbackAll}
        onCancel={() => setConfirmingRollbackAll(false)}
      />
    </div>
  )
}
