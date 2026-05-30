import React, { useState, useEffect } from 'react'
import { Globe, Radar, ShieldAlert, Target, Zap, Search, Skull, Activity, AlertTriangle, ShieldCheck, ChevronRight, Hash, Database, Cpu } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'

const communitySignals = [
  { title: 'Rare domain observed across 12 SMEs: risk auto-increased to 90', time: '2m ago', color: 'border-danger' },
  { title: 'New hash associated with phishing kit: auto-block enabled', time: '8m ago', color: 'border-accent' },
  { title: 'IP 91.108.4.x removed from watchlist — expired threat', time: '15m ago', color: 'border-info' },
  { title: 'Tor exit node 185.220.101.47 flagged by 847 nodes', time: '22m ago', color: 'border-warning' },
  { title: 'Domain fast-flux pattern detected: cdn-x7.io', time: '31m ago', color: 'border-accent' },
  { title: 'Swarm model retrained: 3.2% accuracy improvement', time: '1h ago', color: 'border-success' },
  { title: 'Ransomware hash cluster: LockBit variant — 34 nodes report', time: '2h ago', color: 'border-danger' },
  { title: 'Federated sync complete: 1,204 new model parameters', time: '3h ago', color: 'border-info' },
]

export default function ThreatIntelPage() {
  const [ioc, setIoc] = useState('185.220.101.47')
  const [isEnriching, setIsEnriching] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [indicators, setIndicators] = useState<any[]>([])
  const [demoMode, setDemoMode] = useState(false)

  const fetchRecent = async () => {
    try {
        const res = await apiClient.get('/api/threat-intel')
        setIndicators(res.data)
    } catch (e) {
        console.error('Failed to fetch recent indicators:', e)
    }
  }

  useEffect(() => {
    fetchRecent()
  }, [])

  const handleEnrich = async () => {
    if (!ioc) return
    setIsEnriching(true)
    setDemoMode(false)
    try {
      const response = await apiClient.post('/api/threat-intel/enrich', { indicator: ioc })
      setResult(response.data)
      if (response.headers['x-acis-ai-mode'] === 'mock' || response.data.description?.includes('mock')) {
         setDemoMode(true)
      }
    } catch (error) {
      console.error('Threat lookup failed:', error)
      setResult(null)
    } finally {
      setIsEnriching(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in bg-black">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Threat Intelligence Swarm</h1>
          <p className="text-[10px] text-text-secondary font-bold tracking-[0.4em] uppercase mt-2">Shared Collective Intelligence & Model Training</p>
        </div>
        <div className="flex items-center gap-3">
           <div className="flex items-center gap-4 bg-surface-2 border border-fire-border px-4 py-2 rounded-xl">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest leading-none mb-1">Swarm Sync</span>
                <span className="text-xs font-black text-success tabular-nums">ACTIVE</span>
              </div>
              <div className="w-px h-6 bg-border" />
              <Globe className="w-4 h-4 text-accent animate-spin-slow" />
           </div>
        </div>
      </div>

      {demoMode && (
        <div className="bg-warning/20 border border-warning/50 text-warning px-4 py-3 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 animate-pulse mb-4">
            <AlertTriangle size={16} />
            Demo Mode — AI key not configured. Displaying simulated results.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
        {/* Main Intelligence Workspace */}
        <div className="lg:col-span-2 space-y-8">
          {/* Search Area */}
          <div className="card-mission bg-surface-2 border-fire-border/60 p-10">
            <h2 className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em] mb-6">Swarm Intelligence — Model-Assisted Enrichment</h2>
            <div className="flex flex-col gap-6">
              <div className="relative group overflow-hidden rounded-2xl border border-fire-border bg-black shadow-inner">
                 <input 
                  type="text" 
                  value={ioc}
                  onChange={(e) => setIoc(e.target.value)}
                  placeholder="PASTE INDICATOR (HASH, DOMAIN, IP)..." 
                  className="bg-transparent px-8 py-6 text-lg font-black tracking-widest text-white placeholder:text-text-muted focus:outline-none w-full uppercase selection:bg-accent selection:text-white"
                 />
              </div>
              <button 
                onClick={handleEnrich}
                disabled={isEnriching}
                className="btn-fire py-6 text-sm font-black tracking-[0.3em] relative overflow-hidden group"
              >
                {isEnriching ? 'PROCESSING...' : 'ENRICH INDICATOR'}
                {isEnriching && (
                  <div className="absolute inset-0 bg-white/10 animate-pulse" />
                )}
              </button>
            </div>
          </div>

          {/* Enrichment Results Card */}
          {result ? (
            <div className="card-mission bg-surface-2 border-fire-border/60 overflow-hidden relative animate-slide-up">
                <div className={clsx(
                    "absolute top-0 left-0 w-1.5 h-full shadow-lg",
                    result.severity === 'HIGH' ? "bg-danger shadow-danger-glow" : "bg-warning shadow-warning-glow"
                )} />
                
                <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                    <span className="text-2xl font-black text-white tracking-widest uppercase">{result.value}</span>
                    <span className={clsx(
                        "px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border",
                        result.severity === 'HIGH' ? "bg-danger/20 text-danger border-danger/30" : "bg-warning/20 text-warning border-warning/30"
                    )}>
                    {result.severity || 'UNKNOWN'}
                    </span>
                </div>
                <div className="flex flex-col items-end leading-none">
                    <span className={clsx("text-3xl font-black tracking-tighter", result.confidenceScore > 70 ? "text-danger" : "text-warning")}>
                        {result.confidenceScore || 0} / 100
                    </span>
                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest mt-2">Model Confidence</span>
                </div>
                </div>

                {/* Severity Bar */}
                <div className="w-full h-1 bg-black rounded-full overflow-hidden mb-12">
                <div 
                    className={clsx("h-full transition-all duration-1000", result.confidenceScore > 70 ? "bg-danger shadow-danger-glow" : "bg-warning shadow-warning-glow")} 
                    style={{ width: `${result.confidenceScore || 0}%` }} 
                />
                </div>

                {/* Metadata Table */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                {[
                    { label: 'Type', value: result.type, icon: <Target /> },
                    { label: 'Intelligence Source', value: result.source || 'Federated Swarm', icon: <Globe /> },
                    { label: 'First Discovered', value: result.createdAt ? new Date(result.createdAt).toDateString() : 'UNKNOWN', icon: <Hash /> },
                    { label: 'Last Model Update', value: 'Today (Live)', icon: <Activity />, highlight: 'text-success' },
                ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-fire-border pb-4 group/item">
                    <div className="flex items-center gap-3">
                        <div className="text-text-muted group-hover/item:text-accent transition-colors">
                        {React.cloneElement(item.icon, { size: 14 })}
                        </div>
                        <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">{item.label}</span>
                    </div>
                    <span className={clsx("text-xs font-bold uppercase tracking-tight", item.highlight || "text-white")}>{item.value}</span>
                    </div>
                ))}
                </div>

                <div className="mt-12 flex flex-wrap gap-4">
                {['AbuseIPDB', 'Shodan', 'VirusTotal', 'ACIS Swarm'].map(source => (
                    <div key={source} className="flex items-center gap-2 px-3 py-1.5 bg-black border border-fire-border rounded-xl text-[10px] font-bold text-text-secondary">
                        <Database size={12} className="text-accent" /> {source}
                    </div>
                ))}
                </div>

                <div className="mt-12 p-5 bg-success/5 border border-success/20 rounded-2xl flex items-center gap-4">
                <ShieldCheck className="text-success" size={20} />
                <div className="flex flex-col">
                    <span className="text-xs font-black text-white uppercase tracking-tight">Active block-rule distributed to {indicators.length} satellite nodes</span>
                    <span className="text-[9px] text-text-secondary font-bold uppercase tracking-widest mt-1">SME SECTORAL COVERAGE: 92%</span>
                </div>
                </div>

                <div className="mt-12 space-y-4">
                <h3 className="text-[10px] font-black text-accent uppercase tracking-[0.3em]">ACIS AI ANALYSIS</h3>
                <div className="p-6 bg-black border-l-4 border-accent rounded-r-2xl">
                    <p className="text-xs text-text-secondary leading-relaxed font-medium">
                        Model has identified pattern matching {result.type} infrastructure. 
                        Cross-referenced with community signals from {result.source}.
                        <span className="text-white font-bold ml-1">Confidence: {result.confidenceScore}%.</span> Recommend immediate perimeter isolation.
                    </p>
                </div>
                </div>
            </div>
          ) : !isEnriching && ioc && (
             <div className="p-12 border border-dashed border-fire-border/40 rounded-3xl text-center">
                 <Skull className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-20" />
                 <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.4em]">No swarm records found for this indicator</p>
             </div>
          )}
        </div>


        {/* Sidebar Intelligence Feed */}
        <div className="space-y-6">
          <div className="card-mission bg-surface-2 border-fire-border/60">
            <h3 className="text-xs font-black text-white uppercase tracking-[0.3em] mb-6">Latest Community Signals</h3>
            <div className="grid grid-cols-3 gap-3 mb-8">
               <div className="flex flex-col items-center p-3 bg-black border border-fire-border rounded-xl">
                  <span className="text-xs font-black text-white tabular-nums">12,441</span>
                  <span className="text-[8px] text-text-muted uppercase tracking-widest mt-1">IOCS</span>
               </div>
               <div className="flex flex-col items-center p-3 bg-black border border-fire-border rounded-xl">
                  <span className="text-xs font-black text-white tabular-nums">847</span>
                  <span className="text-[8px] text-text-muted uppercase tracking-widest mt-1">NODES</span>
               </div>
               <div className="flex flex-col items-center p-3 bg-black border border-fire-border rounded-xl">
                  <span className="text-xs font-black text-white tabular-nums">v2.1.3</span>
                  <span className="text-[8px] text-text-muted uppercase tracking-widest mt-1">MODEL</span>
               </div>
            </div>

            <div className="space-y-4">
              {communitySignals.map((signal, i) => (
                <div key={i} className={clsx("p-4 bg-black border-l-2 rounded-r-xl group hover:border-r-2 hover:border-r-accent/20 transition-all", signal.color)}>
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-[10px] font-bold text-text-secondary group-hover:text-white transition-colors leading-relaxed tracking-tight uppercase">
                      {signal.title}
                    </p>
                    <span className="text-[9px] font-mono text-text-muted whitespace-nowrap">{signal.time}</span>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full btn-mission mt-8 py-3 text-[10px] flex items-center justify-center gap-2">
               VIEW ALL SIGNALS <ChevronRight size={14} />
            </button>
          </div>

          <div className="card-mission bg-surface-2 border-fire-border/60">
             <h3 className="text-xs font-black text-accent uppercase tracking-[0.3em] mb-4">Model Performance</h3>
             <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-text-muted uppercase">Global Accuracy</span>
                <span className="text-xs font-black text-success">98.4%</span>
             </div>
             <div className="w-full h-1 bg-black rounded-full overflow-hidden">
                <div className="h-full bg-success w-[98.4%] shadow-success-glow" />
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
const MOCK_indicators = [] // Keep for types if needed
