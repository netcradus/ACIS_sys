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
import { toast } from '@/store/toastStore'
import { clsx } from 'clsx'
import type { Alert, Incident, AlertAnalytics, AlertFilterValues, TimelineEntry } from '@/types/alert'
import './AlertsPage.css'

// Real classifier categories the AI model predicts and trains on — kept in
// sync manually with ai-service's CLASSES list and AlertController's
// VALID_CATEGORIES (separate Python/Java processes, no shared enum).
const ALERT_CATEGORIES = [
  { value: 'malware', label: 'Malware' },
  { value: 'exfiltration', label: 'Exfiltration' },
  { value: 'lateral_movement', label: 'Lateral Movement' },
  { value: 'phishing', label: 'Phishing' },
  { value: 'privilege_escalation', label: 'Privilege Escalation' },
  { value: 'benign', label: 'Benign' },
]

const EMPTY_FILTER_VALUES: AlertFilterValues = { sources: [], statuses: [], owners: [] }

/** Defensive normalization — a test/mocked or malformed API response might not have this exact shape; never let a missing field crash the page. */
function normalizeFilterValues(data: unknown): AlertFilterValues {
  const d = data as Partial<AlertFilterValues> | null | undefined
  return {
    sources: Array.isArray(d?.sources) ? d!.sources : [],
    statuses: Array.isArray(d?.statuses) ? d!.statuses : [],
    owners: Array.isArray(d?.owners) ? d!.owners : [],
  }
}

/** Defensive normalization — see normalizeFilterValues. A non-object response (e.g. a test's catch-all `{data: []}`) must never crash chart rendering. */
function normalizeAnalytics(data: unknown): AlertAnalytics | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Partial<AlertAnalytics>
  return {
    severityCounts: d.severityCounts && typeof d.severityCounts === 'object' ? d.severityCounts : {},
    statusCounts: d.statusCounts && typeof d.statusCounts === 'object' ? d.statusCounts : {},
    sourceCounts: d.sourceCounts && typeof d.sourceCounts === 'object' ? d.sourceCounts : {},
    trend: {
      buckets: Array.isArray(d.trend?.buckets) ? d.trend!.buckets : [],
      fromEpochMs: d.trend?.fromEpochMs ?? Date.now() - 24 * 60 * 60 * 1000,
      toEpochMs: d.trend?.toEpochMs ?? Date.now(),
      bucketMinutes: d.trend?.bucketMinutes ?? 60,
    },
  }
}

const DONUT_COLORS = ['var(--blue)', 'var(--cyan)', 'var(--amber)', 'var(--purple)', '#94a3b8']

export default function AlertsPage() {
  const { user } = useAuthStore()
  const currentUsername = user?.preferredUsername || user?.email || 'me'
  const canWrite = useCanWrite(MODULES.ALERTS_CORRELATION)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'ALERTS' | 'INCIDENTS'>('ALERTS')
  const [searchTerm, setSearchTerm] = useState('')
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'OPEN'>('ALL')
  const [sourceFilter, setSourceFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [ownerFilter, setOwnerFilter] = useState('ALL')
  const [filterOptions, setFilterOptions] = useState<AlertFilterValues>(EMPTY_FILTER_VALUES)

  const [analytics, setAnalytics] = useState<AlertAnalytics | null>(null)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)

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
  const [incidentsError, setIncidentsError] = useState<string | null>(null)

  const fetchIncidents = async () => {
    try {
      setIncidentsLoading(true)
      setIncidentsError(null)
      const res = await apiClient.get('/api/incidents')
      setIncidents(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      console.error('Failed to fetch incidents:', e)
      setIncidentsError('Unable to load incidents. Please try again.')
    } finally {
      setIncidentsLoading(false)
    }
  }

  const fetchAlerts = async () => {
    setIsLoading(true)
    setAlertsError(null)
    try {
      const response = await apiClient.get('/api/alerts')
      const sortedAlerts = response.data.sort((a: Alert, b: Alert) => b.id.localeCompare(a.id))
      setAlerts(sortedAlerts)

      if (sortedAlerts.length > 0 && !selectedAlert) {
        setSelectedAlert(sortedAlerts[0])
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
      setAlertsError('Unable to load alerts. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchFilterOptions = async () => {
    try {
      const res = await apiClient.get('/api/alerts/filters')
      setFilterOptions(normalizeFilterValues(res.data))
    } catch (e) {
      console.error('Failed to fetch filter values:', e)
      // Non-fatal — dropdowns just show "All X" only, never fake options.
    }
  }

  const fetchAnalytics = async () => {
    try {
      const res = await apiClient.get('/api/alerts/analytics')
      setAnalytics(normalizeAnalytics(res.data))
      setAnalyticsError(null)
    } catch (e) {
      console.error('Failed to fetch alert analytics:', e)
      setAnalyticsError('Unable to load analytics.')
    }
  }

  useEffect(() => {
    fetchAlerts()
    fetchIncidents()
    fetchFilterOptions()
    fetchAnalytics()

    const pollInterval = setInterval(fetchAnalytics, 30000)

    const sub = wsClient.subscribe('/topic/alerts', (message) => {
      try {
        const incoming: Alert = JSON.parse(message.body)
        setAlerts(prev => {
          const idx = prev.findIndex(a => a.id === incoming.id)
          if (idx === -1) return [incoming, ...prev]
          const next = [...prev]
          next[idx] = incoming
          return next
        })
        setSelectedAlert(prev => (prev && prev.id === incoming.id ? incoming : prev))
        fetchAnalytics()
      } catch (e) {
        console.error('Malformed WebSocket message:', e)
        fetchAlerts()
      }
    })

    const incSub = wsClient.subscribe('/topic/incidents', (message) => {
      try {
        const incoming = JSON.parse(message.body)
        if (incoming?.deleted) {
          setIncidents(prev => prev.filter(i => i.id !== incoming.id))
          setSelectedIncident(prev => (prev && prev.id === incoming.id ? null : prev))
          return
        }
        setIncidents(prev => {
          const idx = prev.findIndex(i => i.id === incoming.id)
          if (idx === -1) return [incoming, ...prev]
          const next = [...prev]
          next[idx] = incoming
          return next
        })
        setSelectedIncident(prev => (prev && prev.id === incoming.id ? incoming : prev))
      } catch (e) {
        console.error('Malformed WebSocket message:', e)
        fetchIncidents()
      }
    })

    return () => {
      clearInterval(pollInterval)
      sub.then(s => s?.unsubscribe())
      incSub.then(s => s?.unsubscribe())
    }
  }, [])

  const fetchTimeline = () => {
    const entityId = selectedAlert?.id ?? selectedIncident?.id
    const kind = selectedAlert ? 'alerts' : selectedIncident ? 'incidents' : null
    if (!entityId || !kind) {
      setTimeline([])
      setTimelineError(null)
      return
    }
    setTimelineLoading(true)
    setTimelineError(null)
    apiClient.get(`/api/${kind}/${entityId}/timeline`)
      .then(res => setTimeline(Array.isArray(res.data) ? res.data : []))
      .catch((e) => {
        console.error('Failed to fetch investigation timeline:', e)
        setTimelineError('Unable to load investigation timeline.')
      })
      .finally(() => setTimelineLoading(false))
  }

  useEffect(() => {
    fetchTimeline()
  }, [selectedAlert?.id, selectedIncident?.id])

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
      toast.error('Failed to assign alert to you.')
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
      toast.error(e?.response?.data?.error?.message || e?.message || 'Failed to create incident')
    }
  }

  const handleUpdateIncidentStatus = async (incidentId: string, status: string) => {
    try {
      const res = await apiClient.put(`/api/incidents/${incidentId}/status?status=${status}`)
      setIncidents(prev => prev.map(i => i.id === incidentId ? res.data : i))
      setSelectedIncident(prev => prev && prev.id === incidentId ? res.data : prev)
    } catch (e) {
      console.error('Failed to update incident status:', e)
      toast.error('Failed to mark incident as mitigated.')
    }
  }

  const handleToggleChecklistItem = async (incidentId: string, index: number) => {
    try {
      const res = await apiClient.put(`/api/incidents/${incidentId}/checklist`, { index })
      setIncidents(prev => prev.map(i => i.id === incidentId ? res.data : i))
      setSelectedIncident(prev => prev && prev.id === incidentId ? res.data : prev)
    } catch (e) {
      console.error('Failed to update checklist:', e)
      toast.error('Failed to update checklist item.')
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
      toast.error('Failed to dismiss alert.')
    }
  }

  const [categorySelection, setCategorySelection] = useState('')
  const [categoryConfirming, setCategoryConfirming] = useState(false)
  const [categoryConfirmError, setCategoryConfirmError] = useState<string | null>(null)

  useEffect(() => {
    setCategorySelection(selectedAlert?.confirmedCategory || '')
    setCategoryConfirmError(null)
  }, [selectedAlert?.id])

  // Real ground-truth label for the AI retraining pipeline — analyst
  // confirms the true category as they resolve the alert. Also marks the
  // alert MITIGATED in the same request, since confirming a category is
  // part of closing it out, not a separate step.
  const handleConfirmCategory = async (alertId: string) => {
    if (!categorySelection) return
    setCategoryConfirming(true)
    setCategoryConfirmError(null)
    try {
      const res = await apiClient.put(`/api/alerts/${alertId}`, {
        confirmedCategory: categorySelection,
        status: 'MITIGATED',
      })
      if (res.data) {
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, confirmedCategory: categorySelection, status: 'MITIGATED' } : a))
        setSelectedAlert(prev => prev && prev.id === alertId ? { ...prev, confirmedCategory: categorySelection, status: 'MITIGATED' } : prev)
      }
    } catch (e: any) {
      console.error('Failed to confirm category:', e)
      setCategoryConfirmError(e?.response?.data?.error || 'Failed to confirm category.')
    } finally {
      setCategoryConfirming(false)
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
        toast.warning('No active SOAR playbooks found.')
      }
    } catch (e) {
      console.error('Playbook execution failed:', e)
      toast.error('Error triggering SOAR playbook execution.')
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

      if (severityFilter === 'CRITICAL' && a.severity !== 'CRITICAL') return false
      if (severityFilter === 'HIGH' && a.severity !== 'HIGH') return false
      if (severityFilter === 'OPEN' && a.status !== 'OPEN') return false
      if (sourceFilter !== 'ALL' && a.source !== sourceFilter) return false
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false
      if (ownerFilter !== 'ALL' && a.ownerId !== ownerFilter) return false
      return true
    })
  }, [alerts, searchTerm, severityFilter, sourceFilter, statusFilter, ownerFilter])

  const filteredIncidents = useMemo(() => {
    return incidents.filter(i => {
      const matchesSearch = i.title.toLowerCase().includes(searchTerm.toLowerCase()) || i.incidentNumber.toLowerCase().includes(searchTerm.toLowerCase())
      if (!matchesSearch) return false

      if (severityFilter === 'CRITICAL' && i.severity !== 'CRITICAL') return false
      if (severityFilter === 'HIGH' && i.severity !== 'HIGH') return false
      if (severityFilter === 'OPEN' && i.status !== 'OPEN') return false
      if (statusFilter !== 'ALL' && i.status !== statusFilter) return false
      if (ownerFilter !== 'ALL' && i.ownerId !== ownerFilter) return false
      return true
    })
  }, [incidents, searchTerm, severityFilter, statusFilter, ownerFilter])

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

  /** Real per-action icon/color for the Investigation Timeline — derived from the actual audit action string, never a fixed sequence. */
  const getTimelineIconMeta = (action: string) => {
    if (action.includes('LABELED') || action.includes('MITIGAT')) return { icon: '↺', colorClass: 'green' }
    if (action.includes('STATUS_CHANGE')) return { icon: '🔍', colorClass: 'amber' }
    if (action.includes('CREATE')) return { icon: '👤', colorClass: 'blue' }
    if (action.includes('DELETE')) return { icon: '⊘', colorClass: 'red' }
    return { icon: '📝', colorClass: 'cyan' }
  }

  const getStatusLabelClass = (status: string) => {
    const s = status?.toUpperCase() || 'OPEN'
    if (s === 'OPEN' || s === 'ACTIVE') return 'text-red font-semibold'
    if (s === 'INVESTIGATING' || s === 'ASSIGNED') return 'text-amber font-semibold'
    if (s === 'MITIGATED') return 'text-green font-semibold'
    return 'text-muted font-semibold'
  }

  // Top Alert Sources donut — real per-actual-source-value counts from the
  // backend's GROUP BY aggregation, ranked, top 4 + "Other" so an arbitrary
  // number of distinct real sources still renders legibly. Replaces the
  // previous substring-heuristic buckets that didn't correspond to any real
  // source value.
  const sourceSlices = useMemo(() => {
    if (!analytics) return []
    const entries = Object.entries(analytics.sourceCounts).sort((a, b) => b[1] - a[1])
    const top = entries.slice(0, 4)
    const otherTotal = entries.slice(4).reduce((sum, [, c]) => sum + c, 0)
    const all: [string, number][] = otherTotal > 0 ? [...top, ['Other', otherTotal]] : top
    const total = all.reduce((sum, [, c]) => sum + c, 0) || 1
    const circ = 2 * Math.PI * 58 // ~364.42
    let offsetAcc = 0
    return all.map(([label, count], i) => {
      const dash = (count / total) * circ
      const slice = { label, count, dash, offset: -offsetAcc, color: DONUT_COLORS[i % DONUT_COLORS.length] }
      offsetAcc += dash
      return slice
    })
  }, [analytics])
  const sourceSlicesCirc = 2 * Math.PI * 58

  // Workflow status bars — real status counts from the backend's GROUP BY
  // aggregation (single source of truth with Quick Summary's own counts).
  const workflowCounts = useMemo(() => {
    const counts = analytics?.statusCounts || {}
    const triage = counts['OPEN'] || 0
    const progress = (counts['ASSIGNED'] || 0) + (counts['INVESTIGATING'] || 0)
    const fp = counts['DISMISSED'] || 0
    const remediated = counts['MITIGATED'] || 0
    const max = Math.max(triage, progress, fp, remediated, 1)

    return {
      triage: (triage / max) * 100,
      progress: (progress / max) * 100,
      fp: (fp / max) * 100,
      remediated: (remediated / max) * 100
    }
  }, [analytics])

  // Real Severity Trend line points, computed from the backend's real
  // time-bucketed counts — replaces the previous literal hardcoded
  // <polyline> coordinates.
  const trendPoints = useMemo(() => {
    const buckets = analytics?.trend.buckets || []
    if (buckets.length === 0) return { critical: '', high: '', medium: '' }
    const max = Math.max(1, ...buckets.flatMap(b => Object.values(b.counts)))
    const toY = (v: number) => 160 - (v / max) * 160
    const toX = (i: number) => (buckets.length > 1 ? (i / (buckets.length - 1)) * 320 : 160)
    const line = (sev: string) => buckets.map((b, i) => `${toX(i)},${toY(b.counts[sev] || 0)}`).join(' ')
    return { critical: line('CRITICAL'), high: line('HIGH'), medium: line('MEDIUM') }
  }, [analytics])

  const trendAxisLabels = useMemo(() => {
    const buckets = analytics?.trend.buckets || []
    if (buckets.length === 0) return []
    const step = Math.max(1, Math.ceil(buckets.length / 6))
    return buckets
      .map((b, i) => ({ i, label: new Date(b.bucketStart).toLocaleTimeString([], { hour: '2-digit' }) }))
      .filter(({ i }) => i % step === 0 || i === buckets.length - 1)
  }, [analytics])

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
                <div className="select-pill">
                  <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                    <option value="ALL">All Sources</option>
                    {filterOptions.sources.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="select-pill">
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="ALL">All Statuses</option>
                    {filterOptions.statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="select-pill">
                  <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
                    <option value="ALL">All Owners</option>
                    {filterOptions.owners.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
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
                <colgroup>
                  <col style={{ width: '90px' }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '130px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '140px' }} />
                  <col style={{ width: '150px' }} />
                </colgroup>
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
                  {activeTab === 'ALERTS' && isLoading && (
                    <tr><td colSpan={7} className="text-center text-text-muted py-6">Loading...</td></tr>
                  )}
                  {activeTab === 'ALERTS' && !isLoading && alertsError && (
                    <tr>
                      <td colSpan={7}>
                        <div className="flex flex-col items-center gap-2 py-4">
                          <span>Unable to load alerts. Please try again.</span>
                          <button className="btn-mission text-small px-3 py-1.5" onClick={fetchAlerts}>Retry</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {activeTab === 'INCIDENTS' && incidentsLoading && (
                    <tr><td colSpan={7} className="text-center text-text-muted py-6">Loading...</td></tr>
                  )}
                  {activeTab === 'INCIDENTS' && !incidentsLoading && incidentsError && (
                    <tr>
                      <td colSpan={7}>
                        <div className="flex flex-col items-center gap-2 py-4">
                          <span>Unable to load incidents. Please try again.</span>
                          <button className="btn-mission text-small px-3 py-1.5" onClick={fetchIncidents}>Retry</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {activeTab === 'ALERTS' && !isLoading && !alertsError && filteredAlerts.map((alert) => {
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
                          <td className="title-cell" style={{ fontWeight: 700 }}>
                            <span className="title-text" title={alert.title}>{alert.title}</span>
                            <div className="badge-row">
                              {alert.isAnomaly && (
                                <span
                                  className="sev-badge high"
                                  style={{ fontSize: '0.7em' }}
                                  title={`Anomaly score ${alert.anomalyScore?.toFixed(2) ?? '—'} (ai-service)${alert.anomalyFeatures ? ` — drivers: ${alert.anomalyFeatures}` : ''}`}
                                >
                                  ⚠ Anomaly
                                </span>
                              )}
                              {alert.riskScore != null && (
                                <span
                                  className="sev-badge medium"
                                  style={{ fontSize: '0.7em' }}
                                  title="Rule-authored risk score"
                                >
                                  Risk {alert.riskScore}
                                </span>
                              )}
                              {alert.mitreTechniques?.map((t) => (
                                <span
                                  key={t}
                                  className="sev-badge medium"
                                  style={{ fontSize: '0.7em' }}
                                  title="MITRE ATT&CK technique"
                                >
                                  {t}
                                </span>
                              ))}
                              {alert.iocMatched && (
                                <span
                                  className="sev-badge critical"
                                  style={{ fontSize: '0.7em' }}
                                  title={`Known threat indicator — ${alert.iocSeverity ?? '—'} (${alert.iocSource ?? 'threat intel'})`}
                                >
                                  ⚠ IOC Match
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={clsx("sev-badge", severity)}>{badgeChar}</span>
                          </td>
                          <td className="ellipsis-cell" title={alert.source || undefined}>{alert.source}</td>
                          <td className={getStatusLabelClass(alert.status)}>{alert.status}</td>
                          <td className="owner-name ellipsis-cell font-mono" title={alert.ownerName || alert.ownerId || undefined}>{alert.ownerName || alert.ownerId || '—'}</td>
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
                    })}
                  {activeTab === 'INCIDENTS' && !incidentsLoading && !incidentsError && filteredIncidents.map((inc) => {
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
                          <td className="title-cell" style={{ fontWeight: 700 }}>
                            <span className="title-text" title={inc.title}>{inc.title}</span>
                          </td>
                          <td>
                            <span className={clsx("sev-badge", severity)}>{badgeChar}</span>
                          </td>
                          <td className="ellipsis-cell">{inc.alertId ? `Alert ${inc.alertId}` : 'Manual'}</td>
                          <td className={getStatusLabelClass(inc.status)}>{inc.status}</td>
                          <td className="owner-name ellipsis-cell font-mono" title={inc.ownerName || inc.ownerId || undefined}>{inc.ownerName || inc.ownerId || '—'}</td>
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
                    })}
                  {activeTab === 'ALERTS' && !isLoading && !alertsError && filteredAlerts.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--dim)' }}>
                        No notable alerts found
                      </td>
                    </tr>
                  )}
                  {activeTab === 'INCIDENTS' && !incidentsLoading && !incidentsError && filteredIncidents.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--dim)' }}>
                        No incidents found
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
                    {selectedAlert.isAnomaly && (
                      <span
                        className="sev-badge high"
                        style={{ fontSize: '0.75em' }}
                        title={selectedAlert.anomalyFeatures ? `Drivers: ${selectedAlert.anomalyFeatures}` : undefined}
                      >
                        ⚠ Anomaly ({selectedAlert.anomalyScore?.toFixed(2) ?? '—'})
                      </span>
                    )}
                    {selectedAlert.riskScore != null && (
                      <span className="sev-badge medium" style={{ fontSize: '0.75em' }} title="Rule-authored risk score">
                        Risk {selectedAlert.riskScore}
                      </span>
                    )}
                    {selectedAlert.mitreTechniques?.map((t) => (
                      <span key={t} className="sev-badge medium" style={{ fontSize: '0.75em' }} title="MITRE ATT&CK technique">
                        {t}
                      </span>
                    ))}
                    {selectedAlert.iocMatched && (
                      <span
                        className="sev-badge critical"
                        style={{ fontSize: '0.75em' }}
                        title={`Known threat indicator — ${selectedAlert.iocSeverity ?? '—'} (${selectedAlert.iocSource ?? 'threat intel'})`}
                      >
                        ⚠ IOC Match
                      </span>
                    )}
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

              {/* Category Confirmation — real ground-truth label for AI retraining */}
              <div className="border-t border-border-soft pt-4 space-y-2">
                <span className="text-label uppercase text-text-muted block">
                  Confirm Category {selectedAlert.confirmedCategory && (
                    <span className="text-green normal-case font-normal">
                      · labeled {selectedAlert.labeledAt ? new Date(selectedAlert.labeledAt).toLocaleString() : ''}
                    </span>
                  )}
                </span>
                <p className="text-small text-text-muted">
                  Confirming the real category resolves this alert and trains the AI classifier's next retraining cycle.
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={categorySelection}
                    onChange={(e) => setCategorySelection(e.target.value)}
                    disabled={!canWrite || categoryConfirming}
                    className="select-pill flex-1"
                  >
                    <option value="">Select category…</option>
                    {ALERT_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleConfirmCategory(selectedAlert.id)}
                    disabled={!canWrite || categoryConfirming || !categorySelection}
                    className="py-2.5 px-4 text-center font-semibold rounded-lg text-small transition-colors border bg-green text-white border-transparent disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {categoryConfirming ? 'Saving…' : 'Confirm & Resolve'}
                  </button>
                </div>
                {categoryConfirmError && (
                  <div className="text-small text-red">{categoryConfirmError}</div>
                )}
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
              {analytics && (
                <div className="date-pill">
                  📅 {new Date(analytics.trend.fromEpochMs).toLocaleDateString()} – {new Date(analytics.trend.toEpochMs).toLocaleDateString()}
                </div>
              )}
              <div className="range-pill">Past 24h</div>
            </div>
            {!analytics && !analyticsError && (
              <div className="chart-empty-state">Loading trend…</div>
            )}
            {analyticsError && (
              <div className="chart-empty-state">
                <span>{analyticsError}</span>
                <button className="btn-mission text-small px-3 py-1.5" onClick={fetchAnalytics}>Retry</button>
              </div>
            )}
            {analytics && !analyticsError && analytics.trend.buckets.length === 0 && (
              <div className="chart-empty-state">No alert activity in this period</div>
            )}
            {analytics && !analyticsError && analytics.trend.buckets.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <svg viewBox="0 0 320 200" width="100%" height="200" style={{ flex: 1 }}>
                    <line x1="0" y1="0" x2="320" y2="0" stroke="var(--svg-grid-line)" />
                    <line x1="0" y1="40" x2="320" y2="40" stroke="var(--svg-grid-line)" />
                    <line x1="0" y1="80" x2="320" y2="80" stroke="var(--svg-grid-line)" />
                    <line x1="0" y1="120" x2="320" y2="120" stroke="var(--svg-grid-line)" />
                    <line x1="0" y1="160" x2="320" y2="160" stroke="var(--svg-grid-line)" />
                    <polyline points={trendPoints.critical} fill="none" stroke="var(--red)" strokeWidth="2.5" />
                    <polyline points={trendPoints.high} fill="none" stroke="var(--amber)" strokeWidth="2.5" />
                    <polyline points={trendPoints.medium} fill="none" stroke="#facc15" strokeWidth="2" />
                  </svg>
                  <div className="legend-list" style={{ flex: 'none', paddingTop: '4px' }}>
                    <div><span className="d" style={{ background: 'var(--red)' }}></span>Critical</div>
                    <div><span className="d" style={{ background: 'var(--amber)' }}></span>High</div>
                    <div><span className="d" style={{ background: '#facc15' }}></span>Medium</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontSize: '11px', color: 'var(--dim)', fontWeight: 700, marginTop: '4px' }}>
                  {trendAxisLabels.map(({ i, label }) => <span key={i}>{label}</span>)}
                </div>
              </>
            )}
          </div>

          <div className="chart-card">
            <div className="chart-head">
              <h3>Top Alert Sources</h3>
            </div>
            {sourceSlices.length === 0 ? (
              <div className="chart-empty-state">No alert sources yet</div>
            ) : (
              <div className="donut-row">
                <svg viewBox="0 0 160 160" width="150" height="150" style={{ transform: 'rotate(-90deg)' }}>
                  {sourceSlices.map(slice => (
                    <circle
                      key={slice.label}
                      cx="80" cy="80" r="58" fill="none"
                      stroke={slice.color}
                      strokeWidth="24"
                      strokeDasharray={`${slice.dash} ${sourceSlicesCirc - slice.dash}`}
                      strokeDashoffset={slice.offset}
                    />
                  ))}
                </svg>
                <div className="legend-list">
                  {sourceSlices.map(slice => (
                    <div key={slice.label} className="ellipsis-cell" title={slice.label}>
                      <span className="d" style={{ background: slice.color }}></span>
                      {slice.label}
                      <span className="n" style={{ marginLeft: '12px' }}>{slice.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              {tickerAlerts.length === 0 ? (
                <div className="chart-empty-state">No recent alerts</div>
              ) : (
                tickerAlerts.map((item, idx) => (
                  <div key={idx} className="ticker-item">
                    <span className="tdot"></span>
                    <b>{item.title}:</b> {item.desc}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bottom-card">
            <h3>Alert Investigation Timeline</h3>
            {!(selectedAlert || selectedIncident) && (
              <div className="chart-empty-state">Select an alert or incident to view its history</div>
            )}
            {(selectedAlert || selectedIncident) && timelineLoading && (
              <div className="chart-empty-state">Loading timeline…</div>
            )}
            {(selectedAlert || selectedIncident) && !timelineLoading && timelineError && (
              <div className="chart-empty-state">
                <span>{timelineError}</span>
                <button className="btn-mission text-small px-3 py-1.5" onClick={fetchTimeline}>Retry</button>
              </div>
            )}
            {(selectedAlert || selectedIncident) && !timelineLoading && !timelineError && timeline.length === 0 && (
              <div className="chart-empty-state">No investigation activity recorded yet</div>
            )}
            {(selectedAlert || selectedIncident) && !timelineLoading && !timelineError && timeline.length > 0 && (
              <div className="invest-flow">
                {timeline.map((entry, idx) => {
                  const meta = getTimelineIconMeta(entry.action)
                  return (
                    <React.Fragment key={entry.id}>
                      {idx > 0 && <div className="invest-arrow">→</div>}
                      <div
                        className="invest-step"
                        title={`${entry.action} by ${entry.user ?? 'unknown'} at ${new Date(entry.timestamp).toLocaleString()}`}
                      >
                        <div className={clsx('invest-icon', meta.colorClass)}>{meta.icon}</div>
                        <div className="invest-lbl">{entry.action.replaceAll('_', ' ')}</div>
                      </div>
                    </React.Fragment>
                  )
                })}
              </div>
            )}
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
