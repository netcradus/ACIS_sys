import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgGridReact } from 'ag-grid-react'
import { ColDef, ICellRendererParams } from 'ag-grid-community'
import { Search, Plus, X, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { listTenants, createTenant, Tenant, TenantStatus } from '@/lib/platformAdminApi'
import { usePlatformToastStore } from '@/store/platformToastStore'

const STATUS_FILTERS: (TenantStatus | 'ALL')[] = ['ALL', 'ACTIVE', 'SUSPENDED', 'TRIAL', 'DEACTIVATED']

function StatusBadge({ status }: { status: TenantStatus }) {
  return (
    <span
      className={clsx(
        'px-2 py-0.5 rounded-full text-label uppercase',
        status === 'ACTIVE' && 'bg-success/10 text-success',
        status === 'SUSPENDED' && 'bg-danger/10 text-danger',
        status === 'TRIAL' && 'bg-warning/10 text-warning',
        status === 'DEACTIVATED' && 'bg-surface-3 text-text-muted'
      )}
    >
      {status}
    </span>
  )
}

function AdminActivationBadge({ status }: { status: Tenant['adminActivationStatus'] }) {
  const labels: Record<Tenant['adminActivationStatus'], string> = {
    NONE: 'Not Sent',
    PENDING: 'Pending',
    ACTIVE: 'Activated',
    EXPIRED: 'Link Expired',
  }
  return (
    <span
      className={clsx(
        'px-2 py-0.5 rounded-full text-label uppercase',
        status === 'ACTIVE' && 'bg-success/10 text-success',
        status === 'PENDING' && 'bg-warning/10 text-warning',
        status === 'EXPIRED' && 'bg-danger/10 text-danger',
        status === 'NONE' && 'bg-surface-3 text-text-muted'
      )}
    >
      {labels[status]}
    </span>
  )
}

// Real named components (referenced by name in columnDefs), not inline
// arrow functions — ag-grid-react only mounts a cellRenderer through
// React's own reconciler when it recognizes a real component reference,
// which matters for any cell that ever needs real event binding.
function NameCell(params: ICellRendererParams) {
  return <span className="font-bold text-text-primary">{params.value}</span>
}
function SlugCell(params: ICellRendererParams) {
  return <span className="font-mono text-text-muted">{params.value || '—'}</span>
}
function StatusCell(params: ICellRendererParams) {
  return <StatusBadge status={params.value} />
}
function PlanCell(params: ICellRendererParams) {
  return <span className="text-text-secondary">{params.value || '—'}</span>
}
function AdminOnboardingCell(params: ICellRendererParams) {
  return <AdminActivationBadge status={params.value} />
}
function ModulesCell(params: ICellRendererParams) {
  return <span className="text-text-muted">{(params.value || []).length} enabled</span>
}
function CreatedCell(params: ICellRendererParams) {
  return <span className="font-mono text-small text-text-muted">{new Date(params.value).toLocaleDateString()}</span>
}

export default function TenantListPage() {
  const navigate = useNavigate()
  const showToast = usePlatformToastStore((s) => s.show)

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TenantStatus | 'ALL'>('ALL')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchTenants = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listTenants()
      setTenants(data)
    } catch (e) {
      console.error('Failed to fetch tenants:', e)
      setError('Failed to load tenants.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTenants()
  }, [])

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        return (
          t.name.toLowerCase().includes(q) ||
          (t.slug || '').toLowerCase().includes(q) ||
          (t.contactEmail || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [tenants, search, statusFilter])

  const columnDefs = useMemo<ColDef[]>(
    () => [
      { field: 'name', headerName: 'TENANT', flex: 2, cellRenderer: NameCell },
      { field: 'slug', headerName: 'SLUG', flex: 1, cellRenderer: SlugCell },
      { field: 'status', headerName: 'STATUS', flex: 1, cellRenderer: StatusCell },
      { field: 'planName', headerName: 'PLAN', flex: 1, cellRenderer: PlanCell },
      { field: 'adminActivationStatus', headerName: 'ADMIN ONBOARDING', flex: 1, cellRenderer: AdminOnboardingCell },
      { field: 'enabledModules', headerName: 'MODULES', flex: 1, cellRenderer: ModulesCell },
      { field: 'createdAt', headerName: 'CREATED', flex: 1, cellRenderer: CreatedCell },
    ],
    []
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <h1 className="text-h1 text-text-primary">Tenants</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-accent-pa hover:bg-accent-pa-dark text-white font-semibold px-4 py-2 rounded-lg text-small flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Tenant
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, slug, or contact email..."
            className="w-full bg-surface-2 border border-fire-border rounded-lg pl-9 pr-3 py-2.5 text-small text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
          />
        </div>
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
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 text-small text-danger font-semibold flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            onClick={fetchTenants}
            className="bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger font-semibold px-3 py-1.5 rounded-lg text-small transition-colors flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-accent-pa animate-spin" />
        </div>
      ) : (
        <div className="min-h-[500px] bg-background border border-fire-border rounded-xl overflow-hidden shadow-card">
          <div className="ag-theme-platform-admin w-full h-[500px]">
            <AgGridReact
              rowData={filteredTenants}
              columnDefs={columnDefs}
              animateRows
              headerHeight={48}
              rowHeight={52}
              pagination
              paginationPageSize={10}
              onRowClicked={(e) => navigate(`/platform-admin/tenants/${e.data.id}`)}
              rowStyle={{ cursor: 'pointer' }}
              overlayNoRowsTemplate="<span class='text-text-muted text-label uppercase'>No tenants match your filters</span>"
            />
          </div>
        </div>
      )}

      {isModalOpen && (
        <CreateTenantModal
          onClose={() => setIsModalOpen(false)}
          onCreated={(result) => {
            setIsModalOpen(false)
            fetchTenants()
            if (result.activationEmailSent) {
              showToast('success', `Tenant created. Activation email sent to ${result.tenant.contactEmail}.`)
            } else {
              showToast(
                'error',
                `Tenant created, but the activation email failed to send${result.activationEmailError ? ` (${result.activationEmailError})` : ''}. Use "Resend Activation" on the tenant's page.`
              )
            }
          }}
          onError={(msg) => showToast('error', msg)}
        />
      )}
    </div>
  )
}

function CreateTenantModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void
  onCreated: (result: import('@/lib/platformAdminApi').CreateTenantResponse) => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [planName, setPlanName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactName, setContactName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldError(null)

    if (!name.trim()) {
      setFieldError('Tenant name is required.')
      return
    }
    if (!contactName.trim()) {
      setFieldError("The tenant administrator's name is required — the real onboarding email is addressed to them.")
      return
    }
    if (!contactEmail.trim() || !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) {
      setFieldError("A valid email address for the tenant administrator is required — that's who the activation link is sent to.")
      return
    }

    setSubmitting(true)
    try {
      const result = await createTenant({
        name: name.trim(),
        slug: slug.trim() || undefined,
        planName: planName.trim() || undefined,
        contactEmail: contactEmail.trim(),
        contactName: contactName.trim(),
      })
      onCreated(result)
    } catch (err: any) {
      console.error('Failed to create tenant:', err)
      onError(err?.message || 'Failed to create tenant.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-fire-border rounded-xl w-full max-w-md overflow-hidden shadow-card animate-scale-in">
        <div className="flex items-center justify-between p-5 border-b border-fire-border">
          <h3 className="text-h3 text-text-primary">New Tenant</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors focus:outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {fieldError && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-small text-danger font-semibold">{fieldError}</div>
          )}

          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Tenant Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
              placeholder="Acme Corp"
            />
          </div>

          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
              placeholder="acme-corp"
            />
          </div>

          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Plan Name</label>
            <input
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
              placeholder="Growth Shield"
            />
          </div>

          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Tenant Administrator Name *</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
              placeholder="Jane Doe"
            />
          </div>

          <div className="space-y-1">
            <label className="text-label text-text-muted uppercase block">Tenant Administrator Email *</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-accent-pa focus:ring-4 focus:ring-accent-pa/10"
              placeholder="jane@acme.example"
            />
            <p className="text-label text-text-muted normal-case">
              A real activation email is sent here to set their password and log in.
            </p>
          </div>

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
              {submitting ? 'Creating...' : 'Create Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
