import React, { useEffect, useState } from 'react'
import { Shield, CheckCircle2, AlertTriangle, Download, ChevronRight, Activity } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'

interface ComplianceControl {
  name: string
  count: string
  status: string
}

interface ComplianceFramework {
  name: string
  description: string
  percentage: number
  color: string
  barColor: string
  controls: ComplianceControl[]
}

interface AuditTrailEntry {
  id: string
  timestamp: string
  user: string
  action: string
  resource: string
  ip: string
  status: string
}

export default function CompliancePage() {
  const [frameworks, setFrameworks] = useState<ComplianceFramework[]>([])
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isReportLoading, setIsReportLoading] = useState(false)

  useEffect(() => {
    const loadCompliance = async () => {
      setIsLoading(true)
      try {
        const [postureRes, auditRes] = await Promise.all([
          apiClient.get<ComplianceFramework[]>('/api/compliance/posture'),
          apiClient.get<AuditTrailEntry[]>('/api/compliance/audit-trail'),
        ])

        setFrameworks(postureRes.data ?? [])
        setAuditTrail(auditRes.data ?? [])
      } catch (error) {
        console.error('Failed to load compliance data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadCompliance()
  }, [])

  const handleGenerateReport = async () => {
    setIsReportLoading(true)
    try {
      const response = await apiClient.get<{ message: string; downloadUrl: string }>('/api/compliance/report')
      if (response.data?.downloadUrl) {
        window.open(response.data.downloadUrl, '_blank')
      }
    } catch (error) {
      console.error('Failed to generate report:', error)
      alert('Unable to queue compliance report at this time.')
    } finally {
      setIsReportLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in bg-background pb-10">
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-text-primary tracking-tighter uppercase leading-none">Compliance & Audit</h1>
          <p className="text-[10px] text-text-secondary font-bold tracking-[0.4em] uppercase mt-2">Regulatory posture, audit trails, and reporting evidence</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleGenerateReport}
            disabled={isReportLoading}
            className="btn-fire min-w-[160px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReportLoading ? 'QUEUING REPORT...' : 'GENERATE REPORT'}
            <Download className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="card-mission bg-surface-2 border-fire-border/40 animate-pulse h-72" />
          ))
        ) : (
          frameworks.map((fw) => (
            <div key={fw.name} className="card-mission bg-surface-2 border-fire-border/60 hover:border-accent/30 transition-all group">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black text-text-primary tracking-tighter uppercase">{fw.name}</h2>
                  <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-1">{fw.description}</p>
                </div>
                <div className="text-4xl font-black text-text-primary tracking-tighter tabular-nums flex flex-col items-end leading-none">
                  {fw.percentage}%
                  <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest mt-2">Satisfaction</span>
                </div>
              </div>

              <div className="w-full h-2 bg-background border border-fire-border rounded-full overflow-hidden mb-10">
                <div
                  className={clsx('h-full rounded-full transition-all duration-1000', fw.barColor)}
                  style={{ width: `${fw.percentage}%` }}
                />
              </div>

              <div className="space-y-4">
                {fw.controls.map((control) => (
                  <div key={control.name} className="flex items-center justify-between group/item">
                    <div className="flex items-center gap-3">
                      {control.status === 'Compliant' ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : (
                        <div className={clsx('w-1.5 h-1.5 rounded-full', control.status === 'In Progress' ? 'bg-warning' : 'bg-danger')} />
                      )}
                      <span className="text-[11px] font-bold text-text-secondary group-hover/item:text-text-primary transition-colors">{control.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-mono text-text-muted">{control.count}</span>
                      <span className={clsx(
                        'text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border',
                        control.status === 'Compliant' ? 'text-success border-success/20 bg-success/5' :
                          control.status === 'In Progress' ? 'text-warning border-warning/20 bg-warning/5' :
                            'text-danger border-danger/20 bg-danger/5'
                      )}
                      >
                        {control.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 pt-6 border-t border-fire-border flex items-center justify-between">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Last assessed: 2025-06-14</span>
                <button className="text-[9px] font-black text-accent uppercase tracking-widest hover:underline flex items-center gap-1 group/more">
                  VIEW DETAILS <ChevronRight className="w-3 h-3 group-hover/more:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card-mission bg-surface-2 border-fire-border/60">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xs font-black text-text-primary uppercase tracking-[0.2em]">Audit Trail — Immutable Platform Logs</h3>
            <p className="text-[10px] text-text-secondary font-bold mt-1">Full traceability for every administrative action</p>
          </div>
          <button className="btn-mission py-2 px-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" /> REAL-TIME MONITORING
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-fire-border">
                <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Timestamp</th>
                <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Identity</th>
                <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Action</th>
                <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Resource</th>
                <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4">Origin IP</th>
                <th className="pb-4 text-[10px] font-black text-text-muted uppercase tracking-widest px-4 text-right">Integrity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fire-border">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    <td className="py-4 px-4 h-8 bg-surface rounded-md" colSpan={6} />
                  </tr>
                ))
              ) : auditTrail.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 px-4 text-center text-text-muted text-sm uppercase tracking-[0.2em]">
                    No audit entries found for your tenant.
                  </td>
                </tr>
              ) : (
                auditTrail.map((log) => (
                  <tr key={log.id} className="group hover:bg-surface-3/40 transition-colors">
                    <td className="py-4 px-4 font-mono text-[10px] text-text-muted font-bold">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="py-4 px-4">
                      <span className="text-xs font-bold text-text-primary tracking-tight">{log.user}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-[10px] font-black text-accent uppercase tracking-tighter bg-accent/5 px-2 py-1 rounded-md border border-accent/20">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-mono text-[10px] text-text-secondary">{log.resource}</td>
                    <td className="py-4 px-4 font-mono text-[10px] text-text-secondary">{log.ip}</td>
                    <td className="py-4 px-4 text-right">
                      <span className={clsx(
                        'px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border',
                        log.status === 'Success' ? 'bg-success/10 text-success border-success/20' :
                          log.status === 'Failure' ? 'bg-danger/10 text-danger border-danger/20' :
                            'bg-warning/10 text-warning border-warning/20'
                      )}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

