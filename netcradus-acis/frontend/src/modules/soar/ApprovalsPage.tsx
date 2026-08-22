import React, { useEffect, useState, useRef } from 'react'
import { ShieldCheck, ShieldX, Undo2 } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SeverityBadge, { toSeverity } from '@/components/viz/SeverityBadge'
import { toast } from '@/store/toastStore'

interface Approval {
  id: string
  playbookName: string
  requestedByName: string
  riskLevel: string
  actionSummary: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  approvedByName: string | null
  decidedAt: string | null
  rejectionReason: string | null
  executionId: string | null
  createdAt: string
}

interface ContainmentAction {
  id: string
  actionType: string
  targetDescription: string
  performedBy: string
  reversible: boolean
  rolledBack: boolean
  rolledBackBy: string | null
  createdAt: string
}

export default function ApprovalsPage() {
  const canWrite = useCanWrite(MODULES.SOAR_PLAYBOOKS)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [actions, setActions] = useState<ContainmentAction[]>([])
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null)
  const [rollbackTargetId, setRollbackTargetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const hasShownFetchErrorRef = useRef(false)

  const fetchData = async () => {
    try {
      const [approvalsRes, actionsRes] = await Promise.all([
        apiClient.get('/api/soar/approvals'),
        apiClient.get('/api/soar/containment/actions'),
      ])
      setApprovals(approvalsRes.data || [])
      setActions(actionsRes.data || [])
      setFetchError(null)
      hasShownFetchErrorRef.current = false
    } catch (err) {
      console.error('Failed to fetch approvals/containment data', err)
      setFetchError('Unable to load approvals and containment actions.')
      if (!hasShownFetchErrorRef.current) {
        toast.error('Unable to load containment approvals. Retrying automatically.')
        hasShownFetchErrorRef.current = true
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 6000)
    return () => clearInterval(interval)
  }, [])

  const handleApprove = async (id: string) => {
    setError(null)
    try {
      await apiClient.post(`/api/soar/approvals/${id}/approve`)
      await fetchData()
    } catch (err: any) {
      setError(err?.message || 'Approval failed')
    }
  }

  const handleReject = async () => {
    if (!rejectTargetId) return
    try {
      await apiClient.post(`/api/soar/approvals/${rejectTargetId}/reject`, { reason: 'Rejected by analyst' })
      await fetchData()
    } catch (err) {
      console.error('Failed to reject approval', err)
      toast.error('Failed to reject containment approval.')
    } finally {
      setRejectTargetId(null)
    }
  }

  const handleRollback = async () => {
    if (!rollbackTargetId) return
    try {
      await apiClient.post(`/api/soar/containment/actions/${rollbackTargetId}/rollback`)
      await fetchData()
    } catch (err) {
      console.error('Failed to roll back containment action', err)
      toast.error('Failed to roll back containment action.')
    } finally {
      setRollbackTargetId(null)
    }
  }

  const pending = approvals.filter((a) => a.status === 'PENDING')
  const decided = approvals.filter((a) => a.status !== 'PENDING')

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-h2 text-text-primary">Containment Approvals</h1>
        <p className="text-small text-text-secondary">
          High-impact playbooks (account disable, session revocation, endpoint isolation, network blocking) never
          run automatically — they wait here for a second, different approver. The requester can never approve
          their own request.
        </p>
        {error && <p className="text-small text-danger mt-2">{error}</p>}
      </div>

      <div className="card-mission overflow-x-auto">
        <div className="p-4 pb-0"><h3 className="text-h3 text-text-primary">Pending Approval ({pending.length})</h3></div>
        <table className="table-enterprise w-full">
          <thead><tr><th>PLAYBOOK</th><th>REQUESTED BY</th><th>RISK</th><th>SUMMARY</th><th style={{ textAlign: 'right' }}>ACTIONS</th></tr></thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="text-center text-text-muted py-6">Loading...</td></tr>
            )}
            {!loading && fetchError && (
              <tr>
                <td colSpan={5}>
                  <div className="flex flex-col items-center gap-2 py-4">
                    <span>Unable to load pending approvals. Please try again.</span>
                    <button className="btn-mission text-small px-3 py-1.5" onClick={fetchData}>Retry</button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && !fetchError && pending.length === 0 && (
              <tr><td colSpan={5} className="text-center text-text-muted py-6">No pending approvals.</td></tr>
            )}
            {!loading && !fetchError && pending.map((a) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 600 }}>{a.playbookName}</td>
                <td>{a.requestedByName}</td>
                <td><SeverityBadge severity={toSeverity(a.riskLevel)} label={a.riskLevel} size="sm" /></td>
                <td className="text-small" style={{ maxWidth: 400 }}>{a.actionSummary}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-3 justify-end text-text-muted">
                    <button
                      className="hover:text-success transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Approve"
                      aria-label={`Approve ${a.playbookName} request`}
                      onClick={() => handleApprove(a.id)}
                      disabled={!canWrite}
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </button>
                    <button
                      className="hover:text-danger transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Reject"
                      aria-label={`Reject ${a.playbookName} request`}
                      onClick={() => setRejectTargetId(a.id)}
                      disabled={!canWrite}
                    >
                      <ShieldX className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-mission overflow-x-auto">
        <div className="p-4 pb-0"><h3 className="text-h3 text-text-primary">Decision History</h3></div>
        <table className="table-enterprise w-full">
          <thead><tr><th>PLAYBOOK</th><th>REQUESTED BY</th><th>STATUS</th><th>DECIDED BY</th><th>DECIDED AT</th></tr></thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="text-center text-text-muted py-6">Loading...</td></tr>
            )}
            {!loading && fetchError && (
              <tr>
                <td colSpan={5}>
                  <div className="flex flex-col items-center gap-2 py-4">
                    <span>Unable to load decision history. Please try again.</span>
                    <button className="btn-mission text-small px-3 py-1.5" onClick={fetchData}>Retry</button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && !fetchError && decided.length === 0 && (
              <tr><td colSpan={5} className="text-center text-text-muted py-6">No decisions yet.</td></tr>
            )}
            {!loading && !fetchError && decided.map((a) => (
              <tr key={a.id}>
                <td>{a.playbookName}</td>
                <td>{a.requestedByName}</td>
                <td>
                  <span className={clsx(
                    'badge-mission',
                    a.status === 'APPROVED'
                      ? 'text-severity-low border-severity-low/30 bg-severity-low/10'
                      : 'text-severity-critical border-severity-critical/30 bg-severity-critical/10'
                  )}>
                    {a.status}
                  </span>
                </td>
                <td>{a.approvedByName}{a.rejectionReason ? ` — ${a.rejectionReason}` : ''}</td>
                <td>{a.decidedAt ? new Date(a.decidedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-mission overflow-x-auto">
        <div className="p-4 pb-0"><h3 className="text-h3 text-text-primary">Containment Action History</h3></div>
        <table className="table-enterprise w-full">
          <thead><tr><th>TYPE</th><th>TARGET</th><th>PERFORMED BY</th><th>WHEN</th><th style={{ textAlign: 'right' }}>ROLLBACK</th></tr></thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="text-center text-text-muted py-6">Loading...</td></tr>
            )}
            {!loading && fetchError && (
              <tr>
                <td colSpan={5}>
                  <div className="flex flex-col items-center gap-2 py-4">
                    <span>Unable to load containment action history. Please try again.</span>
                    <button className="btn-mission text-small px-3 py-1.5" onClick={fetchData}>Retry</button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && !fetchError && actions.length === 0 && (
              <tr><td colSpan={5} className="text-center text-text-muted py-6">No containment actions taken yet.</td></tr>
            )}
            {!loading && !fetchError && actions.map((act) => (
              <tr key={act.id}>
                <td className="font-mono text-small">{act.actionType}</td>
                <td>{act.targetDescription}</td>
                <td>{act.performedBy}</td>
                <td>{new Date(act.createdAt).toLocaleString()}</td>
                <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                  {act.rolledBack ? (
                    <span className="text-small text-text-muted">Rolled back by {act.rolledBackBy}</span>
                  ) : act.reversible ? (
                    <button
                      className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Roll back"
                      aria-label={`Roll back ${act.actionType} on ${act.targetDescription}`}
                      onClick={() => setRollbackTargetId(act.id)}
                      disabled={!canWrite}
                    >
                      <Undo2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <span className="text-small text-text-muted">Not reversible</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={rejectTargetId !== null}
        title="Reject this containment action?"
        message="The playbook will not run. This decision is recorded in the audit trail."
        confirmLabel="Reject"
        danger
        onConfirm={handleReject}
        onCancel={() => setRejectTargetId(null)}
      />
      <ConfirmDialog
        open={rollbackTargetId !== null}
        title="Roll back this containment action?"
        message="This reverses the real effect of the action (e.g. re-enables a disabled account or removes a firewall block)."
        confirmLabel="Roll Back"
        onConfirm={handleRollback}
        onCancel={() => setRollbackTargetId(null)}
      />
    </div>
  )
}
