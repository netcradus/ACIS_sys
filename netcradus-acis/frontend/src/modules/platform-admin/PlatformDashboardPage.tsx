import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ShieldCheck, ShieldOff, Clock, Loader2, ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'
import { listTenants, Tenant } from '@/lib/platformAdminApi'

export default function PlatformDashboardPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await listTenants()
        if (!cancelled) setTenants(data)
      } catch (e) {
        console.error('Failed to fetch tenants:', e)
        if (!cancelled) setError('Failed to load platform data. Check that acis-platform-admin is reachable.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const active = tenants.filter((t) => t.status === 'ACTIVE').length
    const suspended = tenants.filter((t) => t.status === 'SUSPENDED').length
    const trial = tenants.filter((t) => t.status === 'TRIAL').length
    return [
      { label: 'Total Tenants', value: tenants.length, icon: Building2, color: 'text-accent-pa', border: 'border-accent-pa/20' },
      { label: 'Active', value: active, icon: ShieldCheck, color: 'text-success', border: 'border-success/20' },
      { label: 'Suspended', value: suspended, icon: ShieldOff, color: 'text-danger', border: 'border-danger/20' },
      { label: 'Trial', value: trial, icon: Clock, color: 'text-warning', border: 'border-warning/20' },
    ]
  }, [tenants])

  const recentTenants = useMemo(
    () => [...tenants].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5),
    [tenants]
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <h1 className="text-h1 text-text-primary">Platform Overview</h1>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 text-small text-danger font-semibold">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-accent-pa animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={clsx('bg-surface-2 border rounded-lg p-5 flex flex-col justify-between h-24 shadow-sm', stat.border)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-h1 text-text-primary leading-none">{stat.value}</span>
                  <stat.icon className={clsx('w-5 h-5', stat.color)} />
                </div>
                <span className="text-label text-text-muted uppercase mt-2">{stat.label}</span>
              </div>
            ))}
          </div>

          <div className="card-mission overflow-hidden !p-0">
            <div className="flex items-center justify-between p-5 border-b border-fire-border">
              <h2 className="text-h3 text-text-primary">Recently Created Tenants</h2>
              <button
                onClick={() => navigate('/platform-admin/tenants')}
                className="text-small font-semibold text-accent-pa hover:opacity-80 flex items-center gap-1 transition-colors"
              >
                View All <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {recentTenants.length === 0 ? (
              <div className="p-8 text-center text-label text-text-muted uppercase">
                No tenants yet
              </div>
            ) : (
              <table className="table-enterprise">
                <tbody>
                  {recentTenants.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/platform-admin/tenants/${t.id}`)}
                    >
                      <td className="font-semibold text-text-primary">{t.name}</td>
                      <td className="text-text-muted">{t.planName || '—'}</td>
                      <td>
                        <span
                          className={clsx(
                            'px-2 py-0.5 rounded-full text-label uppercase',
                            t.status === 'ACTIVE' && 'bg-success/10 text-success',
                            t.status === 'SUSPENDED' && 'bg-danger/10 text-danger',
                            t.status === 'TRIAL' && 'bg-warning/10 text-warning',
                            t.status === 'DEACTIVATED' && 'bg-surface-3 text-text-muted'
                          )}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="text-text-muted text-right">{new Date(t.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
