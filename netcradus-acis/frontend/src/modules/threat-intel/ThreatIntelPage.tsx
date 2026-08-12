import React, { useState, useEffect, useMemo } from 'react'
import { Globe, ShieldAlert, Skull, AlertTriangle, ShieldCheck, Database, Clock } from 'lucide-react'
import { clsx } from 'clsx'
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

function seedRandom(seed: number) {
  let s = seed
  return function() {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
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
    if (indicators.length === 0) {
      vt = 30; abuse = 13; other = 0
    }
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

  // Severity stacked bar chart heights
  const sevBarsData = useMemo(() => {
    const crit = severityBreakdown.CRITICAL || 0
    const high = severityBreakdown.HIGH || 0
    const med = severityBreakdown.MEDIUM || 0
    const low = severityBreakdown.LOW || 0
    
    // Fall back to mockup ratios if no data is present
    return [
      { stack: [30, 50, 55, 25] },
      { stack: [35, 55, 60, 30] },
      { stack: [28, 48, 52, 26] },
      { stack: [crit > 0 ? crit : 25, high > 0 ? high : 45, med > 0 ? med : 50, low > 0 ? low : 20] }
    ]
  }, [severityBreakdown])

  // Threat Actor Map coordinates outline
  const mapData = useMemo(() => {
    const spots = [[90,100],[180,80],[300,90],[330,140],[60,150],[210,130],[350,180],[70,190]]
    const arcs = [[90,100,180,80],[180,80,300,90],[300,90,330,140],[60,150,180,80],[210,130,300,90],[70,190,210,130]]
    const dots = []
    const rng = seedRandom(1234)
    for (let i = 0; i < 600; i++) {
      const x = rng() * 400
      const y = 20 + rng() * 220
      const inLand = (x>20&&x<110&&y>70&&y<190) || (x>140&&x<230&&y>40&&y<180) || (x>250&&x<390&&y>50&&y<200)
      if (inLand && rng() < 0.4) {
        dots.push({ x, y })
      }
    }
    return { dots, spots, arcs }
  }, [])

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
              <div className="v">{indicatorsLoading ? '...' : indicators.length}</div>
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
              <div className="ioc-box"><div className="n">{indicators.length}</div><div className="l">Total IOCs</div></div>
              <div className="ioc-box"><div className="n">0</div><div className="l">Quarantined</div></div>
              <div className="ioc-box"><div className="n">0</div><div className="l">Conflicts</div></div>
            </div>
            <div className="ioc-mini">
              <div className="ioc-mini-left">
                <div className="n">{indicators.length}</div>
                <div className="l">Total IOCs</div>
              </div>
              <div className="spark-wrap">
                <svg viewBox="0 0 70 30" width="70" height="26">
                  <polyline points="0,24 15,20 30,22 45,12 60,4 70,6" fill="none" stroke="var(--blue)" strokeWidth="2" />
                </svg>
                <span className="n">3</span>
              </div>
              <div className="ioc-mini-right">
                <div className="n">3</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>Severity Breakdown</h3>
            <div className="sev-axis">
              <div className="axis-y">
                <span>200</span><span>150</span><span>100</span><span>50</span><span>0</span>
              </div>
              <div className="stack-bars">
                {sevBarsData.map((item, idx) => (
                  <div key={idx} className="stack-col">
                    {item.stack.map((v, sIdx) => {
                      const colors = ['#22d3ee', '#3b82f6', '#ea580c', '#dc2626']
                      return (
                        <div
                          key={sIdx}
                          className="stack-seg"
                          style={{
                            height: `${(v / 200) * 160}px`,
                            background: colors[sIdx % 4]
                          }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
              <div className="sev-legend">
                <div><span className="d" style={{ background: '#dc2626' }}></span>Critical</div>
                <div><span className="d" style={{ background: '#ea580c' }}></span>High</div>
                <div><span className="d" style={{ background: '#3b82f6' }}></span>Medium</div>
                <div><span className="d" style={{ background: '#22d3ee' }}></span>Low</div>
              </div>
            </div>
            <div className="stack-lbls">
              <span>09 Jan</span><span>12 Jan</span><span>16 Jan</span><span>24 Dec</span>
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

        {/* Recent Indicators + World Map Grid */}
        <div style={{ position: 'relative' }}>
          
          {/* Main indicators table */}
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
                {!indicatorsLoading && indicators.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={5}>
                      <span className="hl">Potential Data Exfiltration</span> · enrich one above to get started.
                    </td>
                  </tr>
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

            {/* Custom threat vendor scores table from mockup */}
            <table style={{ marginTop: '24px' }}>
              <thead>
                <tr>
                  <th>TIMESTAMP ↑</th>
                  <th>INDICATOR</th>
                  <th>TYPE</th>
                  <th>ENRICHMENT SOURCE</th>
                  <th>STATUS</th>
                  <th colSpan={4}>THREAT SCORE<br /><span style={{ fontWeight: 600 }}>Critical &nbsp; High &nbsp; AbuseIPDB &nbsp; Vendor</span></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>2022-07-18:16…</td>
                  <td className="font-mono">Locallecnite7…</td>
                  <td>Hash</td>
                  <td className="owner-name">S. Skallenorora.com</td>
                  <td>Active</td>
                  <td>13 <span className="wbadge">W</span></td>
                  <td>5 <span className="wbadge">W</span></td>
                  <td>
                    0 &nbsp;
                    <svg width="30" height="14" viewBox="0 0 30 14" style={{ display: 'inline' }}>
                      <polyline points="0,10 8,4 16,8 24,2 30,6" fill="none" stroke="var(--cyan)" strokeWidth="1.5" />
                    </svg>
                  </td>
                  <td>
                    0 &nbsp;
                    <svg width="30" height="14" viewBox="0 0 30 14" style={{ display: 'inline' }}>
                      <polyline points="0,10 8,4 16,8 24,2 30,6" fill="none" stroke="var(--cyan)" strokeWidth="1.5" />
                    </svg>
                  </td>
                </tr>
                <tr>
                  <td>2022-07-18:16…</td>
                  <td className="font-mono">Locallestom5…</td>
                  <td>Domain</td>
                  <td>AbuseIPDB</td>
                  <td>Active</td>
                  <td>42 <span className="wbadge">W</span></td>
                  <td>5 <span className="wbadge">W</span></td>
                  <td>
                    0 &nbsp;
                    <svg width="30" height="14" viewBox="0 0 30 14" style={{ display: 'inline' }}>
                      <polyline points="0,4 8,10 16,4 24,8 30,2" fill="none" stroke="var(--cyan)" strokeWidth="1.5" />
                    </svg>
                  </td>
                  <td>0</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Floating Threat Actor Map */}
          <div className="map-float">
            <div className="map-float-head">
              <h3>🗺 Threat Actor Map</h3>
              <div className="map-icons">⤢ ⚙ ⛶</div>
            </div>
            <div className="map-box">
              <svg viewBox="0 0 400 260">
                {/* Silhouette map dots */}
                {mapData.dots.map((dot, idx) => (
                  <circle key={idx} cx={dot.x} cy={dot.y} r={0.8} fill="var(--map-dot-color)" />
                ))}

                {/* Arc connections */}
                {mapData.arcs.map(([x1, y1, x2, y2], idx) => {
                  const mx = (x1 + x2) / 2
                  const my = (y1 + y2) / 2 - 24
                  return (
                    <path
                      key={idx}
                      d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                      fill="none"
                      stroke="var(--map-path-color)"
                      strokeWidth="1.1"
                    />
                  )
                })}

                {/* Radar spots */}
                {mapData.spots.map(([x, y], idx) => {
                  const gradId = `mg-intel-dark-${idx}`
                  return (
                    <g key={idx}>
                      <defs>
                        <radialGradient id={gradId}>
                          <stop offset="0%" stopColor="var(--map-hotspot-color)" stopOpacity="0.9" />
                          <stop offset="100%" stopColor="var(--map-hotspot-color)" stopOpacity="0" />
                        </radialGradient>
                      </defs>
                      <circle cx={x} cy={y} r={16} fill={`url(#${gradId})`} />
                      <circle cx={x} cy={y} r={3} fill="var(--map-dot-center-color)" />
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Bottom widgets columns */}
        <div className="bottom-cols">
          
          <div className="feed-panel">
            <div className="feed-head">
              <h3>Threat intel Feed</h3>
              <span style={{ color: 'var(--dim)', cursor: 'pointer' }}>⌃</span>
            </div>
            <div className="feed-flow">
              <div className="feed-step"><div className="feed-icon">👤</div><div className="feed-lbl">Assignment seen</div></div>
              <div className="feed-arrow">→</div>
              <div className="feed-step"><div className="feed-icon active">🎯</div><div className="feed-lbl">Invsged Diagnose</div></div>
              <div className="feed-arrow">→</div>
              <div className="feed-step"><div className="feed-icon">$</div><div className="feed-lbl">Enverged Diagnose</div></div>
              <div className="feed-arrow">→</div>
              <div className="feed-step"><div className="feed-icon">①</div><div className="feed-lbl">Severned Diagnose</div></div>
              <div className="feed-arrow">→</div>
              <div className="feed-step"><div className="feed-icon">↻</div><div className="feed-lbl">Conflicts</div></div>
              <div className="feed-arrow">→</div>
              <div className="feed-step"><div className="feed-icon">!</div><div className="feed-lbl">Conflicts</div></div>
              <div className="feed-arrow">→</div>
              <div className="feed-step"><div className="feed-icon">⚗</div><div className="feed-lbl">Corolfilist seen</div></div>
              <div className="feed-arrow">→</div>
              <div className="feed-step"><div className="feed-icon">⚙</div><div className="feed-lbl">Threat intel Feed</div></div>
            </div>
          </div>

          <div className="wordcloud-panel">
            <h3>Emerging Threats Word Cloud</h3>
            <div className="cloud">
              <span style={{ fontSize: '14px', color: '#7c8ba3' }}>Tirotet</span> &nbsp;
              <span style={{ fontSize: '20px', color: '#f97316' }}>Ransomware</span> &nbsp;
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>APTwars</span> &nbsp;
              <span style={{ fontSize: '17px', color: '#5b9dff' }}>Malware</span> &nbsp;
              <span style={{ fontSize: '19px', color: '#c7d1ea' }}>Familittare</span> &nbsp;
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Ransomware</span><br />
              <span style={{ fontSize: '13px', color: '#7c8ba3' }}>Hardware</span> &nbsp;
              <span style={{ fontSize: '30px', color: '#f97316', fontWeight: 900 }}>Emotet</span> &nbsp;
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Supply Chain Attack</span><br />
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Ransomwarwarmware</span> &nbsp;
              <span style={{ fontSize: '28px', color: '#c084fc' }}>APT28</span> &nbsp;
              <span style={{ fontSize: '30px', color: '#ef4444', fontWeight: 900 }}>Ransomware</span> &nbsp;
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>ForrestDroures</span><br />
              <span style={{ fontSize: '16px', color: '#c7d1ea' }}>Emoret</span> &nbsp;
              <span style={{ fontSize: '19px', color: '#5b9dff' }}>Supply Chain Attack</span> &nbsp;
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Tiestram</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
