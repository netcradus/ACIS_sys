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
  title: string
  severity: string
  status: string
  owner: string
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

  // Local state for Incidents
  const [incidents, setIncidents] = useState<Incident[]>([
    { id: 'INC-1001', title: 'Multiple Host Compromise via Ransomware', severity: 'CRITICAL', status: 'ACTIVE', owner: 'analyst1', createdAt: new Date(Date.now() - 3600000 * 2).toISOString() },
    { id: 'INC-1002', title: 'Data Leak to External File Sharing Domain', severity: 'HIGH', status: 'INVESTIGATING', owner: 'analyst2', createdAt: new Date(Date.now() - 3600000 * 5).toISOString() },
    { id: 'INC-1003', title: 'Active Brute Force on VPN Gateway', severity: 'HIGH', status: 'ACTIVE', owner: 'analyst3', createdAt: new Date(Date.now() - 3600000 * 8).toISOString() },
    { id: 'INC-1004', title: 'Phishing Outbreak Targeting Financial Division', severity: 'MEDIUM', status: 'MITIGATED', owner: 'analyst1', createdAt: new Date(Date.now() - 3600000 * 12).toISOString() },
    { id: 'INC-1005', title: 'Suspicious Domain Controller Access Pattern', severity: 'CRITICAL', status: 'MITIGATED', owner: 'analyst2', createdAt: new Date(Date.now() - 3600000 * 24).toISOString() }
  ])

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

  // Create Incident from Alert
  const handleCreateIncident = (alert: Alert) => {
    const incId = `INC-${1000 + incidents.length + 1}`
    const newInc: Incident = {
      id: incId,
      title: alert.title,
      severity: alert.severity,
      status: 'ACTIVE',
      owner: alert.ownerId || currentUsername,
      createdAt: new Date().toISOString()
    }
    setIncidents(prev => [newInc, ...prev])
    alert(`Incident ${incId} created successfully from Alert ${alert.id}!`)
    
    // Switch to incidents tab and select it
    setActiveTab('INCIDENTS')
    setSelectedIncident(newInc)
    setSelectedAlert(null)
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
      const matchesSearch = i.title.toLowerCase().includes(searchTerm.toLowerCase()) || i.id.toLowerCase().includes(searchTerm.toLowerCase())
      if (!matchesSearch) return false

      if (severityFilter === 'CRITICAL') return i.severity === 'CRITICAL'
      if (severityFilter === 'HIGH') return i.severity === 'HIGH'
      if (severityFilter === 'OPEN') return i.status === 'ACTIVE'
      return true
    })
  }, [incidents, searchTerm, severityFilter])

  // Parse Raw Event
  const parsedEvent = useMemo(() => {
    if (!selectedAlert || !selectedAlert.rawEvent) {
      return {
        eventId: 4625,
        src_ip: "10.0.12.44",
        user: "j.singh",
        target: "dc-prod-01",
        failures: 847,
        window: "60s"
      }
    }
    try {
      return JSON.parse(selectedAlert.rawEvent)
    } catch (e) {
      return { error: 'Failed to parse raw event data', raw: selectedAlert.rawEvent }
    }
  }, [selectedAlert])

  // Get Risk Indicators based on selected alert
  const riskIndicators = useMemo(() => {
    if (!selectedAlert) return []
    try {
      const title = selectedAlert.title.toLowerCase()
      if (title.includes('stuffing') || title.includes('login') || title.includes('failure')) {
        const failures = parsedEvent?.failures || 847
        const srcIp = parsedEvent?.src_ip || '10.0.12.44'
        const target = parsedEvent?.target || 'dc-prod-01'
        return [
          { label: `${failures} failed authentications in 60 seconds`, color: 'border-l-danger' },
          { label: `Source IP ${srcIp} — 1st appearance`, color: 'border-l-severity-high' },
          { label: `Target: ${target}`, color: 'border-l-severity-medium' }
        ]
      }
      if (title.includes('beaconing') || title.includes('domain') || title.includes('outbound')) {
        const domain = parsedEvent?.domain || 'cdn-x7.io'
        const dest = parsedEvent?.destination || '185.199.110.153'
        const src = parsedEvent?.src_ip || '10.0.12.50'
        return [
          { label: `Egress traffic to anomalous domain ${domain}`, color: 'border-l-danger' },
          { label: `Source host: ${src}`, color: 'border-l-severity-high' },
          { label: `Destination IP: ${dest}`, color: 'border-l-severity-medium' }
        ]
      }
      if (title.includes('asr') || title.includes('bypass') || title.includes('lolbin')) {
        const proc = parsedEvent?.process || 'powershell.exe'
        const parent = parsedEvent?.parent_process || 'cmd.exe'
        return [
          { label: `ASR bypass trigger by ${proc}`, color: 'border-l-danger' },
          { label: `Parent process: ${parent}`, color: 'border-l-severity-high' },
          { label: `Command arguments bypass detection signatures`, color: 'border-l-severity-medium' }
        ]
      }
      if (title.includes('travel')) {
        const user = parsedEvent?.user || 'a.patel'
        const c1 = parsedEvent?.login_1_city || 'Mumbai'
        const c2 = parsedEvent?.login_2_city || 'London'
        return [
          { label: `User ${user} travel anomaly detected`, color: 'border-l-danger' },
          { label: `Login 1: ${c1} | Login 2: ${c2}`, color: 'border-l-severity-high' },
          { label: `Time difference of 15 minutes physically impossible`, color: 'border-l-severity-medium' }
        ]
      }
    } catch (e) {
      // fallback
    }
    return [
      { label: `Anomalous security alert trigger`, color: 'border-l-danger' },
      { label: `Source component: ${selectedAlert.source}`, color: 'border-l-severity-high' },
      { label: `Risk rating calculated based on alert signature`, color: 'border-l-severity-medium' }
    ]
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
                Open • {activeTab === 'ALERTS' ? openCount : incidents.filter(i => i.status === 'ACTIVE').length}
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
                        {inc.id}
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
                        SOAR
                      </td>
                      <td>
                        <span className={getStatusBadge(inc.status)}>
                          {inc.status}
                        </span>
                      </td>
                      <td className="text-small text-text-secondary font-mono">
                        {inc.owner}
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
                <span className="text-label uppercase text-text-muted block">Raw Event (Sample)</span>
                <div className="bg-surface-2 border border-fire-border rounded-lg p-4 font-mono text-small text-text-secondary overflow-x-auto whitespace-pre leading-relaxed border-l-2 border-l-accent">
                  {JSON.stringify(parsedEvent, null, 2)}
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

              {/* Timeline Status */}
              <div className="mt-6 space-y-3">
                <span className="text-label uppercase text-text-muted block">Investigation Checklist</span>
                <div className="space-y-2 text-small">
                  {[
                    { title: 'Triage & Scope Assessment', done: true },
                    { title: 'Threat Intelligence Lookup (SIEM/EDR)', done: true },
                    { title: 'Automated Isolation Playbook Triggered', done: selectedIncident.status === 'MITIGATED' },
                    { title: 'Final Resolution Signature', done: selectedIncident.status === 'MITIGATED' }
                  ].map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 py-1">
                      <div className={clsx(
                        "w-4 h-4 rounded border flex items-center justify-center font-semibold text-[9px] shrink-0",
                        step.done ? "bg-accent/10 border-accent text-accent" : "border-fire-border text-text-muted"
                      )}>
                        {step.done ? '✓' : ''}
                      </div>
                      <span className={clsx("font-medium", step.done ? "text-text-secondary" : "text-text-muted")}>{step.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="border-t border-fire-border pt-4 space-y-2.5">
              <span className="text-label uppercase text-text-muted block">Incident Workflow Actions</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setIncidents(prev => prev.map(i => i.id === selectedIncident.id ? { ...i, status: 'MITIGATED' } : i))
                    setSelectedIncident(prev => prev && prev.id === selectedIncident.id ? { ...prev, status: 'MITIGATED' } : prev)
                  }}
                  disabled={selectedIncident.status === 'MITIGATED'}
                  className={clsx(
                    "col-span-2 py-2.5 text-center font-semibold rounded-lg text-small transition-colors focus:outline-none border",
                    selectedIncident.status === 'MITIGATED'
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
