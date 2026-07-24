import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, ShieldOff, ShieldCheck, Trash2, Save, ArrowRightLeft } from 'lucide-react'
import { clsx } from 'clsx'
import {
  getUser,
  updateUserProfile,
  activateUser,
  deactivateUser,
  deleteUser,
  moveUserTenant,
  assignRole,
  removeRole,
  listTenants,
  PlatformUserDetail,
  Tenant,
  ALL_REALM_ROLES,
} from '@/lib/platformAdminApi'
import { usePlatformToastStore } from '@/store/platformToastStore'
import ConfirmDialog from '@/modules/platform-admin/components/ConfirmDialog'

type ConfirmAction = 'activate' | 'deactivate' | 'delete' | 'move-tenant' | null

const NON_DISPLAY_ROLES = new Set(['default-roles-acis', 'offline_access', 'uma_authorization'])

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const showToast = usePlatformToastStore((s) => s.show)

  const [user, setUser] = useState<PlatformUserDetail | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [savingDetails, setSavingDetails] = useState(false)

  const [moveTargetTenantId, setMoveTargetTenantId] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [pendingRole, setPendingRole] = useState<string | null>(null)

  const load = async () => {
    if (!id) return
    setIsLoading(true)
    setError(null)
    try {
      const [u, t] = await Promise.all([getUser(id), listTenants()])
      setUser(u)
      setTenants(t)
      setUsername(u.username)
      setEmail(u.email || '')
      setFirstName(u.firstName || '')
      setLastName(u.lastName || '')
      setMoveTargetTenantId(t.find((tenant) => tenant.id !== u.tenantId)?.id || '')
    } catch (e) {
      console.error('Failed to fetch user:', e)
      setError('Failed to load user. It may not exist.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleSaveDetails = async () => {
    if (!id) return
    setFieldError(null)
    if (!username.trim()) {
      setFieldError('Username is required.')
      return
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setFieldError('Email is not a valid email address.')
      return
    }
    setSavingDetails(true)
    try {
      const updated = await updateUserProfile(id, {
        username: username.trim(),
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      setUser(updated)
      showToast('success', 'User details saved.')
    } catch (e: any) {
      console.error('Failed to update user:', e)
      showToast('error', e?.message || 'Failed to save user details.')
    } finally {
      setSavingDetails(false)
    }
  }

  const toggleRole = async (roleKey: string, currentlyHeld: boolean) => {
    if (!id) return
    setPendingRole(roleKey)
    try {
      if (currentlyHeld) {
        await removeRole(id, roleKey)
      } else {
        await assignRole(id, roleKey)
      }
      const refreshed = await getUser(id)
      setUser(refreshed)
      showToast('success', `Role "${roleKey}" ${currentlyHeld ? 'removed' : 'assigned'}.`)
    } catch (e: any) {
      console.error('Failed to change role:', e)
      // Company-Admin conflicts (and any other validation failure) surface here,
      // inline, at the exact checkbox — the checkbox itself just doesn't change
      // since we only update state from a successful refetch above.
      showToast('error', e?.message || 'Failed to change role.')
    } finally {
      setPendingRole(null)
    }
  }

  const runConfirmedAction = async () => {
    if (!id || !confirmAction || !user) return
    setConfirmBusy(true)
    try {
      if (confirmAction === 'activate') {
        const updated = await activateUser(id)
        setUser(updated)
        showToast('success', 'User activated.')
      } else if (confirmAction === 'deactivate') {
        const updated = await deactivateUser(id)
        setUser(updated)
        showToast('success', 'User deactivated.')
      } else if (confirmAction === 'move-tenant') {
        const updated = await moveUserTenant(id, moveTargetTenantId)
        setUser(updated)
        showToast('success', 'User moved to new tenant.')
      } else if (confirmAction === 'delete') {
        await deleteUser(id)
        showToast('success', 'User deleted.')
        navigate('/platform-admin/users')
        return
      }
    } catch (e: any) {
      console.error(`Failed to ${confirmAction} user:`, e)
      showToast('error', e?.message || `Failed to ${confirmAction} user.`)
    } finally {
      setConfirmBusy(false)
      setConfirmAction(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" />
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/platform-admin/users')} className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to Users
        </button>
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-xs text-danger font-semibold">
          {error || 'User not found.'}
        </div>
      </div>
    )
  }

  const heldRoles = new Set(user.roles.filter((r) => !NON_DISPLAY_ROLES.has(r)))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
        <div>
          <button
            onClick={() => navigate('/platform-admin/users')}
            className="flex items-center gap-2 text-[11px] text-neutral-500 hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Users
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white tracking-tight uppercase">{user.username}</h1>
            <span
              className={clsx(
                'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                user.enabled ? 'bg-[#00FF99]/10 text-[#00FF99]' : 'bg-danger/10 text-danger'
              )}
            >
              {user.enabled ? 'ACTIVE' : 'DISABLED'}
            </span>
          </div>
          <p className="text-[10px] text-neutral-600 font-mono mt-1">{user.id}</p>
        </div>

        <div className="flex items-center gap-2">
          {user.enabled ? (
            <button
              onClick={() => setConfirmAction('deactivate')}
              className="flex items-center gap-2 bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger font-bold px-4 py-2 rounded-xl text-xs transition-colors"
            >
              <ShieldOff className="w-4 h-4" /> Deactivate
            </button>
          ) : (
            <button
              onClick={() => setConfirmAction('activate')}
              className="flex items-center gap-2 bg-[#00FF99]/10 hover:bg-[#00FF99]/20 border border-[#00FF99]/30 text-[#00FF99] font-bold px-4 py-2 rounded-xl text-xs transition-colors"
            >
              <ShieldCheck className="w-4 h-4" /> Activate
            </button>
          )}
          <button
            onClick={() => setConfirmAction('delete')}
            className="flex items-center gap-2 bg-neutral-900 hover:bg-danger/20 border border-neutral-800 hover:border-danger/30 text-neutral-400 hover:text-danger font-bold px-4 py-2 rounded-xl text-xs transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile */}
        <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">Profile</h2>
          {fieldError && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-xs text-danger font-semibold">{fieldError}</div>
          )}
          <div className="space-y-1">
            <label className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider block">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7C3AED]/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider block">First Name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7C3AED]/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider block">Last Name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7C3AED]/50"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider block">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7C3AED]/50"
            />
          </div>
          <button
            onClick={handleSaveDetails}
            disabled={savingDetails}
            className="flex items-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> {savingDetails ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        {/* Tenant assignment */}
        <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-bold text-white uppercase tracking-widest">Tenant Assignment</h2>
          <div className="space-y-1">
            <label className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider block">Current Tenant</label>
            <div className="bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white">
              {user.tenantName || <span className="text-neutral-600">Unassigned</span>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-neutral-500 font-bold uppercase tracking-wider block">Move To</label>
            <select
              value={moveTargetTenantId}
              onChange={(e) => setMoveTargetTenantId(e.target.value)}
              className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7C3AED]/50"
            >
              {tenants
                .filter((t) => t.id !== user.tenantId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
          {heldRoles.has('company-admin') && (
            <p className="text-[10px] text-[#FFAB00] leading-relaxed">
              This user holds Company Admin in their current tenant — moving them will strip that role, since
              ownership is scoped to a specific tenant.
            </p>
          )}
          <button
            onClick={() => setConfirmAction('move-tenant')}
            disabled={!moveTargetTenantId}
            className="flex items-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors disabled:opacity-50"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" /> Move Tenant
          </button>
        </div>
      </div>

      {/* Roles */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 space-y-4">
        <h2 className="text-xs font-bold text-white uppercase tracking-widest">Roles</h2>
        <p className="text-[10px] text-neutral-600">
          Changes apply immediately — each toggle calls the API directly so a rejected change (e.g. Company Admin
          already held elsewhere in this tenant) shows up right at the checkbox.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ALL_REALM_ROLES.map((role) => {
            const checked = heldRoles.has(role.key)
            const busy = pendingRole === role.key
            return (
              <label
                key={role.key}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors text-xs font-semibold',
                  checked ? 'border-[#7C3AED]/40 bg-[#7C3AED]/10 text-white' : 'border-neutral-800 text-neutral-500 hover:border-neutral-700',
                  busy && 'opacity-50 pointer-events-none'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={() => toggleRole(role.key, checked)}
                  className="accent-[#7C3AED]"
                />
                {role.label}
                {busy && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
              </label>
            )
          })}
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction === 'deactivate'}
        title="Deactivate User"
        message={`This immediately blocks "${user.username}" from logging in. You can reactivate at any time.`}
        confirmLabel="Deactivate"
        danger
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      />
      <ConfirmDialog
        open={confirmAction === 'activate'}
        title="Activate User"
        message={`Restore login access for "${user.username}"?`}
        confirmLabel="Activate"
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      />
      <ConfirmDialog
        open={confirmAction === 'move-tenant'}
        title="Move User to New Tenant"
        message={`Move "${user.username}" from "${user.tenantName || 'their current tenant'}" to "${
          tenants.find((t) => t.id === moveTargetTenantId)?.name || 'the selected tenant'
        }"? ${heldRoles.has('company-admin') ? 'Their Company Admin role will be removed.' : ''}`}
        confirmLabel="Move"
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        title="Delete User"
        message={`This permanently removes "${user.username}" from Keycloak. This cannot be undone.`}
        confirmLabel="Delete Permanently"
        danger
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      />
    </div>
  )
}
