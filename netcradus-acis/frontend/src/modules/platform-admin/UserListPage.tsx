import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgGridReact } from 'ag-grid-react'
import { ColDef } from 'ag-grid-community'
import { Search, Plus, X, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { listUsers, createUser, listTenants, PlatformUser, Tenant, ALL_REALM_ROLES } from '@/lib/platformAdminApi'
import { usePlatformToastStore } from '@/store/platformToastStore'

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'DISABLED'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={clsx(
        'px-2 py-0.5 rounded-full text-label uppercase',
        enabled ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
      )}
    >
      {enabled ? 'ACTIVE' : 'DISABLED'}
    </span>
  )
}

export default function UserListPage() {
  const navigate = useNavigate()
  const showToast = usePlatformToastStore((s) => s.show)

  const [users, setUsers] = useState<PlatformUser[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [tenantFilter, setTenantFilter] = useState<string>('ALL')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchAll = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [userData, tenantData] = await Promise.all([listUsers(), listTenants()])
      setUsers(userData)
      setTenants(tenantData)
    } catch (e) {
      console.error('Failed to fetch users:', e)
      setError('Failed to load users.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (statusFilter === 'ACTIVE' && !u.enabled) return false
      if (statusFilter === 'DISABLED' && u.enabled) return false
      if (tenantFilter !== 'ALL' && u.tenantId !== tenantFilter) return false
      if (roleFilter !== 'ALL' && !u.roles.includes(roleFilter)) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        return (
          u.username.toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.firstName || '').toLowerCase().includes(q) ||
          (u.lastName || '').toLowerCase().includes(q) ||
          (u.tenantName || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [users, search, statusFilter, tenantFilter, roleFilter])

  const columnDefs = useMemo<ColDef[]>(
    () => [
      {
        field: 'username',
        headerName: 'USER',
        flex: 2,
        cellRenderer: (params: any) => (
          <div className="leading-tight">
            <div className="font-semibold text-text-primary">{params.value}</div>
            <div className="text-label text-text-muted">{params.data.email || '—'}</div>
          </div>
        ),
      },
      {
        field: 'tenantName',
        headerName: 'TENANT',
        flex: 1,
        cellRenderer: (params: any) => <span className="text-text-secondary">{params.value || '—'}</span>,
      },
      {
        field: 'roles',
        headerName: 'ROLES',
        flex: 1.5,
        cellRenderer: (params: any) => (
          <span className="text-text-muted text-small">
            {(params.value || []).filter((r: string) => r !== 'default-roles-acis' && r !== 'offline_access' && r !== 'uma_authorization').join(', ') || '—'}
          </span>
        ),
      },
      {
        field: 'enabled',
        headerName: 'STATUS',
        flex: 1,
        cellRenderer: (params: any) => <StatusBadge enabled={params.value} />,
      },
      {
        field: 'totp',
        headerName: 'MFA',
        flex: 0.7,
        cellRenderer: (params: any) => (
          <span className={clsx('text-label uppercase', params.value ? 'text-success' : 'text-text-muted')}>
            {params.value ? 'ON' : 'OFF'}
          </span>
        ),
      },
    ],
    []
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <h1 className="text-h1 text-text-primary">Users</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-accent-pa hover:bg-accent-pa-dark text-white font-semibold px-4 py-2 rounded-lg text-small flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> New User
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, username, or tenant..."
            className="w-full bg-surface-2 border border-fire-border rounded-lg pl-9 pr-3 py-2.5 text-small text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
          />
        </div>

        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="bg-surface-2 border border-fire-border rounded-lg px-3 py-2.5 text-small text-text-primary focus:outline-none focus:border-accent-pa cursor-pointer"
        >
          <option value="ALL">All Tenants</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-surface-2 border border-fire-border rounded-lg px-3 py-2.5 text-small text-text-primary focus:outline-none focus:border-accent-pa cursor-pointer"
        >
          <option value="ALL">All Roles</option>
          {ALL_REALM_ROLES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 bg-surface-2 border border-fire-border rounded-lg p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-label uppercase transition-colors',
                statusFilter === s ? 'bg-accent-pa text-white' : 'text-text-muted hover:text-text-primary'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 text-small text-danger font-semibold">{error}</div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-accent-pa animate-spin" />
        </div>
      ) : (
        <div className="min-h-[500px] bg-background border border-fire-border rounded-xl overflow-hidden shadow-card">
          <div className="ag-theme-platform-admin w-full h-[500px]">
            <AgGridReact
              rowData={filteredUsers}
              columnDefs={columnDefs}
              animateRows
              headerHeight={48}
              rowHeight={52}
              pagination
              paginationPageSize={10}
              onRowClicked={(e) => navigate(`/platform-admin/users/${e.data.id}`)}
              rowStyle={{ cursor: 'pointer' }}
              overlayNoRowsTemplate="<span class='text-text-muted text-label uppercase'>No users match your filters</span>"
            />
          </div>
        </div>
      )}

      {isModalOpen && (
        <CreateUserModal
          tenants={tenants}
          onClose={() => setIsModalOpen(false)}
          onCreated={() => {
            setIsModalOpen(false)
            fetchAll()
            showToast('success', 'User created successfully.')
          }}
          onError={(msg) => showToast('error', msg)}
        />
      )}
    </div>
  )
}

function CreateUserModal({
  tenants,
  onClose,
  onCreated,
  onError,
}: {
  tenants: Tenant[]
  onClose: () => void
  onCreated: () => void
  onError: (msg: string) => void
}) {
  const [tenantId, setTenantId] = useState(tenants[0]?.id || '')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [tempPassword, setTempPassword] = useState('')
  const [forceReset, setForceReset] = useState(true)
  const [initialRole, setInitialRole] = useState('viewer')
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldError(null)

    if (!username.trim()) {
      setFieldError('Username is required.')
      return
    }
    if (!tenantId) {
      setFieldError('A tenant must be selected.')
      return
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setFieldError('Email is not a valid email address.')
      return
    }
    if (!tempPassword.trim() || tempPassword.trim().length < 8) {
      setFieldError('A temporary password of at least 8 characters is required.')
      return
    }

    setSubmitting(true)
    try {
      await createUser({
        tenantId,
        username: username.trim(),
        email: email.trim() || undefined,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        tempPassword: tempPassword.trim(),
        forcePasswordResetNextLogin: forceReset,
        initialRoles: initialRole ? [initialRole] : [],
      })
      onCreated()
    } catch (err: any) {
      console.error('Failed to create user:', err)
      onError(err?.message || 'Failed to create user.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-fire-border rounded-xl w-full max-w-md overflow-hidden shadow-card animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-fire-border">
          <h3 className="text-h3 text-text-primary">New User</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors focus:outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {fieldError && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-small text-danger font-semibold">{fieldError}</div>
          )}

          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Tenant *</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary focus:outline-none focus:border-accent-pa cursor-pointer"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Username *</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
              placeholder="jane.doe"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-label text-text-muted uppercase block">First Name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
                placeholder="Jane"
              />
            </div>
            <div className="space-y-1">
              <label className="text-label text-text-muted uppercase block">Last Name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
              placeholder="jane@acme.example"
            />
          </div>

          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Initial Role</label>
            <select
              value={initialRole}
              onChange={(e) => setInitialRole(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary focus:outline-none focus:border-accent-pa cursor-pointer"
            >
              {ALL_REALM_ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Temporary Password *</label>
            <input
              type="text"
              autoComplete="new-password"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
              placeholder="Min. 8 characters"
            />
          </div>

          <label className="flex items-center gap-2 text-small text-text-secondary font-medium">
            <input type="checkbox" checked={forceReset} onChange={(e) => setForceReset(e.target.checked)} className="accent-accent-pa" />
            Force password reset on first login
          </label>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-fire-border mt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="border border-fire-border bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary font-semibold px-4 py-2 rounded-lg text-small focus:outline-none transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-accent-pa hover:bg-accent-pa-dark text-white font-semibold px-4 py-2 rounded-lg text-small focus:outline-none transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
