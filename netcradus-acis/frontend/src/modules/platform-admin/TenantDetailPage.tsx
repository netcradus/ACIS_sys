import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, ShieldOff, ShieldCheck, Trash2, Save } from 'lucide-react'
import { clsx } from 'clsx'
import {
  getTenant,
  updateTenant,
  suspendTenant,
  reactivateTenant,
  setTenantPlan,
  setTenantModules,
  deleteTenant,
  Tenant,
  TenantModule,
  ALL_TENANT_MODULES,
} from '@/lib/platformAdminApi'
import { usePlatformToastStore } from '@/store/platformToastStore'
import ConfirmDialog from '@/modules/platform-admin/components/ConfirmDialog'

type ConfirmAction = 'suspend' | 'reactivate' | 'delete' | null

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const showToast = usePlatformToastStore((s) => s.show)

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [planName, setPlanName] = useState('')
  const [enabledModules, setEnabledModules] = useState<Set<TenantModule>>(new Set())
  const [fieldError, setFieldError] = useState<string | null>(null)

  const [savingDetails, setSavingDetails] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [savingModules, setSavingModules] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const load = async () => {
    if (!id) return
    setIsLoading(true)
    setError(null)
    try {
      const t = await getTenant(id)
      setTenant(t)
      setName(t.name)
      setContactName(t.contactName || '')
      setContactEmail(t.contactEmail || '')
      setPlanName(t.planName || '')
      setEnabledModules(new Set(t.enabledModules))
    } catch (e) {
      console.error('Failed to fetch tenant:', e)
      setError('Failed to load tenant. It may not exist.')
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
    if (!name.trim()) {
      setFieldError('Tenant name is required.')
      return
    }
    if (contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) {
      setFieldError('Contact email is not a valid email address.')
      return
    }
    setSavingDetails(true)
    try {
      const updated = await updateTenant(id, {
        name: name.trim(),
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
      })
      setTenant(updated)
      showToast('success', 'Tenant details saved.')
    } catch (e: any) {
      console.error('Failed to update tenant:', e)
      showToast('error', e?.message || 'Failed to save tenant details.')
    } finally {
      setSavingDetails(false)
    }
  }

  const handleSavePlan = async () => {
    if (!id) return
    setSavingPlan(true)
    try {
      const updated = await setTenantPlan(id, planName.trim())
      setTenant(updated)
      showToast('success', 'Plan updated.')
    } catch (e: any) {
      console.error('Failed to update plan:', e)
      showToast('error', e?.message || 'Failed to update plan.')
    } finally {
      setSavingPlan(false)
    }
  }

  const toggleModule = (mod: TenantModule) => {
    setEnabledModules((prev) => {
      const next = new Set(prev)
      if (next.has(mod)) next.delete(mod)
      else next.add(mod)
      return next
    })
  }

  const handleSaveModules = async () => {
    if (!id) return
    setSavingModules(true)
    try {
      const updated = await setTenantModules(id, Array.from(enabledModules))
      setTenant(updated)
      showToast('success', 'Module access updated.')
    } catch (e: any) {
      console.error('Failed to update modules:', e)
      showToast('error', e?.message || 'Failed to update module access.')
    } finally {
      setSavingModules(false)
    }
  }

  const runConfirmedAction = async () => {
    if (!id || !confirmAction) return
    setConfirmBusy(true)
    try {
      if (confirmAction === 'suspend') {
        const updated = await suspendTenant(id, suspendReason.trim() || undefined)
        setTenant(updated)
        showToast('success', 'Tenant suspended.')
      } else if (confirmAction === 'reactivate') {
        const updated = await reactivateTenant(id)
        setTenant(updated)
        showToast('success', 'Tenant reactivated.')
      } else if (confirmAction === 'delete') {
        await deleteTenant(id)
        showToast('success', 'Tenant deleted.')
        navigate('/platform-admin/tenants')
        return
      }
    } catch (e: any) {
      console.error(`Failed to ${confirmAction} tenant:`, e)
      showToast('error', e?.message || `Failed to ${confirmAction} tenant.`)
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

  if (error || !tenant) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/platform-admin/tenants')} className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary">
          <ArrowLeft className="w-4 h-4" /> Back to Tenants
        </button>
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-xs text-danger font-semibold">
          {error || 'Tenant not found.'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <div>
          <button
            onClick={() => navigate('/platform-admin/tenants')}
            className="flex items-center gap-2 text-[11px] text-text-muted hover:text-text-primary mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Tenants
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-text-primary tracking-tight uppercase">{tenant.name}</h1>
            <span
              className={clsx(
                'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                tenant.status === 'ACTIVE' && 'bg-success/10 text-success',
                tenant.status === 'SUSPENDED' && 'bg-danger/10 text-danger',
                tenant.status === 'TRIAL' && 'bg-warning/10 text-warning',
                tenant.status === 'DEACTIVATED' && 'bg-surface-3 text-text-muted'
              )}
            >
              {tenant.status}
            </span>
          </div>
          <p className="text-[10px] text-text-muted font-mono mt-1">{tenant.id}</p>
        </div>

        <div className="flex items-center gap-2">
          {tenant.status === 'SUSPENDED' ? (
            <button
              onClick={() => setConfirmAction('reactivate')}
              className="flex items-center gap-2 bg-success/10 hover:bg-success/20 border border-success/30 text-success font-bold px-4 py-2 rounded-xl text-xs transition-colors"
            >
              <ShieldCheck className="w-4 h-4" /> Reactivate
            </button>
          ) : (
            <button
              onClick={() => setConfirmAction('suspend')}
              className="flex items-center gap-2 bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger font-bold px-4 py-2 rounded-xl text-xs transition-colors"
            >
              <ShieldOff className="w-4 h-4" /> Suspend
            </button>
          )}
          <button
            onClick={() => setConfirmAction('delete')}
            className="flex items-center gap-2 bg-surface-3 hover:bg-danger/20 border border-fire-border hover:border-danger/30 text-text-secondary hover:text-danger font-bold px-4 py-2 rounded-xl text-xs transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>

      {tenant.suspendedReason && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-xs text-danger">
          <span className="font-bold uppercase tracking-wider">Suspended:</span> {tenant.suspendedReason}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Details */}
        <div className="bg-surface-2 border border-fire-border rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest">Tenant Details</h2>
          {fieldError && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-xs text-danger font-semibold">{fieldError}</div>
          )}
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted font-bold uppercase tracking-wider block">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-pa/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted font-bold uppercase tracking-wider block">Contact Name</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-pa/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted font-bold uppercase tracking-wider block">Contact Email</label>
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-pa/50"
            />
          </div>
          <button
            onClick={handleSaveDetails}
            disabled={savingDetails}
            className="flex items-center gap-2 bg-accent-pa hover:bg-accent-pa-dark text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> {savingDetails ? 'Saving...' : 'Save Details'}
          </button>
        </div>

        {/* Plan */}
        <div className="bg-surface-2 border border-fire-border rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest">Subscription Plan</h2>
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted font-bold uppercase tracking-wider block">Plan Name</label>
            <input
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="e.g. Enterprise Shield"
              className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-pa/50"
            />
          </div>
          <p className="text-[10px] text-text-muted leading-relaxed">
            Internal label only — no payment processor is wired up. Use this to reflect a plan the customer has already
            paid for outside the app.
          </p>
          <button
            onClick={handleSavePlan}
            disabled={savingPlan}
            className="flex items-center gap-2 bg-accent-pa hover:bg-accent-pa-dark text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> {savingPlan ? 'Saving...' : 'Save Plan'}
          </button>
        </div>
      </div>

      {/* Modules */}
      <div className="bg-surface-2 border border-fire-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest">Module Access</h2>
          <button
            onClick={handleSaveModules}
            disabled={savingModules}
            className="flex items-center gap-2 bg-accent-pa hover:bg-accent-pa-dark text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> {savingModules ? 'Saving...' : 'Save Modules'}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ALL_TENANT_MODULES.map((mod) => {
            const checked = enabledModules.has(mod.key)
            return (
              <label
                key={mod.key}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors text-xs font-semibold',
                  checked ? 'border-accent-pa/40 bg-accent-pa/10 text-text-primary' : 'border-fire-border text-text-muted hover:border-accent-pa/30'
                )}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleModule(mod.key)} className="accent-accent-pa" />
                {mod.label}
              </label>
            )
          })}
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction === 'suspend'}
        title="Suspend Tenant"
        message={`This immediately blocks all users of "${tenant.name}" from the platform. You can reactivate at any time.`}
        confirmLabel="Suspend"
        danger
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      >
        <div className="space-y-1 mt-2">
          <label className="text-[11px] text-text-muted font-bold uppercase tracking-wider block">Reason (optional)</label>
          <textarea
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            rows={2}
            placeholder="e.g. Non-payment, ToS violation..."
            className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 resize-none"
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmAction === 'reactivate'}
        title="Reactivate Tenant"
        message={`Restore access for "${tenant.name}"?`}
        confirmLabel="Reactivate"
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        title="Delete Tenant"
        message={`This permanently removes "${tenant.name}" from the platform registry. This does not delete the tenant's existing data in other services. This cannot be undone.`}
        confirmLabel="Delete Permanently"
        danger
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      />
    </div>
  )
}
