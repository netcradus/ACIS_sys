import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'

interface Alert {
  id: string
  title: string
  severity: string
}

export default function AppLayout() {
  const [tickerAlerts, setTickerAlerts] = useState<Alert[]>([])

  const fetchTickerData = async () => {
    try {
      const response = await apiClient.get('/api/alerts')
      setTickerAlerts(response.data.slice(0, 10))
    } catch (error) {
      console.error('Failed to fetch ticker alerts:', error)
    }
  }

  useEffect(() => {
    fetchTickerData()

    // Subscribe to real-time updates for the ticker
    const sub = wsClient.subscribe('/topic/alerts', (msg) => {
      const newAlert = JSON.parse(msg.body)
      setTickerAlerts(prev => [newAlert, ...prev.slice(0, 9)])
    })

    return () => {
      sub.then(s => s.unsubscribe())
    }
  }, [])

  return (
    <div className="flex h-screen bg-background text-text-primary overflow-hidden font-sans">
      {/* Sidebar - Fixed width */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <TopBar />

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto p-8 animate-fade-in relative scrollbar-hide">
          <div className="relative z-10 max-w-[1800px] mx-auto pb-20">
            <Outlet />
          </div>
        </main>

        {/* Live Threat Feed Ticker */}
        <footer className="h-10 bg-background border-t border-fire-border flex items-center overflow-hidden z-20 absolute bottom-0 w-full backdrop-blur-md bg-background/80">
          <div className="flex items-center gap-3 px-6 bg-background z-10 border-r border-fire-border h-full relative">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse shadow-success-glow" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-success whitespace-nowrap">
              LIVE THREAT FEED
            </span>
          </div>
          
          <div className="flex-1 overflow-hidden relative h-full flex items-center">
            <div className="flex gap-12 whitespace-nowrap animate-ticker hover:[animation-play-state:paused] cursor-default">
              {tickerAlerts.length > 0 ? (
                tickerAlerts.map((alert, i) => (
                  <div key={`${alert.id}-${i}`} className="flex items-center gap-3">
                    <span className={`text-[10px] font-black uppercase ${
                      alert.severity === 'CRITICAL' ? 'text-danger' : 
                      alert.severity === 'HIGH' ? 'text-warning' : 'text-info'
                    }`}>
                      {alert.severity}
                    </span>
                    <span className="text-[11px] font-bold text-text-secondary tracking-tight">
                      {alert.title}
                    </span>
                    <span className="text-fire-border px-2">|</span>
                  </div>
                ))
              ) : (
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                  Scanning network telemetry... no active threats matching correlation rules... system status nominal...
                </div>
              )}
              {/* Duplicate for seamless loop if enough content */}
              {tickerAlerts.length > 0 && tickerAlerts.map((alert, i) => (
                <div key={`dup-${alert.id}-${i}`} className="flex items-center gap-3">
                  <span className={`text-[10px] font-black uppercase ${
                    alert.severity === 'CRITICAL' ? 'text-danger' : 
                    alert.severity === 'HIGH' ? 'text-warning' : 'text-info'
                  }`}>
                    {alert.severity}
                  </span>
                  <span className="text-[11px] font-bold text-text-secondary tracking-tight">
                    {alert.title}
                  </span>
                  <span className="text-fire-border px-2">|</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="px-6 bg-background z-10 border-l border-fire-border h-full flex items-center gap-4">
            <span className="text-[9px] font-bold text-text-muted tracking-widest uppercase">
              GRID_STATUS: <span className="text-success">NOMINAL</span>
            </span>
            <span className="text-[9px] font-bold text-text-muted tracking-widest uppercase">
              TZ: <span className="text-text-primary">IST</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}
