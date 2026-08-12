import React, { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
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

const BAR_GRADIENTS: Record<string, string> = {
  'NIS2': 'linear-gradient(90deg,#16a34a,#22c55e)',
  'GDPR': 'linear-gradient(90deg,#d97706,#f59e0b)',
  'ISO 27001': 'linear-gradient(90deg,#3b82f6,#60a5fa)',
}

const DEFAULT_BAR = 'linear-gradient(90deg,#3b82f6,#60a5fa)'

function controlBadge(status: string): { badge: string; label: string; dot: 'ok' | 'dot' | null } {
  switch (status) {
    case 'Compliant':
      return { badge: 'compliant', label: 'COMPLIANT', dot: 'ok' }
    case 'In Progress':
      return { badge: 'inprogress', label: 'IN PROGRESS', dot: 'dot' }
    case 'Needs Attention':
      return { badge: 'attention', label: 'NEEDS ATTENTION', dot: 'dot' }
    case 'No Data':
      return { badge: 'nodata', label: 'NO DATA', dot: 'dot' }
    case 'Not Tracked':
      return { badge: 'nottracked', label: 'NOT TRACKED', dot: 'dot' }
    default:
      return { badge: 'nodata', label: status.toUpperCase(), dot: 'dot' }
  }
}

function integrityLabel(entry: AuditTrailEntry): string {
  const base = (entry.status || 'Logged').toUpperCase()
  return entry.ip ? `${base} · ${entry.ip}` : base
}

export default function CompliancePage() {
  const canWrite = useCanWrite(MODULES.REPORTS_COMPLIANCE)
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
          <div>
            <h1>Compliance &amp; Audit</h1>
            <p>Regulatory posture, audit trails, and reporting evidence</p>
          </div>
          <button
            className="generate-btn"
            onClick={handleGenerateReport}
            disabled={isReportLoading || !canWrite}
            title={!canWrite ? "Your role doesn't have write access to Reports & Compliance" : undefined}
          >
            {isReportLoading ? 'Generating Report...' : 'Generate Report'}
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* compliance cards */}
        <div className="comp-row">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="comp-card animate-pulse" style={{ height: 380 }} />
            ))
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
                      background: BAR_GRADIENTS[fw.name] || DEFAULT_BAR,
                    }}
                  />
                </div>

                {fw.controls.map((control) => {
                  const badge = controlBadge(control.status)
                  return (
                    <div key={control.name} className="comp-item">
                      <div className="left">
                        {badge.dot === 'ok' ? (
                          <span className="ic ok">✓</span>
                        ) : (
                          <span className="ic dot">●</span>
                        )}
                        {control.name}
                      </div>
                      <span className="mid">{control.count}</span>
                      <span className={clsx('badge', badge.badge)}>{badge.label}</span>
                    </div>
                  )
                })}

                <div className="comp-footer">
                  <span className="l">Continuously Monitored</span>
                  <button className="r" type="button">
                    View Details <span aria-hidden="true">›</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Audit Trail panel */}
        <div className="audit-panel">
          <div className="audit-head">
            <div>
              <h3>Audit Trail — Immutable Platform Logs</h3>
              <div className="sub">Full traceability for every administrative action</div>
            </div>
            <div className="monitor-pill">📈 Real-Time Monitoring</div>
          </div>

          <table className="audit-table">
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>IDENTITY</th>
                <th>ACTION</th>
                <th>RESOURCE</th>
                <th>INTEGRITY</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    <td className="h-8" colSpan={5} />
                  </tr>
                ))
              ) : auditTrail.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-8">
                    No audit entries found for your tenant.
                  </td>
                </tr>
              ) : (
                auditTrail.map((log) => (
                  <tr key={log.id}>
                    <td className="mono">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="identity-cell">{log.user}</td>
                    <td>
                      <span className="action-badge">{log.action}</span>
                    </td>
                    <td className="resource-cell">{log.resource}</td>
                    <td>
                      <span className="integrity-badge">{integrityLabel(log)}</span>
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
