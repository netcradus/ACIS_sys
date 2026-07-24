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
    let content = `Kiro AI ACIS REPORT EXPORT\n`
    content += `=========================\n`
    content += `Type: ${reportType}\n`
    content += `Export Date: ${new Date().toUTCString()}\n\n`
    
    if (reportType.includes("Executive")) {
      content += `SUMMARY STATS:\n`
      content += `- Total Threats/Alerts logged: ${847 + alerts.length}\n`
      content += `- Resolved incidents: ${844 + alerts.filter(a => a.status === 'CLOSED').length}\n`
      content += `- Open active threats: ${3 + alerts.filter(a => a.status === 'OPEN').length}\n\n`
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
  const totalThreats = 847 + alerts.length
  const resolvedThreats = 844 + alerts.filter(a => a.status === 'CLOSED').length
  const openThreats = 3 + alerts.filter(a => a.status === 'OPEN').length

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => s.reportName.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [schedules, searchTerm])

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full bg-[#050506] text-neutral-300 p-6 min-h-screen">
      
      {/* Search Header */}
      <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight uppercase leading-none">Reports</h1>
          <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider">Reports — Executive and technical exports</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64 bg-[#0C0C0D] border border-neutral-800 rounded-xl overflow-hidden">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Search Kiro AI..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent pl-10 pr-4 py-2 text-xs placeholder:text-neutral-600 text-white focus:outline-none focus:border-neutral-700"
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 text-neutral-300 font-bold px-3 py-2 rounded-xl text-xs transition-colors focus:outline-none flex items-center gap-1"
          >
            ↑ Schedule
          </button>
          <button 
            onClick={() => triggerDownload("Weekly Executive Summary")}
            className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors focus:outline-none flex items-center gap-1.5"
          >
            ↓ Export PDF
          </button>
        </div>
      </div>

      {/* Reports Card Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Card 1: Weekly Executive Summary */}
        <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-sm h-[320px]">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-orange-600" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="bg-[#FF5A1F]/10 border border-[#FF5A1F]/30 text-[#FF5A1F] font-black text-[9px] px-2 py-0.5 rounded uppercase">PDF</span>
              <FileText className="w-4 h-4 text-neutral-600" />
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight">Weekly Executive Summary</h3>
            <p className="text-[11px] text-neutral-500 font-semibold leading-relaxed mt-1">Board-ready overview of threat landscape, KPIs, and incident status</p>
            
            <div className="mt-4 space-y-1 text-[10px] text-neutral-400 font-semibold">
              <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-neutral-600" /> Generated: Weekly • Every Monday 08:00</div>
              <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-neutral-600" /> Coverage: Last 7 days</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-neutral-600" /> Recipients: exec-team@kiro.ai (+3)</div>
            </div>
          </div>

          <div className="mt-4 bg-[#050505] border border-neutral-900 rounded-lg p-3 flex flex-col gap-1 text-[10px] font-mono">
            <span className="text-neutral-500 font-bold uppercase">Executive Summary - Week 24/2026</span>
            <div className="flex gap-2 text-neutral-300 font-bold mt-1">
              <span>Threats: <b className="text-red-500">{totalThreats}</b></span>
              <span>Resolved: <b className="text-emerald-400">{resolvedThreats}</b></span>
              <span>Open: <b className="text-orange-400">{openThreats}</b></span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button 
              onClick={() => triggerDownload("Weekly Executive Summary")}
              className="border border-[#FF5A1F] hover:bg-[#FF5A1F]/10 text-[#FF5A1F] font-bold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 focus:outline-none"
            >
              ↓ Download
            </button>
            <button 
              onClick={() => alert("Configure layout options")}
              className="border border-neutral-700 hover:bg-neutral-800 text-neutral-300 font-bold py-2 rounded-xl text-xs transition-colors focus:outline-none"
            >
              Configure
            </button>
          </div>
        </div>

        {/* Card 2: Incident Board Pack */}
        <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-sm h-[320px]">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-600" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="bg-red-500/10 border border-red-500/30 text-red-500 font-black text-[9px] px-2 py-0.5 rounded uppercase">PPTX</span>
              <FileText className="w-4 h-4 text-neutral-600" />
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight">Incident Board Pack</h3>
            <p className="text-[11px] text-neutral-500 font-semibold leading-relaxed mt-1">Detailed incident timeline for board review and insurance reporting</p>
            
            <div className="mt-4 space-y-1 text-[10px] text-neutral-400 font-semibold">
              <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-neutral-600" /> On-demand + monthly scheduled</div>
              <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-neutral-600" /> Coverage: Per incident + monthly rollup</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-neutral-600" /> Recipients: board@kiro.ai, legal@kiro.ai</div>
            </div>
          </div>

          <div className="mt-4 bg-[#050505] border border-neutral-900 rounded-lg p-3 flex flex-col gap-1 text-[10px] font-mono">
            <span className="text-neutral-500 font-bold uppercase">Incident Report - INC-101 through INC-106</span>
            <div className="flex gap-2 text-neutral-300 font-bold mt-1">
              <span>Total incidents: <b>6</b></span>
              <span>MTTR: <b className="text-orange-400">14.8 min</b></span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button 
              onClick={() => triggerDownload("Incident Board Pack")}
              className="border border-[#FF5A1F] hover:bg-[#FF5A1F]/10 text-[#FF5A1F] font-bold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 focus:outline-none"
            >
              ↓ Download
            </button>
            <button 
              onClick={() => alert("Configure layout options")}
              className="border border-neutral-700 hover:bg-neutral-800 text-neutral-300 font-bold py-2 rounded-xl text-xs transition-colors focus:outline-none"
            >
              Configure
            </button>
          </div>
        </div>

        {/* Card 3: Detection Coverage Report */}
        <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-sm h-[320px]">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-neutral-600" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="bg-neutral-500/20 border border-neutral-500/30 text-neutral-300 font-black text-[9px] px-2 py-0.5 rounded uppercase">CSV</span>
              <FileText className="w-4 h-4 text-neutral-600" />
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight">Detection Coverage Report</h3>
            <p className="text-[11px] text-neutral-500 font-semibold leading-relaxed mt-1">MITRE ATT&CK technique coverage and gap analysis for your security posture</p>
            
            <div className="mt-4 space-y-1 text-[10px] text-neutral-400 font-semibold">
              <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-neutral-600" /> Monthly - 1st of each month</div>
              <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-neutral-600" /> Coverage: MITRE ATT&CK Enterprise v14</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-neutral-600" /> Recipients: security-team@kiro.ai</div>
            </div>
          </div>

          <div className="mt-4 bg-[#050505] border border-neutral-900 rounded-lg p-3 flex flex-col gap-1 text-[10px] font-mono">
            <span className="text-neutral-500 font-bold uppercase">Detection Coverage - June 2026</span>
            <div className="flex items-center justify-between font-bold mt-1 text-[10px]">
              <span className="text-emerald-400">Covered: 156/200 techniques (78%)</span>
            </div>
            <div className="w-full bg-neutral-900 rounded-full h-1.5 mt-1 overflow-hidden">
              <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: '78%' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button 
              onClick={() => triggerDownload("Detection Coverage Report")}
              className="border border-[#FF5A1F] hover:bg-[#FF5A1F]/10 text-[#FF5A1F] font-bold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 focus:outline-none"
            >
              ↓ Download
            </button>
            <button 
              onClick={() => alert("Configure layout options")}
              className="border border-neutral-700 hover:bg-neutral-800 text-neutral-300 font-bold py-2 rounded-xl text-xs transition-colors focus:outline-none"
            >
              Configure
            </button>
          </div>
        </div>

      </div>

      {/* Scheduled Exports Table */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
          <h3 className="text-xs font-bold text-white tracking-wider uppercase">Scheduled Exports</h3>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-transparent hover:bg-neutral-800 border border-neutral-700 text-neutral-300 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors focus:outline-none flex items-center gap-1"
          >
            + Add Schedule
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-900 text-neutral-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 w-[28%]">Report</th>
                <th className="py-3 px-4 w-[12%]">Format</th>
                <th className="py-3 px-4 w-[18%]">Frequency</th>
                <th className="py-3 px-4 w-[15%]">Next Run</th>
                <th className="py-3 px-4 w-[15%]">Recipients</th>
                <th className="py-3 px-4 w-[12%] text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900/60">
              {filteredSchedules.map(sched => (
                <tr key={sched.id} className="hover:bg-[#121214] transition-colors duration-150 group">
                  <td className="py-4 px-4 font-bold text-neutral-200 flex items-center justify-between">
                    <span>{sched.reportName}</span>
                    <button 
                      onClick={() => handleDeleteSchedule(sched.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 font-bold text-[10px] uppercase ml-2 transition-opacity focus:outline-none"
                    >
                      Delete
                    </button>
                  </td>
                  <td className="py-4 px-4 font-mono font-bold text-neutral-400">
                    {sched.format}
                  </td>
                  <td className="py-4 px-4 text-neutral-300 font-semibold">
                    {sched.frequency}
                  </td>
                  <td className="py-4 px-4 text-neutral-400 font-mono">
                    {new Date(sched.nextRun).toLocaleDateString()} at {new Date(sched.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-4 px-4 text-neutral-400 font-semibold font-mono">
                    {sched.recipients}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <button 
                      onClick={() => handleToggleStatus(sched.id, sched.status)}
                      className="focus:outline-none flex items-center justify-end gap-1.5 w-full font-bold"
                    >
                      <span className={clsx(
                        "w-1.5 h-1.5 rounded-full inline-block",
                        sched.status === 'Active' ? "bg-emerald-400" : "bg-neutral-600"
                      )} />
                      <span className={clsx(
                        "text-[10px] tracking-wider uppercase",
                        sched.status === 'Active' ? "text-emerald-400 hover:text-emerald-500" : "text-neutral-500 hover:text-neutral-400"
                      )}>
                        {sched.status}
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredSchedules.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-600 uppercase font-black tracking-widest text-[10px]">
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
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-neutral-900">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Add Export Schedule</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-white transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSchedule} className="p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Report Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. SOC2 Compliance Posture"
                  value={newReportName}
                  onChange={(e) => setNewReportName(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-neutral-500 font-bold uppercase tracking-wider block">Export Format</label>
                  <select 
                    value={newFormat}
                    onChange={(e) => setNewFormat(e.target.value)}
                    className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-neutral-700"
                  >
                    <option value="PDF">PDF</option>
                    <option value="PPTX">PPTX</option>
                    <option value="CSV">CSV</option>
                  </select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-neutral-500 font-bold uppercase tracking-wider block">Recipients Count</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. 4 recipients"
                    value={newRecipients}
                    onChange={(e) => setNewRecipients(e.target.value)}
                    className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none focus:border-neutral-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Frequency Interval</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Weekly Mon 08:00 or Monthly 1st"
                  value={newFrequency}
                  onChange={(e) => setNewFrequency(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-900 mt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="border border-neutral-800 bg-[#0C0C0D] hover:bg-neutral-800 text-neutral-400 hover:text-white font-bold px-4 py-2 rounded-xl focus:outline-none transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl focus:outline-none transition-colors"
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
