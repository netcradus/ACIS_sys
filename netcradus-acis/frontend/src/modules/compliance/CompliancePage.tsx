import React from 'react'
import { Shield, CheckCircle2, AlertCircle, Clock, Download, ChevronRight, FileText, Activity } from 'lucide-react'
import { clsx } from 'clsx'
import InDevelopment from '@/components/InDevelopment'

const frameworks = [
  {
    name: 'NIS2',
    description: 'Network & Information Security Directive',
    percentage: 92,
    color: 'text-success',
    barColor: 'bg-success',
    controls: [
      { name: 'Risk Management Measures', count: '18/18', status: 'Compliant' },
      { name: 'Incident Handling', count: '12/12', status: 'Compliant' },
      { name: 'Reporting Obligations', count: '8/9', status: 'In Progress' },
      { name: 'Business Continuity', count: '6/6', status: 'Compliant' },
      { name: 'Supply Chain Security', count: '4/4', status: 'Compliant' },
    ]
  },
  {
    name: 'GDPR',
    description: 'General Data Protection Regulation',
    percentage: 88,
    color: 'text-warning',
    barColor: 'bg-warning',
    controls: [
      { name: 'Data Minimisation', count: '14/14', status: 'Compliant' },
      { name: 'Consent Management', count: '8/8', status: 'Compliant' },
      { name: 'Right to Erasure', count: '6/7', status: 'In Progress' },
      { name: 'Data Breach Notification', count: '5/5', status: 'Compliant' },
      { name: 'Privacy by Design', count: '3/4', status: 'In Progress' },
    ]
  },
  {
    name: 'ISO 27001',
    description: 'Information Security Management',
    percentage: 74,
    color: 'text-accent',
    barColor: 'bg-accent',
    controls: [
      { name: 'Access Control', count: '22/22', status: 'Compliant' },
      { name: 'Asset Management', count: '15/18', status: 'In Progress' },
      { name: 'Cryptography Policy', count: '4/8', status: 'Needs Attention' },
      { name: 'Physical Security', count: '12/12', status: 'Compliant' },
      { name: 'Supplier Relations', count: '6/9', status: 'In Progress' },
    ]
  }
]

const auditTrail = [
  { time: '15:21:08', user: 'analyst2@acis', action: 'PLAYBOOK_EXECUTE', resource: 'soar/block-domain', ip: '192.168.1.44', status: 'Success' },
  { time: '15:19:33', user: 'analyst1@acis', action: 'ALERT_ASSIGN', resource: 'alert/AL-1000', ip: '192.168.1.22', status: 'Success' },
  { time: '15:17:51', user: 'analyst3@acis', action: 'RULE_TOGGLE', resource: 'corr/impossible-travel', ip: '192.168.1.67', status: 'Success' },
  { time: '15:15:02', user: 'admin@acme', action: 'USER_CREATE', resource: 'users/analyst4', ip: '10.0.1.5', status: 'Success' },
  { time: '15:11:44', user: 'analyst2@acis', action: 'IOC_ENRICH', resource: 'threat-intel/185...', ip: '192.168.1.44', status: 'Success' },
]

export default function CompliancePage() {
  return (
    <InDevelopment>
      <div className="space-y-8 animate-fade-in bg-black">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Compliance & Audit</h1>
            <p className="text-[10px] text-text-secondary font-bold tracking-[0.4em] uppercase mt-2">Regulatory Mapping & Control Verifications</p>
          </div>
          <div className="flex items-center gap-3">
             <button className="btn-fire min-w-[160px]">
               GENERATE REPORT <Download className="w-4 h-4 ml-1" />
             </button>
          </div>
        </div>

        {/* Framework Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {frameworks.map((fw) => (
            <div key={fw.name} className="card-mission bg-surface-2 border-fire-border/60 hover:border-accent/30 transition-all group">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tighter uppercase">{fw.name}</h2>
                  <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-1">{fw.description}</p>
                </div>
                <div className="text-4xl font-black text-white tracking-tighter tabular-nums flex flex-col items-end leading-none">
                  {fw.percentage}%
                  <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest mt-2">Satisfaction</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-black border border-fire-border rounded-full overflow-hidden mb-10">
                <div 
                  className={clsx("h-full rounded-full transition-all duration-1000", fw.barColor)} 
                  style={{ width: `${fw.percentage}%` }} 
                />
              </div>

              {/* Controls List */}
              <div className="space-y-4">
                {fw.controls.map((control) => (
                  <div key={control.name} className="flex items-center justify-between group/item">
                    <div className="flex items-center gap-3">
                      {control.status === 'Compliant' ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : (
                        <div className={clsx("w-1.5 h-1.5 rounded-full", control.status === 'In Progress' ? "bg-warning" : "bg-danger")} />
                      )}
                      <span className="text-[11px] font-bold text-text-secondary group-hover/item:text-white transition-colors">{control.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-mono text-text-muted">{control.count}</span>
                      <span className={clsx(
                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border",
                        control.status === 'Compliant' ? "text-success border-success/20 bg-success/5" :
                        control.status === 'In Progress' ? "text-warning border-warning/20 bg-warning/5" :
                        "text-danger border-danger/20 bg-danger/5"
                      )}>
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
          ))}
        </div>

        {/* Audit Trail Table */}
        <div className="card-mission bg-surface-2 border-fire-border/60">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Audit Trail — Immutable Platform Logs</h3>
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
              <tbody className="divide-y divide-border">
                {auditTrail.map((log, i) => (
                  <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-4 font-mono text-[10px] text-text-muted font-bold">{log.time}</td>
                    <td className="py-4 px-4">
                      <span className="text-xs font-bold text-white tracking-tight">{log.user}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-[10px] font-black text-accent uppercase tracking-tighter bg-accent/5 px-2 py-1 rounded-md border border-accent/20">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-mono text-[10px] text-text-secondary">{log.resource}</td>
                    <td className="py-4 px-4 font-mono text-[10px] text-text-secondary">{log.ip}</td>
                    <td className="py-4 px-4 text-right">
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-success/10 text-success border border-success/20">
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </InDevelopment>
  )
}

