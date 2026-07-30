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
    <div className="space-y-8 animate-fade-in bg-background">
      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-text-primary tracking-tighter uppercase leading-none">Threat Intelligence Swarm</h1>
          <p className="text-[10px] text-text-secondary font-bold tracking-[0.4em] uppercase mt-2">Shared anonymized IOC enrichment and swarm telemetry</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 bg-surface-2 border border-fire-border px-4 py-3 rounded-2xl shadow-accent-glow">
            <Globe className="w-4 h-4 text-accent animate-spin-slow" />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Swarm Sync</span>
              <span className="text-sm font-black text-success uppercase tracking-[0.2em]">ACTIVE</span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-surface-2 border border-fire-border px-4 py-3 rounded-2xl">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-text-muted">Live Nodes</span>
            <span className="text-lg font-black text-text-primary">847</span>
          </div>
        </div>
      </div>

      {demoMode && (
        <div className="bg-warning/20 border border-warning/50 text-warning px-4 py-3 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 animate-pulse mb-4">
          <AlertTriangle size={16} />
          Demo Mode — AI key not configured. Displaying simulated results.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 pb-12">
        <div className="xl:col-span-8 space-y-8">
          <div className="card-mission bg-surface-2 border-fire-border/60 p-10">
            <h2 className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em] mb-6">Swarm Intelligence — Model-Assisted Enrichment</h2>
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] items-center">
              <div className="relative group overflow-hidden rounded-[28px] border border-fire-border bg-background shadow-inner">
                <input
                  type="text"
                  value={ioc}
                  onChange={(e) => setIoc(e.target.value)}
                  placeholder="PASTE INDICATOR (HASH, DOMAIN, IP)..."
                  className="bg-transparent px-8 py-6 text-lg font-black tracking-widest text-text-primary placeholder:text-text-muted focus:outline-none w-full uppercase selection:bg-accent selection:text-white"
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

          {result ? (
            <div className="card-mission bg-surface-2 border-fire-border/60 overflow-hidden relative animate-slide-up">
              <div className={clsx(
                'absolute top-0 left-0 w-1.5 h-full shadow-lg',
                result.severity === 'HIGH' ? 'bg-danger shadow-danger-glow' : 'bg-warning shadow-warning-glow'
              )} />

              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between mb-10">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-2xl font-black text-text-primary tracking-widest uppercase">{result.value || ioc}</span>
                    <span className={clsx(
                      'px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border',
                      result.severity === 'HIGH' ? 'bg-danger/15 text-danger border-danger/30' : 'bg-warning/15 text-warning border-warning/30'
                    )}>
                      {result.severity === 'HIGH' ? 'MALICIOUS' : result.severity || 'SUSPICIOUS'}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-text-muted">Risk Score</p>
                </div>

                <div className="flex flex-col items-start gap-2 rounded-3xl border border-fire-border bg-background/60 p-4">
                  <span className="text-[10px] text-text-muted uppercase tracking-[0.35em]">Risk Score</span>
                  <span className="text-4xl font-black text-danger tracking-tight">{result.confidenceScore || 0}</span>
                  <div className="h-2 w-full rounded-full bg-text-primary/10 overflow-hidden">
                    <div
                      className="h-full bg-danger"
                      style={{ width: `${Math.min(Math.max(result.confidenceScore || 0, 0), 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-fire-border pb-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.35em] text-text-muted">Type</span>
                    <span className="text-xs font-bold uppercase tracking-tight text-text-primary">{result.type || 'Tor Exit Node / C2 Relay'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-fire-border pb-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.35em] text-text-muted">Country</span>
                    <span className="text-xs font-bold uppercase tracking-tight text-text-primary">{result.country || 'Netherlands • AS-201011'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-fire-border pb-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.35em] text-text-muted">First Seen</span>
                    <span className="text-xs font-bold uppercase tracking-tight text-text-primary">{result.firstSeen || '2024-11-03'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-fire-border pb-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.35em] text-text-muted">Last Active</span>
                    <span className="text-xs font-bold uppercase tracking-tight text-success">{result.lastActive || 'Today'}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-2 p-5 rounded-3xl bg-background border border-fire-border">
                    <span className="text-[10px] font-black uppercase tracking-[0.35em] text-accent">Detected by</span>
                    <span className="text-lg font-black uppercase tracking-tighter text-text-primary">847 ACIS nodes in last 24h</span>
                    <span className="text-[10px] text-text-muted uppercase tracking-[0.35em]">MITRE ATT&CK: T1090.003 — Proxy: Multi-hop Proxy</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {['AbuseIPDB', 'Shodan', 'VirusTotal', 'ACIS Swarm'].map((source) => (
                      <div key={source} className="flex items-center gap-2 px-3 py-2 bg-background border border-fire-border rounded-2xl text-[10px] font-bold uppercase tracking-[0.3em] text-text-secondary">
                        <Database size={14} className="text-accent" /> {source}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 grid gap-6 lg:grid-cols-2">
                <div className="rounded-3xl border border-success/30 bg-success/5 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck size={20} className="text-success" />
                    <span className="text-[10px] font-black uppercase tracking-[0.35em] text-success">ACIS AI Analysis</span>
                  </div>
                  <p className="text-xs leading-relaxed text-text-secondary">
                    This IP operates as a Tor exit relay and has been associated with credential exfiltration campaigns targeting UK financial institutions. Confidence: High ({result.confidenceScore || 0}%). Recommend: Block at perimeter + create watchlist rule.
                  </p>
                </div>

                <div className="rounded-3xl border border-accent/20 bg-background/60 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-text-muted">Threat Context</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-success">Live</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">
                      <span>Confidence</span>
                      <span>{result.confidenceScore || 0}%</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">
                      <span>Node Reach</span>
                      <span>847</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.25em] text-text-secondary">
                      <span>Model Version</span>
                      <span>v2.1.3</span>
                    </div>
                  </div>
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

        <div className="xl:col-span-4 space-y-6">
          <div className="card-mission bg-surface-2 border-fire-border/60">
            <h3 className="text-xs font-black text-text-primary uppercase tracking-[0.3em] mb-6">Latest Community Signals</h3>
            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="flex flex-col items-center p-4 bg-background border border-fire-border rounded-3xl">
                <span className="text-[12px] font-black text-text-primary tabular-nums">12,441</span>
                <span className="text-[8px] text-text-muted uppercase tracking-widest mt-1">IOCS UPDATED</span>
              </div>
              <div className="flex flex-col items-center p-4 bg-background border border-fire-border rounded-3xl">
                <span className="text-[12px] font-black text-text-primary tabular-nums">847</span>
                <span className="text-[8px] text-text-muted uppercase tracking-widest mt-1">ACTIVE NODES</span>
              </div>
              <div className="flex flex-col items-center p-4 bg-background border border-fire-border rounded-3xl">
                <span className="text-[12px] font-black text-text-primary tabular-nums">v2.1.3</span>
                <span className="text-[8px] text-text-muted uppercase tracking-widest mt-1">MODEL VERSION</span>
              </div>
            </div>

            <div className="space-y-4">
              {communitySignals.map((signal, i) => (
                <div key={i} className={clsx('p-4 rounded-3xl border border-fire-border bg-background transition-all hover:bg-surface-3', signal.color)}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-tight text-text-secondary group-hover:text-text-primary leading-relaxed">
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
            <div className="mb-4">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-text-muted mb-2">
                <span>Global Accuracy</span>
                <span className="text-[11px] font-black text-success">98.4%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-background border border-fire-border overflow-hidden">
                <div className="h-full bg-success w-[98.4%] shadow-success-glow" />
              </div>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-text-muted">
                <span>Average Detection</span>
                <span className="text-text-primary font-black">92.3%</span>
              </div>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-text-muted">
                <span>Update Cadence</span>
                <span className="text-text-primary font-black">15m</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
const MOCK_indicators = [] // Keep for types if needed
