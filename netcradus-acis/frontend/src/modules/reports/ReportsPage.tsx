import React, { useEffect, useState, useMemo } from 'react'
import { FileText, Printer, Download, Settings, Search, Plus, X, CheckCircle2, Clock, Activity } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { useCanWrite, useCanAdmin, MODULES } from '@/store/permissionsStore'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { toast } from '@/store/toastStore'
import './ReportsPage.css'

interface ReportSchedule {
  id: string
  reportName: string
  format: string // PDF, PPTX, CSV
  frequency: string // Weekly Mon 08:00, Monthly 1st, etc.
  nextRun: string
  recipients: string
  status: string // Active, Paused
}

interface Alert {
  id: string
  title: string
  status: string // OPEN, CLOSED, INVESTIGATING
  severity: string
  createdAt: string
}

interface Incident {
  id: string
  incidentNumber: string
  title: string
  severity: string
  status: string
  createdAt: string
  updatedAt: string
}

interface RedTeamSimulation {
  id: string
  mitreTechniques: string[]
}

interface RedTeamExecutionSummary {
  simulationId: string
  status: string
  stepLogs: string
}

export default function ReportsPage() {
  const canWrite = useCanWrite(MODULES.REPORTS_COMPLIANCE)
  const canAdmin = useCanAdmin(MODULES.REPORTS_COMPLIANCE)
  const [schedules, setSchedules] = useState<ReportSchedule[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [redTeamSimulations, setRedTeamSimulations] = useState<RedTeamSimulation[]>([])
  const [redTeamExecutions, setRedTeamExecutions] = useState<RedTeamExecutionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newReportName, setNewReportName] = useState('')
  const [newFormat, setNewFormat] = useState('PDF')
  const [newFrequency, setNewFrequency] = useState('Weekly Mon 08:00')
  const [newRecipients, setNewRecipients] = useState('4 recipients')
  const [deleteScheduleId, setDeleteScheduleId] = useState<string | null>(null)
  const [deleteScheduleBusy, setDeleteScheduleBusy] = useState(false)

  // Opens the real "Add Export Schedule" modal pre-filled for one of the
  // report preview cards below — reuses the same create-schedule flow/API
  // rather than a separate, fake "layout options" concept that has no
  // backend support (ReportSchedule has no layout field).
  const openScheduleModalFor = (reportName: string, format: string) => {
    setNewReportName(reportName)
    setNewFormat(format)
    setIsModalOpen(true)
  }

  const fetchData = async () => {
    setLoading(true)
    setDataError(null)
    try {
      const [schedulesRes, alertsRes, incidentsRes, simsRes, execsRes] = await Promise.all([
        apiClient.get('/api/soar/reports/schedules'),
        apiClient.get('/api/alerts'),
        apiClient.get('/api/incidents'),
        apiClient.get('/api/red-team/simulations'),
        apiClient.get('/api/red-team/executions')
      ])
      setSchedules(schedulesRes.data || [])
      setAlerts(alertsRes.data || [])
      setIncidents(incidentsRes.data || [])
      setRedTeamSimulations(simsRes.data || [])
      setRedTeamExecutions(execsRes.data || [])
    } catch (err) {
      console.error("Failed to fetch reports details", err)
      setDataError('Unable to load reports data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Toggle Schedule Status
  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'Active' ? 'Paused' : 'Active'
    try {
      await apiClient.put(`/api/soar/reports/schedules/${id}/status?status=${nextStatus}`)
      fetchData()
    } catch (e) {
      console.error(e)
      toast.error('Failed to update schedule status.')
    }
  }

  // Add Schedule
  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        reportName: newReportName,
        format: newFormat,
        frequency: newFrequency,
        recipients: newRecipients,
        status: 'Active'
      }
      await apiClient.post('/api/soar/reports/schedules', payload)
      setIsModalOpen(false)
      setNewReportName('')
      toast.success('Export schedule created.')
      fetchData()
    } catch (e) {
      console.error(e)
      toast.error('Failed to create export schedule.')
    }
  }

  // Delete Schedule
  const handleDeleteSchedule = (id: string) => {
    setDeleteScheduleId(id)
  }

  const confirmDeleteSchedule = async () => {
    if (!deleteScheduleId) return
    setDeleteScheduleBusy(true)
    try {
      await apiClient.delete(`/api/soar/reports/schedules/${deleteScheduleId}`)
      setDeleteScheduleId(null)
      fetchData()
    } catch (e) {
      console.error(e)
      toast.error('Failed to delete scheduled export.')
    } finally {
      setDeleteScheduleBusy(false)
    }
  }

  // Dynamically generate file downloads
  const triggerDownload = (reportType: string) => {
    let content = `NETCRADUS ACIS REPORT EXPORT\n`
    content += `=========================\n`
    content += `Type: ${reportType}\n`
    content += `Export Date: ${new Date().toUTCString()}\n\n`

    if (reportType.includes("Executive")) {
      content += `SUMMARY STATS:\n`
      content += `- Total Threats/Alerts logged: ${totalThreats}\n`
      content += `- Resolved incidents: ${resolvedThreats}\n`
      content += `- Open active threats: ${openThreats}\n\n`
      content += `INCIDENT LIST:\n`
      alerts.forEach(a => {
        content += `[${a.createdAt}] ${a.title} - Severity: ${a.severity} (${a.status})\n`
      })
    } else if (reportType.includes("Board")) {
      content += `- Total Incidents recorded: ${incidents.length}\n`
      content += `- Mean Time to Resolution (MTTR): ${mttrMinutes !== null ? `${mttrMinutes.toFixed(1)} min` : 'Not enough resolved incidents yet'}\n\n`
      content += `INCIDENT LIST:\n`
      if (incidents.length === 0) {
        content += `(no incidents recorded)\n`
      } else {
        incidents.forEach(i => {
          content += `[${i.incidentNumber}] ${i.title} - Severity: ${i.severity} (${i.status}) - Opened ${new Date(i.createdAt).toUTCString()}\n`
        })
      }
    } else {
      content += `MITRE ATT&CK TECHNIQUES COVERAGE:\n`
      content += declaredTechniques.size > 0
        ? `- Covered: ${executedTechniques.size}/${declaredTechniques.size} declared techniques (${coveragePercent}%)\n`
        : `- No MITRE techniques declared on any Red Team simulation yet\n`
      content += `\nTECHNIQUES EXECUTED:\n`
      content += executedTechniques.size > 0 ? Array.from(executedTechniques).join(', ') + '\n' : '(none)\n'
    }

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${reportType.toLowerCase().replace(/\s+/g, '_')}_export.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Live counters mapping
  const totalThreats = alerts.length
  const resolvedThreats = alerts.filter(a => a.status === 'CLOSED').length
  const openThreats = alerts.filter(a => a.status === 'OPEN').length

  const resolvedIncidents = incidents.filter(i => i.status === 'MITIGATED' || i.status === 'CLOSED')
  const mttrMinutes = resolvedIncidents.length > 0
    ? resolvedIncidents.reduce((sum, i) => sum + (new Date(i.updatedAt).getTime() - new Date(i.createdAt).getTime()), 0)
      / resolvedIncidents.length / 60000
    : null

  const declaredTechniques = new Set(redTeamSimulations.flatMap(s => s.mitreTechniques || []))
  const executedTechniques = new Set<string>()
  redTeamExecutions.forEach(e => {
    if (e.status !== 'completed') return
    try {
      const steps = JSON.parse(e.stepLogs)
      if (Array.isArray(steps)) steps.forEach((s: any) => { if (s.technique) executedTechniques.add(s.technique) })
    } catch { /* ignore malformed step logs */ }
  })
  const coveragePercent = declaredTechniques.size > 0
    ? Math.round((executedTechniques.size / declaredTechniques.size) * 100)
    : null

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => s.reportName.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [schedules, searchTerm])

  return (
    <div className="reports-page">
      {/* Atmospheric Background for Dark Mode */}
      <div className="bg-fixed">
        <div className="nebula1" />
        <div className="nebula2" />
        <div className="nebula3" />
        <div className="stars" />
      </div>

      <div className="content">
        {/* Search Header */}
        <div className="page-head">
          <div>
            <h1>Reports</h1>
            <p>Executive and technical exports</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="search-wrap">
              <Search className="w-4 h-4" />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!canWrite}
              className="btn-action"
            >
              + Schedule
            </button>
            <button
              onClick={() => triggerDownload("Weekly Executive Summary")}
              className="btn-action primary"
            >
              Export PDF
            </button>
          </div>
        </div>

        {/* Reports Card Section */}
        <div className="reports-grid">
          {/* Card 1: Weekly Executive Summary */}
          <div className="report-card">
            <div className="accent-line bg-blue" />
            <div>
              <div className="flex items-center justify-between">
                <span className="tag bg-blue/15 text-blue">PDF</span>
                <FileText className="w-4 h-4 text-muted" />
              </div>
              <h3>Weekly Executive Summary</h3>
              <p>Board-ready overview of threat landscape, KPIs, and incident status</p>

              <div className="mt-4 space-y-1 text-label text-text-secondary normal-case" style={{ fontSize: '11.5px' }}>
                <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-muted" /> Generated: Weekly • Every Monday 08:00</div>
                <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-muted" /> Coverage: Last 7 days</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-muted" /> Recipients: configured per schedule below</div>
              </div>
            </div>

            <div className="stats-box">
              <div className="title">Executive Summary - as of {new Date().toLocaleDateString()}</div>
              <div className="vals">
                <span>Threats: <span className="text-red">{totalThreats}</span></span>
                <span>Resolved: <span className="text-green">{resolvedThreats}</span></span>
                <span>Open: <span className="text-amber">{openThreats}</span></span>
              </div>
            </div>

            <div className="btn-row">
              <button
                onClick={() => triggerDownload("Weekly Executive Summary")}
                className="btn-action primary justify-center py-2 text-small"
              >
                Download
              </button>
              <button
                onClick={() => openScheduleModalFor("Weekly Executive Summary", "PDF")}
                className="btn-action justify-center py-2 text-small"
              >
                Configure
              </button>
            </div>
          </div>

          {/* Card 2: Incident Board Pack */}
          <div className="report-card">
            <div className="accent-line bg-red" />
            <div>
              <div className="flex items-center justify-between">
                <span className="tag bg-red/15 text-red">PPTX</span>
                <FileText className="w-4 h-4 text-muted" />
              </div>
              <h3>Incident Board Pack</h3>
              <p>Detailed incident timeline for board review and insurance reporting</p>

              <div className="mt-4 space-y-1 text-label text-text-secondary normal-case" style={{ fontSize: '11.5px' }}>
                <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-muted" /> On-demand + monthly scheduled</div>
                <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-muted" /> Coverage: Per incident + monthly rollup</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-muted" /> Recipients: configured per schedule below</div>
              </div>
            </div>

            <div className="stats-box">
              <div className="title">
                {incidents.length > 0 ? `Incident Report - ${incidents[incidents.length - 1].incidentNumber} through ${incidents[0].incidentNumber}` : 'Incident Report - no incidents recorded'}
              </div>
              <div className="vals">
                <span>Total incidents: <span>{incidents.length}</span></span>
                <span>MTTR: <span className="text-amber">{mttrMinutes !== null ? `${mttrMinutes.toFixed(1)} min` : 'Not tracked'}</span></span>
              </div>
            </div>

            <div className="btn-row">
              <button
                onClick={() => triggerDownload("Incident Board Pack")}
                className="btn-action primary justify-center py-2 text-small"
              >
                Download
              </button>
              <button
                onClick={() => openScheduleModalFor("Incident Board Pack", "PPTX")}
                className="btn-action justify-center py-2 text-small"
              >
                Configure
              </button>
            </div>
          </div>

          {/* Card 3: Detection Coverage Report */}
          <div className="report-card">
            <div className="accent-line bg-purple" />
            <div>
              <div className="flex items-center justify-between">
                <span className="tag bg-purple/15 text-purple">CSV</span>
                <FileText className="w-4 h-4 text-muted" />
              </div>
              <h3>Detection Coverage Report</h3>
              <p>MITRE ATT&amp;CK technique coverage and gap analysis for your security posture</p>

              <div className="mt-4 space-y-1 text-label text-text-secondary normal-case" style={{ fontSize: '11.5px' }}>
                <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-muted" /> Monthly - 1st of each month</div>
                <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-muted" /> Coverage: MITRE ATT&amp;CK Enterprise v14</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-muted" /> Recipients: configured per schedule below</div>
              </div>
            </div>

            <div className="stats-box">
              <div className="title">Detection Coverage - as of {new Date().toLocaleDateString()}</div>
              <div className="vals flex-col" style={{ gap: '4px' }}>
                <span className="text-green" style={{ fontSize: '10.5px' }}>
                  {declaredTechniques.size > 0 ? `Covered: ${executedTechniques.size}/${declaredTechniques.size} techniques (${coveragePercent}%)` : 'No MITRE techniques declared yet'}
                </span>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden" style={{ minWidth: '100px' }}>
                  <div className="bg-green h-1.5 rounded-full" style={{ width: `${coveragePercent ?? 0}%` }} />
                </div>
              </div>
            </div>

            <div className="btn-row">
              <button
                onClick={() => triggerDownload("Detection Coverage Report")}
                className="btn-action primary justify-center py-2 text-small"
              >
                Download
              </button>
              <button
                onClick={() => openScheduleModalFor("Detection Coverage Report", "CSV")}
                className="btn-action justify-center py-2 text-small"
              >
                Configure
              </button>
            </div>
          </div>
        </div>

        {/* Scheduled Exports Table */}
        <div className="schedule-panel">
          <div className="schedule-head">
            <h3>Scheduled Exports</h3>
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!canWrite}
              className="btn-action"
            >
              + Add Schedule
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="sched-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>REPORT</th>
                  <th style={{ width: '12%' }}>FORMAT</th>
                  <th style={{ width: '18%' }}>FREQUENCY</th>
                  <th style={{ width: '15%' }}>NEXT RUN</th>
                  <th style={{ width: '15%' }}>RECIPIENTS</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} className="text-center text-text-muted py-6">Loading...</td></tr>
                )}
                {!loading && dataError && (
                  <tr className="empty-row">
                    <td colSpan={6}>
                      <div className="flex flex-col items-center gap-2 py-4">
                        <span>Unable to load scheduled exports. Please try again.</span>
                        <button className="btn-action text-small" onClick={fetchData}>Retry</button>
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && !dataError && filteredSchedules.map(sched => (
                  <tr key={sched.id} className="group">
                    <td className="font-semibold text-text-secondary">
                      <div className="flex items-center justify-between">
                        <span>{sched.reportName}</span>
                        {canAdmin && (
                          <button
                            onClick={() => handleDeleteSchedule(sched.id)}
                            className="opacity-0 group-hover:opacity-100 text-red hover:text-red/80 text-label uppercase ml-2 transition-opacity focus:outline-none"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="mono font-semibold text-text-secondary">
                      {sched.format}
                    </td>
                    <td className="text-text-secondary font-medium">
                      {sched.frequency}
                    </td>
                    <td className="text-text-secondary font-mono">
                      {new Date(sched.nextRun).toLocaleDateString()} at {new Date(sched.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="text-text-secondary font-medium font-mono">
                      {sched.recipients}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleToggleStatus(sched.id, sched.status)}
                        disabled={!canWrite}
                        className="focus:outline-none flex items-center justify-end gap-1.5 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <span className={clsx(
                          "w-1.5 h-1.5 rounded-full inline-block",
                          sched.status === 'Active' ? "bg-green" : "bg-muted"
                        )} />
                        <span className={clsx(
                          "text-label uppercase font-semibold",
                          sched.status === 'Active' ? "text-green" : "text-muted"
                        )}>
                          {sched.status}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && !dataError && filteredSchedules.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-text-muted text-label uppercase">
                      No report schedules found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Schedule Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-head">
              <h3>Add Export Schedule</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSchedule}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Report Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SOC2 Compliance Posture"
                    value={newReportName}
                    onChange={(e) => setNewReportName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label>Export Format</label>
                    <select
                      value={newFormat}
                      onChange={(e) => setNewFormat(e.target.value)}
                    >
                      <option value="PDF">PDF</option>
                      <option value="PPTX">PPTX</option>
                      <option value="CSV">CSV</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Recipients Count</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 4 recipients"
                      value={newRecipients}
                      onChange={(e) => setNewRecipients(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Frequency Interval</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Weekly Mon 08:00 or Monthly 1st"
                    value={newFrequency}
                    onChange={(e) => setNewFrequency(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-action text-small"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-action primary text-small"
                >
                  Add Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteScheduleId}
        title="Delete Scheduled Export"
        message="Are you sure you want to delete this scheduled export? This cannot be undone."
        confirmLabel="Delete"
        danger
        busy={deleteScheduleBusy}
        onConfirm={confirmDeleteSchedule}
        onCancel={() => setDeleteScheduleId(null)}
      />
    </div>
  )
}
