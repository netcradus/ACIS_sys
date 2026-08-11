import React, { useEffect, useState } from 'react'
import { Sparkles, Play, Terminal, AlertTriangle, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { LogEntry } from '@/types/log'
import { useCanWrite, MODULES } from '@/store/permissionsStore'

interface Playbook {
  id: string
  name: string
}

/** Mirrors LogExplorerPage's query-string convention so translated SPL maps to real /api/logs/search filters. */
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
  // Set only from a real failure response (no provider configured, or every
  // configured provider failed) — ai-service never returns a 200 with a
  // fabricated SPL translation, so there is no "demo mode" to represent
  // here, only "translation genuinely didn't happen" (the raw query text
  // is still searched for real, below).
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
      // ai-service's real error contract is {success:false, error:"..."} —
      // read it directly rather than trusting axios's generic message.
      // The search below still runs for real against the raw query text —
      // this only means the query wasn't AI-translated to SPL first.
      console.error('SPL translation failed, falling back to raw query text:', e)
      setAiTranslateError(e?.response?.data?.error || 'AI translation unavailable. Please try again.')
    }
    setSplResult(spl)

    try {
      const filters = parseQuery(spl)
      if (Object.keys(filters).length === 0) {
        // Translation produced no recognizable field filters — search on the
        // raw text the analyst typed instead of silently returning everything.
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
    <div className="space-y-6 animate-fade-in flex flex-col h-full text-text-secondary min-h-screen">

      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <h1 className="text-h1 text-text-primary flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" /> AI Analyst
        </h1>
        <span className={clsx(
          "text-label border px-2.5 py-1 rounded-full uppercase",
          aiTranslateError
            ? "bg-danger/10 text-danger border-danger/20"
            : "bg-accent/10 text-accent border-accent/20"
        )}>
          {aiTranslateError ? 'AI Unavailable' : 'AI Analyst'}
        </span>
      </div>

      {aiTranslateError && (
        <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-small font-semibold flex items-center justify-center gap-2">
          <AlertTriangle size={16} />
          AI Unavailable — {aiTranslateError} Search results below are still real.
        </div>
      )}

      {/* Query Bar */}
      <div className="card-mission space-y-4">
        <div className="relative flex items-center">
          <Sparkles className="absolute left-4 w-4 h-4 text-text-muted z-10" />
          <input
            type="text"
            placeholder="Ask a question about your logs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-field pl-11 pr-32 py-3.5"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleGenerate(query)
            }}
          />
          <button
            onClick={() => handleGenerate(query)}
            disabled={isGenerating || !query.trim()}
            className="absolute right-2 btn-fire py-1.5 px-4 text-small disabled:opacity-40"
          >
            {isGenerating ? 'Searching...' : 'Generate'}
          </button>
        </div>

        {splResult && (
          <div className="bg-surface border border-fire-border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-label text-info uppercase">Translated Query</span>
              <Terminal className="w-3.5 h-3.5 text-text-muted" />
            </div>
            <div className="font-mono text-small text-text-secondary overflow-x-auto whitespace-pre leading-relaxed select-all">
              {splResult}
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-small font-semibold">
          {errorMsg}
        </div>
      )}

      {hasRun && !errorMsg && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Real results table */}
          <div className="lg:col-span-2 card-mission space-y-4">
            <div className="flex items-center justify-between border-b border-fire-border pb-3">
              <h3 className="text-h3 text-text-primary">
                Query Results ({results.length} event{results.length === 1 ? '' : 's'})
              </h3>
            </div>

            {results.length === 0 ? (
              <p className="text-small text-text-muted py-8 text-center">No matching log events found.</p>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="table-enterprise">
                  <thead className="sticky top-0">
                    <tr>
                      <th>Time</th>
                      <th>Level</th>
                      <th>Service</th>
                      <th>Host</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {results.slice(0, 200).map((log) => (
                      <tr key={log.id}>
                        <td className="text-text-muted whitespace-nowrap text-label">
                          {log.timestamp ? new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '—'}
                        </td>
                        <td className={clsx('font-semibold text-small', log.level === 'CRITICAL' || log.level === 'ERROR' ? 'text-danger' : 'text-text-secondary')}>
                          {log.level}
                        </td>
                        <td className="text-accent text-small">{log.service}</td>
                        <td className="text-text-secondary text-small">{log.host || '—'}</td>
                        <td className="text-text-secondary text-small max-w-[400px] truncate" title={log.message}>{log.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Real aggregates + playbook actions — no fabricated narrative */}
          <div className="card-mission flex flex-col gap-5">
            <div>
              <h3 className="text-h3 text-text-primary flex items-center gap-1.5 border-b border-fire-border pb-3 mb-4">
                <Sparkles className="w-3.5 h-3.5 text-accent" /> Result Breakdown
              </h3>

              {results.length === 0 ? (
                <p className="text-small text-text-muted">Nothing to summarize — no events matched.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <span className="text-label text-text-muted uppercase block mb-2">By Level</span>
                    <div className="space-y-1.5">
                      {levelCounts.map(([level, count]) => (
                        <div key={level} className="flex items-center gap-2 text-small">
                          <span className="w-16 text-text-secondary font-semibold">{level}</span>
                          <div className="flex-1 bg-surface-3 rounded h-3 overflow-hidden">
                            <div
                              className={clsx('h-full', level === 'CRITICAL' || level === 'ERROR' ? 'bg-danger/60' : 'bg-accent/50')}
                              style={{ width: `${(count / maxLevelCount) * 100}%` }}
                            />
                          </div>
                          <span className="w-8 text-right font-mono text-text-secondary">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-label text-text-muted uppercase block mb-2">Top Services</span>
                    <div className="flex flex-wrap gap-1.5">
                      {serviceCounts.map(([svc, count]) => (
                        <span key={svc} className="text-label font-mono bg-surface-3 border border-fire-border px-2 py-1 rounded normal-case">
                          {svc} <span className="text-text-muted">×{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {hostCounts.length > 0 && (
                    <div>
                      <span className="text-label text-text-muted uppercase block mb-2">Top Hosts</span>
                      <div className="flex flex-wrap gap-1.5">
                        {hostCounts.map(([host, count]) => (
                          <span key={host} className="text-label font-mono bg-surface-3 border border-fire-border px-2 py-1 rounded normal-case">
                            {host} <span className="text-text-muted">×{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-fire-border pt-4">
              <span className="text-label text-text-muted uppercase block mb-2">Run a Playbook</span>
              {playbooks.length === 0 ? (
                <p className="text-small text-text-muted">No playbooks available.</p>
              ) : (
                <div className="space-y-1.5">
                  {playbooks.map((pb) => (
                    <button
                      key={pb.id}
                      onClick={() => handleTriggerPlaybook(pb.id, pb.name)}
                      disabled={triggering === pb.id || !canTriggerPlaybook}
                      title={!canTriggerPlaybook ? "Your role doesn't have write access to SOAR Playbooks" : undefined}
                      className="w-full text-left text-success hover:text-success/80 disabled:opacity-40 font-semibold flex items-center gap-1.5 focus:outline-none text-small bg-surface border border-fire-border rounded-lg px-3 py-2"
                    >
                      <Play className="w-3 h-3 fill-success flex-shrink-0" />
                      {triggering === pb.id ? 'Triggering...' : pb.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-label text-text-muted uppercase justify-center mt-auto pt-2">
              <ShieldCheck className="w-3 h-3" /> Live data — acis-log-service
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
