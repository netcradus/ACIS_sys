import React, { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, ShieldAlert, Bell, Clock, User, Filter, RefreshCw, X, ChevronRight, Zap, Target, Search } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import { useAuthStore } from '@/store/authStore'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import { clsx } from 'clsx'

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
  checklist: string | null // JSON array of {label, done}
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

  // Real incidents — fetched from the backend, not fabricated client state.
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
      // Sort alerts: OPEN/CRITICAL first, or sorted by id/createdAt
      const sortedAlerts = response.data.sort((a: Alert, b: Alert) => b.id.localeCompare(a.id))
      setAlerts(sortedAlerts)
      
      // Auto-select first alert if none selected
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

    // Subscribe to new alerts via WebSocket
    const sub = wsClient.subscribe('/topic/alerts', (message) => {
      try {
        const newAlert = JSON.parse(message.body)
        setAlerts(prev => {
          // Avoid duplicate inserts
          if (prev.some(a => a.id === newAlert.id)) return prev
          return [newAlert, ...prev]
        })
      } catch (e) {
        console.error('Malformed WebSocket message:', e)
        fetchAlerts() // Fallback
      }
    })
    
    return () => { 
      sub.then(s => s?.unsubscribe())
    }
  }, [])

  // Assign Alert to User
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

  // Create Incident from Alert — real, persisted, escalated with a real
  // checklist. Previously this only ever pushed into local React state;
  // "Create Incident" never called the backend at all. Parameter
  // deliberately not named "alert" — that shadowed window.alert() in the
  // original code, which would have thrown "alert is not a function" the
  // moment the catch block's own alert(...) call ran, real evidence this
  // path was never actually exercised before.
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

  // Quick state update helper
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

  // Execute SOAR Playbook
  const handleRunPlaybook = async (alertId: string) => {
    try {
      const pbs = await apiClient.get('/api/soar/playbooks')
      if (pbs.data && pbs.data.length > 0) {
        // execute first playbook for this alert
        await apiClient.post(`/api/soar/playbooks/${pbs.data[0].id}/execute`, { alertId })
        alert(`SOAR Playbook '${pbs.data[0].name}' executed successfully! Status updated to MITIGATED.`)
        handleUpdateStatus(alertId, 'MITIGATED')
      } else {
        alert('No active SOAR playbooks found.')
      }
    } catch (e) {
      console.error('Playbook execution failed:', e)
      alert('Error triggering SOAR playbook execution.')
    }
  }

  // Counts calculated dynamically
  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length
  const highCount = alerts.filter(a => a.severity === 'HIGH').length
  const openCount = alerts.filter(a => a.status === 'OPEN').length

  // Filter logic
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

  // Parse Raw Event — honest null when there's no real rawEvent, rather
  // than fabricating a plausible-looking sample event in its place.
  const parsedEvent = useMemo(() => {
    if (!selectedAlert || !selectedAlert.rawEvent) {
      return null
    }
    try {
      return JSON.parse(selectedAlert.rawEvent)
    } catch (e) {
      return { error: 'Failed to parse raw event data', raw: selectedAlert.rawEvent }
    }
  }, [selectedAlert])

  // Risk indicators derived only from fields actually present in the real
  // parsed event — no more inventing sample IPs/usernames/domains when a
  // field is missing.
  const riskIndicators = useMemo(() => {
    if (!selectedAlert || !parsedEvent || parsedEvent.error) return []
    const title = selectedAlert.title.toLowerCase()
    const indicators: { label: string; color: string }[] = []

    if (title.includes('stuffing') || title.includes('login') || title.includes('failure')) {
      if (parsedEvent.failures) indicators.push({ label: `${parsedEvent.failures} failed authentications${parsedEvent.window ? ` in ${parsedEvent.window}` : ''}`, color: 'border-l-danger' })
      if (parsedEvent.src_ip) indicators.push({ label: `Source IP ${parsedEvent.src_ip}`, color: 'border-l-severity-high' })
      if (parsedEvent.target) indicators.push({ label: `Target: ${parsedEvent.target}`, color: 'border-l-severity-medium' })
    } else if (title.includes('beaconing') || title.includes('domain') || title.includes('outbound')) {
      if (parsedEvent.domain) indicators.push({ label: `Egress traffic to anomalous domain ${parsedEvent.domain}`, color: 'border-l-danger' })
      if (parsedEvent.src_ip) indicators.push({ label: `Source host: ${parsedEvent.src_ip}`, color: 'border-l-severity-high' })
      if (parsedEvent.destination) indicators.push({ label: `Destination IP: ${parsedEvent.destination}`, color: 'border-l-severity-medium' })
    } else if (title.includes('asr') || title.includes('bypass') || title.includes('lolbin')) {
      if (parsedEvent.process) indicators.push({ label: `ASR bypass trigger by ${parsedEvent.process}`, color: 'border-l-danger' })
      if (parsedEvent.parent_process) indicators.push({ label: `Parent process: ${parsedEvent.parent_process}`, color: 'border-l-severity-high' })
    } else if (title.includes('travel')) {
      if (parsedEvent.user) indicators.push({ label: `User ${parsedEvent.user} travel anomaly detected`, color: 'border-l-danger' })
      if (parsedEvent.login_1_city && parsedEvent.login_2_city) indicators.push({ label: `Login 1: ${parsedEvent.login_1_city} | Login 2: ${parsedEvent.login_2_city}`, color: 'border-l-severity-high' })
      if (parsedEvent.time_diff_minutes) indicators.push({ label: `Time difference of ${parsedEvent.time_diff_minutes} minutes`, color: 'border-l-severity-medium' })
    } else {
      indicators.push({ label: `Source component: ${selectedAlert.source}`, color: 'border-l-severity-high' })
    }
    return indicators
  }, [selectedAlert, parsedEvent])

  const getSeverityBadge = (sev: string) => {
    const s = sev?.toUpperCase() || 'LOW'
    if (s === 'CRITICAL') return 'bg-danger/10 text-danger border border-danger/25 px-2 py-0.5 rounded text-label uppercase'
    if (s === 'HIGH') return 'bg-severity-high/10 text-severity-high border border-severity-high/25 px-2 py-0.5 rounded text-label uppercase'
    if (s === 'MEDIUM') return 'bg-severity-medium/10 text-severity-medium border border-severity-medium/25 px-2 py-0.5 rounded text-label uppercase'
    return 'bg-info/10 text-info border border-info/25 px-2 py-0.5 rounded text-label uppercase'
  }

  const getStatusBadge = (status: string) => {
    const s = status?.toUpperCase() || 'OPEN'
    if (s === 'OPEN' || s === 'ACTIVE') return 'bg-danger/5 text-danger border border-danger/20 px-2.5 py-0.5 rounded text-label uppercase'
    if (s === 'INVESTIGATING') return 'bg-warning/5 text-warning border border-warning/20 px-2.5 py-0.5 rounded text-label uppercase'
    if (s === 'MITIGATED') return 'bg-success/5 text-success border border-success/20 px-2.5 py-0.5 rounded text-label uppercase'
    return 'bg-surface-3 text-text-muted px-2.5 py-0.5 rounded text-label uppercase'
  }

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full text-text-secondary min-h-screen">

      {/* Search Header */}
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <h1 className="text-h1 text-text-primary">Alerts & Incidents</h1>
        <div className="relative w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search alerts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10 text-small"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setActiveTab('ALERTS'); setSelectedIncident(null); if (alerts.length > 0) setSelectedAlert(alerts[0]); }}
          className={clsx(
            "px-4 py-2 rounded-lg text-small font-semibold transition-colors duration-150 flex items-center gap-1.5 focus:outline-none",
            activeTab === 'ALERTS'
              ? "bg-accent text-white"
              : "bg-surface-2 border border-fire-border text-text-secondary hover:text-text-primary"
          )}
        >
          Alerts <span className={clsx("text-small opacity-70", activeTab === 'ALERTS' ? "text-white" : "text-text-muted")}>• {alerts.length}</span>
        </button>
        <button
          onClick={() => { setActiveTab('INCIDENTS'); setSelectedAlert(null); if (incidents.length > 0) setSelectedIncident(incidents[0]); }}
          className={clsx(
            "px-4 py-2 rounded-lg text-small font-semibold transition-colors duration-150 flex items-center gap-1.5 focus:outline-none",
            activeTab === 'INCIDENTS'
              ? "bg-accent text-white"
              : "bg-surface-2 border border-fire-border text-text-secondary hover:text-text-primary"
          )}
        >
          Incidents <span className={clsx("text-small opacity-70", activeTab === 'INCIDENTS' ? "text-white" : "text-text-muted")}>• {incidents.length}</span>
        </button>
      </div>

      {/* Table & Drawer Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        
        {/* Left Side: Main table */}
        <div className={clsx(
          "card-mission space-y-4 transition-all duration-300",
          (selectedAlert || selectedIncident) ? "md:col-span-8" : "md:col-span-12"
        )}>

          {/* Deduplication Title & Filter Badges */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-fire-border pb-3">
            <span className="text-small font-medium text-text-muted">
              {activeTab === 'ALERTS'
                ? 'Alerts — deduplicated notable events with ownership & workflow'
                : 'Incidents — high-priority security incidents escalated from investigations'}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSeverityFilter('ALL')}
                className={clsx(
                  "px-3 py-1 rounded-md text-small font-medium transition-colors focus:outline-none border",
                  severityFilter === 'ALL' ? "bg-surface-3 text-text-primary border-fire-border" : "bg-transparent text-text-muted border-transparent hover:text-text-secondary"
                )}
              >
                All
              </button>
              <button
                onClick={() => setSeverityFilter('CRITICAL')}
                className={clsx(
                  "px-3 py-1 rounded-md text-small font-medium transition-colors focus:outline-none border border-transparent hover:bg-surface-3",
                  severityFilter === 'CRITICAL' ? "border-danger/30 text-danger bg-danger/5" : "text-text-muted"
                )}
              >
                Critical • {activeTab === 'ALERTS' ? criticalCount : incidents.filter(i => i.severity === 'CRITICAL').length}
              </button>
              <button
                onClick={() => setSeverityFilter('HIGH')}
                className={clsx(
                  "px-3 py-1 rounded-md text-small font-medium transition-colors focus:outline-none border border-transparent hover:bg-surface-3",
                  severityFilter === 'HIGH' ? "border-severity-high/30 text-severity-high bg-severity-high/5" : "text-text-muted"
                )}
              >
                High • {activeTab === 'ALERTS' ? highCount : incidents.filter(i => i.severity === 'HIGH').length}
              </button>
              <button
                onClick={() => setSeverityFilter('OPEN')}
                className={clsx(
                  "px-3 py-1 rounded-md text-small font-medium transition-colors focus:outline-none border border-transparent hover:bg-surface-3",
                  severityFilter === 'OPEN' ? "border-danger/30 text-danger bg-danger/5" : "text-text-muted"
                )}
              >
                Open • {activeTab === 'ALERTS' ? openCount : incidents.filter(i => i.status === 'OPEN').length}
              </button>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto">
            <table className="table-enterprise">
              <thead>
                <tr>
                  <th className="w-[10%]">ID</th>
                  <th className="w-[40%]">Title</th>
                  <th className="w-[12%]">Severity</th>
                  <th className="w-[10%]">Source</th>
                  <th className="w-[12%]">Status</th>
                  <th className="w-[12%]">Owner</th>
                  <th className="w-[6%] text-right"></th>
                </tr>
              </thead>
              <tbody>
                {activeTab === 'ALERTS' ? (
                  filteredAlerts.map(alert => (
                    <tr
                      key={alert.id}
                      onClick={() => { setSelectedAlert(alert); setSelectedIncident(null); }}
                      className={clsx(
                        "cursor-pointer",
                        selectedAlert?.id === alert.id && "bg-surface-3"
                      )}
                    >
                      <td className="font-mono text-small font-semibold text-danger">
                        {alert.id}
                      </td>
                      <td className="text-small font-semibold text-text-primary">
                        {alert.title}
                      </td>
                      <td>
                        <span className={getSeverityBadge(alert.severity)}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className="text-small text-text-secondary">
                        {alert.source}
                      </td>
                      <td>
                        <span className={getStatusBadge(alert.status)}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="text-small text-text-secondary font-mono">
                        {alert.ownerId || '—'}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedAlert(alert); }}
                          className="btn-mission py-1.5 px-3 text-label uppercase"
                        >
                          Respond
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  filteredIncidents.map(inc => (
                    <tr
                      key={inc.id}
                      onClick={() => { setSelectedIncident(inc); setSelectedAlert(null); }}
                      className={clsx(
                        "cursor-pointer",
                        selectedIncident?.id === inc.id && "bg-surface-3"
                      )}
                    >
                      <td className="font-mono text-small font-semibold text-danger">
                        {inc.incidentNumber}
                      </td>
                      <td className="text-small font-semibold text-text-primary">
                        {inc.title}
                      </td>
                      <td>
                        <span className={getSeverityBadge(inc.severity)}>
                          {inc.severity}
                        </span>
                      </td>
                      <td className="text-small text-text-secondary">
                        {inc.alertId ? `Escalated from ${inc.alertId}` : 'Manual'}
                      </td>
                      <td>
                        <span className={getStatusBadge(inc.status)}>
                          {inc.status}
                        </span>
                      </td>
                      <td className="text-small text-text-secondary font-mono">
                        {inc.ownerName || inc.ownerId || '—'}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedIncident(inc); }}
                          className="btn-mission py-1.5 px-3 text-label uppercase"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
                {((activeTab === 'ALERTS' && filteredAlerts.length === 0) || (activeTab === 'INCIDENTS' && filteredIncidents.length === 0)) && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-small font-medium text-text-muted">
                      No entries found matching filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Detail Drawer */}
        {activeTab === 'ALERTS' && selectedAlert && (
          <div className="md:col-span-4 card-mission flex flex-col justify-between space-y-6 animate-slide-in">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-fire-border pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-small font-semibold text-danger">{selectedAlert.id}</span>
                  <span className={getSeverityBadge(selectedAlert.severity)}>
                    {selectedAlert.severity}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedAlert(null)}
                  className="text-text-muted hover:text-text-primary transition-colors focus:outline-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Alert Summary */}
              <div className="mt-4 space-y-2">
                <span className="text-label uppercase text-text-muted block">Alert Summary</span>
                <h3 className="text-h3 text-text-primary leading-tight">{selectedAlert.title}</h3>
                <div className="text-small text-text-muted font-mono pt-1">
                  <div>{new Date(selectedAlert.createdAt).toUTCString()}</div>
                  <div className="mt-0.5">Source: {selectedAlert.source}</div>
                </div>
              </div>

              {/* Risk Indicators */}
              <div className="mt-6 space-y-3">
                <span className="text-label uppercase text-text-muted block">Risk Indicators</span>
                <div className="space-y-2">
                  {riskIndicators.length === 0 && (
                    <div className="p-3 bg-surface-2 rounded-lg text-text-muted text-small">
                      No raw event data to derive risk indicators from.
                    </div>
                  )}
                  {riskIndicators.map((risk, idx) => (
                    <div
                      key={idx}
                      className={clsx(
                        "p-3 bg-surface-2 rounded-r-lg border-l-2 text-text-secondary text-small font-medium leading-snug",
                        risk.color
                      )}
                    >
                      {risk.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw Event */}
              <div className="mt-6 space-y-2">
                <span className="text-label uppercase text-text-muted block">Raw Event</span>
                <div className="bg-surface-2 border border-fire-border rounded-lg p-4 font-mono text-small text-text-secondary overflow-x-auto whitespace-pre leading-relaxed border-l-2 border-l-accent">
                  {parsedEvent ? JSON.stringify(parsedEvent, null, 2) : 'No raw event data available for this alert.'}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="border-t border-fire-border pt-4 space-y-2.5">
              <span className="text-label uppercase text-text-muted block">Quick Actions</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleAssignToMe(selectedAlert.id)}
                  disabled={selectedAlert.ownerId === currentUsername || !canWrite}
                  title={!canWrite ? "Your role doesn't have write access to Alerts & Correlation" : undefined}
                  className={clsx(
                    "py-2.5 text-center font-semibold rounded-lg text-small transition-colors focus:outline-none border",
                    selectedAlert.ownerId === currentUsername || !canWrite
                      ? "bg-surface-3 border-fire-border text-text-muted cursor-not-allowed"
                      : "bg-accent hover:bg-accent-dark text-white border-transparent"
                  )}
                >
                  {selectedAlert.ownerId === currentUsername ? 'Assigned' : 'Assign to Me'}
                </button>
                <button
                  onClick={() => handleCreateIncident(selectedAlert)}
                  disabled={!canWrite}
                  title={!canWrite ? "Your role doesn't have write access to Alerts & Correlation" : undefined}
                  className="btn-mission disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Incident
                </button>
                <button
                  onClick={() => handleRunPlaybook(selectedAlert.id)}
                  disabled={!canWrite}
                  title={!canWrite ? "Your role doesn't have write access to Alerts & Correlation" : undefined}
                  className="btn-mission col-span-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Zap className="w-3.5 h-3.5 text-accent" /> Run Playbook
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Right Side: Incident Details Drawer */}
        {activeTab === 'INCIDENTS' && selectedIncident && (
          <div className="md:col-span-4 card-mission flex flex-col justify-between space-y-6 animate-slide-in">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-fire-border pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-small font-semibold text-danger">{selectedIncident.id}</span>
                  <span className={getSeverityBadge(selectedIncident.severity)}>
                    {selectedIncident.severity}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedIncident(null)}
                  className="text-text-muted hover:text-text-primary transition-colors focus:outline-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Incident Description */}
              <div className="mt-4 space-y-2">
                <span className="text-label uppercase text-text-muted block">Incident Detail</span>
                <h3 className="text-h3 text-text-primary leading-tight">{selectedIncident.title}</h3>
                <div className="text-small text-text-muted font-mono pt-1">
                  <div>Created: {new Date(selectedIncident.createdAt).toUTCString()}</div>
                  <div className="mt-0.5">Workflow: SOAR Automation Pipeline</div>
                </div>
              </div>

              {/* Investigation Checklist — real, persisted, toggled by real user click */}
              <div className="mt-6 space-y-3">
                <span className="text-label uppercase text-text-muted block">Investigation Checklist</span>
                <div className="space-y-2 text-small">
                  {(() => {
                    let items: { label: string; done: boolean }[] = []
                    try {
                      items = selectedIncident.checklist ? JSON.parse(selectedIncident.checklist) : []
                    } catch { items = [] }
                    if (items.length === 0) {
                      return <div className="text-text-muted text-small">No checklist items.</div>
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
                          step.done ? "bg-accent/10 border-accent text-accent" : "border-fire-border text-text-muted"
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

            {/* Quick Actions */}
            <div className="border-t border-fire-border pt-4 space-y-2.5">
              <span className="text-label uppercase text-text-muted block">Incident Workflow Actions</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleUpdateIncidentStatus(selectedIncident.id, 'MITIGATED')}
                  disabled={selectedIncident.status === 'MITIGATED' || !canWrite}
                  title={!canWrite ? "Your role doesn't have write access to Alerts & Correlation" : undefined}
                  className={clsx(
                    "col-span-2 py-2.5 text-center font-semibold rounded-lg text-small transition-colors focus:outline-none border",
                    selectedIncident.status === 'MITIGATED' || !canWrite
                      ? "bg-surface-3 border-fire-border text-text-muted cursor-not-allowed"
                      : "bg-accent hover:bg-accent-dark text-white border-transparent"
                  )}
                >
                  {selectedIncident.status === 'MITIGATED' ? 'Mitigated' : 'Mark as Mitigated'}
                </button>
              </div>
            </div>

          </div>
        )}

      </div>

    </div>
  )
}
