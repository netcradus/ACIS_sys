import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Search, X, Zap, Sparkles, ChevronRight, Sliders } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import keycloak from '@/lib/keycloak'
import { useAuthStore } from '@/store/authStore'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import { usePivotSeed } from '@/hooks/useEntityPivot'
import SeverityBadge, { toSeverity } from '@/components/viz/SeverityBadge'
import PivotChip from '@/components/ui/PivotChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import './AlertsPage.css'

interface Alert {
  id: string
  title: string
  severity: string
  source: string
  status: string
  ownerId: string | null
  rawEvent: string | null
  createdAt: string
  updatedAt: string
}

interface Incident {
  id: string
  incidentNumber: string
  title: string
  severity: string
  status: string
  ownerId: string | null
  ownerName: string | null
  alertId: string | null
  checklist: string | null
  createdAt: string
}

export default function AlertsPage() {
  const { user } = useAuthStore()
  const currentUsername = user?.preferredUsername || user?.email || 'me'
  const canWrite = useCanWrite(MODULES.ALERTS_CORRELATION)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'ALERTS' | 'INCIDENTS'>('ALERTS')
  const [searchTerm, setSearchTerm] = useState('')
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'OPEN'>('ALL')

  const [confirmingPlaybookAlertId, setConfirmingPlaybookAlertId] = useState<string | null>(null)
  const [playbookBusy, setPlaybookBusy] = useState(false)

  const [aiExplainText, setAiExplainText] = useState('')
  const [aiExplainMode, setAiExplainMode] = useState<'live' | 'unavailable' | null>(null)
  const [aiExplainStreaming, setAiExplainStreaming] = useState(false)
  const [aiExplainError, setAiExplainError] = useState<string | null>(null)
  const aiExplainAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    aiExplainAbortRef.current?.abort()
    setAiExplainText('')
    setAiExplainMode(null)
    setAiExplainStreaming(false)
    setAiExplainError(null)
    return () => aiExplainAbortRef.current?.abort()
  }, [selectedAlert?.id])

  const pivotSeed = usePivotSeed()
  useEffect(() => {
    if (pivotSeed?.type === 'severity' && (pivotSeed.value === 'CRITICAL' || pivotSeed.value === 'HIGH')) {
      setSeverityFilter(pivotSeed.value)
    }
  }, [pivotSeed])

  const [incidents, setIncidents] = useState<Incident[]>([])
  const [incidentsLoading, setIncidentsLoading] = useState(true)

  const fetchIncidents = async () => {
    try {
      setIncidentsLoading(true)
      const res = await apiClient.get('/api/incidents')
      setIncidents(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      console.error('Failed to fetch incidents:', e)
    } finally {
      setIncidentsLoading(false)
    }
  }

  const fetchAlerts = async () => {
    setIsLoading(true)
    try {
      const response = await apiClient.get('/api/alerts')
      const sortedAlerts = response.data.sort((a: Alert, b: Alert) => b.id.localeCompare(a.id))
      setAlerts(sortedAlerts)
      
      if (sortedAlerts.length > 0 && !selectedAlert) {
        setSelectedAlert(sortedAlerts[0])
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAlerts()
    fetchIncidents()

    const sub = wsClient.subscribe('/topic/alerts', (message) => {
      try {
        const newAlert = JSON.parse(message.body)
        setAlerts(prev => {
          if (prev.some(a => a.id === newAlert.id)) return prev
          return [newAlert, ...prev]
        })
      } catch (e) {
        console.error('Malformed WebSocket message:', e)
        fetchAlerts()
      }
    })
    
    return () => { 
      sub.then(s => s?.unsubscribe())
    }
  }, [])

  const handleAssignToMe = async (alertId: string) => {
    try {
      const targetOwner = currentUsername
      const res = await apiClient.put(`/api/alerts/${alertId}`, { ownerId: targetOwner })
      if (res.data) {
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, ownerId: targetOwner } : a))
        setSelectedAlert(prev => prev && prev.id === alertId ? { ...prev, ownerId: targetOwner } : prev)
      }
    } catch (e) {
      console.error('Failed to assign alert:', e)
    }
  }

  const handleCreateIncident = async (sourceAlert: Alert) => {
    try {
      const res = await apiClient.post('/api/incidents', {
        title: sourceAlert.title,
        severity: sourceAlert.severity,
        alertId: sourceAlert.id,
      })
      const newInc: Incident = res.data
      setIncidents(prev => [newInc, ...prev])
      setActiveTab('INCIDENTS')
      setSelectedIncident(newInc)
      setSelectedAlert(null)
    } catch (e: any) {
      console.error('Failed to create incident:', e)
      alert(e?.message || 'Failed to create incident')
    }
  }

  const handleUpdateIncidentStatus = async (incidentId: string, status: string) => {
    try {
      const res = await apiClient.put(`/api/incidents/${incidentId}/status?status=${status}`)
      setIncidents(prev => prev.map(i => i.id === incidentId ? res.data : i))
      setSelectedIncident(prev => prev && prev.id === incidentId ? res.data : prev)
    } catch (e) {
      console.error('Failed to update incident status:', e)
    }
  }

  const handleToggleChecklistItem = async (incidentId: string, index: number) => {
    try {
      const res = await apiClient.put(`/api/incidents/${incidentId}/checklist`, { index })
      setIncidents(prev => prev.map(i => i.id === incidentId ? res.data : i))
      setSelectedIncident(prev => prev && prev.id === incidentId ? res.data : prev)
    } catch (e) {
      console.error('Failed to update checklist:', e)
    }
  }

  const handleUpdateStatus = async (alertId: string, newStatus: string) => {
    try {
      const res = await apiClient.put(`/api/alerts/${alertId}`, { status: newStatus })
      if (res.data) {
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: newStatus } : a))
        setSelectedAlert(prev => prev && prev.id === alertId ? { ...prev, status: newStatus } : prev)
      }
    } catch (e) {
      console.error('Failed to update status:', e)
    }
  }

  const handleRunPlaybook = async (alertId: string) => {
    setPlaybookBusy(true)
    try {
      const pbs = await apiClient.get('/api/soar/playbooks')
      if (pbs.data && pbs.data.length > 0) {
        await apiClient.post(`/api/soar/playbooks/${pbs.data[0].id}/execute`, { alertId })
        handleUpdateStatus(alertId, 'MITIGATED')
      } else {
        alert('No active SOAR playbooks found.')
      }
    } catch (e) {
      console.error('Playbook execution failed:', e)
      alert('Error triggering SOAR playbook execution.')
    } finally {
      setPlaybookBusy(false)
      setConfirmingPlaybookAlertId(null)
    }
  }

  const handleAiExplain = async (alertId: string) => {
    aiExplainAbortRef.current?.abort()
    const controller = new AbortController()
    aiExplainAbortRef.current = controller

    setAiExplainText('')
    setAiExplainMode(null)
    setAiExplainError(null)
    setAiExplainStreaming(true)

    try {
      const tenantId = (keycloak.tokenParsed as Record<string, unknown> | undefined)?.tenant_id as string | undefined
      const response = await fetch(`/api/alerts/${alertId}/explain/stream`, {
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
        },
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        throw new Error(`AI explain request failed (HTTP ${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const rawEvent of events) {
          const line = rawEvent.split('\n').find(l => l.startsWith('data:'))
          if (!line) continue
          let payload: { mode?: 'live' | 'unavailable'; delta?: string; error?: string; success?: false; done?: boolean }
          try {
            payload = JSON.parse(line.slice('data:'.length).trim())
          } catch {
            continue
          }
          if (payload.mode) setAiExplainMode(payload.mode)
          if (payload.delta) setAiExplainText(prev => prev + payload.delta)
          if (payload.error) {
            setAiExplainError(payload.error)
            setAiExplainMode('unavailable')
          }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      console.error('AI explain stream failed:', e)
      setAiExplainError('AI explanation unavailable. Please try again.')
      setAiExplainMode('unavailable')
    } finally {
      if (!controller.signal.aborted) setAiExplainStreaming(false)
    }
  }

  // Derived severity metrics
  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length
  const highCount = alerts.filter(a => a.severity === 'HIGH').length
  const medCount = alerts.filter(a => a.severity === 'MEDIUM').length
  const lowCount = alerts.filter(a => a.severity === 'LOW').length
  const openCount = alerts.filter(a => a.status === 'OPEN').length

  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      const matchesSearch = a.title.toLowerCase().includes(searchTerm.toLowerCase()) || a.id.toLowerCase().includes(searchTerm.toLowerCase())
      if (!matchesSearch) return false

      if (severityFilter === 'CRITICAL') return a.severity === 'CRITICAL'
      if (severityFilter === 'HIGH') return a.severity === 'HIGH'
      if (severityFilter === 'OPEN') return a.status === 'OPEN'
      return true
    })
  }, [alerts, searchTerm, severityFilter])

  const filteredIncidents = useMemo(() => {
    return incidents.filter(i => {
      const matchesSearch = i.title.toLowerCase().includes(searchTerm.toLowerCase()) || i.incidentNumber.toLowerCase().includes(searchTerm.toLowerCase())
      if (!matchesSearch) return false

      if (severityFilter === 'CRITICAL') return i.severity === 'CRITICAL'
      if (severityFilter === 'HIGH') return i.severity === 'HIGH'
      if (severityFilter === 'OPEN') return i.status === 'OPEN'
      return true
    })
  }, [incidents, searchTerm, severityFilter])

  const parsedEvent = useMemo(() => {
    if (!selectedAlert || !selectedAlert.rawEvent) return null
    try {
      return JSON.parse(selectedAlert.rawEvent)
    } catch (e) {
      return { error: 'Failed to parse raw event data', raw: selectedAlert.rawEvent }
    }
  }, [selectedAlert])

  const riskIndicators = useMemo(() => {
    if (!selectedAlert || !parsedEvent || parsedEvent.error) return []
    const title = selectedAlert.title.toLowerCase()
    const indicators: { label: string; color: string; pivot?: { type: 'ip' | 'host'; value: string } }[] = []

    if (title.includes('stuffing') || title.includes('login') || title.includes('failure')) {
      if (parsedEvent.failures) indicators.push({ label: `${parsedEvent.failures} failed authentications${parsedEvent.window ? ` in ${parsedEvent.window}` : ''}`, color: 'border-l-red' })
      if (parsedEvent.src_ip) indicators.push({ label: 'Source IP', color: 'border-l-amber', pivot: { type: 'ip', value: parsedEvent.src_ip } })
      if (parsedEvent.target) indicators.push({ label: 'Target', color: 'border-l-blue', pivot: { type: 'host', value: parsedEvent.target } })
    } else if (title.includes('beaconing') || title.includes('domain') || title.includes('outbound')) {
      if (parsedEvent.domain) indicators.push({ label: `Egress traffic to anomalous domain ${parsedEvent.domain}`, color: 'border-l-red' })
      if (parsedEvent.src_ip) indicators.push({ label: 'Source host', color: 'border-l-amber', pivot: { type: 'ip', value: parsedEvent.src_ip } })
      if (parsedEvent.destination) indicators.push({ label: 'Destination IP', color: 'border-l-blue', pivot: { type: 'ip', value: parsedEvent.destination } })
    } else if (title.includes('asr') || title.includes('bypass') || title.includes('lolbin')) {
      if (parsedEvent.process) indicators.push({ label: `ASR bypass trigger by ${parsedEvent.process}`, color: 'border-l-red' })
      if (parsedEvent.parent_process) indicators.push({ label: `Parent process: ${parsedEvent.parent_process}`, color: 'border-l-amber' })
    } else if (title.includes('travel')) {
      if (parsedEvent.user) indicators.push({ label: `User ${parsedEvent.user} travel anomaly detected`, color: 'border-l-red' })
      if (parsedEvent.login_1_city && parsedEvent.login_2_city) indicators.push({ label: `Login 1: ${parsedEvent.login_1_city} | Login 2: ${parsedEvent.login_2_city}`, color: 'border-l-amber' })
      if (parsedEvent.time_diff_minutes) indicators.push({ label: `Time difference of ${parsedEvent.time_diff_minutes} minutes`, color: 'border-l-blue' })
    } else {
      indicators.push({ label: `Source component: ${selectedAlert.source}`, color: 'border-l-amber' })
    }
    return indicators
  }, [selectedAlert, parsedEvent])

  const getStatusLabelClass = (status: string) => {
    const s = status?.toUpperCase() || 'OPEN'
    if (s === 'OPEN' || s === 'ACTIVE') return 'text-red font-semibold'
    if (s === 'INVESTIGATING' || s === 'ASSIGNED') return 'text-amber font-semibold'
    if (s === 'MITIGATED') return 'text-green font-semibold'
    return 'text-muted font-semibold'
  }

  // Top Alert Sources donut calculations
  const sources = useMemo(() => {
    let explorer = 0, expCorr = 0, corr = 0, asset = 0, other = 0
    alerts.forEach(a => {
      const src = (a.source || '').toLowerCase()
      if (src.includes('explorer') && src.includes('correlation')) expCorr++
      else if (src.includes('explorer') || src.includes('spl')) explorer++
      else if (src.includes('correlation') || src.includes('rule')) corr++
      else if (src.includes('asset') || src.includes('intel') || src.includes('cmdb')) asset++
      else other++
    })
    return { explorer, expCorr, corr, asset, other }
  }, [alerts])

  const donutSlices = useMemo(() => {
    const total = sources.explorer + sources.expCorr + sources.corr + sources.asset + sources.other
    const totalVal = total > 0 ? total : 1
    const circ = 2 * Math.PI * 58 // ~364.42

    const expDash = (sources.explorer / totalVal) * circ
    const expCorrDash = (sources.expCorr / totalVal) * circ
    const corrDash = (sources.corr / totalVal) * circ
    const assetDash = (sources.asset / totalVal) * circ
    const otherDash = (sources.other / totalVal) * circ

    return {
      circ,
      explorer: { dash: expDash, offset: 0 },
      expCorr: { dash: expCorrDash, offset: -expDash },
      corr: { dash: corrDash, offset: -(expDash + expCorrDash) },
      asset: { dash: assetDash, offset: -(expDash + expCorrDash + corrDash) },
      other: { dash: otherDash, offset: -(expDash + expCorrDash + corrDash + assetDash) }
    }
  }, [sources])

  // Workflow status bars calculations
  const workflowCounts = useMemo(() => {
    const triage = alerts.filter(a => a.status === 'OPEN').length
    const progress = alerts.filter(a => a.status === 'ASSIGNED' || a.status === 'INVESTIGATING').length
    const fp = alerts.filter(a => a.status === 'DISMISSED').length
    const remediated = alerts.filter(a => a.status === 'MITIGATED').length
    const max = Math.max(triage, progress, fp, remediated, 1)
    
    return {
      triage: (triage / max) * 100,
      progress: (progress / max) * 100,
      fp: (fp / max) * 100,
      remediated: (remediated / max) * 100
    }
  }, [alerts])

  // Recent alerts ticker calculations
  const tickerAlerts = useMemo(() => {
    return alerts.slice(0, 3).map(a => ({
      id: a.id,
      title: a.title,
      desc: a.rawEvent ? (a.rawEvent.length > 180 ? a.rawEvent.slice(0, 180) + '…' : a.rawEvent) : `Notable event with source ${a.source} escalated in system.`
    }))
  }, [alerts])

  return (
    <div className="alerts-page">
      <div className="content">
        <div className="page-head">
          <h1>Alerts &amp; Incidents</h1>
        </div>

        <div className="tabs-summary-row">
          <button
            onClick={() => { setActiveTab('ALERTS'); setSelectedIncident(null); if (alerts.length > 0) setSelectedAlert(alerts[0]); }}
            className={clsx("tab", activeTab === 'ALERTS' && "active")}
          >
            Alerts · {alerts.length}
          </button>
          <button
            onClick={() => { setActiveTab('INCIDENTS'); setSelectedAlert(null); if (incidents.length > 0) setSelectedIncident(incidents[0]); }}
            className={clsx("tab", activeTab === 'INCIDENTS' && "active")}
          >
            Incidents · {incidents.length}
          </button>

          <div className="summary-bar">
            <span className="lbl">Quick Summary</span>
            <span className="sev-critical">CRITICAL · {criticalCount}</span>
            <span className="sev-high">HIGH · {highCount}</span>
            <span className="sev-med">MED · {medCount}</span>
            <span className="sev-low">LOW · {lowCount}</span>
          </div>
        </div>

        {/* Table & Details Drawer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          
          {/* Main Table */}
          <div className={clsx(
            "table-panel transition-all duration-300",
            (selectedAlert || selectedIncident) ? "md:col-span-8" : "md:col-span-12"
          )}>
            <div className="table-top">
              <p>
                {activeTab === 'ALERTS'
                  ? 'Alerts — deduplicated notable events with ownership & workflow'
                  : 'Incidents — high-priority security incidents escalated from investigations'}
              </p>
              <div className="filters">
                <div className="select-pill">Source ⌄</div>
                <div className="select-pill">Status ⌄</div>
                <div className="select-pill">Owner ⌄</div>
                <div className="chip-row">
                  <div className={clsx("chip", severityFilter === 'ALL' && "on")} onClick={() => setSeverityFilter('ALL')}>All</div>
                  <div className={clsx("chip", severityFilter === 'CRITICAL' && "on")} onClick={() => setSeverityFilter('CRITICAL')}>Critical</div>
                  <div className={clsx("chip", severityFilter === 'HIGH' && "on")} onClick={() => setSeverityFilter('HIGH')}>High</div>
                  <div className={clsx("chip", severityFilter === 'OPEN' && "on")} onClick={() => setSeverityFilter('OPEN')}>Open</div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table>
                <thead>
                  {activeTab === 'ALERTS' ? (
                    <tr>
                      <th>ID</th>
                      <th>TITLE</th>
                      <th>SEVERITY</th>
                      <th>SOURCE</th>
                      <th>STATUS</th>
                      <th>OWNER</th>
                      <th style={{ textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>ID</th>
                      <th>TITLE</th>
                      <th>SEVERITY</th>
                      <th>ESC. ALERT ID</th>
                      <th>STATUS</th>
                      <th>OWNER</th>
                      <th style={{ textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {activeTab === 'ALERTS' ? (
                    filteredAlerts.map((alert) => {
                      const isSelected = selectedAlert?.id === alert.id
                      const severity = (alert.severity || 'LOW').toLowerCase()
                      const badgeChar = severity === 'critical' ? '◉' : (severity === 'high' ? '⚡' : '●')
                      return (
                        <tr
                          key={alert.id}
                          onClick={() => { setSelectedAlert(alert); setSelectedIncident(null); }}
                          className={clsx(isSelected && "selected")}
                        >
                          <td style={{ fontWeight: 700 }}>{alert.id}</td>
                          <td style={{ fontWeight: 700 }}>{alert.title}</td>
                          <td>
                            <span className={clsx("sev-badge", severity)}>{badgeChar}</span>
                          </td>
                          <td>{alert.source}</td>
                          <td className={getStatusLabelClass(alert.status)}>{alert.status}</td>
                          <td className="owner-name font-mono">{alert.ownerId || '—'}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="row-actions">
                              <button
                                className="row-action-btn"
                                title="Assign to Me"
                                onClick={() => handleAssignToMe(alert.id)}
                                disabled={alert.ownerId === currentUsername || !canWrite}
                              >
                                👤
                              </button>
                              <button
                                className="row-action-btn"
                                title="Details"
                                onClick={() => { setSelectedAlert(alert); setSelectedIncident(null); }}
                              >
                                ✎
                              </button>
                              <button
                                className="row-action-btn"
                                title="SOAR Playbook"
                                onClick={() => setConfirmingPlaybookAlertId(alert.id)}
                                disabled={!canWrite}
                              >
                                ⚙
                              </button>
                              <button
                                className="row-action-btn"
                                title="Dismiss Alert"
                                onClick={() => handleUpdateStatus(alert.id, 'DISMISSED')}
                                disabled={!canWrite}
                              >
                                ⊘
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    filteredIncidents.map((inc) => {
                      const isSelected = selectedIncident?.id === inc.id
                      const severity = (inc.severity || 'LOW').toLowerCase()
                      const badgeChar = severity === 'critical' ? '◉' : (severity === 'high' ? '⚡' : '●')
                      return (
                        <tr
                          key={inc.id}
                          onClick={() => { setSelectedIncident(inc); setSelectedAlert(null); }}
                          className={clsx(isSelected && "selected")}
                        >
                          <td style={{ fontWeight: 700 }}>{inc.incidentNumber}</td>
                          <td style={{ fontWeight: 700 }}>{inc.title}</td>
                          <td>
                            <span className={clsx("sev-badge", severity)}>{badgeChar}</span>
                          </td>
                          <td>{inc.alertId ? `Alert ${inc.alertId}` : 'Manual'}</td>
                          <td className={getStatusLabelClass(inc.status)}>{inc.status}</td>
                          <td className="owner-name font-mono">{inc.ownerName || inc.ownerId || '—'}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="row-actions">
                              <button
                                className="row-action-btn"
                                title="Details"
                                onClick={() => { setSelectedIncident(inc); setSelectedAlert(null); }}
                              >
                                ✎
                              </button>
                              <button
                                className="row-action-btn"
                                title="Mark Mitigated"
                                onClick={() => handleUpdateIncidentStatus(inc.id, 'MITIGATED')}
                                disabled={inc.status === 'MITIGATED' || !canWrite}
                              >
                                ⊘
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                  {((activeTab === 'ALERTS' && filteredAlerts.length === 0) || (activeTab === 'INCIDENTS' && filteredIncidents.length === 0)) && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--dim)' }}>
                        No notable alerts or incidents found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Side: Alert Response Detail Drawer */}
          {activeTab === 'ALERTS' && selectedAlert && (
            <div className="md:col-span-4 bottom-card details-drawer flex flex-col justify-between space-y-5 animate-slide-in relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg, var(--red), var(--amber))', zIndex: 10 }} />
              <div>
                <div className="flex items-center justify-between border-b border-border-soft pb-3 pt-1">

                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-small font-bold text-red">{selectedAlert.id}</span>
                    <SeverityBadge severity={toSeverity(selectedAlert.severity)} label={selectedAlert.severity} size="sm" />
                  </div>
                  <button
                    onClick={() => setSelectedAlert(null)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <X className="w-4 h-4 text-text-muted hover:text-text-primary" />
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  <span className="text-label uppercase text-text-muted block">Alert Summary</span>
                  <h3 className="text-h3 text-heading-color leading-snug">{selectedAlert.title}</h3>
                  <div className="text-small text-text-muted font-mono pt-1">
                    <div>{new Date(selectedAlert.createdAt).toUTCString()}</div>
                    <div className="mt-0.5">Source Component: {selectedAlert.source}</div>
                  </div>
                </div>

                {/* Risk Indicators */}
                <div className="mt-6 space-y-3">
                  <span className="text-label uppercase text-text-muted block">Risk Indicators</span>
                  <div className="space-y-2">
                    {riskIndicators.length === 0 && (
                      <div className="p-3 bg-input-bg rounded-lg text-text-muted text-small">
                        No raw event data to derive risk indicators.
                      </div>
                    )}
                    {riskIndicators.map((risk, idx) => (
                      <div
                        key={idx}
                        className={clsx(
                          "p-3 bg-input-bg rounded-r-lg border-l-2 text-text-secondary text-small font-medium leading-snug flex items-center justify-between gap-3",
                          risk.color
                        )}
                      >
                        <span>{risk.label}</span>
                        {risk.pivot && (
                          <PivotChip
                            type={risk.pivot.type}
                            value={risk.pivot.value}
                            route="/dashboard/assets"
                            className="flex-shrink-0"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Analysis */}
                <div className="mt-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-label uppercase text-text-muted block">AI Explanation</span>
                    {aiExplainMode && (
                      <span className={clsx(
                        "text-label uppercase px-2 py-0.5 rounded-full border",
                        aiExplainMode === 'live'
                          ? "border-green/30 bg-green/10 text-green"
                          : "border-red/30 bg-red/10 text-red"
                      )}>
                        {aiExplainMode === 'live' ? 'Live Stream' : 'AI Offline'}
                      </span>
                    )}
                  </div>

                  {!aiExplainText && !aiExplainStreaming && !aiExplainError && (
                    <button
                      onClick={() => handleAiExplain(selectedAlert.id)}
                      className="new-rule-btn w-full justify-center"
                      style={{ padding: '8px 16px', fontSize: '12px' }}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Explain Alert with AI
                    </button>
                  )}

                  {aiExplainError && (
                    <div className="space-y-2">
                      <div className="p-3 bg-red/10 border border-red/30 rounded-lg text-red text-small">
                        {aiExplainError}
                      </div>
                      <button
                        onClick={() => handleAiExplain(selectedAlert.id)}
                        disabled={aiExplainStreaming}
                        className="new-rule-btn w-full justify-center disabled:opacity-50"
                        style={{ padding: '8px 16px', fontSize: '12px' }}
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Retry Request
                      </button>
                    </div>
                  )}

                  {(aiExplainText || aiExplainStreaming) && (
                    <div className="bg-input-bg border border-border-soft rounded-lg p-4 text-small text-text-secondary leading-relaxed border-l-2 border-l-blue">
                      {aiExplainText}
                      {aiExplainStreaming && (
                        <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-blue animate-pulse align-text-bottom" />
                      )}
                    </div>
                  )}
                </div>

                {/* Raw Event */}
                <div className="mt-6 space-y-2">
                  <span className="text-label uppercase text-text-muted block">Raw Event Data</span>
                  <div className="bg-input-bg border border-border-soft rounded-lg p-4 font-mono text-small text-text-secondary overflow-x-auto whitespace-pre leading-relaxed border-l-2 border-l-blue">
                    {parsedEvent ? JSON.stringify(parsedEvent, null, 2) : 'No raw event data available.'}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="border-t border-border-soft pt-4 space-y-2">
                <span className="text-label uppercase text-text-muted block">Incident Workflow Actions</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAssignToMe(selectedAlert.id)}
                    disabled={selectedAlert.ownerId === currentUsername || !canWrite}
                    className={clsx(
                      "py-2.5 text-center font-semibold rounded-lg text-small transition-colors border",
                      selectedAlert.ownerId === currentUsername || !canWrite
                        ? "bg-input-bg border-border-soft text-text-muted cursor-not-allowed"
                        : "bg-blue hover:bg-blue-dark text-white border-transparent"
                    )}
                  >
                    {selectedAlert.ownerId === currentUsername ? 'Assigned' : 'Assign to Me'}
                  </button>
                  <button
                    onClick={() => handleCreateIncident(selectedAlert)}
                    disabled={!canWrite}
                    className="select-pill justify-center text-center font-semibold disabled:opacity-50"
                  >
                    Escalate Incident
                  </button>
                  <button
                    onClick={() => setConfirmingPlaybookAlertId(selectedAlert.id)}
                    disabled={!canWrite}
                    className="select-pill col-span-2 justify-center gap-1.5 font-semibold disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5 text-blue" /> Run SOAR Playbook
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Right Side: Incident Details Drawer */}
          {activeTab === 'INCIDENTS' && selectedIncident && (
            <div className="md:col-span-4 bottom-card details-drawer flex flex-col justify-between space-y-5 animate-slide-in relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg, var(--purple), var(--blue))', zIndex: 10 }} />
              <div>
                <div className="flex items-center justify-between border-b border-border-soft pb-3 pt-1">

                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-small font-bold text-red">{selectedIncident.id}</span>
                    <SeverityBadge severity={toSeverity(selectedIncident.severity)} label={selectedIncident.severity} size="sm" />
                  </div>
                  <button
                    onClick={() => setSelectedIncident(null)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <X className="w-4 h-4 text-text-muted hover:text-text-primary" />
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  <span className="text-label uppercase text-text-muted block">Incident Detail</span>
                  <h3 className="text-h3 text-heading-color leading-snug">{selectedIncident.title}</h3>
                  <div className="text-small text-text-muted font-mono pt-1">
                    <div>Created: {new Date(selectedIncident.createdAt).toUTCString()}</div>
                    <div className="mt-0.5">Workflow: SOAR Automation Pipeline</div>
                  </div>
                </div>

                {/* Checklist */}
                <div className="mt-6 space-y-3">
                  <span className="text-label uppercase text-text-muted block">Investigation Checklist</span>
                  <div className="space-y-2 text-small">
                    {(() => {
                      let items: { label: string; done: boolean }[] = []
                      try {
                        items = selectedIncident.checklist ? JSON.parse(selectedIncident.checklist) : []
                      } catch { items = [] }
                      if (items.length === 0) {
                        return <div className="text-text-muted text-small">No checklist items defined.</div>
                      }
                      return items.map((step, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleToggleChecklistItem(selectedIncident.id, idx)}
                          disabled={!canWrite}
                          className="flex items-center gap-2.5 py-1 w-full text-left focus:outline-none disabled:cursor-not-allowed"
                        >
                          <div className={clsx(
                            "w-4 h-4 rounded border flex items-center justify-center font-semibold text-[9px] shrink-0",
                            step.done ? "bg-blue/10 border-blue text-blue" : "border-border-soft text-text-muted"
                          )}>
                            {step.done ? '✓' : ''}
                          </div>
                          <span className={clsx("font-medium", step.done ? "text-text-secondary" : "text-text-muted")}>{step.label}</span>
                        </button>
                      ))
                    })()}
                  </div>
                </div>
              </div>

              <div className="border-t border-border-soft pt-4 space-y-2">
                <span className="text-label uppercase text-text-muted block">Incident Workflow Actions</span>
                <button
                  onClick={() => handleUpdateIncidentStatus(selectedIncident.id, 'MITIGATED')}
                  disabled={selectedIncident.status === 'MITIGATED' || !canWrite}
                  className={clsx(
                    "w-full py-2.5 text-center font-semibold rounded-lg text-small transition-colors border",
                    selectedIncident.status === 'MITIGATED' || !canWrite
                      ? "bg-input-bg border-border-soft text-text-muted cursor-not-allowed"
                      : "bg-blue hover:bg-blue-dark text-white border-transparent"
                  )}
                >
                  {selectedIncident.status === 'MITIGATED' ? 'Incident Mitigated' : 'Mark as Mitigated'}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Charts row */}
        <div className="chart-row">
          <div className="chart-card">
            <div className="chart-head">
              <h3>Alert Severity Trend</h3>
              <div className="date-pill">📅 5 Jan, 24h - 24h, 2023</div>
              <div className="range-pill">Past 24h ⌄</div>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <svg viewBox="0 0 320 200" width="100%" height="200" style={{ flex: 1 }}>
                <line x1="0" y1="0" x2="320" y2="0" stroke="var(--svg-grid-line)" />
                <line x1="0" y1="40" x2="320" y2="40" stroke="var(--svg-grid-line)" />
                <line x1="0" y1="80" x2="320" y2="80" stroke="var(--svg-grid-line)" />
                <line x1="0" y1="120" x2="320" y2="120" stroke="var(--svg-grid-line)" />
                <line x1="0" y1="160" x2="320" y2="160" stroke="var(--svg-grid-line)" />
                <polyline points="0,60 45,50 90,65 135,15 180,55 225,45 270,25 315,15" fill="none" stroke="var(--red)" strokeWidth="2.5" />
                <polyline points="0,140 45,120 90,135 135,90 180,150 225,110 270,140 315,110" fill="none" stroke="var(--amber)" strokeWidth="2.5" />
                <polyline points="0,155 45,150 90,158 135,140 180,152 225,148 270,155 315,150" fill="none" stroke="#facc15" strokeWidth="2" />
              </svg>
              <div className="legend-list" style={{ flex: 'none', paddingTop: '4px' }}>
                <div><span className="d" style={{ background: 'var(--red)' }}></span>Critical</div>
                <div><span className="d" style={{ background: 'var(--amber)' }}></span>High</div>
                <div><span className="d" style={{ background: '#facc15' }}></span>Medium</div>
                <div><span className="line" style={{ background: '#94a3b8' }}></span>Laser 24h</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontSize: '11px', color: 'var(--dim)', fontWeight: 700, marginTop: '4px' }}>
              <span>Past 0</span><span>Pax 4</span><span>Pao 8</span><span>Pat 12</span><span>Pat 18</span><span>Pat 24</span>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-head">
              <h3>Top Alert Sources</h3>
            </div>
            <div className="donut-row">
              <svg viewBox="0 0 160 160" width="150" height="150" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="80" cy="80" r="58" fill="none" stroke="var(--blue)" strokeWidth="24" strokeDasharray={`${donutSlices.explorer.dash} ${donutSlices.circ - donutSlices.explorer.dash}`} strokeDashoffset={donutSlices.explorer.offset} />
                <circle cx="80" cy="80" r="58" fill="none" stroke="var(--cyan)" strokeWidth="24" strokeDasharray={`${donutSlices.expCorr.dash} ${donutSlices.circ - donutSlices.expCorr.dash}`} strokeDashoffset={donutSlices.expCorr.offset} />
                <circle cx="80" cy="80" r="58" fill="none" stroke="var(--amber)" strokeWidth="24" strokeDasharray={`${donutSlices.corr.dash} ${donutSlices.circ - donutSlices.corr.dash}`} strokeDashoffset={donutSlices.corr.offset} />
                <circle cx="80" cy="80" r="58" fill="none" stroke="var(--purple)" strokeWidth="24" strokeDasharray={`${donutSlices.asset.dash} ${donutSlices.circ - donutSlices.asset.dash}`} strokeDashoffset={donutSlices.asset.offset} />
                <circle cx="80" cy="80" r="58" fill="none" stroke="#94a3b8" strokeWidth="24" strokeDasharray={`${donutSlices.other.dash} ${donutSlices.circ - donutSlices.other.dash}`} strokeDashoffset={donutSlices.other.offset} />
              </svg>
              <div className="legend-list">
                <div><span className="d" style={{ background: 'var(--blue)' }}></span>Log Explorer<span className="n" style={{ marginLeft: '12px' }}>{sources.explorer}</span></div>
                <div><span className="d" style={{ background: 'var(--cyan)' }}></span>Log &amp; Correlation<span className="n" style={{ marginLeft: '12px' }}>{sources.expCorr}</span></div>
                <div><span className="d" style={{ background: 'var(--amber)' }}></span>Correlation<span className="n" style={{ marginLeft: '12px' }}>{sources.corr}</span></div>
                <div><span className="d" style={{ background: 'var(--purple)' }}></span>Asset Intel<span className="n" style={{ marginLeft: '12px' }}>{sources.asset}</span></div>
                <div><span className="d" style={{ background: '#94a3b8' }}></span>Others<span className="n" style={{ marginLeft: '12px' }}>{sources.other}</span></div>
              </div>
              <div className="donut-tooltip">
                Past 24h
                <div className="row"><span className="d"></span>Correlation {sources.corr}</div>
              </div>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-head">
              <h3>Alert Workflow Status</h3>
            </div>
            <div className="bars-simple">
              <div className="bcol"><div className="bar" style={{ height: `${workflowCounts.triage}%` }}></div><div className="lbl">Triage</div></div>
              <div className="bcol"><div className="bar" style={{ height: `${workflowCounts.progress}%` }}></div><div className="lbl">In Progress</div></div>
              <div className="bcol"><div className="bar" style={{ height: `${workflowCounts.fp}%` }}></div><div className="lbl">Closed-FP</div></div>
              <div className="bcol"><div className="bar" style={{ height: `${workflowCounts.remediated}%` }}></div><div className="lbl">Mitigated</div></div>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="bottom-row">
          <div className="bottom-card">
            <h3>Live Alert Ticker</h3>
            <div className="ticker-list">
              {tickerAlerts.map((item, idx) => (
                <div key={idx} className="ticker-item">
                  <span className="tdot"></span>
                  <b>{item.title}:</b> {item.desc}
                </div>
              ))}
            </div>
          </div>

          <div className="bottom-card">
            <h3>Alert Workflow Status</h3>
            <div className="bars-simple">
              <div className="bcol"><div className="bar" style={{ height: `${workflowCounts.triage}%` }}></div><div className="lbl">Triage</div></div>
              <div className="bcol"><div className="bar" style={{ height: `${workflowCounts.progress}%` }}></div><div className="lbl">In Progress</div></div>
              <div className="bcol"><div className="bar" style={{ height: `${workflowCounts.fp}%` }}></div><div className="lbl">Closed-FP</div></div>
              <div className="bcol"><div className="bar" style={{ height: `${workflowCounts.remediated}%` }}></div><div className="lbl">Mitigated</div></div>
            </div>
          </div>

          <div className="bottom-card">
            <h3>Alert Investigation Timeline</h3>
            <div className="invest-flow">
              <div className="invest-step"><div className="invest-icon blue">👤</div><div className="invest-lbl">Assignment Seen</div></div>
              <div className="invest-arrow">→</div>
              <div className="invest-step"><div className="invest-icon cyan">🔍</div><div className="invest-lbl">Investigation</div></div>
              <div className="invest-arrow">→</div>
              <div className="invest-step"><div className="invest-icon amber">⏱</div><div className="invest-lbl">Escalated</div></div>
              <div className="invest-arrow">→</div>
              <div className="invest-step"><div className="invest-icon red">↺</div><div className="invest-lbl">Remediate / Dismiss</div></div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingPlaybookAlertId !== null}
        title="Run SOAR playbook?"
        message="This executes the first available playbook's real steps against this alert — including any quarantine/isolation actions it defines. This is a genuine remediation action, not a simulation."
        confirmLabel="Run Playbook"
        busy={playbookBusy}
        onConfirm={() => confirmingPlaybookAlertId && handleRunPlaybook(confirmingPlaybookAlertId)}
        onCancel={() => setConfirmingPlaybookAlertId(null)}
      />
    </div>
  )
}
