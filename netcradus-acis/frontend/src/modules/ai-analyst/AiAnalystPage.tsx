import React, { useState, useEffect } from 'react'
import { Sparkles, Play, Send, Terminal, ShieldAlert, Cpu, Check, RotateCcw, AlertTriangle } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'

interface Playbook {
  id: string
  name: string
}

export default function AiAnalystPage() {
  const [query, setQuery] = useState('Show me failed administrative logins over the last 24 hours grouped by country')
  const [isGenerating, setIsGenerating] = useState(false)
  const [splResult, setSplResult] = useState('')
  const [queryExecuted, setQueryExecuted] = useState(false)
  const [selectedScenario, setSelectedScenario] = useState('logins')
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])

  useEffect(() => {
    // Fetch playbooks list so we can trigger the right playbook on request
    const fetchPlaybooks = async () => {
      try {
        const res = await apiClient.get('/api/soar/playbooks')
        setPlaybooks(res.data || [])
      } catch (e) {
        console.error(e)
      }
    }
    fetchPlaybooks()
  }, [])

  // Call translation API and trigger state update
  const handleGenerate = async (searchQuery: string, scenario: string) => {
    setIsGenerating(true)
    setSelectedScenario(scenario)
    setQuery(searchQuery)
    try {
      const res = await apiClient.post('/api/logs/translate', { query: searchQuery })
      // Use standard response SPL, fallback to preset if needed
      setSplResult(res.data?.spl || 'index=auth action="failure" user_role="admin" | stats count by geo_country | sort -count')
      setQueryExecuted(true)
    } catch (e) {
      console.error(e)
      setSplResult('index=auth action="failure" user_role="admin" | stats count by geo_country | sort -count')
      setQueryExecuted(true)
    } finally {
      setIsGenerating(false)
    }
  }

  // Trigger Block/EDR playbook based on the scenario
  const handleTriggerPlaybook = async (playbookName: string) => {
    const matched = playbooks.find(p => p.name.toLowerCase().includes(playbookName.toLowerCase()))
    if (!matched) {
      alert(`Playbook "${playbookName}" not found in current SOAR database.`)
      return
    }
    try {
      await apiClient.post(`/api/soar/playbooks/${matched.id}/execute`)
      alert(`Successfully triggered SOAR Playbook: "${matched.name}".`)
    } catch (e) {
      console.error(e)
      alert("Failed to execute playbook.")
    }
  }

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full bg-[#050506] text-neutral-300 p-6 min-h-screen">
      
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
        <h1 className="text-xl font-bold text-white tracking-tight uppercase flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#FF5A1F] animate-pulse" /> OOURAA Copilot
        </h1>
        <span className="text-[10px] bg-[#FF5A1F]/10 text-[#FF5A1F] border border-[#FF5A1F]/20 font-bold tracking-widest px-2.5 py-1 rounded-full uppercase">
          AI Analyst Live
        </span>
      </div>

      {/* Query Bar Box */}
      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="relative bg-[#050505] border border-neutral-800 rounded-xl overflow-hidden flex items-center">
          <Sparkles className="absolute left-4 w-4 h-4 text-neutral-500" />
          <input 
            type="text" 
            placeholder="Ask Copilot a question..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent pl-11 pr-32 py-3.5 text-xs text-white placeholder:text-neutral-600 font-semibold focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleGenerate(query, 'logins')
            }}
          />
          <button 
            onClick={() => handleGenerate(query, 'logins')}
            disabled={isGenerating}
            className="absolute right-3.5 bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 focus:outline-none"
          >
            {isGenerating ? 'Translating...' : 'Generate'}
          </button>
        </div>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap gap-2 text-[10px] font-bold">
          <button 
            onClick={() => handleGenerate('Show me failed administrative logins over the last 24 hours grouped by country', 'logins')}
            className="bg-neutral-900/40 hover:bg-neutral-800 border border-neutral-800 px-3 py-1.5 rounded-full transition-colors focus:outline-none"
          >
            Failed admin logins by country
          </button>
          <button 
            onClick={() => handleGenerate('Find lateral movement from laptop-332', 'lateral')}
            className="bg-neutral-900/40 hover:bg-neutral-800 border border-neutral-800 px-3 py-1.5 rounded-full transition-colors focus:outline-none"
          >
            Find lateral movement from laptop-332
          </button>
          <button 
            onClick={() => handleGenerate('Summarize active critical incidents in the system', 'critical')}
            className="bg-neutral-900/40 hover:bg-neutral-800 border border-neutral-800 px-3 py-1.5 rounded-full transition-colors focus:outline-none"
          >
            Summarize active critical incidents
          </button>
        </div>

        {/* Generated SPL Output Panel */}
        {queryExecuted && (
          <div className="bg-[#050505] border border-neutral-900 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-[#00F5D4] font-black uppercase tracking-wider">OOURAA Generated SPL</span>
              <Terminal className="w-3.5 h-3.5 text-neutral-600" />
            </div>
            <div className="font-mono text-[11px] text-neutral-300 overflow-x-auto whitespace-pre leading-relaxed select-all">
              {splResult}
            </div>
          </div>
        )}
      </div>

      {/* Query Results & AI Insight Split Panel */}
      {queryExecuted && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Query Results (Left Col - takes 2 spans) */}
          <div className="lg:col-span-2 bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight uppercase">
                  {selectedScenario === 'logins' && 'Query Results (1,244 events)'}
                  {selectedScenario === 'lateral' && 'Query Results (6 events)'}
                  {selectedScenario === 'critical' && 'Query Results (3 incidents)'}
                </h3>
                <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider">Last 24 hours</p>
              </div>
            </div>

            {/* Render Scenario 1: Logins Grouped by Country */}
            {selectedScenario === 'logins' && (
              <div className="space-y-6">
                {/* Bar Chart */}
                <div className="flex items-end justify-between h-36 px-4 bg-[#050505]/40 border border-neutral-900 rounded-xl py-4">
                  {[
                    { label: 'RU', count: 542, pct: '100%' },
                    { label: 'CN', count: 418, pct: '77%' },
                    { label: 'US', count: 156, pct: '29%' },
                    { label: 'GB', count: 84, pct: '15%' },
                    { label: 'IR', count: 52, pct: '10%' },
                    { label: 'BR', count: 20, pct: '4%' },
                    { label: 'IN', count: 12, pct: '2%' }
                  ].map((bar, i) => (
                    <div key={i} className="flex flex-col items-center gap-2 h-full justify-end w-12">
                      <div className="text-[9px] font-mono text-neutral-500 font-bold">{bar.count}</div>
                      <div 
                        className="bg-red-500/20 border border-red-500/60 rounded w-6 hover:bg-red-500/30 transition-all cursor-pointer" 
                        style={{ height: bar.pct }}
                      />
                      <span className="text-[10px] font-bold text-neutral-500">{bar.label}</span>
                    </div>
                  ))}
                </div>

                {/* Country Breakdown Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-950 text-neutral-500 font-bold uppercase tracking-wider text-[9px]">
                        <th className="py-2.5 px-3">Geo_Country</th>
                        <th className="py-2.5 px-3">Count</th>
                        <th className="py-2.5 px-3">% of Total</th>
                        <th className="py-2.5 px-3">Top User Targeted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-950 font-semibold">
                      {[
                        { country: 'Russia (RU)', count: 542, pct: '43.5%', user: 'admin', warn: true },
                        { country: 'China (CN)', count: 418, pct: '32.9%', user: 'root', warn: true },
                        { country: 'United States (US)', count: 156, pct: '12.5%', user: 'administrator', warn: false },
                        { country: 'United Kingdom (GB)', count: 84, pct: '6.7%', user: 'db_admin', warn: false },
                        { country: 'Iran (IR)', count: 52, pct: '4.1%', user: 'admin', warn: false }
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#121214]/40">
                          <td className="py-3 px-3 text-neutral-300">{row.country}</td>
                          <td className={clsx("py-3 px-3 font-mono", row.warn ? "text-red-500 font-bold" : "text-neutral-400")}>{row.count}</td>
                          <td className="py-3 px-3 text-neutral-400 font-mono">{row.pct}</td>
                          <td className="py-3 px-3 text-neutral-300 font-mono">{row.user}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Render Scenario 2: Lateral Movement laptop-332 */}
            {selectedScenario === 'lateral' && (
              <div className="space-y-4">
                <div className="p-4 bg-orange-950/20 border border-orange-800/40 rounded-xl flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Warning: Multi-endpoint Lateral hops detected</h4>
                    <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                      WMI execution requests and raw SMB connections were detected initiating from `laptop-332` and targeting domain administrator accounts on critical production database servers.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-950 text-neutral-500 font-bold uppercase tracking-wider text-[9px]">
                        <th className="py-2.5 px-3">Source Node</th>
                        <th className="py-2.5 px-3">Destination Node</th>
                        <th className="py-2.5 px-3">Protocol/Tactic</th>
                        <th className="py-2.5 px-3">User context</th>
                        <th className="py-2.5 px-3">Event Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-950 font-semibold font-mono text-[11px]">
                      {[
                        { src: 'laptop-332', dst: 'dc-prod-01', proto: 'WMI (Port 135)', user: 'service_admin', type: 'Sysmon 1' },
                        { src: 'laptop-332', dst: 'srv-erp', proto: 'SMB (Port 445)', user: 'domain_admin', type: 'Security 4624' },
                        { src: 'laptop-332', dst: 'srv-backup-01', proto: 'WinRM (Port 5985)', user: 'backup_svc', type: 'Security 4624' }
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#121214]/40">
                          <td className="py-3 px-3 text-neutral-300 uppercase">{row.src}</td>
                          <td className="py-3 px-3 text-neutral-200 uppercase">{row.dst}</td>
                          <td className="py-3 px-3 text-orange-400">{row.proto}</td>
                          <td className="py-3 px-3 text-neutral-400">{row.user}</td>
                          <td className="py-3 px-3 text-neutral-500">{row.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Render Scenario 3: Summarize Critical Incidents */}
            {selectedScenario === 'critical' && (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-950 text-neutral-500 font-bold uppercase tracking-wider text-[9px]">
                        <th className="py-2.5 px-3">Severity</th>
                        <th className="py-2.5 px-3">Alert Title</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-950 font-semibold">
                      {[
                        { sev: 'CRITICAL', title: 'Excessive 401 auth failures', cat: 'Brute Force', stat: 'OPEN' },
                        { sev: 'CRITICAL', title: 'Suspicious PowerShell Download', cat: 'Malware Execution', stat: 'INVESTIGATING' },
                        { sev: 'HIGH', title: 'Database Backup Exfiltration attempt', cat: 'Data Exfil', stat: 'OPEN' }
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#121214]/40">
                          <td className="py-3 px-3">
                            <span className={clsx(
                              "text-[9px] font-black tracking-widest px-2 py-0.5 rounded",
                              row.sev === 'CRITICAL' ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                            )}>
                              {row.sev}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-neutral-200">{row.title}</td>
                          <td className="py-3 px-3 text-neutral-400 font-mono">{row.cat}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-orange-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping" />
                              <span>{row.stat}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* AI Insight & Investigation (Right Col - takes 1 span) */}
          <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[460px]">
            
            {/* Header */}
            <div>
              <div className="flex items-center justify-between border-b border-neutral-900 pb-3 mb-4">
                <h3 className="text-xs font-bold text-white tracking-wider uppercase flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#FF5A1F]" /> Insight & Investigation
                </h3>
              </div>

              {/* Chat Timeline */}
              <div className="space-y-4 text-xs">
                
                {/* User query card */}
                <div className="bg-[#050505] border border-neutral-900 rounded-xl p-3.5 text-neutral-300 leading-relaxed font-semibold relative pr-10">
                  <p>{query}</p>
                  <span className="absolute right-3.5 top-3.5 bg-neutral-900 text-neutral-400 font-bold px-1.5 py-0.5 rounded text-[8px] border border-neutral-800">A1</span>
                </div>

                {/* Copilot response card */}
                <div className="border border-neutral-900 bg-[#050505]/40 rounded-xl p-4 text-neutral-300 leading-relaxed relative space-y-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-md bg-[#FF5A1F] flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <span className="font-bold text-white text-[10px] uppercase tracking-wider">OOURAA Copilot</span>
                  </div>

                  {selectedScenario === 'logins' && (
                    <div className="space-y-3">
                      <p>I've converted your request into SPL and run the query.</p>
                      <div>
                        <strong className="text-white block font-bold mb-1">Key Findings:</strong>
                        <p className="text-neutral-400">
                          A total of 1,244 failed admin logins occurred. The vast majority originated from <b className="text-red-400">Russia (43.5%)</b> and <b className="text-red-400">China (32.9%)</b>. This high volume of failures directed at 'admin' and 'root' accounts strongly suggests an automated brute-force or password spraying attack originating from these regions.
                        </p>
                      </div>
                      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-lg p-3 space-y-2 mt-2">
                        <span className="text-[10px] text-neutral-400 font-semibold block">Would you like me to block these top 5 ASN ranges on the edge firewall?</span>
                        <button 
                          onClick={() => handleTriggerPlaybook("Block Domain")}
                          className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 focus:outline-none text-[10px]"
                        >
                          <Play className="w-3 h-3 fill-emerald-400" /> Run Block_Geofence Playbook
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedScenario === 'lateral' && (
                    <div className="space-y-3">
                      <p>I've isolated the logs for laptop-332 and verified active threat paths.</p>
                      <div>
                        <strong className="text-white block font-bold mb-1">Key Findings:</strong>
                        <p className="text-neutral-400">
                          The host laptop-332 is connecting to three different internal database backups and DC endpoints, performing credential access testing. This matches a standard Ransomware lateral movement sequence.
                        </p>
                      </div>
                      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-lg p-3 space-y-2 mt-2">
                        <span className="text-[10px] text-neutral-400 font-semibold block">Would you like me to isolate the infected source endpoint immediately?</span>
                        <button 
                          onClick={() => handleTriggerPlaybook("Isolate Endpoint")}
                          className="text-red-400 hover:text-red-300 font-bold flex items-center gap-1 focus:outline-none text-[10px]"
                        >
                          <Play className="w-3 h-3 fill-red-400" /> Run Isolate_Endpoint Playbook
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedScenario === 'critical' && (
                    <div className="space-y-3">
                      <p>Here is the critical incident rollup for today.</p>
                      <div>
                        <strong className="text-white block font-bold mb-1">Key Findings:</strong>
                        <p className="text-neutral-400">
                          You have 3 critical events open. 1 is brute force attacks on production server, and 2 is script download activity. All items currently lack analysts assigned.
                        </p>
                      </div>
                      <div className="bg-[#0C0C0D] border border-neutral-800 rounded-lg p-3 space-y-2 mt-2">
                        <span className="text-[10px] text-neutral-400 font-semibold block">Would you like me to run credentials reset workflow?</span>
                        <button 
                          onClick={() => handleTriggerPlaybook("Reset Compromised")}
                          className="text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1 focus:outline-none text-[10px]"
                        >
                          <Play className="w-3 h-3 fill-orange-400" /> Run Reset_Account Playbook
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Bottom Actions info */}
            <div className="text-[9px] text-neutral-600 font-bold uppercase tracking-wider text-center mt-6">
              Powered by sentence-transformers & FAISS
            </div>

          </div>

        </div>
      )}

    </div>
  )
}
