import React, { useEffect, useState } from 'react'
import { Sparkles, Play, Terminal, AlertTriangle, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { LogEntry } from '@/types/log'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import './AiAnalystPage.css'

interface Playbook {
  id: string
  name: string
}

function parseQuery(q: string) {
  const filters: Record<string, string> = {}
  const parts = q.split('|').map((p) => p.trim())
  const textTerms: string[] = []

  parts.forEach((part) => {
    if (part.startsWith('service=')) {
      filters.service = part.replace('service=', '').trim()
    } else if (part.startsWith('level=')) {
      filters.level = part.replace('level=', '').trim()
    } else if (part.startsWith('host=')) {
      filters.host = part.replace('host=', '').trim()
    } else if (part.startsWith('search ')) {
      const term = part.substring(7).replace(/"/g, '').trim()
      if (term) textTerms.push(term)
    }
  })

  if (textTerms.length > 0) {
    filters.query = textTerms.join(' ')
  }
  return filters
}

function topCounts(logs: LogEntry[], field: keyof LogEntry, limit = 6) {
  const counts = new Map<string, number>()
  for (const log of logs) {
    const raw = log[field]
    const key = (typeof raw === 'string' && raw.trim()) ? raw : 'UNKNOWN'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

export default function AiAnalystPage() {
  const canTriggerPlaybook = useCanWrite(MODULES.SOAR_PLAYBOOKS)
  const [query, setQuery] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [splResult, setSplResult] = useState('')
  const [hasRun, setHasRun] = useState(false)
  const [aiTranslateError, setAiTranslateError] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [results, setResults] = useState<LogEntry[]>([])
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [triggering, setTriggering] = useState<string | null>(null)

  useEffect(() => {
    const fetchPlaybooks = async () => {
      try {
        const res = await apiClient.get('/api/soar/playbooks')
        setPlaybooks(res.data || [])
      } catch (e) {
        console.error('Failed to load playbooks:', e)
      }
    }
    fetchPlaybooks()
  }, [])

  const handleGenerate = async (searchQuery: string) => {
    if (!searchQuery.trim()) return
    setIsGenerating(true)
    setAiTranslateError(null)
    setErrorMsg(null)
    setQuery(searchQuery)

    let spl = searchQuery
    try {
      const translateRes = await apiClient.post('/api/logs/translate', { query: searchQuery })
      if (translateRes.data?.spl) {
        spl = translateRes.data.spl
      } else {
        setAiTranslateError('AI translation unavailable. Please try again.')
      }
    } catch (e: any) {
      console.error('SPL translation failed, falling back to raw query text:', e)
      setAiTranslateError(e?.response?.data?.error || 'AI translation unavailable. Please try again.')
    }
    setSplResult(spl)

    try {
      const filters = parseQuery(spl)
      if (Object.keys(filters).length === 0) {
        filters.query = searchQuery
      }
      const searchRes = await apiClient.get<LogEntry[]>('/api/logs/search', { params: filters })
      setResults(searchRes.data || [])
      setHasRun(true)
    } catch (e) {
      console.error('Log search failed:', e)
      setErrorMsg('Log search request failed — see console for details.')
      setResults([])
      setHasRun(true)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleTriggerPlaybook = async (playbookId: string, playbookName: string) => {
    setTriggering(playbookId)
    try {
      await apiClient.post(`/api/soar/playbooks/${playbookId}/execute`)
      alert(`Triggered SOAR playbook: "${playbookName}". Check the SOAR module for live execution status.`)
    } catch (e) {
      console.error(e)
      alert('Failed to execute playbook — see console for details.')
    } finally {
      setTriggering(null)
    }
  }

  const levelCounts = topCounts(results, 'level')
  const serviceCounts = topCounts(results, 'service')
  const hostCounts = topCounts(results, 'host')
  const maxLevelCount = Math.max(1, ...levelCounts.map(([, c]) => c))

  return (
    <div className="ai-analyst-page">
      {/* Atmospheric Background for Dark Mode */}
      <div className="bg-fixed">
        <div className="nebula1" />
        <div className="nebula2" />
        <div className="nebula3" />
        <div className="stars" />
      </div>

      <div className="content">
        {/* Page Header */}
        <div className="page-head">
          <h1 className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-cyan" /> Compliance AI Analyst
          </h1>
          <span className={clsx(
            "badge-top",
            aiTranslateError ? "danger" : "info"
          )}>
            {aiTranslateError ? 'AI Unavailable' : 'AI Analyst Active'}
          </span>
        </div>

        {aiTranslateError && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-small font-semibold flex items-center justify-center gap-2 mb-5">
            <AlertTriangle size={16} />
            AI Unavailable — {aiTranslateError} Search results below are still real.
          </div>
        )}

        {/* Query Bar */}
        <div className="query-card">
          <div className="query-wrap">
            <Sparkles className="absolute left-4 w-4 h-4 text-muted z-10" />
            <input
              type="text"
              placeholder="Ask a question about your logs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="query-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleGenerate(query)
              }}
            />
            <button
              onClick={() => handleGenerate(query)}
              disabled={isGenerating || !query.trim()}
              className="query-btn"
            >
              {isGenerating ? 'Searching...' : 'Generate'}
            </button>
          </div>

          {splResult && (
            <div className="spl-box">
              <div className="flex items-center justify-between mb-2">
                <span className="lbl">Translated Query</span>
                <Terminal className="w-3.5 h-3.5 text-muted" />
              </div>
              <div className="font-mono text-small text-text-secondary overflow-x-auto whitespace-pre leading-relaxed select-all">
                {splResult}
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-small font-semibold mb-5">
            {errorMsg}
          </div>
        )}

        {hasRun && !errorMsg && (
          <div className="two-col">
            {/* Real results table */}
            <div className="results-panel">
              <h3>
                Query Results ({results.length} event{results.length === 1 ? '' : 's'})
              </h3>

              {results.length === 0 ? (
                <p className="text-small text-text-muted py-8 text-center">No matching log events found.</p>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: '440px', overflowY: 'auto' }}>
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>TIME</th>
                        <th>LEVEL</th>
                        <th>SERVICE</th>
                        <th>HOST</th>
                        <th>MESSAGE</th>
                      </tr>
                    </thead>
                    <tbody className="mono">
                      {results.slice(0, 200).map((log) => (
                        <tr key={log.id}>
                          <td className="text-text-muted whitespace-nowrap text-label">
                            {log.timestamp ? new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '—'}
                          </td>
                          <td className={clsx('font-semibold text-small', log.level === 'CRITICAL' || log.level === 'ERROR' ? 'text-danger' : 'text-text-secondary')}>
                            {log.level}
                          </td>
                          <td className="text-cyan text-small">{log.service}</td>
                          <td className="text-text-secondary text-small">{log.host || '—'}</td>
                          <td className="text-text-secondary text-small max-w-[340px] truncate" title={log.message}>
                            {log.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Real aggregates + playbook actions */}
            <div className="breakdown-panel">
              <div>
                <h3>Result Breakdown</h3>

                {results.length === 0 ? (
                  <p className="text-small text-text-muted">Nothing to summarize — no events matched.</p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <span className="text-label text-text-muted uppercase block mb-2" style={{ fontSize: '11px', fontWeight: 700 }}>By Level</span>
                      <div>
                        {levelCounts.map(([level, count]) => {
                          const isCritical = level === 'CRITICAL' || level === 'ERROR'
                          return (
                            <div key={level} className="level-row">
                              <span className="level-lbl">{level}</span>
                              <div className="level-track">
                                <div
                                  className={clsx('level-fill', isCritical ? 'danger' : 'accent')}
                                  style={{ width: `${(count / maxLevelCount) * 100}%` }}
                                />
                              </div>
                              <span className="level-num">{count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <span className="text-label text-text-muted uppercase block mb-2" style={{ fontSize: '11px', fontWeight: 700 }}>Top Services</span>
                      <div className="flex flex-wrap gap-1.5">
                        {serviceCounts.map(([svc, count]) => (
                          <span key={svc} className="pill-badge">
                            {svc} <span className="text-muted">×{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {hostCounts.length > 0 && (
                      <div>
                        <span className="text-label text-text-muted uppercase block mb-2" style={{ fontSize: '11px', fontWeight: 700 }}>Top Hosts</span>
                        <div className="flex flex-wrap gap-1.5">
                          {hostCounts.map(([host, count]) => (
                            <span key={host} className="pill-badge">
                              {host} <span className="text-muted">×{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-fire-border pt-4">
                <span className="text-label text-text-muted uppercase block mb-3" style={{ fontSize: '11px', fontWeight: 700 }}>Run a Playbook</span>
                {playbooks.length === 0 ? (
                  <p className="text-small text-text-muted">No playbooks available.</p>
                ) : (
                  <div className="space-y-2">
                    {playbooks.map((pb) => (
                      <button
                        key={pb.id}
                        onClick={() => handleTriggerPlaybook(pb.id, pb.name)}
                        disabled={triggering === pb.id || !canTriggerPlaybook}
                        className="btn-playbook"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{triggering === pb.id ? 'Triggering...' : pb.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-label text-text-muted uppercase justify-center mt-auto pt-4 border-t border-fire-border" style={{ fontSize: '11px', fontWeight: 700 }}>
                <ShieldCheck className="w-4.5 h-4.5" /> Live data — acis-log-service
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
