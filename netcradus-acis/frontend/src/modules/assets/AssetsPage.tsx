import React, { useState, useEffect, useMemo } from 'react'
import { Monitor, UserCircle2, Server, Laptop, Network, Cloud, Cpu, Plus, RefreshCw, Search, ShieldCheck, Database, HardDrive, Smartphone, X, AlertTriangle, ShieldAlert } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import { clsx } from 'clsx'

interface Asset {
  id: string
  name: string
  ipAddress: string
  macAddress: string
  type: string
  status: string
  owner: string
  location: string
  os: string
  health: string
  isolationStatus: boolean
  criticality: string
  tags: string | null
  createdAt: string
  updatedAt: string
}

const assetIdentities: Record<string, { username: string, role: string, lastActive: string, flagged?: boolean }[]> = {
  "dc-prod-01": [
    { username: "it-admin", role: "Domain Admin", lastActive: "2h ago" },
    { username: "j.singh", role: "User", lastActive: "15m ago", flagged: true },
    { username: "a.sharma", role: "User", lastActive: "1d ago" }
  ],
  "fw-edge-01": [
    { username: "netops", role: "Network Ops", lastActive: "5m ago" },
    { username: "it-admin", role: "Domain Admin", lastActive: "1d ago" }
  ],
  "laptop-332": [
    { username: "a.sharma", role: "User", lastActive: "8m ago" }
  ],
  "srv-erp-02": [
    { username: "sap-admin", role: "SAP Admin", lastActive: "12m ago" },
    { username: "it-admin", role: "Domain Admin", lastActive: "2h ago" }
  ],
  "api-gw-prod": [
    { username: "devops", role: "Cloud Administrator", lastActive: "1m ago" }
  ],
  "workstation-114": [
    { username: "j.singh", role: "User", lastActive: "22m ago", flagged: true }
  ]
}

const assetAlerts: Record<string, { title: string, severity: string, time: string }[]> = {
  "dc-prod-01": [
    { title: "Excessive 401 failures", severity: "High", time: "12m ago" },
    { title: "Suspicious PowerShell", severity: "High", time: "31m ago" }
  ],
  "fw-edge-01": [
    { title: "Beaconing to rare domain cdn-x7.io", severity: "High", time: "5m ago" }
  ],
  "laptop-332": [
    { title: "ASR Rule Bypass Detected", severity: "Medium", time: "8m ago" }
  ],
  "workstation-114": [
    { title: "ASR Rule Bypass Detected", severity: "Medium", time: "22m ago" }
  ]
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form states for Registering Node
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('SERVER')
  const [newOwner, setNewOwner] = useState('')
  const [newIp, setNewIp] = useState('')
  const [newOs, setNewOs] = useState('')
  const [newCriticality, setNewCriticality] = useState('HIGH')
  const [newTags, setNewTags] = useState('')

  const fetchAssets = async () => {
    setIsLoading(true)
    try {
      const response = await apiClient.get('/api/assets')
      setAssets(response.data)
      
      // Auto-select first asset
      if (response.data.length > 0 && !selectedAssetId) {
        setSelectedAssetId(response.data[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch assets:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAssets()
  }, [])

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        name: newName,
        type: newType,
        owner: newOwner,
        ipAddress: newIp,
        os: newOs,
        status: 'ACTIVE',
        health: 'OK',
        criticality: newCriticality,
        tags: newTags,
        macAddress: '00:1A:2B:3C:4D:' + Math.floor(10 + Math.random() * 89)
      }
      await apiClient.post('/api/assets', payload)
      
      // Reset form
      setNewName('')
      setNewType('SERVER')
      setNewOwner('')
      setNewIp('')
      setNewOs('')
      setNewCriticality('HIGH')
      setNewTags('')
      setIsModalOpen(false)

      fetchAssets()
    } catch (e) {
      console.error('Failed to create asset:', e)
    }
  }

  const handleIsolateToggle = async (asset: Asset) => {
    try {
      const newIsolated = !asset.isolationStatus
      const newStatus = newIsolated ? 'QUARANTINED' : 'ACTIVE'
      
      await apiClient.put(`/api/assets/${asset.id}/status`, {
        isolated: newIsolated,
        status: newStatus,
        health: newIsolated ? 'CRITICAL' : 'OK'
      })

      setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isolationStatus: newIsolated, status: newIsolated ? 'INACTIVE' : 'ACTIVE', health: newIsolated ? 'CRITICAL' : 'OK' } : a))
    } catch (e) {
      console.error('Failed to isolate asset:', e)
    }
  }

  const filteredAssets = useMemo(() => {
    return assets.filter(a => 
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.tags && a.tags.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  }, [assets, searchTerm])

  const selectedAsset = assets.find(a => a.id === selectedAssetId)

  // Stats Card Calculations
  const totalAssetsCount = assets.length
  const highCriticalityCount = assets.filter(a => a.criticality === 'HIGH').length
  const quarantinedCount = assets.filter(a => a.status === 'INACTIVE' || a.isolationStatus).length
  const identityConflictsCount = 5 // Static default representation

  const getCriticalityBadge = (crit: string) => {
    const c = crit?.toUpperCase() || 'MEDIUM'
    if (c === 'HIGH') return 'bg-orange-500/10 text-accent border border-orange-500/20 px-2 py-0.5 rounded text-[10px] font-bold'
    if (c === 'MEDIUM') return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded text-[10px] font-bold'
    return 'bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-bold'
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'SERVER': return <Server className="w-3.5 h-3.5" />
      case 'WORKSTATION': return <Laptop className="w-3.5 h-3.5" />
      case 'NETWORK_DEVICE': return <Network className="w-3.5 h-3.5" />
      case 'CLOUD_INSTANCE': return <Cloud className="w-3.5 h-3.5" />
      default: return <Monitor className="w-3.5 h-3.5" />
    }
  }

  const getTagsList = (tagsStr: string | null) => {
    if (!tagsStr) return []
    return tagsStr.split(',').map(t => t.trim())
  }

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full bg-background text-text-secondary p-6 min-h-screen">
      
      {/* Search Header */}
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <h1 className="text-xl font-bold text-text-primary tracking-tight uppercase">Assets & Identities</h1>
        <div className="relative w-80 bg-surface-2 border border-fire-border rounded-xl overflow-hidden">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input 
            type="text" 
            placeholder="Search Kiro AI..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent pl-10 pr-4 py-2 text-xs placeholder:text-text-muted text-text-primary focus:outline-none focus:border-fire-border"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Assets', value: totalAssetsCount, border: 'border-fire-border' },
          { label: 'High Criticality', value: highCriticalityCount, border: 'border-l-4 border-l-orange-500' },
          { label: 'Quarantined', value: quarantinedCount, border: 'border-l-4 border-l-yellow-500' },
          { label: 'Identity Conflicts', value: identityConflictsCount, border: 'border-l-4 border-l-purple-500' }
        ].map((stat, i) => (
          <div key={i} className={clsx("bg-surface-2 border border-fire-border rounded-lg p-5 flex flex-col justify-between h-24 shadow-sm", stat.border)}>
            <span className="text-3xl font-bold text-text-primary tracking-tight leading-none">{stat.value}</span>
            <span className="text-[10px] text-text-muted font-semibold tracking-wider uppercase mt-2">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        
        {/* Left Table Section */}
        <div className={clsx(
          "bg-surface-2 border border-fire-border rounded-xl p-5 shadow-sm space-y-4 transition-all duration-300",
          selectedAsset ? "md:col-span-8" : "md:col-span-12"
        )}>
          <div className="flex items-center justify-between border-b border-fire-border pb-3">
            <div>
              <h2 className="text-sm font-bold text-text-primary tracking-tight leading-none uppercase">Assets & Identities</h2>
              <p className="text-[10px] text-text-muted mt-1 uppercase tracking-wider">CMDB-like view • criticality • identity stitching</p>
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-accent hover:bg-accent-dark text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors focus:outline-none"
            >
              <Plus className="w-3.5 h-3.5" /> Add Asset
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-fire-border text-text-muted font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 w-[25%]">Asset</th>
                  <th className="py-3 px-4 w-[15%]">Type</th>
                  <th className="py-3 px-4 w-[15%]">Owner</th>
                  <th className="py-3 px-4 w-[12%]">Criticality</th>
                  <th className="py-3 px-4 w-[23%]">Tags</th>
                  <th className="py-3 px-4 w-[10%]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fire-border/60">
                {filteredAssets.map(asset => (
                  <tr 
                    key={asset.id}
                    onClick={() => setSelectedAssetId(asset.id)}
                    className={clsx(
                      "hover:bg-surface-3 cursor-pointer transition-colors duration-150",
                      selectedAssetId === asset.id ? "bg-surface-3" : ""
                    )}
                  >
                    <td className="py-4 px-4 font-bold text-accent/90 flex items-center gap-2">
                      {getTypeIcon(asset.type)}
                      {asset.name}
                    </td>
                    <td className="py-4 px-4 text-text-secondary font-semibold uppercase tracking-wider text-[10px]">
                      {asset.type}
                    </td>
                    <td className="py-4 px-4 text-text-secondary font-semibold">
                      {asset.owner}
                    </td>
                    <td className="py-4 px-4">
                      <span className={getCriticalityBadge(asset.criticality)}>
                        {asset.criticality}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {getTagsList(asset.tags).map(t => (
                          <span key={t} className="bg-surface-3 border border-fire-border text-text-secondary font-semibold px-2 py-0.5 rounded text-[9px] lowercase tracking-wide">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={clsx(
                        "w-2 h-2 rounded-full inline-block",
                        asset.status === 'INACTIVE' ? "bg-red-500" : "bg-emerald-400"
                      )} />
                    </td>
                  </tr>
                ))}
                {filteredAssets.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-text-muted uppercase font-black tracking-widest text-[10px]">
                      No discovered assets in this environment
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Detail Drawer */}
        {selectedAsset && (
          <div className="md:col-span-4 bg-surface-2 border border-fire-border rounded-xl p-5 flex flex-col justify-between shadow-sm space-y-6 animate-slide-in">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-fire-border pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-text-primary">{selectedAsset.name}</h3>
                  <span className={getCriticalityBadge(selectedAsset.criticality)}>
                    {selectedAsset.criticality}
                  </span>
                  <span className="bg-surface-3/80 text-text-secondary px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                    {selectedAsset.type}
                  </span>
                </div>
                <button 
                  onClick={() => setSelectedAssetId(null)}
                  className="text-text-muted hover:text-text-primary transition-colors focus:outline-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Profile Details */}
              <div className="mt-4 space-y-3 text-xs">
                <span className="text-[9px] text-text-muted font-black uppercase tracking-wider block border-b border-fire-border pb-1">Asset Profile</span>
                <div className="grid grid-cols-3 gap-y-2">
                  <span className="text-text-muted font-semibold">Owner:</span>
                  <span className="col-span-2 text-text-secondary font-bold font-mono">{selectedAsset.owner}@kiro.ai</span>

                  <span className="text-text-muted font-semibold">IP Address:</span>
                  <span className="col-span-2 text-text-secondary font-bold font-mono">{selectedAsset.ipAddress}</span>

                  <span className="text-text-muted font-semibold">OS:</span>
                  <span className="col-span-2 text-text-secondary font-bold">{selectedAsset.os || '—'}</span>

                  <span className="text-text-muted font-semibold">Last Seen:</span>
                  <span className="col-span-2 text-text-secondary font-mono text-[11px]">{new Date(selectedAsset.createdAt).toUTCString()}</span>
                </div>
              </div>

              {/* Identity Stitching */}
              <div className="mt-6 space-y-3">
                <div>
                  <span className="text-[9px] text-text-muted font-black uppercase tracking-wider block">Identity Stitching</span>
                  <p className="text-[10px] text-text-muted mt-0.5 font-medium leading-none">Users with access to this asset</p>
                </div>
                <div className="space-y-2">
                  {(assetIdentities[selectedAsset.name] || [
                    { username: selectedAsset.owner, role: "Owner", lastActive: "Just now" }
                  ]).map((user, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-surface p-3 rounded-lg border border-fire-border">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-surface-3 border border-fire-border text-[10px] font-black uppercase tracking-tighter text-accent flex items-center justify-center">
                          {user.username.slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-text-secondary">{user.username}</span>
                            {user.flagged && (
                              <span className="text-[8px] bg-red-500/10 text-red-500 border border-red-500/20 px-1 rounded font-black uppercase tracking-wider flex items-center gap-1">
                                <ShieldAlert className="w-2.5 h-2.5" /> Flagged
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] text-text-muted font-medium">{user.role}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-text-muted font-mono font-semibold">{user.lastActive}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Open Alerts */}
              <div className="mt-6 space-y-3">
                <span className="text-[9px] text-text-muted font-black uppercase tracking-wider block">Open Alerts</span>
                <div className="space-y-2">
                  {(assetAlerts[selectedAsset.name] || []).map((alert, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-red-950/5 border border-red-900/10 p-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="bg-red-500/10 text-red-500 border border-red-500/25 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">
                          {alert.severity}
                        </span>
                        <span className="text-xs font-bold text-text-secondary">{alert.title}</span>
                      </div>
                      <span className="text-[10px] text-text-muted font-mono font-semibold">{alert.time}</span>
                    </div>
                  ))}
                  {(!assetAlerts[selectedAsset.name] || assetAlerts[selectedAsset.name].length === 0) && (
                    <div className="flex items-center gap-2 bg-emerald-950/5 border border-emerald-900/10 p-3 rounded-lg text-emerald-400 font-bold text-xs">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      No open security alerts detected
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-fire-border pt-4 space-y-2">
              <span className="text-[9px] text-text-muted font-black uppercase tracking-wider block">CMDB Node Actions</span>
              <button 
                onClick={() => handleIsolateToggle(selectedAsset)}
                className={clsx(
                  "w-full py-2.5 rounded-xl text-xs font-bold transition-all focus:outline-none border flex items-center justify-center gap-1.5",
                  selectedAsset.isolationStatus 
                    ? "bg-accent text-white border-transparent hover:bg-accent-dark" 
                    : "border-fire-border bg-surface-3/40 hover:bg-surface-3 text-text-secondary"
                )}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {selectedAsset.isolationStatus ? 'Isolated (Re-instate Node)' : 'Isolate Asset'}
              </button>
            </div>

          </div>
        )}

      </div>

      {/* Register Node Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-2 border border-fire-border rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-fire-border">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Register Corporate Node</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-text-primary transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAsset} className="p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-text-muted font-bold uppercase tracking-wider block">Node Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. dc-prod-02"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-fire-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-text-muted font-bold uppercase tracking-wider block">Node Type</label>
                  <select 
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-fire-border"
                  >
                    <option value="SERVER">SERVER</option>
                    <option value="WORKSTATION">WORKSTATION</option>
                    <option value="NETWORK_DEVICE">NETWORK</option>
                    <option value="CLOUD_INSTANCE">CLOUD</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-text-muted font-bold uppercase tracking-wider block">Criticality</label>
                  <select 
                    value={newCriticality}
                    onChange={(e) => setNewCriticality(e.target.value)}
                    className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-fire-border"
                  >
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-text-muted font-bold uppercase tracking-wider block">Custodian Owner Username</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. it-admin"
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-fire-border"
                />
              </div>

              <div className="space-y-1">
                <label className="text-text-muted font-bold uppercase tracking-wider block">IP Address (bound)</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. 192.168.1.102"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-fire-border"
                />
              </div>

              <div className="space-y-1">
                <label className="text-text-muted font-bold uppercase tracking-wider block">Operating System</label>
                <input 
                  type="text" 
                  placeholder="e.g. Windows Server 2022"
                  value={newOs}
                  onChange={(e) => setNewOs(e.target.value)}
                  className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-fire-border"
                />
              </div>

              <div className="space-y-1">
                <label className="text-text-muted font-bold uppercase tracking-wider block">Tags (comma-separated)</label>
                <input 
                  type="text" 
                  placeholder="e.g. windows,prod,domain-controller"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full bg-surface border border-fire-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-fire-border"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-fire-border mt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="border border-fire-border bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary font-bold px-4 py-2 rounded-xl focus:outline-none transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-accent hover:bg-accent-dark text-white font-bold px-4 py-2 rounded-xl focus:outline-none transition-colors"
                >
                  Register Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
