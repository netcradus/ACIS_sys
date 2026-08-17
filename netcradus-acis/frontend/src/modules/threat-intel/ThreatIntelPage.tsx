import React, { useState, useEffect, useMemo } from 'react'
import { ShieldAlert, AlertTriangle, ShieldCheck, Database } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import SeverityBadge, { toSeverity } from '@/components/viz/SeverityBadge'
import PivotChip from '@/components/ui/PivotChip'
import './ThreatIntelPage.css'

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
  const [totalIndicators, setTotalIndicators] = useState(0)
  const [indicatorsLoading, setIndicatorsLoading] = useState(true)
  const [indicatorsError, setIndicatorsError] = useState<string | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const fetchRecent = async () => {
    try {
      setIndicatorsLoading(true)
      setIndicatorsError(null)
      // GET /api/threat-intel is now real database-level pagination (was
      // fully unbounded before the production-readiness audit). This page's
      // severity/source breakdowns are real aggregate stats over the whole
      // tenant, so it requests the largest single page (200, the API's cap
      // is 500) rather than the default 50 - still a real, bounded fetch,
      // not the previous "everything, no limit" behavior.
      const res = await apiClient.get('/api/threat-intel', { params: { size: 200 } })
      const content = res.data?.content
      setIndicators(Array.isArray(content) ? content : [])
      setTotalIndicators(typeof res.data?.totalElements === 'number' ? res.data.totalElements : (content?.length ?? 0))
    } catch (e: any) {
      console.error('Failed to fetch recent indicators:', e)
      setIndicators([])
      setIndicatorsError(e?.message || 'Unable to load threat indicators. Please try again.')
    } finally {
      setIndicatorsLoading(false)
    }
  }

  useEffect(() => {
    fetchRecent()
  }, [])

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
      fetchRecent()
    } catch (error: any) {
      console.error('Threat lookup failed:', error)
      setLookupError(error?.message || 'Threat lookup failed')
      setResult(null)
    } finally {
      setIsEnriching(false)
    }
  }

  // Source breakdown circular donut segments
  const sourceBreakdown = useMemo(() => {
    let vt = 0, abuse = 0, other = 0
    indicators.forEach(i => {
      const src = (i.source || '').toLowerCase()
      if (src.includes('virustotal') || src.includes('vt')) vt++
      else if (src.includes('abuse')) abuse++
      else other++
    })
    const total = vt + abuse + other || 1
    const circ = 2 * Math.PI * 48 // ~301.59

    const vtDash = (vt / total) * circ
    const abuseDash = (abuse / total) * circ
    const otherDash = (other / total) * circ

    return {
      circ,
      vt: { dash: vtDash, offset: 0 },
      abuse: { dash: abuseDash, offset: -vtDash },
      other: { dash: otherDash, offset: -(vtDash + abuseDash) },
      vtCount: vt,
      abuseCount: abuse,
      otherCount: other
    }
  }, [indicators])

  // Severity bar chart heights — real current counts only, no fabricated history
  const sevBarsData = useMemo(() => {
    const crit = severityBreakdown.CRITICAL || 0
    const high = severityBreakdown.HIGH || 0
    const med = severityBreakdown.MEDIUM || 0
    const low = severityBreakdown.LOW || 0
    const max = Math.max(crit, high, med, low, 1)
    return { crit, high, med, low, max }
  }, [severityBreakdown])

  return (
    <div className="threat-intel-page">
      {/* Atmospheric Background for Dark Mode */}
      <div className="bg-fixed">
        <div className="nebula1" />
        <div className="nebula2" />
        <div className="nebula3" />
        <div className="stars" />
      </div>

      <div className="content">
        <div className="page-head">
          <div>
            <h1>Threat Intelligence</h1>
            <p>Real-time IOC enrichment via VirusTotal &amp; AbuseIPDB</p>
          </div>
          <div className="indicators-pill">
            <span>🌐</span>
            <div>
              <div className="l">INDICATORS TRACKED</div>
              <div className="v">{indicatorsLoading ? '...' : totalIndicators}</div>
            </div>
          </div>
        </div>

        {demoMode && (
          <div className="bg-warning/10 border border-warning/30 text-warning px-4 py-3 rounded-lg text-small font-semibold flex items-center justify-center gap-2 mb-4">
            <AlertTriangle size={16} />
            Demo Mode — VirusTotal/AbuseIPDB API keys not configured. Real lookups will resume once they're set.
          </div>
        )}

        {lookupError && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-small font-semibold flex items-center justify-center gap-2 mb-4">
            <ShieldAlert size={16} />
            {lookupError}
          </div>
        )}

        {/* Top Grid Panels */}
        <div className="top-grid">
          
          <div className="panel">
            <h3>Indicator Tracking</h3>
            <div className="ioc-boxes">
              <div className="ioc-box"><div className="n">{totalIndicators}</div><div className="l">Total IOCs</div></div>
              <div className="ioc-box"><div className="n">{distinctSources.length}</div><div className="l">Sources</div></div>
              <div className="ioc-box"><div className="n">{severityBreakdown.CRITICAL + severityBreakdown.HIGH}</div><div className="l">Critical + High</div></div>
            </div>
          </div>

          <div className="panel">
            <h3>Severity Breakdown</h3>
            <div className="sev-axis">
              <div className="stack-bars">
                {([
                  ['Critical', sevBarsData.crit, '#dc2626'],
                  ['High', sevBarsData.high, '#ea580c'],
                  ['Medium', sevBarsData.med, '#3b82f6'],
                  ['Low', sevBarsData.low, '#22d3ee'],
                ] as const).map(([label, count, color]) => (
                  <div key={label} className="stack-col">
                    <div
                      className="stack-seg"
                      style={{
                        height: `${(count / sevBarsData.max) * 160}px`,
                        background: color
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="sev-legend">
                <div><span className="d" style={{ background: '#dc2626' }}></span>Critical <span className="n">{sevBarsData.crit}</span></div>
                <div><span className="d" style={{ background: '#ea580c' }}></span>High <span className="n">{sevBarsData.high}</span></div>
                <div><span className="d" style={{ background: '#3b82f6' }}></span>Medium <span className="n">{sevBarsData.med}</span></div>
                <div><span className="d" style={{ background: '#22d3ee' }}></span>Low <span className="n">{sevBarsData.low}</span></div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>Source Breakdown</h3>
            <div className="src-row">
              <div className="src-list">
                <div><span className="d" style={{ background: 'var(--src-donut-vt)' }}></span>VirusTotal <span className="n">{sourceBreakdown.vtCount}</span></div>
                <div><span className="d" style={{ background: 'var(--src-donut-abuse)' }}></span>AbuseIPDB <span className="n">{sourceBreakdown.abuseCount}</span></div>
                <div><span className="d" style={{ background: 'var(--src-donut-other)' }}></span>Others <span className="n">{sourceBreakdown.otherCount}</span></div>
              </div>
              <svg viewBox="0 0 130 130" width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="65" cy="65" r="48" fill="none" stroke="var(--src-donut-vt)" strokeWidth="22" strokeDasharray={`${sourceBreakdown.vt.dash} ${sourceBreakdown.circ - sourceBreakdown.vt.dash}`} strokeDashoffset={sourceBreakdown.vt.offset} />
                <circle cx="65" cy="65" r="48" fill="none" stroke="var(--src-donut-abuse)" strokeWidth="22" strokeDasharray={`${sourceBreakdown.abuse.dash} ${sourceBreakdown.circ - sourceBreakdown.abuse.dash}`} strokeDashoffset={sourceBreakdown.abuse.offset} />
                <circle cx="65" cy="65" r="48" fill="none" stroke="var(--src-donut-other)" strokeWidth="22" strokeDasharray={`${sourceBreakdown.other.dash} ${sourceBreakdown.circ - sourceBreakdown.other.dash}`} strokeDashoffset={sourceBreakdown.other.offset} />
              </svg>
            </div>
          </div>

          <div className="panel howworks">
            <h3>ⓘ How This Works</h3>
            <p>Enriching an indicator queries VirusTotal, AbuseIPDB in real-time and saves the result to your tenant indicator list, visible to your whole team. Severity is derived from real vendor threat score.</p>
          </div>
        </div>

        {/* IOC enrichment form */}
        <div className="enrich-panel">
          <div className="enrich-label">IOC ENRICHMENT</div>
          <div className="enrich-row">
            <input
              type="text"
              value={ioc}
              onChange={(e) => setIoc(e.target.value)}
              placeholder="Paste indicator (hash, domain, IP)…"
              className="enrich-input"
            />
            <button
              onClick={handleEnrich}
              disabled={isEnriching || !ioc}
              className="enrich-btn"
            >
              {isEnriching ? 'Processing...' : 'Enrich Indicator'}
            </button>
          </div>
        </div>

        {/* Dynamic Query Results Panel */}
        {result && (
          <div className="recent-panel overflow-hidden relative mb-5 border-l-4 border-l-red">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between mb-8">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-h2 font-mono text-heading-color font-bold">{result.indicator || ioc}</span>
                  <SeverityBadge severity={toSeverity(result.severity)} label={result.severity || 'Unknown'} />
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 rounded-xl border border-border-soft bg-input-bg p-4 min-w-[160px]">
                <span className="text-label uppercase text-text-muted">Threat Score</span>
                <span className="text-h1 text-red font-bold">{result.threat_score ?? 0}</span>
                <div className="h-2 w-full rounded-full bg-border-soft overflow-hidden">
                  <div
                    className="h-full bg-red"
                    style={{ width: `${Math.min(Math.max(result.threat_score ?? 0, 0), 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border-soft pb-3">
                  <span className="text-label uppercase text-text-muted">Type</span>
                  <span className="text-small font-semibold text-heading-color">{detectIocType(result.indicator || ioc)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border-soft pb-3">
                  <span className="text-label uppercase text-text-muted">Checked</span>
                  <span className="text-small font-semibold text-heading-color">{enrichedAt || '—'}</span>
                </div>
                <div className="flex items-start justify-between border-b border-border-soft pb-3 gap-3">
                  <span className="text-label uppercase text-text-muted shrink-0">Categories</span>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {(result.categories || []).length > 0
                      ? result.categories.map((c: string) => (
                          <span key={c} className="text-label px-2 py-0.5 rounded bg-input-bg text-text-secondary">{c}</span>
                        ))
                      : <span className="text-small text-text-muted">none</span>}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-2 p-4 rounded-xl bg-input-bg border border-border-soft">
                  <span className="text-label uppercase text-blue">Sources Queried</span>
                  <div className="grid gap-2 sm:grid-cols-2 mt-1">
                    {['VirusTotal', 'AbuseIPDB'].map((source) => (
                      <div key={source} className="flex items-center gap-2 px-3 py-2 bg-background border border-border-soft rounded-lg text-label text-text-secondary uppercase">
                        <Database size={14} className="text-blue" /> {source}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="rounded-xl border border-green/30 bg-green/5 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck size={20} className="text-green" />
                  <span className="text-label uppercase text-green">Analysis</span>
                </div>
                <p className="text-small leading-relaxed text-text-secondary">
                  {result.description || 'No further detail returned for this indicator.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Recent Indicators */}
        <div>
          <div className="recent-panel">
            <h3>Recent Indicators</h3>
            <table>
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
                {!indicatorsLoading && indicatorsError && (
                  <tr className="empty-row">
                    <td colSpan={5}>
                      <div className="flex flex-col items-center gap-2 py-4">
                        <span>Unable to load threat indicators. Please try again.</span>
                        <button className="btn-mission text-small px-3 py-1.5" onClick={fetchRecent}>Retry</button>
                      </div>
                    </td>
                  </tr>
                )}
                {!indicatorsLoading && !indicatorsError && indicators.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={5}>
                      No indicators enriched yet — paste an IOC above to get started.
                    </td>
                  </tr>
                )}
                {!indicatorsLoading && !indicatorsError && indicators.slice(0, 20).map((ind) => (
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
    </div>
  )
}
