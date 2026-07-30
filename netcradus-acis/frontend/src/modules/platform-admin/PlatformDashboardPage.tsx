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
        <h1 className="text-xl font-bold text-text-primary tracking-tight uppercase">Platform Overview</h1>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-xs text-danger font-semibold">
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
                  <span className="text-3xl font-bold text-text-primary tracking-tight leading-none">{stat.value}</span>
                  <stat.icon className={clsx('w-5 h-5', stat.color)} />
                </div>
                <span className="text-[10px] text-text-muted font-semibold tracking-wider uppercase mt-2">{stat.label}</span>
              </div>
            ))}
          </div>

          <div className="bg-surface-2 border border-fire-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-fire-border">
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest">Recently Created Tenants</h2>
              <button
                onClick={() => navigate('/platform-admin/tenants')}
                className="text-[11px] font-bold text-accent-pa hover:opacity-80 uppercase tracking-wider flex items-center gap-1 transition-colors"
              >
                View All <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {recentTenants.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-muted font-semibold uppercase tracking-wider">
                No tenants yet
              </div>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {recentTenants.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/platform-admin/tenants/${t.id}`)}
                      className="border-b border-fire-border last:border-0 hover:bg-surface-3/50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 font-bold text-text-primary">{t.name}</td>
                      <td className="px-5 py-3 text-text-muted">{t.planName || '—'}</td>
                      <td className="px-5 py-3">
                        <span
                          className={clsx(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            t.status === 'ACTIVE' && 'bg-success/10 text-success',
                            t.status === 'SUSPENDED' && 'bg-danger/10 text-danger',
                            t.status === 'TRIAL' && 'bg-warning/10 text-warning',
                            t.status === 'DEACTIVATED' && 'bg-surface-3 text-text-muted'
                          )}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-text-muted text-right">{new Date(t.createdAt).toLocaleDateString()}</td>
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
