import React, { useState, useEffect, useMemo } from 'react'
import { Monitor, UserCircle2, Server, Laptop, Network, Cloud, Cpu, Plus, RefreshCw, Search, ShieldCheck, Database, HardDrive, Smartphone, X, AlertTriangle, ShieldAlert, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import { usePivotSeed, useEntityPivot } from '@/hooks/useEntityPivot'
import SeverityBadge, { toSeverity } from '@/components/viz/SeverityBadge'
import PivotChip from '@/components/ui/PivotChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import './AssetsPage.css'

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

  const pivotSeed = usePivotSeed()
  useEffect(() => {
    if (pivotSeed?.type === 'ip' || pivotSeed?.type === 'asset' || pivotSeed?.type === 'host') {
      setSearchTerm(pivotSeed.value)
    }
  }, [pivotSeed])

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

  // Top Asset Sources calculations
  const sources = useMemo(() => {
    let rules = 0, ad = 0, intel = 0, other = 0
    assets.forEach(a => {
      const type = (a.type || '').toUpperCase()
      if (type === 'SERVER') rules++
      else if (type === 'WORKSTATION') ad++
      else if (type === 'CLOUD_INSTANCE' || type === 'NETWORK_DEVICE') intel++
      else other++
    })
    const total = rules + ad + intel + other || 1
    const circ = 2 * Math.PI * 52 // ~326.72

    const rulesDash = (rules / total) * circ
    const adDash = (ad / total) * circ
    const intelDash = (intel / total) * circ
    const otherDash = (other / total) * circ

    return {
      circ,
      rules: { dash: rulesDash, offset: 0 },
      ad: { dash: adDash, offset: -rulesDash },
      intel: { dash: intelDash, offset: -(rulesDash + adDash) },
      other: { dash: otherDash, offset: -(rulesDash + adDash + intelDash) },
      rulesCount: rules,
      adCount: ad,
      intelCount: intel,
      otherCount: other
    }
  }, [assets])

  // Asset Criticality Breakdown — real current counts only, no fabricated history
  const critData = useMemo(() => {
    const critical = assets.filter(a => a.criticality === 'HIGH').length
    const high = assets.filter(a => a.criticality === 'MEDIUM').length
    const medium = assets.filter(a => a.criticality === 'LOW').length
    const low = assets.filter(a => a.status === 'INACTIVE').length
    return { critical, high, medium, low, max: Math.max(critical, high, medium, low, 1) }
  }, [assets])

  // Bottom row live asset tickers
  const tickerItems = useMemo(() => {
    return assets.slice(0, 3).map(a => ({
      name: a.name,
      owner: a.owner
    }))
  }, [assets])

  // Real flagged-identity feed
  const identityConflicts = useMemo(() => {
    return identities
      .filter(i => i.flagged)
      .slice(0, 5)
      .map(i => ({
        id: i.id,
        username: i.username,
        assetName: assets.find(a => a.id === i.assetId)?.name || 'Unknown asset',
      }))
  }, [identities, assets])

  const SortHeader = ({ label, sortKeyName, className }: { label: string; sortKeyName: 'name' | 'owner' | 'criticality'; className?: string }) => (
    <th className={className}>
      <button
        type="button"
        onClick={() => toggleSort(sortKeyName)}
        className="inline-flex items-center gap-1 hover:text-text-primary transition-colors text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {label}
        {sortKey === sortKeyName ? (
          sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-cyan" /> : <ArrowDown className="w-3 h-3 text-cyan" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </th>
  )

  return (
    <div className="assets-page">
      <div className="content">
        <div className="page-head">
          <h1>Assets &amp; Identities</h1>
          <div className="search-assets">
            <Search className="w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Search assets…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Stat Cards */}
        <div className="stat-row">
          <div className="stat-card">
            <div>
              <div className="v">{totalAssetsCount}</div>
              <div className="l">Total Assets</div>
            </div>
            <div className="stat-chart">
              <svg viewBox="0 0 70 30" width="70" height="28">
                <polyline points="0,22 12,18 24,20 36,10 48,14 60,4 70,6" fill="none" stroke="var(--cyan)" strokeWidth="2" />
              </svg>
              <span className="n">{totalAssetsCount}</span>
            </div>
          </div>

          <div className="stat-card">
            <div>
              <div className="v">{highCriticalityCount}</div>
              <div className="l">High Criticality</div>
            </div>
            <div className="stat-chart">
              <svg viewBox="0 0 70 30" width="70" height="28">
                <polyline points="0,15 12,20 24,10 36,18 48,8 60,16 70,12" fill="none" stroke="var(--cyan)" strokeWidth="2" />
              </svg>
              <span className="n">{highCriticalityCount}</span>
            </div>
          </div>

          <div className="stat-card">
            <div>
              <div className="v">{quarantinedCount}</div>
              <div className="l">Quarantined</div>
            </div>
            <div className="stat-chart">
              <svg viewBox="0 0 70 30" width="70" height="28">
                <polyline points="0,25 12,22 24,24 36,18 48,20 60,10 70,14" fill="none" stroke="var(--amber)" strokeWidth="2" />
              </svg>
              <span className="n">{quarantinedCount}</span>
            </div>
          </div>

          <div className="stat-card">
            <div>
              <div className="v">{identityConflictsCount}</div>
              <div className="l">Identity Conflicts</div>
            </div>
            <div className="stat-chart">
              <svg viewBox="0 0 70 30" width="70" height="28">
                <polyline points="0,20 12,16 24,18 36,8 48,12 60,4 70,10" fill="none" stroke="var(--cyan)" strokeWidth="2" />
              </svg>
              <span className="n">{identityConflictsCount}</span>
            </div>
          </div>
        </div>

        {/* Main Grid: Table & Details Drawer */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          
          {/* Main Table */}
          <div className={clsx(
            "table-panel transition-all duration-300",
            selectedAsset ? "md:col-span-8" : "md:col-span-12"
          )}>
            <div className="table-top">
              <div>
                <h3>Assets &amp; Identities</h3>
                <p>CMDB-Like View · Criticality · Identity Stitching</p>
              </div>
              <button
                className="add-btn"
                onClick={() => setIsModalOpen(true)}
                disabled={!canWrite}
              >
                + Add Asset
              </button>
            </div>

            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <SortHeader label="Asset" sortKeyName="name" className="w-[30%]" />
                    <th className="w-[15%]">Type</th>
                    <SortHeader label="Owner" sortKeyName="owner" className="w-[18%]" />
                    <SortHeader label="Criticality" sortKeyName="criticality" className="w-[12%]" />
                    <th className="w-[15%]">Tags</th>
                    <th className="w-[10%]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map(asset => {
                    const isSelected = selectedAssetId === asset.id
                    return (
                      <tr
                        key={asset.id}
                        onClick={() => setSelectedAssetId(asset.id)}
                        className={clsx(isSelected && "selected")}
                      >
                        <td className="type-icon font-semibold">
                          {getTypeIcon(asset.type)} {asset.name}
                        </td>
                        <td style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>{asset.type}</td>
                        <td className="owner-name font-mono">{asset.owner}</td>
                        <td>
                          <SeverityBadge severity={toSeverity(asset.criticality)} label={asset.criticality} size="sm" />
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {getTagsList(asset.tags).map(t => (
                              <span key={t} className="bg-input-bg border border-border-soft text-text-muted px-2 py-0.5 rounded text-[10px] font-medium lowercase">
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className="status-dot">
                            <span className={clsx(
                              "w-2 h-2 rounded-full inline-block",
                              asset.status === 'INACTIVE' ? "bg-red" : "bg-green"
                            )} />
                            {asset.status === 'INACTIVE' ? 'Quarantined' : 'Nominal'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {filteredAssets.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--dim)' }}>
                        No discovered assets in this environment
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Side: Asset Details Drawer */}
          {selectedAsset && (
            <div className="md:col-span-4 bottom-card flex flex-col justify-between space-y-5 animate-slide-in relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg, var(--cyan), var(--blue))', zIndex: 10 }} />
              <div>
                <div className="flex items-center justify-between border-b border-border-soft pb-3 pt-1">

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-h3 text-heading-color font-bold">{selectedAsset.name}</h3>
                    <SeverityBadge severity={toSeverity(selectedAsset.criticality)} label={selectedAsset.criticality} size="sm" />
                    <span className="bg-input-bg text-text-secondary px-2 py-0.5 rounded text-[10px] uppercase font-semibold">
                      {selectedAsset.type}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedAssetId(null)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <X className="w-4 h-4 text-text-muted hover:text-text-primary" />
                  </button>
                </div>

                {/* Details list */}
                <div className="mt-4 space-y-3 text-small">
                  <span className="text-label uppercase text-text-muted block border-b border-border-soft pb-1">Asset Profile</span>
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

                {/* Identity Stitching list */}
                <div className="mt-6 space-y-3">
                  <div>
                    <span className="text-label uppercase text-text-muted block">Identity Stitching</span>
                    <p className="text-[10px] text-text-muted mt-0.5 leading-none">Users registered with credentials to access node</p>
                  </div>
                  <div className="space-y-2">
                    {identities.filter(i => i.assetId === selectedAsset.id).map(user => (
                      <div key={user.id} className="flex items-center justify-between bg-input-bg p-3 rounded-lg border border-border-soft group">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-border-soft border border-border-soft text-[10px] uppercase text-text-primary flex items-center justify-center font-bold">
                            {user.username.slice(0, 2)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-small font-semibold text-text-secondary">{user.username}</span>
                              {user.flagged && (
                                <span className="text-[9px] bg-red/10 text-red border border-red/20 px-1 rounded uppercase flex items-center gap-0.5">
                                  <ShieldAlert className="w-2.5 h-2.5" /> Flagged
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-text-muted block">{user.role || '—'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-text-muted font-mono">{new Date(user.lastActive).toLocaleDateString()}</span>
                          {canWrite && (
                            <button
                              onClick={() => handleDeleteIdentity(user.id)}
                              className="text-text-muted hover:text-red transition-colors opacity-0 group-hover:opacity-100"
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {identities.filter(i => i.assetId === selectedAsset.id).length === 0 && (
                      <div className="text-small text-text-muted bg-input-bg p-3 rounded-lg border border-border-soft">
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
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border-soft)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text)' }}
                      />
                      <input
                        type="text"
                        placeholder="Role"
                        value={newIdentityRole}
                        onChange={(e) => setNewIdentityRole(e.target.value)}
                        className="input-field text-small py-1.5 flex-1"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border-soft)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text)' }}
                      />
                      <button
                        type="submit"
                        className="add-btn text-small"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  )}
                </div>

                {/* Open Alerts */}
                <div className="mt-6 space-y-3">
                  <span className="text-label uppercase text-text-muted block">Open Alerts</span>
                  <div className="space-y-2">
                    {alertsForAsset(selectedAsset, alerts).map(alert => (
                      <div key={alert.id} className="flex items-center justify-between bg-red/5 border border-red/10 p-3 rounded-lg">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={toSeverity(alert.severity)} label={alert.severity} size="sm" />
                          <span className="text-small font-semibold text-text-secondary">{alert.title}</span>
                        </div>
                        <span className="text-label text-text-muted font-mono">{new Date(alert.createdAt).toLocaleString()}</span>
                      </div>
                    ))}
                    {alertsForAsset(selectedAsset, alerts).length === 0 && (
                      <div className="flex items-center gap-2 bg-green/5 border border-green/10 p-3 rounded-lg text-green font-semibold text-small">
                        <ShieldCheck className="w-4 h-4 text-green" />
                        No open security alerts detected
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Isolation Action button */}
              <div className="border-t border-border-soft pt-4 space-y-2">
                <span className="text-label uppercase text-text-muted block">CMDB Node Actions</span>
                <button
                  onClick={() => setConfirmingIsolateAsset(selectedAsset)}
                  disabled={!canWrite}
                  className={clsx(
                    "w-full py-2.5 text-small flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg",
                    selectedAsset.isolationStatus ? "bg-red hover:bg-red/90" : "bg-blue hover:bg-blue/90"
                  )}
                  style={{ border: 'none', cursor: 'pointer' }}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {selectedAsset.isolationStatus ? 'Isolated (Re-instate Node)' : 'Isolate Asset'}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Middle Charts row */}
        <div className="mid-row">
          
          {/* Top Asset Sources Donut */}
          <div className="mid-card">
            <h3>Top Asset Sources</h3>
            <div className="donut-row">
              <svg viewBox="0 0 140 140" width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="70" cy="70" r="52" fill="none" stroke="var(--cyan)" strokeWidth="22" strokeDasharray={`${sources.rules.dash} ${sources.circ - sources.rules.dash}`} strokeDashoffset={sources.rules.offset} />
                <circle cx="70" cy="70" r="52" fill="none" stroke="#0891b2" strokeWidth="22" strokeDasharray={`${sources.ad.dash} ${sources.circ - sources.ad.dash}`} strokeDashoffset={sources.ad.offset} />
                <circle cx="70" cy="70" r="52" fill="none" stroke="#134e6f" strokeWidth="22" strokeDasharray={`${sources.intel.dash} ${sources.circ - sources.intel.dash}`} strokeDashoffset={sources.intel.offset} />
                <circle cx="70" cy="70" r="52" fill="none" stroke="#7c88a8" strokeWidth="22" strokeDasharray={`${sources.other.dash} ${sources.circ - sources.other.dash}`} strokeDashoffset={sources.other.offset} />
              </svg>
              <div className="legend-list">
                <div><span className="d" style={{ background: 'var(--cyan)' }}></span>Servers <span className="text-[10px] text-text-muted ml-1">({sources.rulesCount})</span></div>
                <div><span className="d" style={{ background: '#0891b2' }}></span>Workstations <span className="text-[10px] text-text-muted ml-1">({sources.adCount})</span></div>
                <div><span className="d" style={{ background: '#134e6f' }}></span>Cloud nodes <span className="text-[10px] text-text-muted ml-1">({sources.intelCount})</span></div>
                <div><span className="d" style={{ background: '#7c88a8' }}></span>Others <span className="text-[10px] text-text-muted ml-1">({sources.otherCount})</span></div>
              </div>
            </div>
          </div>

          {/* Asset Criticality Breakdown */}
          <div className="mid-card">
            <h3>Asset Criticality Breakdown</h3>
            <div className="chart-legend-row">
              <div style={{ flex: 1 }}>
                <div className="bars-simple" style={{ marginLeft: '4px' }}>
                  {([
                    ['Critical', critData.critical, '#ef4444'],
                    ['High', critData.high, '#f97316'],
                    ['Medium', critData.medium, '#facc15'],
                    ['Low', critData.low, '#22c55e'],
                  ] as const).map(([label, count, color]) => (
                    <div key={label} className="bcol" style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', flexDirection: 'column-reverse', width: '55%', height: '100%', margin: '0 auto' }}>
                        <div
                          style={{
                            height: `${(count / critData.max) * 100}%`,
                            background: color,
                            borderRadius: '2px',
                            transition: 'height 0.3s ease'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="legend-list">
                <div><span className="d" style={{ background: '#ef4444' }}></span>Critical <span className="text-[10px] text-text-muted ml-1">({critData.critical})</span></div>
                <div><span className="d" style={{ background: '#f97316' }}></span>High <span className="text-[10px] text-text-muted ml-1">({critData.high})</span></div>
                <div><span className="d" style={{ background: '#facc15' }}></span>Medium <span className="text-[10px] text-text-muted ml-1">({critData.medium})</span></div>
                <div><span className="d" style={{ background: '#22c55e' }}></span>Low <span className="text-[10px] text-text-muted ml-1">({critData.low})</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="bottom-row">
          
          <div className="bottom-card">
            <h3>Live Asset Ticker <span style={{ color: 'var(--dim)', fontSize: '12px', cursor: 'pointer' }}>⌄</span></h3>
            <div className="ticker-top">
              on threat status check by <span className="lnk">Asset Identity Audit</span> - Active Stitching…
            </div>
            <div className="ticker-list">
              {tickerItems.map((item, idx) => (
                <div key={idx} className="ticker-item">
                  • <b>New node registered:</b> {item.name} | Custodian: {item.owner}
                </div>
              ))}
            </div>
          </div>

          <div className="bottom-card">
            <h3>Identity Conflict Feed <span style={{ color: 'var(--dim)', fontSize: '12px', cursor: 'pointer' }}>⌄</span></h3>
            <div className="ticker-list">
              {identityConflicts.length === 0 ? (
                <div className="ticker-item" style={{ color: 'var(--dim)' }}>No flagged identities detected.</div>
              ) : (
                identityConflicts.map((item) => (
                  <div key={item.id} className="ticker-item">• <b>Flagged access:</b> {item.username} on {item.assetName}</div>
                ))
              )}
            </div>
          </div>

          <div className="bottom-card">
            <h3>Asset Investigation Timeline</h3>
            <div className="invest-flow">
              <div className="invest-step"><div className="invest-icon blue">👤</div><div className="invest-lbl">Assignment Seen</div></div>
              <div className="invest-arrow">→</div>
              <div className="invest-step"><div className="invest-icon cyan">🔍</div><div className="invest-lbl">Inv. Diagnosis</div></div>
              <div className="invest-arrow">→</div>
              <div className="invest-step"><div className="invest-icon amber">⏱</div><div className="invest-lbl">Severe Status</div></div>
              <div className="invest-arrow">→</div>
              <div className="invest-step"><div className="invest-icon blue">⚠</div><div className="invest-lbl">Report Conflicts</div></div>
            </div>
          </div>

        </div>

      </div>

      {/* Register Node Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-input-bg border border-border-soft rounded-xl w-full max-w-md overflow-hidden shadow-card animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-border-soft">
              <h3 className="text-h3 text-heading-color font-bold">Register Corporate Node</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X className="w-5 h-5 text-text-muted hover:text-text-primary" />
              </button>
            </div>
            <form onSubmit={handleCreateAsset} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-text-muted uppercase block font-bold">Node Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. dc-prod-02"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', width: '100%', outline: 'none' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-text-muted uppercase block font-bold">Node Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', width: '100%', outline: 'none' }}
                  >
                    <option value="SERVER">SERVER</option>
                    <option value="WORKSTATION">WORKSTATION</option>
                    <option value="NETWORK_DEVICE">NETWORK</option>
                    <option value="CLOUD_INSTANCE">CLOUD</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-text-muted uppercase block font-bold">Criticality</label>
                  <select
                    value={newCriticality}
                    onChange={(e) => setNewCriticality(e.target.value)}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', width: '100%', outline: 'none' }}
                  >
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-text-muted uppercase block font-bold">Custodian Owner Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. it-admin"
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', width: '100%', outline: 'none' }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-text-muted uppercase block font-bold">IP Address (bound)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 192.168.1.102"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', width: '100%', outline: 'none' }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-text-muted uppercase block font-bold">MAC Address (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 00:1A:2B:3C:4D:5E"
                  value={newMac}
                  onChange={(e) => setNewMac(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', width: '100%', outline: 'none' }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-text-muted uppercase block font-bold">Operating System</label>
                <input
                  type="text"
                  placeholder="e.g. Windows Server 2022"
                  value={newOs}
                  onChange={(e) => setNewOs(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', width: '100%', outline: 'none' }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-text-muted uppercase block font-bold">Tags (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. windows,prod,domain-controller"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', width: '100%', outline: 'none' }}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-soft mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="add-btn"
                  style={{ background: 'var(--border-soft)', color: 'var(--text)', border: 'none', cursor: 'pointer', boxShadow: 'none' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="add-btn"
                  style={{ border: 'none', cursor: 'pointer' }}
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
