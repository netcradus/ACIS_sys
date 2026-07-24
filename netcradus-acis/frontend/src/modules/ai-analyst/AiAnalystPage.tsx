import React, { useEffect, useState } from 'react'
import { Sparkles, Play, Terminal, AlertTriangle, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import { LogEntry } from '@/types/log'

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
  const [query, setQuery] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [splResult, setSplResult] = useState('')
  const [hasRun, setHasRun] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
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
    setDemoMode(false)
    setErrorMsg(null)
    setQuery(searchQuery)

    let spl = searchQuery
    try {
      const translateRes = await apiClient.post('/api/logs/translate', { query: searchQuery })
      if (translateRes.data?.spl) {
        spl = translateRes.data.spl
      }
      if (translateRes.headers['x-acis-ai-mode'] === 'mock') {
        setDemoMode(true)
      }
    } catch (e) {
      console.error('SPL translation failed, falling back to raw query text:', e)
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
    <div className="space-y-6 animate-fade-in flex flex-col h-full bg-[#050506] text-neutral-300 p-6 min-h-screen">

      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
        <h1 className="text-xl font-bold text-white tracking-tight uppercase flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#FF5A1F]" /> AI Analyst
        </h1>
        <span className="text-[10px] bg-[#FF5A1F]/10 text-[#FF5A1F] border border-[#FF5A1F]/20 font-bold tracking-widest px-2.5 py-1 rounded-full uppercase">
          {demoMode ? 'Demo Mode' : 'AI Analyst'}
        </span>
      </div>

      {demoMode && (
        <div className="bg-warning/20 border border-warning/50 text-warning px-4 py-3 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 animate-pulse">
          <AlertTriangle size={16} />
          Demo Mode — AI key not configured. SPL translation is a naive fallback, not real NL understanding. Search results below are real.
        </div>
      )}

      {/* Query Bar */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="relative bg-[#050505] border border-neutral-800 rounded-xl overflow-hidden flex items-center">
          <Sparkles className="absolute left-4 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Ask a question about your logs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent pl-11 pr-32 py-3.5 text-xs text-white placeholder:text-neutral-600 font-semibold focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleGenerate(query)
            }}
          />
          <button
            onClick={() => handleGenerate(query)}
            disabled={isGenerating || !query.trim()}
            className="absolute right-3.5 bg-[#FF5A1F] hover:bg-[#E54E18] disabled:opacity-40 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 focus:outline-none"
          >
            {isGenerating ? 'Searching...' : 'Generate'}
          </button>
        </div>

        {splResult && (
          <div className="bg-[#050505] border border-neutral-900 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-[#00F5D4] font-black uppercase tracking-wider">Translated Query</span>
              <Terminal className="w-3.5 h-3.5 text-neutral-600" />
            </div>
            <div className="font-mono text-[11px] text-neutral-300 overflow-x-auto whitespace-pre leading-relaxed select-all">
              {splResult}
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="bg-danger/10 border border-danger/40 text-danger px-4 py-3 rounded-xl text-xs font-bold">
          {errorMsg}
        </div>
      )}

      {hasRun && !errorMsg && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Real results table */}
          <div className="lg:col-span-2 bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
              <h3 className="text-sm font-bold text-white tracking-tight uppercase">
                Query Results ({results.length} event{results.length === 1 ? '' : 's'})
              </h3>
            </div>

            {results.length === 0 ? (
              <p className="text-xs text-neutral-500 py-8 text-center">No matching log events found.</p>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-[#0C0C0D]">
                    <tr className="border-b border-neutral-950 text-neutral-500 font-bold uppercase tracking-wider text-[9px]">
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Level</th>
                      <th className="py-2.5 px-3">Service</th>
                      <th className="py-2.5 px-3">Host</th>
                      <th className="py-2.5 px-3">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-950 font-mono">
                    {results.slice(0, 200).map((log) => (
                      <tr key={log.id} className="hover:bg-[#121214]/40">
                        <td className="py-2.5 px-3 text-neutral-500 whitespace-nowrap">
                          {log.timestamp ? new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '—'}
                        </td>
                        <td className={clsx('py-2.5 px-3 font-bold', log.level === 'CRITICAL' || log.level === 'ERROR' ? 'text-red-500' : 'text-neutral-400')}>
                          {log.level}
                        </td>
                        <td className="py-2.5 px-3 text-accent">{log.service}</td>
                        <td className="py-2.5 px-3 text-neutral-400">{log.host || '—'}</td>
                        <td className="py-2.5 px-3 text-neutral-300 max-w-[400px] truncate" title={log.message}>{log.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Real aggregates + playbook actions — no fabricated narrative */}
          <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm flex flex-col gap-5">
            <div>
              <h3 className="text-xs font-bold text-white tracking-wider uppercase flex items-center gap-1.5 border-b border-neutral-900 pb-3 mb-4">
                <Sparkles className="w-3.5 h-3.5 text-[#FF5A1F]" /> Result Breakdown
              </h3>

              {results.length === 0 ? (
                <p className="text-[11px] text-neutral-500">Nothing to summarize — no events matched.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <span className="text-[9px] text-neutral-500 font-black uppercase tracking-wider block mb-2">By Level</span>
                    <div className="space-y-1.5">
                      {levelCounts.map(([level, count]) => (
                        <div key={level} className="flex items-center gap-2 text-[10px]">
                          <span className="w-16 text-neutral-400 font-bold">{level}</span>
                          <div className="flex-1 bg-neutral-900 rounded h-3 overflow-hidden">
                            <div
                              className={clsx('h-full', level === 'CRITICAL' || level === 'ERROR' ? 'bg-red-500/60' : 'bg-accent/50')}
                              style={{ width: `${(count / maxLevelCount) * 100}%` }}
                            />
                          </div>
                          <span className="w-8 text-right font-mono text-neutral-400">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] text-neutral-500 font-black uppercase tracking-wider block mb-2">Top Services</span>
                    <div className="flex flex-wrap gap-1.5">
                      {serviceCounts.map(([svc, count]) => (
                        <span key={svc} className="text-[10px] font-mono bg-neutral-900/60 border border-neutral-800 px-2 py-1 rounded">
                          {svc} <span className="text-neutral-500">×{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {hostCounts.length > 0 && (
                    <div>
                      <span className="text-[9px] text-neutral-500 font-black uppercase tracking-wider block mb-2">Top Hosts</span>
                      <div className="flex flex-wrap gap-1.5">
                        {hostCounts.map(([host, count]) => (
                          <span key={host} className="text-[10px] font-mono bg-neutral-900/60 border border-neutral-800 px-2 py-1 rounded">
                            {host} <span className="text-neutral-500">×{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-neutral-900 pt-4">
              <span className="text-[9px] text-neutral-500 font-black uppercase tracking-wider block mb-2">Run a Playbook</span>
              {playbooks.length === 0 ? (
                <p className="text-[11px] text-neutral-600">No playbooks available.</p>
              ) : (
                <div className="space-y-1.5">
                  {playbooks.map((pb) => (
                    <button
                      key={pb.id}
                      onClick={() => handleTriggerPlaybook(pb.id, pb.name)}
                      disabled={triggering === pb.id}
                      className="w-full text-left text-emerald-400 hover:text-emerald-300 disabled:opacity-40 font-bold flex items-center gap-1.5 focus:outline-none text-[10px] bg-[#050505] border border-neutral-900 rounded-lg px-3 py-2"
                    >
                      <Play className="w-3 h-3 fill-emerald-400 flex-shrink-0" />
                      {triggering === pb.id ? 'Triggering...' : pb.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!demoMode && (
              <div className="flex items-center gap-1.5 text-[9px] text-neutral-600 font-bold uppercase tracking-wider justify-center mt-auto pt-2">
                <ShieldCheck className="w-3 h-3" /> Live data — acis-log-service
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
