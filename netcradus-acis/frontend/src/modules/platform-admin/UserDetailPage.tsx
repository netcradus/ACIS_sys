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
import UserSecurityTab from '@/modules/platform-admin/components/UserSecurityTab'

type ConfirmAction = 'activate' | 'deactivate' | 'delete' | 'move-tenant' | null
type TabId = 'profile' | 'security'

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
  const [activeTab, setActiveTab] = useState<TabId>('profile')

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
        <Loader2 className="w-6 h-6 text-accent-pa animate-spin" />
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/platform-admin/users')} className="flex items-center gap-2 text-small text-text-secondary hover:text-text-primary">
          <ArrowLeft className="w-4 h-4" /> Back to Users
        </button>
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 text-small text-danger font-semibold">
          {error || 'User not found.'}
        </div>
      </div>
    )
  }

  const heldRoles = new Set(user.roles.filter((r) => !NON_DISPLAY_ROLES.has(r)))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <div>
          <button
            onClick={() => navigate('/platform-admin/users')}
            className="flex items-center gap-2 text-small text-text-muted hover:text-text-primary mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Users
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-h1 text-text-primary">{user.username}</h1>
            <span
              className={clsx(
                'px-2 py-0.5 rounded-full text-label uppercase',
                user.enabled ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
              )}
            >
              {user.enabled ? 'ACTIVE' : 'DISABLED'}
            </span>
          </div>
          <p className="text-label text-text-muted font-mono mt-1">{user.id}</p>
        </div>

        <div className="flex items-center gap-2">
          {user.enabled ? (
            <button
              onClick={() => setConfirmAction('deactivate')}
              className="flex items-center gap-2 bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger font-semibold px-4 py-2 rounded-lg text-small transition-colors"
            >
              <ShieldOff className="w-4 h-4" /> Deactivate
            </button>
          ) : (
            <button
              onClick={() => setConfirmAction('activate')}
              className="flex items-center gap-2 bg-success/10 hover:bg-success/20 border border-success/30 text-success font-semibold px-4 py-2 rounded-lg text-small transition-colors"
            >
              <ShieldCheck className="w-4 h-4" /> Activate
            </button>
          )}
          <button
            onClick={() => setConfirmAction('delete')}
            className="flex items-center gap-2 bg-surface-3 hover:bg-danger/20 border border-fire-border hover:border-danger/30 text-text-secondary hover:text-danger font-semibold px-4 py-2 rounded-lg text-small transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-fire-border">
        <button
          onClick={() => setActiveTab('profile')}
          className={clsx('px-4 py-2 text-small font-semibold transition-colors border-b-2 -mb-px',
            activeTab === 'profile' ? 'text-accent-pa border-accent-pa' : 'text-text-muted border-transparent hover:text-text-primary')}
        >Profile &amp; Roles</button>
        <button
          onClick={() => setActiveTab('security')}
          className={clsx('px-4 py-2 text-small font-semibold transition-colors border-b-2 -mb-px',
            activeTab === 'security' ? 'text-accent-pa border-accent-pa' : 'text-text-muted border-transparent hover:text-text-primary')}
        >Security</button>
      </div>

      {activeTab === 'security' ? (
        <UserSecurityTab userId={id!} />
      ) : (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile */}
        <div className="card-mission space-y-4">
          <h2 className="text-h3 text-text-primary">Profile</h2>
          {fieldError && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-small text-danger font-semibold">{fieldError}</div>
          )}
          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-label text-text-muted uppercase block">First Name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
              />
            </div>
            <div className="space-y-1">
              <label className="text-label text-text-muted uppercase block">Last Name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
            />
          </div>
          <button
            onClick={handleSaveDetails}
            disabled={savingDetails}
            className="flex items-center gap-2 bg-accent-pa hover:bg-accent-pa-dark text-white font-semibold px-4 py-2 rounded-lg text-small transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> {savingDetails ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        {/* Tenant assignment */}
        <div className="card-mission space-y-4">
          <h2 className="text-h3 text-text-primary">Tenant Assignment</h2>
          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Current Tenant</label>
            <div className="bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary">
              {user.tenantName || <span className="text-text-muted">Unassigned</span>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Move To</label>
            <select
              value={moveTargetTenantId}
              onChange={(e) => setMoveTargetTenantId(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary focus:outline-none focus:border-accent-pa cursor-pointer"
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
            <p className="text-small text-warning leading-relaxed">
              This user holds Company Admin in their current tenant — moving them will strip that role, since
              ownership is scoped to a specific tenant.
            </p>
          )}
          <button
            onClick={() => setConfirmAction('move-tenant')}
            disabled={!moveTargetTenantId}
            className="flex items-center gap-2 bg-accent-pa hover:bg-accent-pa-dark text-white font-semibold px-4 py-2 rounded-lg text-small transition-colors disabled:opacity-50"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" /> Move Tenant
          </button>
        </div>
      </div>

      {/* Roles */}
      <div className="card-mission space-y-4">
        <h2 className="text-h3 text-text-primary">Roles</h2>
        <p className="text-small text-text-muted">
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
                  'flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors text-small font-medium',
                  checked ? 'border-accent-pa/40 bg-accent-pa/10 text-text-primary' : 'border-fire-border text-text-muted hover:border-accent-pa/30',
                  busy && 'opacity-50 pointer-events-none'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={() => toggleRole(role.key, checked)}
                  className="accent-accent-pa"
                />
                {role.label}
                {busy && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
              </label>
            )
          })}
        </div>
      </div>
      </>
      )}

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
