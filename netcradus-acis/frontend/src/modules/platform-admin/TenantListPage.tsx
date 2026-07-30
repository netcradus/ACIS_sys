import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgGridReact } from 'ag-grid-react'
import { ColDef } from 'ag-grid-community'
import { Search, Plus, X, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { listTenants, createTenant, Tenant, TenantStatus } from '@/lib/platformAdminApi'
import { usePlatformToastStore } from '@/store/platformToastStore'

const STATUS_FILTERS: (TenantStatus | 'ALL')[] = ['ALL', 'ACTIVE', 'SUSPENDED', 'TRIAL', 'DEACTIVATED']

function StatusBadge({ status }: { status: TenantStatus }) {
  return (
    <span
      className={clsx(
        'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
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
      {
        field: 'name',
        headerName: 'TENANT',
        flex: 2,
        cellRenderer: (params: any) => <span className="font-bold text-text-primary">{params.value}</span>,
      },
      {
        field: 'slug',
        headerName: 'SLUG',
        flex: 1,
        cellRenderer: (params: any) => <span className="font-mono text-text-muted">{params.value || '—'}</span>,
      },
      {
        field: 'status',
        headerName: 'STATUS',
        flex: 1,
        cellRenderer: (params: any) => <StatusBadge status={params.value} />,
      },
      {
        field: 'planName',
        headerName: 'PLAN',
        flex: 1,
        cellRenderer: (params: any) => <span className="text-text-secondary">{params.value || '—'}</span>,
      },
      {
        field: 'enabledModules',
        headerName: 'MODULES',
        flex: 1,
        cellRenderer: (params: any) => <span className="text-text-muted">{(params.value || []).length} enabled</span>,
      },
      {
        field: 'createdAt',
        headerName: 'CREATED',
        flex: 1,
        cellRenderer: (params: any) => (
          <span className="font-mono text-[11px] text-text-muted">{new Date(params.value).toLocaleDateString()}</span>
        ),
      },
    ],
    []
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <h1 className="text-xl font-bold text-text-primary tracking-tight uppercase">Tenants</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-accent-pa hover:bg-accent-pa-dark text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-colors"
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
            className="w-full bg-surface-2 border border-fire-border rounded-lg pl-9 pr-3 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-pa/50"
          />
        </div>
        <div className="flex items-center gap-1 bg-surface-2 border border-fire-border rounded-lg p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors',
                statusFilter === s ? 'bg-accent-pa text-white' : 'text-text-muted hover:text-text-primary'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-xs text-danger font-semibold">{error}</div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-accent-pa animate-spin" />
        </div>
      ) : (
        <div className="min-h-[500px] bg-background border border-fire-border rounded-2xl overflow-hidden shadow-2xl">
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
              overlayNoRowsTemplate="<span class='text-text-muted font-black uppercase tracking-[0.2em] text-[10px]'>No tenants match your filters</span>"
            />
          </div>
        </div>
      )}

      {isModalOpen && (
        <CreateTenantModal
          onClose={() => setIsModalOpen(false)}
          onCreated={() => {
            setIsModalOpen(false)
            fetchTenants()
            showToast('success', 'Tenant created successfully.')
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
  onCreated: () => void
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
    if (contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) {
      setFieldError('Contact email is not a valid email address.')
      return
    }

    setSubmitting(true)
    try {
      await createTenant({
        name: name.trim(),
        slug: slug.trim() || undefined,
        planName: planName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactName: contactName.trim() || undefined,
      })
      onCreated()
    } catch (err: any) {
      console.error('Failed to create tenant:', err)
      onError(err?.message || 'Failed to create tenant.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-2 border border-fire-border rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between p-5 border-b border-fire-border">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">New Tenant</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors focus:outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {fieldError && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-danger font-semibold">{fieldError}</div>
          )}

          <div className="space-y-1">
            <label className="text-text-muted font-bold uppercase tracking-wider block">Tenant Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-pa/50"
              placeholder="Acme Corp"
            />
          </div>

          <div className="space-y-1">
            <label className="text-text-muted font-bold uppercase tracking-wider block">Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-pa/50"
              placeholder="acme-corp"
            />
          </div>

          <div className="space-y-1">
            <label className="text-text-muted font-bold uppercase tracking-wider block">Plan Name</label>
            <input
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-pa/50"
              placeholder="Growth Shield"
            />
          </div>

          <div className="space-y-1">
            <label className="text-text-muted font-bold uppercase tracking-wider block">Contact Name</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-pa/50"
              placeholder="Jane Doe"
            />
          </div>

          <div className="space-y-1">
            <label className="text-text-muted font-bold uppercase tracking-wider block">Contact Email</label>
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-pa/50"
              placeholder="jane@acme.example"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-fire-border mt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="border border-fire-border bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary font-bold px-4 py-2 rounded-xl focus:outline-none transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-accent-pa hover:bg-accent-pa-dark text-white font-bold px-4 py-2 rounded-xl focus:outline-none transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
