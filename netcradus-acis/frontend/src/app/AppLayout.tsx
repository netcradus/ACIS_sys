import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import CommandPalette, { type PaletteEntityResult } from '@/components/ui/CommandPalette'
import { tenantNavItems } from '@/components/navConfig'
import { useEntityPivot } from '@/hooks/useEntityPivot'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import '@/components/ChromeTokens.css'

interface Alert {
  id: string
  title: string
  severity: string
}

interface Asset {
  id: string
  name: string
  ipAddress: string | null
}

export default function AppLayout() {
  const [tickerAlerts, setTickerAlerts] = useState<Alert[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navigate = useNavigate()
  const { pivotTo } = useEntityPivot()

  // Full (uncapped) alerts list for command-palette entity search — the
  // ticker itself only displays the first 10, but reuses this same fetch
  // rather than issuing a second /api/alerts call.
  const allAlertsRef = useRef<Alert[]>([])
  // Assets aren't otherwise fetched by this layout — lazily loaded on first
  // palette search rather than eagerly on mount, so users who never open the
  // palette never pay for an unused request.
  const allAssetsRef = useRef<Asset[] | null>(null)

  const fetchTickerData = async () => {
    try {
      const response = await apiClient.get('/api/alerts')
      const alerts: Alert[] = response.data || []
      allAlertsRef.current = alerts
      setTickerAlerts(alerts.slice(0, 10))
    } catch (error) {
      console.error('Failed to fetch ticker alerts:', error)
    }
  }

  useEffect(() => {
    fetchTickerData()

    // Subscribe to real-time updates for the ticker
    const sub = wsClient.subscribe('/topic/alerts', (msg) => {
      const newAlert = JSON.parse(msg.body)
      allAlertsRef.current = [newAlert, ...allAlertsRef.current.slice(0, 49)]
      setTickerAlerts(prev => [newAlert, ...prev.slice(0, 9)])
    })

    return () => {
      sub.then(s => s.unsubscribe())
    }
  }, [])

  // Real Grid Status for the ticker's status pill — enrolled agent
  // connectivity + configured vendor-integration poll health, never a
  // permanently-hardcoded "Nominal" claim.
  const [gridStatus, setGridStatus] = useState<'nominal' | 'degraded' | 'unknown'>('unknown')
  useEffect(() => {
    const fetchGridStatus = async () => {
      try {
        const [agentsRes, integrationsRes] = await Promise.all([
          apiClient.get('/api/soar/settings/agents'),
          apiClient.get('/api/soar/settings/integrations/status'),
        ])
        // /agents wraps its payload in {success, data, timestamp} (ApiResponse<T>); /integrations/status returns a bare array.
        const agents: { status: string }[] = agentsRes.data?.data || []
        const integrations: { enabled: boolean; healthy: boolean }[] = integrationsRes.data || []
        if (agents.length === 0 && integrations.length === 0) {
          setGridStatus('unknown')
          return
        }
        const agentsDegraded = agents.length > 0 && agents.some(a => a.status !== 'ONLINE')
        const integrationsDegraded = integrations.length > 0 && integrations.some(i => !i.healthy)
        setGridStatus(agentsDegraded || integrationsDegraded ? 'degraded' : 'nominal')
      } catch (error) {
        console.error('Failed to fetch grid status:', error)
      }
    }
    fetchGridStatus()
    const interval = setInterval(fetchGridStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  // Global ⌘K / Ctrl+K — finally wires up what TopBar's search affordance
  // always looked like it should do.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const searchEntities = useCallback(async (query: string): Promise<PaletteEntityResult[]> => {
    const q = query.toLowerCase()

    if (allAssetsRef.current === null) {
      try {
        // /api/assets now returns a real paginated envelope (was unbounded
        // before the production-readiness audit) - the command palette only
        // needs a working set to search over, not literally every asset.
        const res = await apiClient.get('/api/assets', { params: { size: 500 } })
        allAssetsRef.current = res.data?.content || []
      } catch {
        allAssetsRef.current = []
      }
    }

    const alertMatches: PaletteEntityResult[] = allAlertsRef.current
      .filter((a) => a.title?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((a) => ({
        id: `alert-${a.id}`,
        label: a.title,
        sublabel: `Alert · ${a.severity}`,
        onSelect: () => navigate('/dashboard/alerts'),
      }))

    const assetMatches: PaletteEntityResult[] = (allAssetsRef.current || [])
      .filter((a) => a.name?.toLowerCase().includes(q) || a.ipAddress?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((a) => ({
        id: `asset-${a.id}`,
        label: a.name,
        sublabel: a.ipAddress ? `Asset · ${a.ipAddress}` : 'Asset',
        onSelect: () => pivotTo('/dashboard/assets', { type: 'asset', value: a.name }),
      }))

    return [...alertMatches, ...assetMatches]
  }, [navigate, pivotTo])

  return (
    <div className="soc-chrome flex h-screen bg-background text-text-primary overflow-hidden font-sans">
      {/* Sidebar - Fixed width */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto p-8 animate-fade-in relative scrollbar-hide">
          <div className="relative z-10 max-w-[1800px] mx-auto pb-20">
            <Outlet />
          </div>
        </main>

        {/* Live Threat Feed Ticker — recessed data-dense strip (--surface-inset) rather than a translucent overlay on the page background */}
        <footer className="h-9 bg-surface-inset border-t border-fire-border flex items-center overflow-hidden z-20 absolute bottom-0 w-full backdrop-blur-md">
          <div className="flex items-center gap-2.5 px-5 bg-surface-inset z-10 border-r border-fire-border h-full relative">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-label uppercase text-success whitespace-nowrap">
              Live Threat Feed
            </span>
          </div>

          <div className="flex-1 overflow-hidden relative h-full flex items-center">
            <div className="flex gap-10 whitespace-nowrap animate-ticker hover:[animation-play-state:paused] cursor-default">
              {tickerAlerts.length > 0 ? (
                tickerAlerts.map((alert, i) => (
                  <div key={`${alert.id}-${i}`} className="flex items-center gap-2.5">
                    <span className={`text-label uppercase ${
                      alert.severity === 'CRITICAL' ? 'text-severity-critical' :
                      alert.severity === 'HIGH' ? 'text-severity-high' : 'text-info'
                    }`}>
                      {alert.severity}
                    </span>
                    <span className="text-small font-medium text-text-secondary">
                      {alert.title}
                    </span>
                    <span className="text-fire-border px-1.5">|</span>
                  </div>
                ))
              ) : (
                <div className="text-label uppercase text-text-muted">
                  Scanning network telemetry... no active threats matching correlation rules... system status nominal...
                </div>
              )}
              {/* Duplicate for seamless loop if enough content */}
              {tickerAlerts.length > 0 && tickerAlerts.map((alert, i) => (
                <div key={`dup-${alert.id}-${i}`} className="flex items-center gap-2.5">
                  <span className={`text-label uppercase ${
                    alert.severity === 'CRITICAL' ? 'text-severity-critical' :
                    alert.severity === 'HIGH' ? 'text-severity-high' : 'text-info'
                  }`}>
                    {alert.severity}
                  </span>
                  <span className="text-small font-medium text-text-secondary">
                    {alert.title}
                  </span>
                  <span className="text-fire-border px-1.5">|</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 bg-surface-inset z-10 border-l border-fire-border h-full flex items-center gap-3.5">
            <span className="text-label uppercase text-text-muted">
              Grid Status: <span className={gridStatus === 'nominal' ? 'text-success' : gridStatus === 'degraded' ? 'text-danger' : 'text-text-muted'}>
                {gridStatus === 'unknown' ? 'No Systems' : gridStatus === 'nominal' ? 'Nominal' : 'Degraded'}
              </span>
            </span>
            <span className="text-label uppercase text-text-muted">
              TZ: <span className="text-text-primary">IST</span>
            </span>
          </div>
        </footer>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        navItems={tenantNavItems}
        searchEntities={searchEntities}
        accentClass="accent"
      />
    </div>
  )
}
