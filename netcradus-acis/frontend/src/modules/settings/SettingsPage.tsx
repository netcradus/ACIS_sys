import React, { useEffect, useState } from 'react'
import { Key, Copy, Plus, X, Check, Settings, Activity, FileText, Database, Shield, Users, CreditCard, Layers } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'

interface ApiKey {
  id: string
  keyName: string
  token: string
  role: string
  createdAt: string
  lastUsedAt: string | null
  status: string // Active, Revoked
}

interface Integration {
  id: string
  name: string
  description: string
  status: string // Connected, Disconnected
  logoLetter: string
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('API Keys')
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null)

  // Modals state
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false)
  const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState(false)

  // Form states
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyRole, setNewKeyRole] = useState('API Read/Write')
  
  const [newIntName, setNewIntName] = useState('')
  const [newIntDesc, setNewIntDesc] = useState('')
  const [newIntLogo, setNewIntLogo] = useState('')

  const fetchData = async () => {
    try {
      const [keysRes, integrationsRes] = await Promise.all([
        apiClient.get('/api/soar/settings/keys'),
        apiClient.get('/api/soar/settings/integrations')
      ])
      setKeys(keysRes.data || [])
      setIntegrations(integrationsRes.data || [])
    } catch (e) {
      console.error("Failed to load settings data:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Copy token to clipboard helper
  const handleCopyToken = (id: string, token: string) => {
    navigator.clipboard.writeText(token.replace('...', ''))
    setCopiedKeyId(id)
    setTimeout(() => setCopiedKeyId(null), 2000)
  }

  // Revoke API Key
  const handleRevokeKey = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API access key?")) return
    try {
      await apiClient.put(`/api/soar/settings/keys/${id}/revoke`)
      fetchData()
    } catch (e) {
      console.error(e)
    }
  }

  // Generate API Key
  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiClient.post('/api/soar/settings/keys', {
        keyName: newKeyName,
        role: newKeyRole
      })
      setNewKeyName('')
      setIsKeyModalOpen(false)
      fetchData()
    } catch (e) {
      console.error(e)
    }
  }

  // Toggle Integration Status
  const handleToggleIntegration = async (id: string) => {
    try {
      await apiClient.put(`/api/soar/settings/integrations/${id}/toggle`)
      fetchData()
    } catch (e) {
      console.error(e)
    }
  }

  // Add Integration
  const handleAddIntegration = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiClient.post('/api/soar/settings/integrations', {
        name: newIntName,
        description: newIntDesc,
        logoLetter: newIntLogo || newIntName.substring(0, 2).toUpperCase()
      })
      setNewIntName('')
      setNewIntDesc('')
      setNewIntLogo('')
      setIsIntegrationModalOpen(false)
      fetchData()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="flex bg-[#050506] text-neutral-300 min-h-screen">
      
      {/* Settings Sub-Sidebar */}
      <aside className="w-56 border-r border-neutral-900 pr-4 pt-2 space-y-6 shrink-0 hidden md:block">
        
        <div className="space-y-2">
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider block px-3">General</span>
          {[
            { label: 'Organization', icon: Activity },
            { label: 'Licenses & Billing', icon: CreditCard }
          ].map((tab, idx) => (
            <button 
              key={idx}
              onClick={() => alert(`${tab.label} settings is in development`)}
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-neutral-500 hover:text-white hover:bg-neutral-900/40 transition-colors flex items-center gap-2 focus:outline-none"
            >
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider block px-3">Access Control</span>
          {[
            { label: 'Users & Groups', icon: Users },
            { label: 'Roles & Permissions', icon: Shield },
            { label: 'API Keys', icon: Key }
          ].map((tab, idx) => (
            <button 
              key={idx}
              onClick={() => setActiveTab(tab.label)}
              className={clsx(
                "w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 focus:outline-none",
                activeTab === tab.label 
                  ? "text-[#FF5A1F] bg-[#FF5A1F]/5" 
                  : "text-neutral-500 hover:text-white hover:bg-neutral-900/40"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider block px-3">Data & Integrations</span>
          {[
            { label: 'Data Sources', icon: Database },
            { label: 'Integrations', icon: Layers },
            { label: 'Agent Deployment', icon: Settings }
          ].map((tab, idx) => (
            <button 
              key={idx}
              onClick={() => setActiveTab(tab.label)}
              className={clsx(
                "w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 focus:outline-none",
                activeTab === tab.label 
                  ? "text-[#FF5A1F] bg-[#FF5A1F]/5" 
                  : "text-neutral-500 hover:text-white hover:bg-neutral-900/40"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>

      </aside>

      {/* Main Settings Panel Area */}
      <main className="flex-1 pl-0 md:pl-8 space-y-6">
        
        {/* Panel Title */}
        <div className="border-b border-neutral-950 pb-4">
          <h2 className="text-lg font-bold text-white tracking-tight uppercase leading-none">Access & Integrations</h2>
          <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider">Manage API access tokens and connected third-party security tools.</p>
        </div>

        {/* Tab 1: API Keys Panel */}
        {activeTab === 'API Keys' && (
          <div className="space-y-6">
            
            {/* API Keys Table Card */}
            <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">API Keys</h3>
                  <p className="text-[10px] text-neutral-500 mt-1">Tokens for external API access and automation scripts.</p>
                </div>
                <button 
                  onClick={() => setIsKeyModalOpen(true)}
                  className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 transition-colors focus:outline-none"
                >
                  <Plus className="w-3.5 h-3.5" /> Generate Key
                </button>
              </div>

              {/* API Keys Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-neutral-900 text-neutral-500 font-bold uppercase tracking-wider text-[9px]">
                      <th className="py-2.5 px-3 w-[25%]">Key Name</th>
                      <th className="py-2.5 px-3 w-[25%]">Token</th>
                      <th className="py-2.5 px-3 w-[15%]">Role</th>
                      <th className="py-2.5 px-3 w-[12%]">Created</th>
                      <th className="py-2.5 px-3 w-[11%]">Last Used</th>
                      <th className="py-2.5 px-3 w-[12%] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-900/60 font-semibold text-neutral-300">
                    {keys.map(k => (
                      <tr key={k.id} className="hover:bg-[#121214]/50 transition-colors">
                        <td className="py-3.5 px-3 text-neutral-200">
                          {k.keyName}
                          {k.status === 'Revoked' && (
                            <span className="ml-2 bg-neutral-900 text-neutral-500 text-[8px] font-bold px-1.5 py-0.5 rounded border border-neutral-800">REVOKED</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-[10px] text-neutral-400">
                          <div className="flex items-center gap-1.5">
                            <span>{k.token}</span>
                            <button 
                              onClick={() => handleCopyToken(k.id, k.token)}
                              className="text-neutral-500 hover:text-white transition-colors focus:outline-none"
                            >
                              {copiedKeyId === k.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-neutral-400 text-[10px]">{k.role}</td>
                        <td className="py-3.5 px-3 text-neutral-400">{new Date(k.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="py-3.5 px-3 text-neutral-400">
                          {k.lastUsedAt ? `${Math.floor((Date.now() - new Date(k.lastUsedAt).getTime()) / 60000)} mins ago` : 'Never'}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          {k.status === 'Active' ? (
                            <button 
                              onClick={() => handleRevokeKey(k.id)}
                              className="text-red-500 hover:text-red-400 font-bold text-[10px] uppercase transition-colors focus:outline-none"
                            >
                              Revoke
                            </button>
                          ) : (
                            <button 
                              onClick={() => alert("Key is already revoked")}
                              className="text-neutral-600 font-bold text-[10px] uppercase focus:outline-none cursor-not-allowed"
                            >
                              Revoked
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {keys.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-neutral-600 uppercase font-black tracking-widest text-[9px]">
                          No API Keys Configured
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Connected Integrations Card */}
            <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Connected Integrations</h3>
                  <p className="text-[10px] text-neutral-500 mt-1">Third-party services connected to OOURAA for ingestion and SOAR actions.</p>
                </div>
                <button 
                  onClick={() => setIsIntegrationModalOpen(true)}
                  className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 transition-colors focus:outline-none"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Integration
                </button>
              </div>

              {/* Integrations Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {integrations.map(int => (
                  <div key={int.id} className="bg-[#050505]/40 border border-neutral-850 rounded-xl p-4 flex flex-col justify-between h-[150px] shadow-sm hover:border-neutral-700 transition-all">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center font-black text-[#FF5A1F] text-xs">
                          {int.logoLetter}
                        </div>
                        <h4 className="text-xs font-bold text-white tracking-tight">{int.name}</h4>
                      </div>
                      <p className="text-[10px] text-neutral-500 leading-normal mt-2.5 font-semibold">
                        {int.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-neutral-900/60 pt-2.5 mt-2.5 text-[10px] font-bold">
                      <button 
                        onClick={() => handleToggleIntegration(int.id)}
                        className="flex items-center gap-1.5 focus:outline-none"
                      >
                        <span className={clsx(
                          "w-1.5 h-1.5 rounded-full inline-block",
                          int.status === 'Connected' ? "bg-emerald-400" : "bg-neutral-600"
                        )} />
                        <span className={clsx(
                          "text-[10px] uppercase font-bold tracking-wider",
                          int.status === 'Connected' ? "text-emerald-400 hover:text-emerald-500" : "text-neutral-500 hover:text-neutral-400"
                        )}>
                          {int.status}
                        </span>
                      </button>
                      <button 
                        onClick={() => alert("Configuration settings options")}
                        className="text-neutral-500 hover:text-white transition-colors focus:outline-none text-[9px] uppercase"
                      >
                        Configure
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Tab 2: Integrations (alternative grid view if they click integrations tab) */}
        {activeTab === 'Integrations' && (
          <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm text-center py-16">
            <Layers className="w-12 h-12 text-neutral-600 mx-auto mb-4 animate-pulse" />
            <h3 className="text-sm font-bold text-white">Full Ingestion Integrations</h3>
            <p className="text-[11px] text-neutral-500 max-w-sm mx-auto mt-2">Manage the complete configurations, API rate boundaries, and pipeline ingest metrics of active toolkits.</p>
            <button 
              onClick={() => setActiveTab('API Keys')}
              className="mt-6 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
            >
              Back to Key Controls
            </button>
          </div>
        )}

      </main>

      {/* Generate API Key Modal */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-neutral-900">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Generate API Access Key</h3>
              <button 
                onClick={() => setIsKeyModalOpen(false)}
                className="text-neutral-500 hover:text-white transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleGenerateKey} className="p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Key Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Jenkins CI/CD Deployer"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Access Role</label>
                <select 
                  value={newKeyRole}
                  onChange={(e) => setNewKeyRole(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                >
                  <option value="API Read/Write">API Read/Write</option>
                  <option value="Data Ingest Only">Data Ingest Only</option>
                  <option value="API Read Only">API Read Only</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-900 mt-4">
                <button 
                  type="button"
                  onClick={() => setIsKeyModalOpen(false)}
                  className="border border-neutral-800 bg-[#0C0C0D] hover:bg-neutral-800 text-neutral-400 hover:text-white font-bold px-4 py-2 rounded-xl focus:outline-none"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl focus:outline-none"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Integration Modal */}
      {isIntegrationModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-neutral-900">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Connect Custom Integration</h3>
              <button 
                onClick={() => setIsIntegrationModalOpen(false)}
                className="text-neutral-500 hover:text-white transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddIntegration} className="p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Service Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. SentinelOne EDR"
                  value={newIntName}
                  onChange={(e) => setNewIntName(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Description</label>
                <textarea 
                  required
                  rows={3}
                  placeholder="e.g. Falcon EDR agent telemetry ingestion and quarantined action logs."
                  value={newIntDesc}
                  onChange={(e) => setNewIntDesc(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-500 font-bold uppercase tracking-wider block">Logo Letter (optional)</label>
                <input 
                  type="text" 
                  maxLength={2}
                  placeholder="e.g. S1"
                  value={newIntLogo}
                  onChange={(e) => setNewIntLogo(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder:text-neutral-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-900 mt-4">
                <button 
                  type="button"
                  onClick={() => setIsIntegrationModalOpen(false)}
                  className="border border-neutral-800 bg-[#0C0C0D] hover:bg-neutral-800 text-neutral-400 hover:text-white font-bold px-4 py-2 rounded-xl focus:outline-none"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl focus:outline-none"
                >
                  Connect Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
