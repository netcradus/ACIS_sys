import React, { useEffect, useState } from 'react'
import { Shield, CheckCircle2, AlertTriangle, Download, ChevronRight, Activity } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import { toast } from '@/store/toastStore'
import './CompliancePage.css'

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

const getBarGradient = (barColor: string) => {
  const c = (barColor || '').toLowerCase()
  if (c.includes('success') || c.includes('green')) return 'linear-gradient(90deg, #16a34a, #22c55e)'
  if (c.includes('warning') || c.includes('amber') || c.includes('medium')) return 'linear-gradient(90deg, #d97706, #f59e0b)'
  return 'linear-gradient(90deg, #3b82f6, #60a5fa)'
}

export default function CompliancePage() {
  const canWrite = useCanWrite(MODULES.REPORTS_COMPLIANCE)
  const [frameworks, setFrameworks] = useState<ComplianceFramework[]>([])
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [complianceError, setComplianceError] = useState<string | null>(null)
  const [isReportLoading, setIsReportLoading] = useState(false)

  const loadCompliance = async () => {
    setIsLoading(true)
    setComplianceError(null)
    try {
      const [postureRes, auditRes] = await Promise.all([
        apiClient.get<ComplianceFramework[]>('/api/compliance/posture'),
        apiClient.get<AuditTrailEntry[]>('/api/compliance/audit-trail'),
      ])

      setFrameworks(postureRes.data ?? [])
      setAuditTrail(auditRes.data ?? [])
    } catch (error) {
      console.error('Failed to load compliance data:', error)
      setComplianceError('Unable to load compliance data. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
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
      toast.error('Unable to queue compliance report at this time.')
    } finally {
      setIsReportLoading(false)
    }
  }

  return (
    <div className="compliance-page">
      {/* Atmospheric Background for Dark Mode */}
      <div className="bg-fixed">
        <div className="nebula1" />
        <div className="nebula2" />
        <div className="nebula3" />
        <div className="stars" />
      </div>

      <div className="content">
        <div className="page-head">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-accent" />
            <div>
              <h1>Compliance &amp; Audit</h1>
              <p>Regulatory posture, audit trails, and reporting evidence</p>
            </div>
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={isReportLoading || !canWrite}
            className="generate-btn"
          >
            {isReportLoading ? 'Queuing Report...' : 'Generate Report'} <Download size={14} />
          </button>
        </div>

        {/* frameworks cards posture list */}
        <div className="comp-row">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="comp-card animate-pulse"
                style={{ height: '320px' }}
              />
            ))
          ) : complianceError ? (
            <div className="comp-card flex flex-col items-center justify-center gap-2 py-8" style={{ minHeight: '160px' }}>
              <span>Unable to load compliance frameworks. Please try again.</span>
              <button className="btn-mission text-small px-3 py-1.5" onClick={loadCompliance}>Retry</button>
            </div>
          ) : frameworks.length === 0 ? (
            <div className="comp-card flex items-center justify-center py-8" style={{ minHeight: '160px' }}>
              <span>No compliance frameworks configured.</span>
            </div>
          ) : (
            frameworks.map((fw) => (
              <div key={fw.name} className="comp-card">
                <div className="comp-subrow">
                  <div>
                    <h3>{fw.name}</h3>
                    <div className="comp-sub">{fw.description}</div>
                  </div>
                  <div>
                    <div className="pct">{fw.percentage}%</div>
                    <div className="comp-sub right">Satisfaction</div>
                  </div>
                </div>

                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${fw.percentage}%`,
                      background: getBarGradient(fw.barColor),
                    }}
                  />
                </div>

                <div>
                  {fw.controls.map((control) => {
                    const isCompliant = control.status.toLowerCase() === 'compliant'
                    const badgeTone = isCompliant
                      ? 'compliant'
                      : control.status.toLowerCase() === 'in progress'
                        ? 'nodata'
                        : 'nottracked'

                    return (
                      <div key={control.name} className="comp-item">
                        <div className="left">
                          {isCompliant ? (
                            <span className="ic ok"><CheckCircle2 size={14} /></span>
                          ) : (
                            <span className="ic dot"><AlertTriangle size={12} /></span>
                          )}
                          <span>{control.name}</span>
                        </div>
                        <span className="mid">{control.count}</span>
                        <span className={clsx('badge', badgeTone)}>
                          {control.status.toUpperCase()}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="comp-footer">
                  <span className="l">Continuously Monitored</span>
                  <span className="r">View Details <ChevronRight size={12} /></span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Audit immutable logs trail */}
        <div className="audit-panel">
          <div className="audit-head">
            <div>
              <h3>Audit Trail — Immutable Platform Logs</h3>
              <div className="sub">Full traceability for every administrative action</div>
            </div>
            <div className="monitor-pill"><Activity size={12} /> Real-Time Monitoring</div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>TIMESTAMP</th>
                  <th>IDENTITY</th>
                  <th>ACTION</th>
                  <th>RESOURCE</th>
                  <th>ORIGIN IP</th>
                  <th style={{ textAlign: 'right' }}>INTEGRITY</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className="animate-pulse">
                      <td colSpan={6} style={{ height: '50px', background: 'var(--tr-border)' }} />
                    </tr>
                  ))
                ) : auditTrail.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-text-muted">
                      No audit entries found for your tenant.
                    </td>
                  </tr>
                ) : (
                  auditTrail.map((log) => (
                    <tr key={log.id}>
                      <td className="mono" style={{ fontSize: '11px', opacity: 0.85 }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="identity-cell">{log.user}</td>
                      <td>
                        <span className="action-badge">{log.action}</span>
                      </td>
                      <td className="resource-cell">{log.resource}</td>
                      <td className="mono" style={{ fontSize: '11.5px', opacity: 0.85 }}>
                        {log.ip}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="integrity-badge">{log.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
