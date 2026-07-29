import { useEffect, useState } from 'react'
import { Loader2, Lock, Unlock, Key, Shield, ShieldOff, Monitor, Trash2, RefreshCw, History, AlertTriangle } from 'lucide-react'
import { clsx } from 'clsx'
import {
  getUserSecurityInfo,
  resetUserPassword,
  generateTempPassword,
  forcePasswordChange,
  sendPasswordResetEmail,
  lockUserAccount,
  unlockUserAccount,
  clearBruteForce,
  requireMfa,
  removeMfa,
  resetMfaDevices,
  listUserSessions,
  terminateSession,
  terminateAllSessions,
  getUserLoginEvents,
  UserSecurityInfo,
  UserSessionInfo,
  LoginEventInfo,
} from '@/lib/platformAdminApi'
import { usePlatformToastStore } from '@/store/platformToastStore'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  userId: string
}

type ConfirmType = 'lock' | 'unlock' | 'brute-clear' | 'mfa-require' | 'mfa-remove' | 'mfa-reset' |
  'force-pw-change' | 'send-reset-email' | 'terminate-session' | 'terminate-all' | null

export default function UserSecurityTab({ userId }: Props) {
  const showToast = usePlatformToastStore((s) => s.show)
  const [secInfo, setSecInfo] = useState<UserSecurityInfo | null>(null)
  const [sessions, setSessions] = useState<UserSessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const [loginEvents, setLoginEvents] = useState<LoginEventInfo[]>([])
  const [loginEventsLoading, setLoginEventsLoading] = useState(false)
  const [loginEventsNotEnabled, setLoginEventsNotEnabled] = useState(false)
  const [loginEventsError, setLoginEventsError] = useState<string | null>(null)

  const [confirmType, setConfirmType] = useState<ConfirmType>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null)

  // Password reset form
  const [newPassword, setNewPassword] = useState('')
  const [tempFlag, setTempFlag] = useState(true)
  const [pwBusy, setPwBusy] = useState(false)
  const [generatedPw, setGeneratedPw] = useState<string | null>(null)

  const loadSecurity = async () => {
    setLoading(true)
    try {
      const info = await getUserSecurityInfo(userId)
      setSecInfo(info)
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to load security info')
    } finally {
      setLoading(false)
    }
  }

  const loadSessions = async () => {
    setSessionsLoading(true)
    try {
      const s = await listUserSessions(userId)
      setSessions(s)
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to load sessions')
    } finally {
      setSessionsLoading(false)
    }
  }

  const loadLoginEvents = async () => {
    setLoginEventsLoading(true)
    setLoginEventsNotEnabled(false)
    setLoginEventsError(null)
    try {
      const events = await getUserLoginEvents(userId)
      setLoginEvents(events)
    } catch (e: any) {
      if (e?.response?.status === 501) {
        setLoginEventsNotEnabled(true)
      } else {
        setLoginEventsError(e?.message || 'Failed to load login history')
      }
    } finally {
      setLoginEventsLoading(false)
    }
  }

  useEffect(() => {
    loadSecurity()
    loadSessions()
    loadLoginEvents()
  }, [userId])

  const handleResetPassword = async () => {
    if (!newPassword.trim()) { showToast('error', 'Enter a password'); return }
    setPwBusy(true)
    try {
      await resetUserPassword(userId, newPassword.trim(), tempFlag)
      showToast('success', `Password ${tempFlag ? 'temporarily ' : ''}reset successfully.`)
      setNewPassword('')
      loadSecurity()
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to reset password')
    } finally { setPwBusy(false) }
  }

  const handleGenerateTemp = async () => {
    setPwBusy(true)
    try {
      const pw = await generateTempPassword(userId)
      setGeneratedPw(pw)
      showToast('success', 'Temporary password generated.')
      loadSecurity()
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to generate password')
    } finally { setPwBusy(false) }
  }

  const runConfirm = async () => {
    setConfirmBusy(true)
    try {
      switch (confirmType) {
        case 'lock': await lockUserAccount(userId); showToast('success', 'Account locked.'); break
        case 'unlock': await unlockUserAccount(userId); showToast('success', 'Account unlocked.'); break
        case 'brute-clear': await clearBruteForce(userId); showToast('success', 'Brute-force status cleared.'); break
        case 'mfa-require': await requireMfa(userId); showToast('success', 'MFA required on next login.'); break
        case 'mfa-remove': await removeMfa(userId); showToast('success', 'MFA configuration removed.'); break
        case 'mfa-reset': await resetMfaDevices(userId); showToast('success', 'MFA devices reset.'); break
        case 'force-pw-change': await forcePasswordChange(userId); showToast('success', 'Password change required on next login.'); break
        case 'send-reset-email': await sendPasswordResetEmail(userId); showToast('success', 'Password reset email sent.'); break
        case 'terminate-session':
          if (targetSessionId) { await terminateSession(userId, targetSessionId); showToast('success', 'Session terminated.') }
          break
        case 'terminate-all': await terminateAllSessions(userId); showToast('success', 'All sessions terminated.'); break
      }
      loadSecurity()
      loadSessions()
    } catch (e: any) {
      showToast('error', e?.message || `Failed: ${confirmType}`)
    } finally {
      setConfirmBusy(false)
      setConfirmType(null)
      setTargetSessionId(null)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-[#7C3AED] animate-spin" /></div>
  }

  if (!secInfo) {
    return <div className="text-xs text-danger">Failed to load security information.</div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Account Status */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-widest">Account Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatusCard label="Status" value={secInfo.accountStatus}
            color={secInfo.accountStatus === 'ACTIVE' ? 'green' : 'red'} />
          <StatusCard label="Failed Logins" value={String(secInfo.failedLoginAttempts)}
            color={secInfo.failedLoginAttempts > 0 ? 'amber' : 'green'} />
          <StatusCard label="MFA" value={secInfo.mfaEnabled ? 'Enabled' : 'Disabled'}
            color={secInfo.mfaEnabled ? 'green' : 'neutral'} />
          <StatusCard label="Active Sessions" value={String(secInfo.activeSessionCount)}
            color="neutral" />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {secInfo.enabled ? (
            <ActionBtn icon={Lock} label="Lock Account" onClick={() => setConfirmType('lock')} danger />
          ) : (
            <ActionBtn icon={Unlock} label="Unlock Account" onClick={() => setConfirmType('unlock')} />
          )}
          {secInfo.bruteForceLocked && (
            <ActionBtn icon={RefreshCw} label="Clear Brute-Force" onClick={() => setConfirmType('brute-clear')} />
          )}
        </div>
      </div>

      {/* Password Management */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-widest">Password Management</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider block">Set New Password</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password..."
              className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7C3AED]/50"
            />
            <label className="flex items-center gap-2 text-[11px] text-neutral-400">
              <input type="checkbox" checked={tempFlag} onChange={(e) => setTempFlag(e.target.checked)} className="accent-[#7C3AED]" />
              Temporary (user must change on next login)
            </label>
            <button onClick={handleResetPassword} disabled={pwBusy}
              className="flex items-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold px-3 py-1.5 rounded-lg text-[11px] disabled:opacity-50">
              <Key className="w-3.5 h-3.5" /> {pwBusy ? 'Working...' : 'Reset Password'}
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider block">Quick Actions</label>
            <div className="flex flex-col gap-2">
              <ActionBtn icon={Key} label="Generate Temp Password" onClick={handleGenerateTemp} />
              <ActionBtn icon={Key} label="Force Password Change" onClick={() => setConfirmType('force-pw-change')} />
              <ActionBtn icon={Key} label="Send Reset Email" onClick={() => setConfirmType('send-reset-email')} />
            </div>
            {generatedPw && (
              <div className="bg-[#050505] border border-[#7C3AED]/30 rounded-lg p-3 mt-2">
                <p className="text-[10px] text-neutral-400 mb-1">Generated Temporary Password:</p>
                <code className="text-xs text-[#00FF99] font-mono select-all">{generatedPw}</code>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MFA Management */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-widest">Multi-Factor Authentication</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatusCard label="MFA Status" value={secInfo.mfaEnabled ? 'Enabled' : 'Not Configured'}
            color={secInfo.mfaEnabled ? 'green' : 'neutral'} />
          <StatusCard label="OTP Devices" value={String(secInfo.otpDeviceCount)} color="neutral" />
          <StatusCard label="MFA Required" value={secInfo.mfaRequired ? 'Yes' : 'No'}
            color={secInfo.mfaRequired ? 'amber' : 'neutral'} />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {!secInfo.mfaRequired && (
            <ActionBtn icon={Shield} label="Require MFA" onClick={() => setConfirmType('mfa-require')} />
          )}
          {secInfo.mfaEnabled && (
            <>
              <ActionBtn icon={ShieldOff} label="Remove MFA" onClick={() => setConfirmType('mfa-remove')} danger />
              <ActionBtn icon={RefreshCw} label="Reset MFA Devices" onClick={() => setConfirmType('mfa-reset')} danger />
            </>
          )}
        </div>
      </div>

      {/* Sessions */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-widest">Active Sessions</h3>
          <div className="flex gap-2">
            <button onClick={loadSessions} className="text-[10px] text-neutral-500 hover:text-white flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
            {sessions.length > 0 && (
              <ActionBtn icon={Trash2} label="Terminate All" onClick={() => setConfirmType('terminate-all')} danger />
            )}
          </div>
        </div>

        {sessionsLoading ? (
          <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 text-[#7C3AED] animate-spin" /></div>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-neutral-600 py-4">No active sessions.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.sessionId} className="flex items-center justify-between bg-[#050505] border border-neutral-800/60 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Monitor className="w-4 h-4 text-neutral-500" />
                  <div>
                    <p className="text-[11px] text-white font-semibold">{s.clients || 'Unknown Client'}</p>
                    <p className="text-[10px] text-neutral-600">
                      IP: {s.ipAddress || 'N/A'} | Started: {s.startTimestamp ? new Date(s.startTimestamp).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setTargetSessionId(s.sessionId); setConfirmType('terminate-session') }}
                  className="text-[10px] text-danger hover:text-white bg-danger/10 hover:bg-danger/30 border border-danger/20 px-2 py-1 rounded font-bold"
                >
                  Terminate
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Login Activity */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-widest">Recent Login Activity</h3>
          <button onClick={loadLoginEvents} className="text-[10px] text-neutral-500 hover:text-white flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {loginEventsLoading ? (
          <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 text-[#7C3AED] animate-spin" /></div>
        ) : loginEventsNotEnabled ? (
          <div className="flex items-start gap-3 bg-[#050505] border border-neutral-800/60 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 text-[#FFAB00] flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-neutral-400">
              Login event history is not enabled on this realm. This is a genuine Keycloak realm-configuration
              limitation, not an application error — an operator must enable events on the realm to populate this view.
            </p>
          </div>
        ) : loginEventsError ? (
          <p className="text-xs text-danger py-4">{loginEventsError}</p>
        ) : loginEvents.length === 0 ? (
          <p className="text-xs text-neutral-600 py-4">No login events recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {loginEvents.map((e, idx) => (
              <div key={idx} className="flex items-center justify-between bg-[#050505] border border-neutral-800/60 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <History className="w-4 h-4 text-neutral-500" />
                  <div>
                    <p className="text-[11px] text-white font-semibold">
                      {(e.type || '').replace(/_/g, ' ')}
                      {e.clientId ? ` — ${e.clientId}` : ''}
                    </p>
                    <p className="text-[10px] text-neutral-600">
                      IP: {e.ipAddress || 'N/A'} | {e.time ? new Date(e.time).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                </div>
                {e.error && (
                  <span className="text-[10px] text-danger bg-danger/10 border border-danger/20 px-2 py-1 rounded font-bold">
                    {e.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm Dialogs */}
      <ConfirmDialog open={confirmType === 'lock'} title="Lock Account" danger
        message="This will immediately disable the account and prevent login." confirmLabel="Lock"
        busy={confirmBusy} onCancel={() => setConfirmType(null)} onConfirm={runConfirm} />
      <ConfirmDialog open={confirmType === 'unlock'} title="Unlock Account"
        message="This will re-enable the account and clear brute-force lockouts." confirmLabel="Unlock"
        busy={confirmBusy} onCancel={() => setConfirmType(null)} onConfirm={runConfirm} />
      <ConfirmDialog open={confirmType === 'brute-clear'} title="Clear Brute-Force Status"
        message="This resets failed login counters for this user." confirmLabel="Clear"
        busy={confirmBusy} onCancel={() => setConfirmType(null)} onConfirm={runConfirm} />
      <ConfirmDialog open={confirmType === 'mfa-require'} title="Require MFA"
        message="User will be forced to configure TOTP on next login." confirmLabel="Require MFA"
        busy={confirmBusy} onCancel={() => setConfirmType(null)} onConfirm={runConfirm} />
      <ConfirmDialog open={confirmType === 'mfa-remove'} title="Remove MFA" danger
        message="This removes all MFA configuration for this user." confirmLabel="Remove MFA"
        busy={confirmBusy} onCancel={() => setConfirmType(null)} onConfirm={runConfirm} />
      <ConfirmDialog open={confirmType === 'mfa-reset'} title="Reset MFA Devices" danger
        message="All MFA devices will be removed and user must re-register." confirmLabel="Reset"
        busy={confirmBusy} onCancel={() => setConfirmType(null)} onConfirm={runConfirm} />
      <ConfirmDialog open={confirmType === 'force-pw-change'} title="Force Password Change"
        message="User will be required to change password on next login." confirmLabel="Force Change"
        busy={confirmBusy} onCancel={() => setConfirmType(null)} onConfirm={runConfirm} />
      <ConfirmDialog open={confirmType === 'send-reset-email'} title="Send Reset Email"
        message="A password reset email will be sent. SMTP must be configured in Keycloak." confirmLabel="Send"
        busy={confirmBusy} onCancel={() => setConfirmType(null)} onConfirm={runConfirm} />
      <ConfirmDialog open={confirmType === 'terminate-session'} title="Terminate Session" danger
        message="This will immediately end the selected session." confirmLabel="Terminate"
        busy={confirmBusy} onCancel={() => { setConfirmType(null); setTargetSessionId(null) }} onConfirm={runConfirm} />
      <ConfirmDialog open={confirmType === 'terminate-all'} title="Terminate All Sessions" danger
        message="All active sessions for this user will be immediately ended." confirmLabel="Terminate All"
        busy={confirmBusy} onCancel={() => setConfirmType(null)} onConfirm={runConfirm} />
    </div>
  )
}

function StatusCard({ label, value, color }: { label: string; value: string; color: 'green' | 'red' | 'amber' | 'neutral' }) {
  const colors = {
    green: 'text-[#00FF99] bg-[#00FF99]/10 border-[#00FF99]/20',
    red: 'text-danger bg-danger/10 border-danger/20',
    amber: 'text-[#FFAB00] bg-[#FFAB00]/10 border-[#FFAB00]/20',
    neutral: 'text-neutral-300 bg-neutral-800/30 border-neutral-800',
  }
  return (
    <div className={clsx('rounded-lg border p-3', colors[color])}>
      <p className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  )
}

function ActionBtn({ icon: Icon, label, onClick, danger = false }: {
  icon: any; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button onClick={onClick} className={clsx(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors border',
      danger
        ? 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20'
        : 'border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#7C3AED] hover:bg-[#7C3AED]/20'
    )}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  )
}
