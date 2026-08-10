import React, { useState, useEffect, useMemo } from 'react'
import { Monitor, UserCircle2, Server, Laptop, Network, Cloud, Cpu, Plus, RefreshCw, Search, ShieldCheck, Database, HardDrive, Smartphone, X, AlertTriangle, ShieldAlert, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import { usePivotSeed, useEntityPivot } from '@/hooks/useEntityPivot'
import SeverityBadge, { toSeverity } from '@/components/viz/SeverityBadge'
import PivotChip from '@/components/ui/PivotChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
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

interface IdentityView {
  id: string
  assetId: string
  username: string
  role: string | null
  lastActive: string
  flagged: boolean
}

interface RealAlert {
  id: string
  title: string
  severity: string
  status: string
  rawEvent: string | null
  createdAt: string
}

/** Best-effort real correlation from real alert data — an asset "has" an
 * alert if the asset's own IP shows up in the alert's parsed raw event, or
 * the asset's name is mentioned in the alert title. Replaces a hardcoded
 * map keyed by 4 specific asset names that every other asset silently
 * showed a fake "no alerts" reassurance for. */
function alertsForAsset(asset: Asset, alerts: RealAlert[]): RealAlert[] {
  return alerts.filter(a => {
    if (a.status === 'MITIGATED' || a.status === 'CLOSED') return false
    if (a.title.toLowerCase().includes(asset.name.toLowerCase())) return true
    if (!a.rawEvent) return false
    try {
      const parsed = JSON.parse(a.rawEvent)
      const haystack = [parsed.src_ip, parsed.target, parsed.destination].filter(Boolean).join(' ')
      return asset.ipAddress && haystack.includes(asset.ipAddress)
    } catch {
      return false
    }
  })
}

export default function AssetsPage() {
  const canWrite = useCanWrite(MODULES.ASSETS_THREAT_INTEL)
  const [assets, setAssets] = useState<Asset[]>([])
  const [identities, setIdentities] = useState<IdentityView[]>([])
  const [alerts, setAlerts] = useState<RealAlert[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { pivotTo } = useEntityPivot()

  // Real pivot target — arriving from Alerts/Log Explorer with an IP or
  // asset-name value seeds the search box (which already matches ipAddress,
  // see filteredAssets below) instead of requiring a manual copy-paste.
  const pivotSeed = usePivotSeed()
  useEffect(() => {
    if (pivotSeed?.type === 'ip' || pivotSeed?.type === 'asset' || pivotSeed?.type === 'host') {
      setSearchTerm(pivotSeed.value)
    }
  }, [pivotSeed])

  // Real column sort — this table previously had none at all.
  const [sortKey, setSortKey] = useState<'name' | 'owner' | 'criticality'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const toggleSort = (key: 'name' | 'owner' | 'criticality') => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Isolating (or re-instating) an asset is a real, consequential network
  // action — previously fired the instant the button was clicked with no
  // confirmation at all.
  const [confirmingIsolateAsset, setConfirmingIsolateAsset] = useState<Asset | null>(null)
  const [isolateBusy, setIsolateBusy] = useState(false)

  // Form states for Registering Node
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('SERVER')
  const [newOwner, setNewOwner] = useState('')
  const [newIp, setNewIp] = useState('')
  const [newMac, setNewMac] = useState('')
  const [newOs, setNewOs] = useState('')
  const [newCriticality, setNewCriticality] = useState('HIGH')
  const [newTags, setNewTags] = useState('')

  // Form state for adding an identity to the selected asset
  const [newIdentityUsername, setNewIdentityUsername] = useState('')
  const [newIdentityRole, setNewIdentityRole] = useState('')

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

  const fetchIdentities = async () => {
    try {
      const response = await apiClient.get('/api/assets/identities')
      setIdentities(response.data)
    } catch (error) {
      console.error('Failed to fetch identities:', error)
    }
  }

  const fetchAlerts = async () => {
    try {
      const response = await apiClient.get('/api/alerts')
      setAlerts(response.data)
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
    }
  }

  useEffect(() => {
    fetchAssets()
    fetchIdentities()
    fetchAlerts()
  }, [])

  const handleAddIdentity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAsset || !newIdentityUsername.trim()) return
    try {
      await apiClient.post('/api/assets/identities', {
        assetId: selectedAsset.id,
        username: newIdentityUsername.trim(),
        role: newIdentityRole.trim() || null
      })
      setNewIdentityUsername('')
      setNewIdentityRole('')
      fetchIdentities()
    } catch (e) {
      console.error('Failed to add identity:', e)
    }
  }

  const handleDeleteIdentity = async (identityId: string) => {
    try {
      await apiClient.delete(`/api/assets/identities/${identityId}`)
      setIdentities(prev => prev.filter(i => i.id !== identityId))
    } catch (e) {
      console.error('Failed to delete identity:', e)
    }
  }

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
        macAddress: newMac.trim() || null
      }
      await apiClient.post('/api/assets', payload)

      // Reset form
      setNewName('')
      setNewType('SERVER')
      setNewOwner('')
      setNewIp('')
      setNewMac('')
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
    setIsolateBusy(true)
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
    } finally {
      setIsolateBusy(false)
      setConfirmingIsolateAsset(null)
    }
  }

  const filteredAssets = useMemo(() => {
    const q = searchTerm.toLowerCase()
    const filtered = assets.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.owner.toLowerCase().includes(q) ||
      (a.ipAddress && a.ipAddress.toLowerCase().includes(q)) ||
      (a.tags && a.tags.toLowerCase().includes(q))
    )
    const CRITICALITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortKey === 'owner') cmp = a.owner.localeCompare(b.owner)
      else cmp = (CRITICALITY_RANK[a.criticality?.toUpperCase()] ?? 0) - (CRITICALITY_RANK[b.criticality?.toUpperCase()] ?? 0)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [assets, searchTerm, sortKey, sortDir])

  const selectedAsset = assets.find(a => a.id === selectedAssetId)

  // Stats Card Calculations
  const totalAssetsCount = assets.length
  const highCriticalityCount = assets.filter(a => a.criticality === 'HIGH').length
  const quarantinedCount = assets.filter(a => a.status === 'INACTIVE' || a.isolationStatus).length
  const identityConflictsCount = identities.filter(i => i.flagged).length

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

  const SortHeader = ({ label, sortKeyName, className }: { label: string; sortKeyName: 'name' | 'owner' | 'criticality'; className?: string }) => (
    <th className={className}>
      <button
        type="button"
        onClick={() => toggleSort(sortKeyName)}
        className="inline-flex items-center gap-1 hover:text-text-primary transition-colors"
      >
        {label}
        {sortKey === sortKeyName ? (
          sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </th>
  )

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full text-text-secondary min-h-screen">

      {/* Search Header */}
      <div className="flex items-center justify-between border-b border-fire-border pb-4">
        <h1 className="text-h1 text-text-primary">Assets & Identities</h1>
        <div className="relative w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search assets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Assets', value: totalAssetsCount, border: 'border-fire-border' },
          { label: 'High Criticality', value: highCriticalityCount, border: 'border-l-4 border-l-severity-high' },
          { label: 'Quarantined', value: quarantinedCount, border: 'border-l-4 border-l-severity-medium' },
          { label: 'Identity Conflicts', value: identityConflictsCount, border: 'border-l-4 border-l-accent-pa' }
        ].map((stat, i) => (
          <div key={i} className={clsx("bg-surface-2 border border-fire-border rounded-lg p-5 flex flex-col justify-between h-24 shadow-sm", stat.border)}>
            <span className="text-h1 text-text-primary leading-none">{stat.value}</span>
            <span className="text-label text-text-muted uppercase mt-2">{stat.label}</span>
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
              <h2 className="text-h3 text-text-primary">Assets & Identities</h2>
              <p className="text-label text-text-muted mt-1 uppercase">CMDB-like view • criticality • identity stitching</p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!canWrite}
              title={!canWrite ? "Your role doesn't have write access to Assets & Threat Intel" : undefined}
              className="btn-fire text-small py-2 px-4 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Add Asset
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="table-enterprise">
              <thead>
                <tr>
                  <SortHeader label="Asset" sortKeyName="name" className="w-[25%]" />
                  <th className="w-[15%]">Type</th>
                  <SortHeader label="Owner" sortKeyName="owner" className="w-[15%]" />
                  <SortHeader label="Criticality" sortKeyName="criticality" className="w-[12%]" />
                  <th className="w-[23%]">Tags</th>
                  <th className="w-[10%]">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map(asset => (
                  <tr
                    key={asset.id}
                    onClick={() => setSelectedAssetId(asset.id)}
                    className={clsx(
                      "cursor-pointer",
                      selectedAssetId === asset.id ? "bg-surface-3" : ""
                    )}
                  >
                    <td className="font-semibold text-accent flex items-center gap-2">
                      {getTypeIcon(asset.type)}
                      {asset.name}
                    </td>
                    <td className="text-text-secondary text-label uppercase">
                      {asset.type}
                    </td>
                    <td className="text-text-secondary">
                      {asset.owner}
                    </td>
                    <td>
                      <SeverityBadge severity={toSeverity(asset.criticality)} label={asset.criticality} />
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {getTagsList(asset.tags).map(t => (
                          <span key={t} className="bg-surface-3 border border-fire-border text-text-secondary font-medium px-2 py-0.5 rounded text-label lowercase">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={clsx(
                        "w-2 h-2 rounded-full inline-block",
                        asset.status === 'INACTIVE' ? "bg-danger" : "bg-success"
                      )} />
                    </td>
                  </tr>
                ))}
                {filteredAssets.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-text-muted text-label uppercase">
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
                  <h3 className="text-h3 text-text-primary">{selectedAsset.name}</h3>
                  <SeverityBadge severity={toSeverity(selectedAsset.criticality)} label={selectedAsset.criticality} />
                  <span className="bg-surface-3 text-text-secondary px-2 py-0.5 rounded text-label uppercase">
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
              <div className="mt-4 space-y-3 text-small">
                <span className="text-label text-text-muted uppercase block border-b border-fire-border pb-1">Asset Profile</span>
                <div className="grid grid-cols-3 gap-y-2">
                  <span className="text-text-muted font-medium">Owner:</span>
                  <span className="col-span-2 text-text-secondary font-semibold font-mono">{selectedAsset.owner}@netcradus.local</span>

                  <span className="text-text-muted font-medium">IP Address:</span>
                  <span className="col-span-2 font-semibold">
                    {selectedAsset.ipAddress ? (
                      <PivotChip type="ip" value={selectedAsset.ipAddress} route="/dashboard/logs" className="text-text-secondary" />
                    ) : (
                      <span className="text-text-secondary font-mono">—</span>
                    )}
                  </span>

                  <span className="text-text-muted font-medium">OS:</span>
                  <span className="col-span-2 text-text-secondary font-semibold">{selectedAsset.os || '—'}</span>

                  <span className="text-text-muted font-medium">Last Seen:</span>
                  <span className="col-span-2 text-text-secondary font-mono text-label">{new Date(selectedAsset.createdAt).toUTCString()}</span>
                </div>
              </div>

              {/* Identity Stitching */}
              <div className="mt-6 space-y-3">
                <div>
                  <span className="text-label text-text-muted uppercase block">Identity Stitching</span>
                  <p className="text-label text-text-muted mt-0.5 normal-case leading-none">Users with access to this asset</p>
                </div>
                <div className="space-y-2">
                  {identities.filter(i => i.assetId === selectedAsset.id).map((user) => (
                    <div key={user.id} className="flex items-center justify-between bg-surface p-3 rounded-lg border border-fire-border group">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-surface-3 border border-fire-border text-label uppercase text-accent flex items-center justify-center">
                          {user.username.slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-small font-semibold text-text-secondary">{user.username}</span>
                            {user.flagged && (
                              <span className="text-label bg-danger/10 text-danger border border-danger/20 px-1 rounded uppercase flex items-center gap-1">
                                <ShieldAlert className="w-2.5 h-2.5" /> Flagged
                              </span>
                            )}
                          </div>
                          <span className="text-label text-text-muted normal-case">{user.role || '—'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-label text-text-muted font-mono">{new Date(user.lastActive).toLocaleDateString()}</span>
                        {canWrite && (
                          <button
                            onClick={() => handleDeleteIdentity(user.id)}
                            className="text-text-muted hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {identities.filter(i => i.assetId === selectedAsset.id).length === 0 && (
                    <div className="text-small text-text-muted bg-surface p-3 rounded-lg border border-fire-border">
                      No identities registered for this asset.
                    </div>
                  )}
                </div>
                {canWrite && (
                  <form onSubmit={handleAddIdentity} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Username"
                      value={newIdentityUsername}
                      onChange={(e) => setNewIdentityUsername(e.target.value)}
                      className="input-field text-small py-1.5 flex-1"
                    />
                    <input
                      type="text"
                      placeholder="Role"
                      value={newIdentityRole}
                      onChange={(e) => setNewIdentityRole(e.target.value)}
                      className="input-field text-small py-1.5 flex-1"
                    />
                    <button type="submit" className="btn-mission text-small py-1.5 px-3">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </form>
                )}
              </div>

              {/* Open Alerts */}
              <div className="mt-6 space-y-3">
                <span className="text-label text-text-muted uppercase block">Open Alerts</span>
                <div className="space-y-2">
                  {alertsForAsset(selectedAsset, alerts).map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between bg-danger/5 border border-danger/10 p-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={toSeverity(alert.severity)} label={alert.severity} size="sm" />
                        <span className="text-small font-semibold text-text-secondary">{alert.title}</span>
                      </div>
                      <span className="text-label text-text-muted font-mono">{new Date(alert.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                  {alertsForAsset(selectedAsset, alerts).length === 0 && (
                    <div className="flex items-center gap-2 bg-success/5 border border-success/10 p-3 rounded-lg text-success font-semibold text-small">
                      <ShieldCheck className="w-4 h-4 text-success" />
                      No open security alerts detected
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-fire-border pt-4 space-y-2">
              <span className="text-label text-text-muted uppercase block">CMDB Node Actions</span>
              <button
                onClick={() => setConfirmingIsolateAsset(selectedAsset)}
                disabled={!canWrite}
                title={!canWrite ? "Your role doesn't have write access to Assets & Threat Intel" : undefined}
                className={clsx(
                  "w-full py-2.5 text-small flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed",
                  selectedAsset.isolationStatus ? "btn-fire" : "btn-mission"
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
          <div className="bg-surface border border-fire-border rounded-xl w-full max-w-md overflow-hidden shadow-card animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-fire-border">
              <h3 className="text-h3 text-text-primary">Register Corporate Node</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-text-primary transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAsset} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Node Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. dc-prod-02"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-label text-text-muted uppercase block">Node Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="input-field"
                  >
                    <option value="SERVER">SERVER</option>
                    <option value="WORKSTATION">WORKSTATION</option>
                    <option value="NETWORK_DEVICE">NETWORK</option>
                    <option value="CLOUD_INSTANCE">CLOUD</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-label text-text-muted uppercase block">Criticality</label>
                  <select
                    value={newCriticality}
                    onChange={(e) => setNewCriticality(e.target.value)}
                    className="input-field"
                  >
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Custodian Owner Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. it-admin"
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">IP Address (bound)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 192.168.1.102"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">MAC Address (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 00:1A:2B:3C:4D:5E"
                  value={newMac}
                  onChange={(e) => setNewMac(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Operating System</label>
                <input
                  type="text"
                  placeholder="e.g. Windows Server 2022"
                  value={newOs}
                  onChange={(e) => setNewOs(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Tags (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. windows,prod,domain-controller"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-fire-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-mission py-2 px-4 text-small"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-fire py-2 px-4 text-small"
                >
                  Register Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmingIsolateAsset !== null}
        title={confirmingIsolateAsset?.isolationStatus ? 'Re-instate this asset?' : 'Isolate this asset?'}
        message={
          confirmingIsolateAsset?.isolationStatus
            ? `${confirmingIsolateAsset?.name} will be reconnected to the network and its health reset to OK. Only do this once you've confirmed the threat is resolved.`
            : `${confirmingIsolateAsset?.name} will be quarantined and disconnected from the network — a real, immediate action, not a simulation.`
        }
        confirmLabel={confirmingIsolateAsset?.isolationStatus ? 'Re-instate' : 'Isolate Asset'}
        danger={!confirmingIsolateAsset?.isolationStatus}
        busy={isolateBusy}
        onConfirm={() => confirmingIsolateAsset && handleIsolateToggle(confirmingIsolateAsset)}
        onCancel={() => setConfirmingIsolateAsset(null)}
      />

    </div>
  )
}
