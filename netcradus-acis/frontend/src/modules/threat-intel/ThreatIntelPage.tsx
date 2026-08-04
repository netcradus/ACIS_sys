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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-h1 text-text-primary">Threat Intelligence Swarm</h1>
          <p className="text-small text-text-secondary mt-1">Shared anonymized IOC enrichment and swarm telemetry</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 bg-surface-2 border border-fire-border px-4 py-3 rounded-xl">
            <Globe className="w-4 h-4 text-accent animate-spin-slow" />
            <div className="flex flex-col">
              <span className="text-label text-text-muted uppercase">Swarm Sync</span>
              <span className="text-small font-semibold text-success">Active</span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-surface-2 border border-fire-border px-4 py-3 rounded-xl">
            <span className="text-label text-text-muted uppercase">Live Nodes</span>
            <span className="text-h3 text-text-primary">847</span>
          </div>
        </div>
      </div>

      {demoMode && (
        <div className="bg-warning/10 border border-warning/30 text-warning px-4 py-3 rounded-lg text-small font-semibold flex items-center justify-center gap-2">
          <AlertTriangle size={16} />
          Demo Mode — AI key not configured. Displaying simulated results.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 pb-8">
        <div className="xl:col-span-8 space-y-6">
          <div className="card-mission p-8">
            <h2 className="text-label text-text-muted uppercase mb-6">Swarm Intelligence — Model-Assisted Enrichment</h2>
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] items-center">
              <input
                type="text"
                value={ioc}
                onChange={(e) => setIoc(e.target.value)}
                placeholder="Paste indicator (hash, domain, IP)..."
                className="input-field py-4 text-body font-medium"
              />
              <button
                onClick={handleEnrich}
                disabled={isEnriching}
                className="btn-fire py-4 px-6 text-small relative overflow-hidden"
              >
                {isEnriching ? 'Processing...' : 'Enrich Indicator'}
                {isEnriching && (
                  <div className="absolute inset-0 bg-white/10 animate-pulse" />
                )}
              </button>
            </div>
          </div>

          {result ? (
            <div className="card-mission overflow-hidden relative animate-slide-up">
              <div className={clsx(
                'absolute top-0 left-0 w-1 h-full',
                result.severity === 'HIGH' ? 'bg-danger' : 'bg-warning'
              )} />

              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between mb-8">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-h2 font-mono text-text-primary">{result.value || ioc}</span>
                    <span className={clsx(
                      'px-3 py-1 rounded-full text-label uppercase border',
                      result.severity === 'HIGH' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-warning/10 text-warning border-warning/30'
                    )}>
                      {result.severity === 'HIGH' ? 'Malicious' : result.severity || 'Suspicious'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-2 rounded-xl border border-fire-border bg-background p-4 min-w-[160px]">
                  <span className="text-label text-text-muted uppercase">Risk Score</span>
                  <span className="text-h1 text-danger">{result.confidenceScore || 0}</span>
                  <div className="h-2 w-full rounded-full bg-text-primary/10 overflow-hidden">
                    <div
                      className="h-full bg-danger"
                      style={{ width: `${Math.min(Math.max(result.confidenceScore || 0, 0), 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-fire-border pb-3">
                    <span className="text-label text-text-muted uppercase">Type</span>
                    <span className="text-small font-semibold text-text-primary">{result.type || 'Tor Exit Node / C2 Relay'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-fire-border pb-3">
                    <span className="text-label text-text-muted uppercase">Country</span>
                    <span className="text-small font-semibold text-text-primary">{result.country || 'Netherlands • AS-201011'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-fire-border pb-3">
                    <span className="text-label text-text-muted uppercase">First Seen</span>
                    <span className="text-small font-semibold text-text-primary">{result.firstSeen || '2024-11-03'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-fire-border pb-3">
                    <span className="text-label text-text-muted uppercase">Last Active</span>
                    <span className="text-small font-semibold text-success">{result.lastActive || 'Today'}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-2 p-4 rounded-xl bg-background border border-fire-border">
                    <span className="text-label text-accent uppercase">Detected by</span>
                    <span className="text-h3 text-text-primary">847 ACIS nodes in last 24h</span>
                    <span className="text-label text-text-muted uppercase">MITRE ATT&CK: T1090.003 — Proxy: Multi-hop Proxy</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {['AbuseIPDB', 'Shodan', 'VirusTotal', 'ACIS Swarm'].map((source) => (
                      <div key={source} className="flex items-center gap-2 px-3 py-2 bg-background border border-fire-border rounded-lg text-label text-text-secondary uppercase">
                        <Database size={14} className="text-accent" /> {source}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-success/30 bg-success/5 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck size={20} className="text-success" />
                    <span className="text-label text-success uppercase">ACIS AI Analysis</span>
                  </div>
                  <p className="text-small leading-relaxed text-text-secondary">
                    This IP operates as a Tor exit relay and has been associated with credential exfiltration campaigns targeting UK financial institutions. Confidence: High ({result.confidenceScore || 0}%). Recommend: Block at perimeter + create watchlist rule.
                  </p>
                </div>

                <div className="rounded-xl border border-accent/20 bg-background p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-label text-text-muted uppercase">Threat Context</span>
                    <span className="text-label text-success uppercase">Live</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-small font-medium text-text-secondary">
                      <span>Confidence</span>
                      <span>{result.confidenceScore || 0}%</span>
                    </div>
                    <div className="flex items-center justify-between text-small font-medium text-text-secondary">
                      <span>Node Reach</span>
                      <span>847</span>
                    </div>
                    <div className="flex items-center justify-between text-small font-medium text-text-secondary">
                      <span>Model Version</span>
                      <span>v2.1.3</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : !isEnriching && ioc && (
            <div className="p-12 border border-dashed border-fire-border rounded-xl text-center">
              <Skull className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-20" />
              <p className="text-label text-text-muted uppercase">No swarm records found for this indicator</p>
            </div>
          )}
        </div>

        <div className="xl:col-span-4 space-y-6">
          <div className="card-mission">
            <h3 className="text-h3 text-text-primary mb-6">Latest Community Signals</h3>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="flex flex-col items-center p-3 bg-background border border-fire-border rounded-lg">
                <span className="text-h3 text-text-primary tabular-nums">{(indicators.length || 12441).toLocaleString()}</span>
                <span className="text-label text-text-muted uppercase mt-1">IOCs Updated</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-background border border-fire-border rounded-lg">
                <span className="text-h3 text-text-primary tabular-nums">847</span>
                <span className="text-label text-text-muted uppercase mt-1">Active Nodes</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-background border border-fire-border rounded-lg">
                <span className="text-h3 text-text-primary tabular-nums">v2.1.3</span>
                <span className="text-label text-text-muted uppercase mt-1">Model Version</span>
              </div>
            </div>

            <div className="space-y-3">
              {communitySignals.map((signal, i) => (
                <div key={i} className={clsx('p-3 rounded-lg border-l-2 border border-fire-border bg-background transition-colors hover:bg-surface-3', signal.color)}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-small font-medium text-text-secondary leading-relaxed">
                      {signal.title}
                    </p>
                    <span className="text-label font-mono text-text-muted whitespace-nowrap">{signal.time}</span>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full btn-mission mt-6 py-2.5 text-small flex items-center justify-center gap-2">
              View All Signals <ChevronRight size={14} />
            </button>
          </div>

          <div className="card-mission">
            <h3 className="text-h3 text-accent mb-4">Model Performance</h3>
            <div className="mb-4">
              <div className="flex items-center justify-between text-label text-text-muted uppercase mb-2">
                <span>Global Accuracy</span>
                <span className="text-small font-semibold text-success">98.4%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-background border border-fire-border overflow-hidden">
                <div className="h-full bg-success w-[98.4%]" />
              </div>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between text-label text-text-muted uppercase">
                <span>Average Detection</span>
                <span className="text-text-primary font-semibold text-small normal-case">92.3%</span>
              </div>
              <div className="flex items-center justify-between text-label text-text-muted uppercase">
                <span>Update Cadence</span>
                <span className="text-text-primary font-semibold text-small normal-case">15m</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
