import React, { useState, useEffect, useMemo } from 'react'
import { Globe, ShieldAlert, Skull, AlertTriangle, ShieldCheck, Database, Clock } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import SeverityBadge, { toSeverity } from '@/components/viz/SeverityBadge'
import PivotChip from '@/components/ui/PivotChip'

/** Simple, real client-side IOC type detection — no backend round-trip needed for this. */
function detectIocType(value: string): string {
  const v = value.trim()
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) return 'IP'
  if (/^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/.test(v)) return 'HASH'
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v)) return 'DOMAIN'
  return 'UNKNOWN'
}

export default function ThreatIntelPage() {
  const [ioc, setIoc] = useState('')
  const [isEnriching, setIsEnriching] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [enrichedAt, setEnrichedAt] = useState<string | null>(null)
  const [indicators, setIndicators] = useState<any[]>([])
  const [indicatorsLoading, setIndicatorsLoading] = useState(true)
  const [demoMode, setDemoMode] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const fetchRecent = async () => {
    try {
      setIndicatorsLoading(true)
      const res = await apiClient.get('/api/threat-intel')
      setIndicators(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      console.error('Failed to fetch recent indicators:', e)
    } finally {
      setIndicatorsLoading(false)
    }
  }

  useEffect(() => {
    fetchRecent()
  }, [])

  // Real severity breakdown computed from the actual persisted indicator list —
  // replaces a "Model Performance" card that used to show hardcoded
  // 98.4%/92.3%/15m figures with no backend metric behind them at all.
  const severityBreakdown = useMemo(() => {
    const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    indicators.forEach((i) => { if (counts[i.severity] !== undefined) counts[i.severity]++ })
    return counts
  }, [indicators])

  const distinctSources = useMemo(() => {
    return Array.from(new Set(indicators.map((i) => i.source).filter(Boolean)))
  }, [indicators])

  const handleEnrich = async () => {
    if (!ioc) return
    setIsEnriching(true)
    setDemoMode(false)
    setLookupError(null)
    try {
      const response = await apiClient.post('/api/threat-intel/enrich', { indicator: ioc, type: detectIocType(ioc) })
      setResult(response.data)
      setEnrichedAt(new Date().toLocaleString())
      if (response.headers['x-acis-ai-mode'] === 'mock' || response.data.description?.includes('mock')) {
        setDemoMode(true)
      }
      // The enrichment is now really persisted server-side — refresh the real list.
      fetchRecent()
    } catch (error: any) {
      console.error('Threat lookup failed:', error)
      setLookupError(error?.message || 'Threat lookup failed')
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
          <h1 className="text-h1 text-text-primary">Threat Intelligence</h1>
          <p className="text-small text-text-secondary mt-1">Real-time IOC enrichment via VirusTotal &amp; AbuseIPDB</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 bg-surface-2 border border-fire-border px-4 py-3 rounded-xl">
            <Globe className="w-4 h-4 text-accent" />
            <div className="flex flex-col">
              <span className="text-label text-text-muted uppercase">Indicators Tracked</span>
              <span className="text-small font-semibold text-text-primary">{indicatorsLoading ? '...' : indicators.length}</span>
            </div>
          </div>
        </div>
      </div>

      {demoMode && (
        <div className="bg-warning/10 border border-warning/30 text-warning px-4 py-3 rounded-lg text-small font-semibold flex items-center justify-center gap-2">
          <AlertTriangle size={16} />
          Demo Mode — VirusTotal/AbuseIPDB API keys not configured. Real lookups will resume once they're set.
        </div>
      )}

      {lookupError && (
        <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-small font-semibold flex items-center justify-center gap-2">
          <ShieldAlert size={16} />
          {lookupError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 pb-8">
        <div className="xl:col-span-8 space-y-6">
          <div className="card-mission p-8">
            <h2 className="text-label text-text-muted uppercase mb-6">IOC Enrichment</h2>
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
                disabled={isEnriching || !ioc}
                className="btn-fire py-4 px-6 text-small relative overflow-hidden disabled:opacity-50"
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
                result.severity === 'CRITICAL' || result.severity === 'HIGH' ? 'bg-danger' : result.severity === 'MEDIUM' ? 'bg-warning' : 'bg-success'
              )} />

              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between mb-8">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-h2 font-mono text-text-primary">{result.indicator || ioc}</span>
                    <SeverityBadge severity={toSeverity(result.severity)} label={result.severity || 'Unknown'} />
                  </div>
                </div>

                <div className="flex flex-col items-start gap-2 rounded-xl border border-fire-border bg-background p-4 min-w-[160px]">
                  <span className="text-label text-text-muted uppercase">Threat Score</span>
                  <span className="text-h1 text-danger">{result.threat_score ?? 0}</span>
                  <div className="h-2 w-full rounded-full bg-text-primary/10 overflow-hidden">
                    <div
                      className="h-full bg-danger"
                      style={{ width: `${Math.min(Math.max(result.threat_score ?? 0, 0), 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-fire-border pb-3">
                    <span className="text-label text-text-muted uppercase">Type</span>
                    <span className="text-small font-semibold text-text-primary">{detectIocType(result.indicator || ioc)}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-fire-border pb-3">
                    <span className="text-label text-text-muted uppercase">Checked</span>
                    <span className="text-small font-semibold text-text-primary">{enrichedAt || '—'}</span>
                  </div>
                  <div className="flex items-start justify-between border-b border-fire-border pb-3 gap-3">
                    <span className="text-label text-text-muted uppercase shrink-0">Categories</span>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {(result.categories || []).length > 0
                        ? result.categories.map((c: string) => (
                            <span key={c} className="text-label px-2 py-0.5 rounded bg-surface-3 text-text-secondary">{c}</span>
                          ))
                        : <span className="text-small text-text-muted">none</span>}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-2 p-4 rounded-xl bg-background border border-fire-border">
                    <span className="text-label text-accent uppercase">Sources Queried</span>
                    <div className="grid gap-2 sm:grid-cols-2 mt-1">
                      {['VirusTotal', 'AbuseIPDB'].map((source) => (
                        <div key={source} className="flex items-center gap-2 px-3 py-2 bg-background border border-fire-border rounded-lg text-label text-text-secondary uppercase">
                          <Database size={14} className="text-accent" /> {source}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-1">
                <div className="rounded-xl border border-success/30 bg-success/5 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck size={20} className="text-success" />
                    <span className="text-label text-success uppercase">Analysis</span>
                  </div>
                  <p className="text-small leading-relaxed text-text-secondary">
                    {result.description || 'No further detail returned for this indicator.'}
                  </p>
                </div>
              </div>
            </div>
          ) : !isEnriching && ioc && (
            <div className="p-12 border border-dashed border-fire-border rounded-xl text-center">
              <Skull className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-20" />
              <p className="text-label text-text-muted uppercase">No results yet — run an enrichment above</p>
            </div>
          )}

          {/* Real persisted indicator history — previously fetched but never actually shown anywhere. */}
          <div className="card-mission">
            <h3 className="text-h3 text-text-primary mb-4">Recent Indicators</h3>
            <div className="overflow-x-auto">
              <table className="table-enterprise">
                <thead>
                  <tr>
                    <th>Indicator</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Source</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {indicatorsLoading && (
                    <tr><td colSpan={5} className="text-center text-text-muted py-6">Loading...</td></tr>
                  )}
                  {!indicatorsLoading && indicators.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-text-muted py-6">No indicators tracked yet — enrich one above to get started.</td></tr>
                  )}
                  {!indicatorsLoading && indicators.slice(0, 20).map((ind) => (
                    <tr key={ind.id}>
                      <td className="font-mono text-text-secondary">
                        {ind.type === 'IP' ? (
                          <PivotChip type="ip" value={ind.value} route="/dashboard/assets" />
                        ) : (
                          ind.value
                        )}
                      </td>
                      <td className="text-text-secondary">{ind.type}</td>
                      <td>
                        <SeverityBadge severity={toSeverity(ind.severity)} label={ind.severity} size="sm" />
                      </td>
                      <td className="text-text-secondary">{ind.source || '—'}</td>
                      <td className="text-text-muted text-small">{ind.lastSeen ? new Date(ind.lastSeen).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="xl:col-span-4 space-y-6">
          <div className="card-mission">
            <h3 className="text-h3 text-text-primary mb-6">Indicator Stats</h3>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="flex flex-col items-center p-3 bg-background border border-fire-border rounded-lg">
                <span className="text-h3 text-text-primary tabular-nums">{indicators.length}</span>
                <span className="text-label text-text-muted uppercase mt-1">Total IOCs</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-background border border-fire-border rounded-lg">
                <span className="text-h3 text-danger tabular-nums">{severityBreakdown.CRITICAL + severityBreakdown.HIGH}</span>
                <span className="text-label text-text-muted uppercase mt-1">High+ Severity</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-background border border-fire-border rounded-lg">
                <span className="text-h3 text-text-primary tabular-nums">{distinctSources.length}</span>
                <span className="text-label text-text-muted uppercase mt-1">Sources</span>
              </div>
            </div>

            <h4 className="text-label text-text-muted uppercase mb-3">Severity Breakdown</h4>
            <div className="space-y-2">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
                <div key={sev} className="flex items-center justify-between text-small">
                  <SeverityBadge severity={toSeverity(sev)} label={sev} size="sm" />
                  <span className="text-text-primary font-semibold tabular-nums">{severityBreakdown[sev]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card-mission">
            <h3 className="text-h3 text-text-primary mb-4 flex items-center gap-2"><Clock size={16} className="text-accent" /> How This Works</h3>
            <p className="text-small text-text-secondary leading-relaxed">
              Enriching an indicator queries VirusTotal and AbuseIPDB in real time and saves the result to your tenant's threat indicator list, visible to your whole team. Severity is derived from the real vendor threat score.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
