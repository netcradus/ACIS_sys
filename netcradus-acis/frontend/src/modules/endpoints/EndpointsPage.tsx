import React, { useEffect, useState, useMemo } from 'react'
import { Server, Cpu, Shield, ShieldAlert, ShieldCheck, Activity, RefreshCw, Search } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import { useThemeStore } from '@/store/themeStore'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
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

function seedRandom(seed: number) {
  let s = seed
  return function() {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

export default function EndpointsPage() {
  const canWrite = useCanWrite(MODULES.ASSETS_THREAT_INTEL)
  const { resolvedTheme } = useThemeStore()
  const isLight = resolvedTheme === 'light'

  const [endpoints, setEndpoints] = useState<Asset[]>([])
  const [agents, setAgents] = useState<AgentEndpointView[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)

  const [confirmTarget, setConfirmTarget] = useState<{ id: string; action: 'isolate' | 'release' | 'rollback' } | null>(null)
  const [confirmingRollbackAll, setConfirmingRollbackAll] = useState(false)
  const [rollbackAllBusy, setRollbackAllBusy] = useState(false)

  const fetchEndpoints = async () => {
    try {
      const response = await apiClient.get('/api/assets')
      const assets = response.data || []
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

  // Small distribution map silhouette
  const distMapData = useMemo(() => {
    const dots = []
    const rng = seedRandom(7777)
    for (let i = 0; i < 400; i++) {
      const x = rng() * 400
      const y = 10 + rng() * 240
      const inLand = (x > 20 && x < 110 && y > 60 && y < 200) || (x > 140 && x < 230 && y > 30 && y < 170) || (x > 250 && x < 390 && y > 50 && y < 210)
      if (inLand && rng() < 0.4) {
        dots.push({ x, y })
      }
    }
    return dots
  }, [])

  // Large attack visualization map
  const attackMapData = useMemo(() => {
    const spots = [[80,220],[150,180],[210,210],[270,190],[320,260],[230,360],[130,390],[300,440]]
    const arcs = [[80,220,150,180],[150,180,210,210],[210,210,270,190],[270,190,320,260],[130,390,230,360],[230,360,300,440]]
    const dots = []
    const rng = seedRandom(8888)
    for (let i = 0; i < 700; i++) {
      const x = rng() * 400
      const y = 20 + rng() * 520
      const inLand = (x > 20 && x < 110 && y > 120 && y < 440) || (x > 140 && x < 230 && y > 60 && y < 440) || (x > 250 && x < 390 && y > 90 && y < 480)
      if (inLand && rng() < 0.4) {
        dots.push({ x, y })
      }
    }
    return { dots, spots, arcs }
  }, [])

  const successRatio = totalCount > 0 ? healthyCount / totalCount : 0.8
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
            <Search className="w-4.5 h-4.5 shrink-0" />
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
            <div className="stat-detail">
              <div><span className="b"></span>Total <span className="n">{totalCount}</span></div>
              <div><span className="b"></span>Healthy <span className="n">{healthyCount}</span></div>
              <div><span className="b"></span>Shift <span className="n">{degradedCount}</span></div>
            </div>
            <div className="stat-lbl">Total Endpoints</div>
          </div>

          <div className="stat-card highlight">
            <div className="stat-num">{healthyCount}</div>
            <div className="stat-detail">
              <div><span className="b"></span>Asset <span className="n">{totalCount}</span></div>
              <div><span className="b"></span>Healthy <span className="n">{healthyCount}</span></div>
              <div><span className="b"></span>Degraded <span className="n">{degradedCount}</span></div>
            </div>
            <div className="stat-lbl">Healthy</div>
          </div>

          <div className="stat-card">
            <div className="stat-num">{degradedCount}</div>
            <div className="stat-detail">
              <div><span className="b"></span>Asset <span className="n">{totalCount}</span></div>
              <div><span className="b"></span>Healthy <span className="n">{healthyCount}</span></div>
              <div><span className="b"></span>Soft <span className="n">{quarantinedCount}</span></div>
            </div>
            <div className="stat-lbl">Degraded</div>
          </div>

          <div className="stat-card">
            <div className="stat-num">{quarantinedCount}</div>
            <div className="stat-detail">
              <div><span className="b"></span>Total <span className="n">{totalCount}</span></div>
              <div><span className="b"></span>Healthy <span className="n">{healthyCount}</span></div>
              <div><span className="b"></span>Shift <span className="n">{degradedCount}</span></div>
            </div>
            <div className="stat-lbl">Quarantined</div>
          </div>

          <div className="stat-card">
            <div className="stat-num">{pendingRollbackCount}</div>
            <div className="stat-detail">
              <div><span className="b"></span>Data <span className="n">{totalCount}</span></div>
              <div><span className="b"></span>Healthy <span className="n">{healthyCount}</span></div>
              <div><span className="b"></span>Shift <span className="n">{degradedCount}</span></div>
            </div>
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
              Rollback All Pending
            </button>
          </div>

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

                const isLinux = (ep.os || '').toLowerCase().includes('linux')

                return (
                  <tr key={ep.id}>
                    <td>
                      <div className="ep-left">
                        <div className="ep-icon">{isLinux ? '🐧' : '🖥'}</div>
                        <div>
                          <div className="ep-title">{ep.name} ({ep.os || 'OS'})</div>
                          <div className="ep-sub">{isIsolated ? 'Quarantined' : ep.status}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="ep-status">
                        {health === 'OK' ? '🟢 Secured' : health === 'Degraded' ? '🔴 Degraded' : '🔵 Active'}
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
                            Release
                          </button>
                        ) : ep.health === 'DEGRADED' ? (
                          <button
                            onClick={() => setConfirmTarget({ id: ep.id, action: 'rollback' })}
                            disabled={processingId === ep.id || !canWrite}
                            className="rollback-btn py-1.5 px-3 text-small bg-amber border-amber"
                            style={{ background: 'var(--amber)', boxShadow: 'none' }}
                          >
                            Clear &amp; Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmTarget({ id: ep.id, action: 'isolate' })}
                            disabled={processingId === ep.id || !canWrite}
                            className="rollback-btn py-1.5 px-3 text-small bg-red border-red"
                            style={{ background: 'var(--red)', boxShadow: 'none' }}
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
                  <td colSpan={5} className="py-8 text-center text-text-muted">
                    No matching endpoint nodes found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* bottom widgets columns */}
        <div className="bottom-grid">
          
          <div className="panel-box">
            <h3>Endpoint Distribution Map</h3>
            <div className="map-box">
              <svg viewBox="0 0 400 260">
                {distMapData.map((dot, idx) => (
                  <circle key={idx} cx={dot.x} cy={dot.y} r={0.8} fill="var(--map-dot-color)" />
                ))}
              </svg>
              <div className="map-marker" style={{ left: '32%', top: '35%' }}>👤</div>
              <div className="map-marker" style={{ left: '22%', top: '55%' }}>📍</div>
              <div className="map-marker" style={{ left: '64%', top: '32%' }}>👥</div>
              <div className="map-marker" style={{ left: '70%', top: '40%' }}>👥</div>
            </div>
          </div>

          <div className="stack-col">
            <div className="panel-box">
              <h3>Self-Healing Trend over Time</h3>
              <svg viewBox="0 0 260 150" width="100%" height="140">
                <line x1="0" y1="0" x2="260" y2="0" stroke="var(--tr-border)" />
                <line x1="0" y1="35" x2="260" y2="35" stroke="var(--tr-border)" />
                <line x1="0" y1="70" x2="260" y2="70" stroke="var(--tr-border)" />
                <line x1="0" y1="105" x2="260" y2="105" stroke="var(--tr-border)" />
                <line x1="0" y1="140" x2="260" y2="140" stroke="var(--tr-border)" />
                <polyline points="10,130 55,90 100,105 140,55 185,25 225,75 255,45" fill="none" stroke="var(--cyan)" strokeWidth="2" />
                <circle cx="10" cy="130" r="3" fill="var(--cyan)" />
                <circle cx="55" cy="90" r="3" fill="var(--cyan)" />
                <circle cx="100" cy="105" r="3" fill="var(--cyan)" />
                <circle cx="140" cy="55" r="3" fill="var(--cyan)" />
                <circle cx="185" cy="25" r="3" fill="var(--cyan)" />
                <circle cx="225" cy="75" r="3" fill="var(--cyan)" />
                <circle cx="255" cy="45" r="3" fill="var(--cyan)" />
              </svg>
              <div className="trend-axis"><span>10</span><span>15</span><span>20</span><span>35</span><span>40</span></div>
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

          <div className="panel-box">
            <h3>Global Attack Visualization Map</h3>
            <div className="attack-map-box">
              <svg viewBox="0 0 400 560">
                {attackMapData.dots.map((dot, idx) => (
                  <circle key={idx} cx={dot.x} cy={dot.y} r={0.8} fill="var(--map-dot-color)" />
                ))}

                {attackMapData.arcs.map(([x1, y1, x2, y2], idx) => {
                  const mx = (x1 + x2) / 2
                  const my = (y1 + y2) / 2 - 40
                  return (
                    <path
                      key={idx}
                      d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                      fill="none"
                      stroke="var(--map-path-color)"
                      strokeWidth="1.3"
                    />
                  )
                })}

                {attackMapData.spots.map(([x, y], idx) => {
                  const gradId = `ng-endpoints-map-${idx}`
                  if (isLight) {
                    return (
                      <g key={idx}>
                        <circle cx={x} cy={y} r={9} fill="#fde3b8" stroke="#d97706" strokeWidth={1.5} />
                        <circle cx={x} cy={y} r={2.8} fill="#b45309" />
                      </g>
                    )
                  }
                  return (
                    <g key={idx}>
                      <defs>
                        <radialGradient id={gradId}>
                          <stop offset="0%" stopColor="var(--map-hotspot-color)" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="var(--map-hotspot-color)" stopOpacity="0" />
                        </radialGradient>
                      </defs>
                      <circle cx={x} cy={y} r={17} fill={`url(#${gradId})`} />
                      <circle cx={x} cy={y} r={3} fill="var(--map-dot-center-color)" />
                    </g>
                  )
                })}
              </svg>
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
