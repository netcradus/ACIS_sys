import React, { useEffect, useState, useMemo } from 'react'
import { FileText, Printer, Download, Settings, Search, Plus, X, CheckCircle2, Clock, Activity } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'

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

export default function ReportsPage() {
  const [schedules, setSchedules] = useState<ReportSchedule[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newReportName, setNewReportName] = useState('')
  const [newFormat, setNewFormat] = useState('PDF')
  const [newFrequency, setNewFrequency] = useState('Weekly Mon 08:00')
  const [newRecipients, setNewRecipients] = useState('4 recipients')

  const fetchData = async () => {
    try {
      const [schedulesRes, alertsRes] = await Promise.all([
        apiClient.get('/api/soar/reports/schedules'),
        apiClient.get('/api/alerts')
      ])
      setSchedules(schedulesRes.data || [])
      setAlerts(alertsRes.data || [])
    } catch (err) {
      console.error("Failed to fetch reports details", err)
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
      fetchData()
    } catch (e) {
      console.error(e)
    }
  }

  // Delete Schedule
  const handleDeleteSchedule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this scheduled export?")) return
    try {
      await apiClient.delete(`/api/soar/reports/schedules/${id}`)
      fetchData()
    } catch (e) {
      console.error(e)
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
      content += `- Total Incidents recorded: 6\n`
      content += `- Mean Time to Resolution (MTTR): 14.8 min\n\n`
      content += `TIMELINE STEPS:\n`
      content += `1. Detected initial access vector (phishing payload execution)\n`
      content += `2. Lateral movement containment via Cisco firewall block list\n`
      content += `3. Isolated workstation node from production VLAN\n`
    } else {
      content += `MITRE ATT&CK TECHNIQUES COVERAGE:\n`
      content += `- Covered: 156/200 techniques (78%)\n`
      content += `- Target compliance: SOC2, ISO27001\n`
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

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => s.reportName.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [schedules, searchTerm])

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full text-text-secondary min-h-screen">

      {/* Search Header */}
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <div>
          <h1 className="text-h1 text-text-primary">Reports</h1>
          <p className="text-label text-text-muted mt-1 uppercase">Executive and technical exports</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search reports..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn-mission text-small py-2 px-3 flex items-center gap-1"
          >
            ↑ Schedule
          </button>
          <button
            onClick={() => triggerDownload("Weekly Executive Summary")}
            className="btn-fire text-small py-2 px-4 flex items-center gap-1.5"
          >
            ↓ Export PDF
          </button>
        </div>
      </div>

      {/* Reports Card Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Card 1: Weekly Executive Summary */}
        <div className="bg-surface-2 border border-fire-border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-sm h-[320px]">
          <div className="absolute top-0 left-0 right-0 h-1 bg-accent" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="bg-accent/10 border border-accent/30 text-accent text-label px-2 py-0.5 rounded uppercase">PDF</span>
              <FileText className="w-4 h-4 text-text-muted" />
            </div>
            <h3 className="text-h3 text-text-primary">Weekly Executive Summary</h3>
            <p className="text-small text-text-muted font-medium leading-relaxed mt-1">Board-ready overview of threat landscape, KPIs, and incident status</p>

            <div className="mt-4 space-y-1 text-label text-text-secondary normal-case">
              <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-text-muted" /> Generated: Weekly • Every Monday 08:00</div>
              <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-text-muted" /> Coverage: Last 7 days</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-text-muted" /> Recipients: exec-team@netcradus.local (+3)</div>
            </div>
          </div>

          <div className="mt-4 bg-surface border border-fire-border rounded-lg p-3 flex flex-col gap-1 text-label font-mono">
            <span className="text-text-muted uppercase">Executive Summary - Week 24/2026</span>
            <div className="flex gap-2 text-text-secondary font-semibold mt-1">
              <span>Threats: <b className="text-danger">{totalThreats}</b></span>
              <span>Resolved: <b className="text-success">{resolvedThreats}</b></span>
              <span>Open: <b className="text-severity-high">{openThreats}</b></span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              onClick={() => triggerDownload("Weekly Executive Summary")}
              className="border border-accent hover:bg-accent/10 text-accent font-semibold py-2 rounded-lg text-small transition-colors flex items-center justify-center gap-1.5 focus:outline-none"
            >
              ↓ Download
            </button>
            <button
              onClick={() => alert("Configure layout options")}
              className="btn-mission py-2 text-small"
            >
              Configure
            </button>
          </div>
        </div>

        {/* Card 2: Incident Board Pack */}
        <div className="bg-surface-2 border border-fire-border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-sm h-[320px]">
          <div className="absolute top-0 left-0 right-0 h-1 bg-danger" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="bg-danger/10 border border-danger/30 text-danger text-label px-2 py-0.5 rounded uppercase">PPTX</span>
              <FileText className="w-4 h-4 text-text-muted" />
            </div>
            <h3 className="text-h3 text-text-primary">Incident Board Pack</h3>
            <p className="text-small text-text-muted font-medium leading-relaxed mt-1">Detailed incident timeline for board review and insurance reporting</p>

            <div className="mt-4 space-y-1 text-label text-text-secondary normal-case">
              <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-text-muted" /> On-demand + monthly scheduled</div>
              <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-text-muted" /> Coverage: Per incident + monthly rollup</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-text-muted" /> Recipients: board@netcradus.local, legal@netcradus.local</div>
            </div>
          </div>

          <div className="mt-4 bg-surface border border-fire-border rounded-lg p-3 flex flex-col gap-1 text-label font-mono">
            <span className="text-text-muted uppercase">Incident Report - INC-101 through INC-106</span>
            <div className="flex gap-2 text-text-secondary font-semibold mt-1">
              <span>Total incidents: <b>6</b></span>
              <span>MTTR: <b className="text-severity-high">14.8 min</b></span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              onClick={() => triggerDownload("Incident Board Pack")}
              className="border border-accent hover:bg-accent/10 text-accent font-semibold py-2 rounded-lg text-small transition-colors flex items-center justify-center gap-1.5 focus:outline-none"
            >
              ↓ Download
            </button>
            <button
              onClick={() => alert("Configure layout options")}
              className="btn-mission py-2 text-small"
            >
              Configure
            </button>
          </div>
        </div>

        {/* Card 3: Detection Coverage Report */}
        <div className="bg-surface-2 border border-fire-border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-sm h-[320px]">
          <div className="absolute top-0 left-0 right-0 h-1 bg-text-muted" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="bg-text-muted/20 border border-text-muted/30 text-text-secondary text-label px-2 py-0.5 rounded uppercase">CSV</span>
              <FileText className="w-4 h-4 text-text-muted" />
            </div>
            <h3 className="text-h3 text-text-primary">Detection Coverage Report</h3>
            <p className="text-small text-text-muted font-medium leading-relaxed mt-1">MITRE ATT&CK technique coverage and gap analysis for your security posture</p>

            <div className="mt-4 space-y-1 text-label text-text-secondary normal-case">
              <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-text-muted" /> Monthly - 1st of each month</div>
              <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-text-muted" /> Coverage: MITRE ATT&CK Enterprise v14</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-text-muted" /> Recipients: security-team@netcradus.local</div>
            </div>
          </div>

          <div className="mt-4 bg-surface border border-fire-border rounded-lg p-3 flex flex-col gap-1 text-label font-mono">
            <span className="text-text-muted uppercase">Detection Coverage - June 2026</span>
            <div className="flex items-center justify-between font-semibold mt-1 text-label">
              <span className="text-success">Covered: 156/200 techniques (78%)</span>
            </div>
            <div className="w-full bg-surface-3 rounded-full h-1.5 mt-1 overflow-hidden">
              <div className="bg-success h-1.5 rounded-full" style={{ width: '78%' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              onClick={() => triggerDownload("Detection Coverage Report")}
              className="border border-accent hover:bg-accent/10 text-accent font-semibold py-2 rounded-lg text-small transition-colors flex items-center justify-center gap-1.5 focus:outline-none"
            >
              ↓ Download
            </button>
            <button
              onClick={() => alert("Configure layout options")}
              className="btn-mission py-2 text-small"
            >
              Configure
            </button>
          </div>
        </div>

      </div>

      {/* Scheduled Exports Table */}
      <div className="card-mission space-y-4">
        <div className="flex items-center justify-between border-b border-fire-border pb-3">
          <h3 className="text-h3 text-text-primary">Scheduled Exports</h3>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn-mission py-1.5 px-3 text-small"
          >
            + Add Schedule
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="table-enterprise">
            <thead>
              <tr>
                <th className="w-[28%]">Report</th>
                <th className="w-[12%]">Format</th>
                <th className="w-[18%]">Frequency</th>
                <th className="w-[15%]">Next Run</th>
                <th className="w-[15%]">Recipients</th>
                <th className="w-[12%] text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedules.map(sched => (
                <tr key={sched.id} className="group">
                  <td className="font-semibold text-text-secondary flex items-center justify-between">
                    <span>{sched.reportName}</span>
                    <button
                      onClick={() => handleDeleteSchedule(sched.id)}
                      className="opacity-0 group-hover:opacity-100 text-danger hover:text-danger/80 text-label uppercase ml-2 transition-opacity focus:outline-none"
                    >
                      Delete
                    </button>
                  </td>
                  <td className="font-mono font-semibold text-text-secondary">
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
                  <td className="text-right">
                    <button
                      onClick={() => handleToggleStatus(sched.id, sched.status)}
                      className="focus:outline-none flex items-center justify-end gap-1.5 w-full"
                    >
                      <span className={clsx(
                        "w-1.5 h-1.5 rounded-full inline-block",
                        sched.status === 'Active' ? "bg-success" : "bg-text-muted"
                      )} />
                      <span className={clsx(
                        "text-label uppercase",
                        sched.status === 'Active' ? "text-success hover:text-success/80" : "text-text-muted hover:text-text-secondary"
                      )}>
                        {sched.status}
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredSchedules.length === 0 && (
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

      {/* Add Schedule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-fire-border rounded-xl w-full max-w-md overflow-hidden shadow-card animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-fire-border">
              <h3 className="text-h3 text-text-primary">Add Export Schedule</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-text-primary transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSchedule} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Report Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SOC2 Compliance Posture"
                  value={newReportName}
                  onChange={(e) => setNewReportName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-label text-text-muted uppercase block">Export Format</label>
                  <select
                    value={newFormat}
                    onChange={(e) => setNewFormat(e.target.value)}
                    className="input-field"
                  >
                    <option value="PDF">PDF</option>
                    <option value="PPTX">PPTX</option>
                    <option value="CSV">CSV</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-label text-text-muted uppercase block">Recipients Count</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 4 recipients"
                    value={newRecipients}
                    onChange={(e) => setNewRecipients(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Frequency Interval</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekly Mon 08:00 or Monthly 1st"
                  value={newFrequency}
                  onChange={(e) => setNewFrequency(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-fire-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-mission py-2 px-4 text-small"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-fire py-2 px-4 text-small"
                >
                  Add Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
