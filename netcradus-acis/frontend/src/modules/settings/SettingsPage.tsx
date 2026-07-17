import React, { useEffect, useState } from 'react'
import { Key, Copy, Plus, X, Check, Settings, Activity, FileText, Database, Shield, Users, CreditCard, Layers, Building2 } from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import InDevelopment from '@/components/InDevelopment'

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
  const [activeTab, setActiveTab] = useState('Organization')
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null)

  // Roles & Permissions states
  interface RolePerm {
    id?: string
    moduleName: string
    permissionLevel: string
  }
  interface ConsoleRole {
    id: string
    name: string
    userCount: number
    permissions: RolePerm[]
  }
  const [roles, setRoles] = useState<ConsoleRole[]>([])
  const [activeRole, setActiveRole] = useState<ConsoleRole | null>(null)
  const [initialActiveRole, setInitialActiveRole] = useState<ConsoleRole | null>(null)
  const [rolesLoading, setRolesLoading] = useState(false)
  const [rolesSaving, setRolesSaving] = useState(false)
  const [newRoleModalOpen, setNewRoleModalOpen] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [activeDropdownRow, setActiveDropdownRow] = useState<string | null>(null)

  // Data Sources states
  interface DataSource {
    id: string
    name: string
    provider: string
    description: string
    status: string
    lastSync: string | null
  }
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [addSourceModalOpen, setAddSourceModalOpen] = useState(false)
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [activeSourceToConnect, setActiveSourceToConnect] = useState<DataSource | null>(null)
  const [newSourceName, setNewSourceName] = useState('')
  const [newSourceProvider, setNewSourceProvider] = useState('AWS')
  const [newSourceDesc, setNewSourceDesc] = useState('')
  const [connectCred1, setConnectCred1] = useState('')
  const [connectCred2, setConnectCred2] = useState('')
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null)

  // Organization states
  const [orgName, setOrgName] = useState('')
  const [orgIdString, setOrgIdString] = useState('')
  const [orgIndustry, setOrgIndustry] = useState('Managed Security Services')
  const [orgRegion, setOrgRegion] = useState('Asia Pacific (Ghaziabad, IN)')
  const [orgEmail, setOrgEmail] = useState('')
  const [orgTimeZone, setOrgTimeZone] = useState('IST (UTC +5:30)')
  const [orgLoading, setOrgLoading] = useState(true)
  const [orgSaving, setOrgSaving] = useState(false)

  // License & Billing states
  const [license, setLicense] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [licenseLoading, setLicenseLoading] = useState(true)
  const [licenseChanging, setLicenseChanging] = useState(false)

  // Users & Groups states
  const [users, setUsers] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [groupModalOpen, setGroupModalOpen] = useState(false)

  // Invite user form fields
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteGroup, setInviteGroup] = useState('Admins')

  // Create group form fields
  const [groupName, setGroupName] = useState('')
  const [groupDesc, setGroupDesc] = useState('')

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

  const fetchOrganization = async () => {
    try {
      setOrgLoading(true)
      const res = await apiClient.get('/api/soar/settings/organization')
      if (res.data) {
        setOrgName(res.data.name || '')
        setOrgIdString(res.data.orgIdString || '')
        setOrgIndustry(res.data.industry || 'Managed Security Services')
        setOrgRegion(res.data.primaryRegion || 'Asia Pacific (Ghaziabad, IN)')
        setOrgEmail(res.data.supportEmail || '')
        setOrgTimeZone(res.data.timeZone || 'IST (UTC +5:30)')
      }
    } catch (e) {
      console.error("Failed to load organization settings:", e)
    } finally {
      setOrgLoading(false)
    }
  }

  const handleSaveOrganization = async (e: React.FormEvent) => {
    if (e) e.preventDefault()
    try {
      setOrgSaving(true)
      const res = await apiClient.put('/api/soar/settings/organization', {
        name: orgName,
        orgIdString: orgIdString,
        industry: orgIndustry,
        primaryRegion: orgRegion,
        supportEmail: orgEmail,
        timeZone: orgTimeZone
      })
      if (res.data) {
        alert("Organization settings updated successfully!")
      }
    } catch (e) {
      console.error("Failed to update organization settings:", e)
      alert("Failed to update organization settings.")
    } finally {
      setOrgSaving(false)
    }
  }

  const handleTransferOwnership = async () => {
    const email = prompt("Enter the email address of the administrator to transfer ownership to:")
    if (!email) return
    try {
      const res = await apiClient.post('/api/soar/settings/organization/transfer', email, {
        headers: { 'Content-Type': 'text/plain' }
      })
      if (res.data) {
        alert(res.data)
      }
    } catch (e) {
      console.error("Failed to transfer ownership:", e)
    }
  }

  const handleDeleteOrganization = async () => {
    if (!confirm("WARNING: This action is irreversible. Are you sure you want to permanently delete and reset this organization?")) return
    try {
      const res = await apiClient.delete('/api/soar/settings/organization')
      if (res.data) {
        alert(res.data)
        fetchOrganization()
      }
    } catch (e) {
      console.error("Failed to delete organization:", e)
    }
  }

  const fetchLicense = async () => {
    try {
      setLicenseLoading(true)
      const res = await apiClient.get('/api/soar/settings/license')
      if (res.data) {
        setLicense(res.data)
      }
      const invRes = await apiClient.get('/api/soar/settings/invoices')
      if (invRes.data) {
        setInvoices(invRes.data)
      }
    } catch (e) {
      console.error("Failed to load license details:", e)
    } finally {
      setLicenseLoading(false)
    }
  }

  const handleChangePlan = async () => {
    const plans = ["Enterprise Shield", "Growth Shield", "Standard Shield"]
    const currentIdx = plans.indexOf(license?.planName || '')
    const nextPlan = plans[(currentIdx + 1) % plans.length]
    
    if (!confirm(`Are you sure you want to change your plan to ${nextPlan}?`)) return
    
    try {
      setLicenseChanging(true)
      const res = await apiClient.post('/api/soar/settings/license/change-plan', nextPlan, {
        headers: { 'Content-Type': 'text/plain' }
      })
      if (res.data) {
        setLicense(res.data)
        alert(`Plan changed successfully to ${nextPlan}!`)
      }
    } catch (e) {
      console.error("Failed to change plan:", e)
    } finally {
      setLicenseChanging(false)
    }
  }

  const handleUpdatePayment = async () => {
    const brand = prompt("Enter Card Brand (e.g. VISA, MasterCard):", license?.cardBrand || 'VISA')
    if (!brand) return
    const last4 = prompt("Enter Card Last 4 digits (e.g. 4471):", license?.cardLast4 || '4471')
    if (!last4) return
    const expiry = prompt("Enter Card Expiry date (MM/YY, e.g. 08/28):", license?.cardExpiry || '08/28')
    if (!expiry) return
    const details = prompt("Enter Billing details (e.g. Billed to CyberHaxs Pvt. Ltd.):", license?.billingDetails || '')
    if (!details) return

    try {
      const res = await apiClient.put('/api/soar/settings/license/payment-method', {
        cardBrand: brand,
        cardLast4: last4,
        cardExpiry: expiry,
        billingDetails: details
      })
      if (res.data) {
        setLicense(res.data)
        alert("Payment method updated successfully!")
      }
    } catch (e) {
      console.error("Failed to update payment method:", e)
    }
  }

  const handleDownloadInvoice = async (invoiceId: string, invoiceNum: string) => {
    try {
      const res = await apiClient.get(`/api/soar/settings/invoices/${invoiceId}/download`, {
        responseType: 'arraybuffer'
      })
      const blob = new Blob([res.data], { type: 'text/plain' })
      const link = document.createElement('a')
      link.href = window.URL.createObjectURL(blob)
      link.download = `${invoiceNum}.txt`
      link.click()
    } catch (e) {
      console.error("Failed to download invoice:", e)
    }
  }

  const handleDownloadAllInvoices = () => {
    if (!invoices.length) {
      alert("No invoices available to download.")
      return
    }
    invoices.forEach(inv => {
      handleDownloadInvoice(inv.id, inv.invoiceNumber)
    })
  }

  const formatNumberWithK = (num: number) => {
    if (!num) return '0'
    if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
    return num.toString()
  }

  const fetchUsersAndGroups = async () => {
    try {
      setUsersLoading(true)
      const resUsers = await apiClient.get('/api/soar/settings/users')
      if (resUsers.data) {
        setUsers(resUsers.data)
      }
      const resGroups = await apiClient.get('/api/soar/settings/groups')
      if (resGroups.data) {
        setGroups(resGroups.data)
      }
    } catch (e) {
      console.error("Failed to load users & groups details:", e)
    } finally {
      setUsersLoading(false)
    }
  }

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await apiClient.post('/api/soar/settings/users/invite', {
        name: inviteName,
        email: inviteEmail,
        groupName: inviteGroup
      })
      if (res.data) {
        alert(`Successfully invited ${inviteName}!`)
        setInviteName('')
        setInviteEmail('')
        setInviteModalOpen(false)
        fetchUsersAndGroups()
      }
    } catch (e) {
      console.error("Failed to invite user:", e)
      alert("Failed to invite user.")
    }
  }

  const handleResendInvite = async (userId: string, userName: string) => {
    try {
      const res = await apiClient.post(`/api/soar/settings/users/${userId}/resend`)
      if (res.data) {
        alert(`Invitation email resent to ${userName}!`)
        fetchUsersAndGroups()
      }
    } catch (e) {
      console.error("Failed to resend invitation:", e)
    }
  }

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to remove ${userName} from this organization?`)) return
    try {
      const res = await apiClient.delete(`/api/soar/settings/users/${userId}`)
      if (res.data) {
        alert(`${userName} removed successfully.`)
        fetchUsersAndGroups()
      }
    } catch (e) {
      console.error("Failed to remove user:", e)
    }
  }

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await apiClient.post('/api/soar/settings/groups', {
        name: groupName,
        description: groupDesc
      })
      if (res.data) {
        alert(`Group ${groupName} created successfully!`)
        setGroupName('')
        setGroupDesc('')
        setGroupModalOpen(false)
        fetchUsersAndGroups()
      }
    } catch (e) {
      console.error("Failed to create group:", e)
      alert("Failed to create group.")
    }
  }

  const fetchRoles = async () => {
    try {
      setRolesLoading(true)
      const res = await apiClient.get('/api/soar/settings/roles')
      if (res.data) {
        setRoles(res.data)
        const currentActive = activeRole ? res.data.find((r: any) => r.id === activeRole.id) : null;
        if (currentActive) {
          setActiveRole(currentActive)
          setInitialActiveRole(JSON.parse(JSON.stringify(currentActive)))
        } else if (res.data.length > 0) {
          setActiveRole(res.data[0])
          setInitialActiveRole(JSON.parse(JSON.stringify(res.data[0])))
        }
      }
    } catch (e) {
      console.error("Failed to load roles:", e)
    } finally {
      setRolesLoading(false)
    }
  }

  const handleSelectRole = (role: ConsoleRole) => {
    setActiveRole(role)
    setInitialActiveRole(JSON.parse(JSON.stringify(role)))
    setActiveDropdownRow(null)
  }

  const handlePermissionChange = (moduleName: string, level: string) => {
    if (!activeRole) return
    const updatedPermissions = activeRole.permissions.map(p => {
      if (p.moduleName === moduleName) {
        return { ...p, permissionLevel: level }
      }
      return p
    })
    setActiveRole({ ...activeRole, permissions: updatedPermissions })
    setActiveDropdownRow(null)
  }

  const handleResetToDefault = () => {
    if (!initialActiveRole) return
    setActiveRole(JSON.parse(JSON.stringify(initialActiveRole)))
    setActiveDropdownRow(null)
  }

  const handleSaveRole = async () => {
    if (!activeRole) return
    try {
      setRolesSaving(true)
      const res = await apiClient.put(`/api/soar/settings/roles/${activeRole.id}`, activeRole)
      if (res.data) {
        alert(`Role ${activeRole.name} updated successfully!`)
        await fetchRoles()
      }
    } catch (e) {
      console.error("Failed to update role:", e)
      alert("Failed to update role.")
    } finally {
      setRolesSaving(false)
    }
  }

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoleName.trim()) return
    try {
      const res = await apiClient.post('/api/soar/settings/roles', { name: newRoleName })
      if (res.data) {
        setNewRoleName('')
        setNewRoleModalOpen(false)
        await fetchRoles()
        const newRole = res.data
        setActiveRole(newRole)
        setInitialActiveRole(JSON.parse(JSON.stringify(newRole)))
      }
    } catch (e) {
      console.error("Failed to create role:", e)
      alert("Failed to create role.")
    }
  }

  const renderDropdown = (moduleName: string, currentLevel: string) => {
    const levels = [
      { key: 'NONE', label: 'None', className: 'text-neutral-450 hover:bg-neutral-800' },
      { key: 'READ', label: 'Read', className: 'text-emerald-400 hover:bg-emerald-500/10' },
      { key: 'WRITE', label: 'Write', className: 'text-blue-400 hover:bg-blue-500/10' },
      { key: 'ADMIN', label: 'Admin', className: 'text-[#FF5A1F] hover:bg-[#FF5A1F]/10' }
    ]

    return (
      <div className="absolute z-30 mt-2 w-32 right-1/2 translate-x-1/2 bg-[#0C0C0D] border border-neutral-800 rounded-xl shadow-xl py-1 animate-fade-in text-[10px] font-bold uppercase tracking-tight">
        {levels.map((lvl) => (
          <button
            key={lvl.key}
            type="button"
            onClick={() => handlePermissionChange(moduleName, lvl.key)}
            className={clsx(
              "w-full text-left px-3.5 py-2.5 transition-colors focus:outline-none flex items-center justify-between",
              lvl.className,
              currentLevel === lvl.key && "bg-neutral-900/60"
            )}
          >
            <span>{lvl.label}</span>
            {currentLevel === lvl.key && <span className="text-[8px]">✓</span>}
          </button>
        ))}
      </div>
    )
  }

  const fetchDataSources = async () => {
    try {
      setSourcesLoading(true)
      const res = await apiClient.get('/api/soar/settings/datasources')
      if (res.data) {
        setDataSources(res.data)
      }
    } catch (e) {
      console.error("Failed to load data sources:", e)
    } finally {
      setSourcesLoading(false)
    }
  }

  const handleConnectSource = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSourceToConnect) return
    try {
      const res = await apiClient.put(`/api/soar/settings/datasources/${activeSourceToConnect.id}/connect`)
      if (res.data) {
        setConnectModalOpen(false)
        setActiveSourceToConnect(null)
        setConnectCred1('')
        setConnectCred2('')
        await fetchDataSources()
      }
    } catch (e) {
      console.error("Failed to connect data source:", e)
      alert("Failed to connect data source.")
    }
  }

  const handleDisconnectSource = async (sourceId: string) => {
    if (!confirm("Are you sure you want to disconnect this data source? Ingestion will stop immediately.")) return
    try {
      const res = await apiClient.put(`/api/soar/settings/datasources/${sourceId}/disconnect`)
      if (res.data) {
        await fetchDataSources()
      }
    } catch (e) {
      console.error("Failed to disconnect data source:", e)
    }
  }

  const handleSyncSource = async (sourceId: string) => {
    try {
      setSyncingSourceId(sourceId)
      const res = await apiClient.post(`/api/soar/settings/datasources/${sourceId}/sync`)
      if (res.data) {
        await new Promise(resolve => setTimeout(resolve, 1500))
        await fetchDataSources()
      }
    } catch (e) {
      console.error("Failed to sync data source:", e)
    } finally {
      setSyncingSourceId(null)
    }
  }

  const handleAddDataSource = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSourceName.trim()) return
    try {
      const res = await apiClient.post('/api/soar/settings/datasources', {
        name: newSourceName,
        provider: newSourceProvider,
        description: newSourceDesc
      })
      if (res.data) {
        setNewSourceName('')
        setNewSourceDesc('')
        setNewSourceProvider('AWS')
        setAddSourceModalOpen(false)
        await fetchDataSources()
      }
    } catch (e) {
      console.error("Failed to add data source:", e)
      alert("Failed to add data source.")
    }
  }

  useEffect(() => {
    fetchData()
    fetchOrganization()
    fetchLicense()
    fetchUsersAndGroups()
    fetchRoles()
    fetchDataSources()
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
            { label: 'Organization', icon: Building2 },
            { label: 'License & Billing', icon: CreditCard }
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
          {activeTab === 'Organization' && (
            <div>
              <div className="text-[10px] text-neutral-500 font-bold mb-2">
                <span>Settings</span> <span className="text-neutral-600">/</span> <span className="text-white">Organization</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight leading-none">Organization</h2>
              <p className="text-xs text-neutral-500 mt-2 font-medium">Manage your organization's identity, contact details, and account-level controls.</p>
            </div>
          )}
          {activeTab === 'License & Billing' && (
            <div>
              <div className="text-[10px] text-neutral-500 font-bold mb-2">
                <span>Settings</span> <span className="text-neutral-600">/</span> <span className="text-white">License & Billing</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight leading-none">License & Billing</h2>
              <p className="text-xs text-neutral-500 mt-2 font-medium">Track your subscription tier, usage against plan limits, and payment history.</p>
            </div>
          )}
          {activeTab === 'Users & Groups' && (
            <div>
              <div className="text-[10px] text-neutral-500 font-bold mb-2">
                <span>Settings</span> <span className="text-neutral-600">/</span> <span className="text-white">Users & Groups</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight leading-none">Users & Groups</h2>
              <p className="text-xs text-neutral-500 mt-2 font-medium">Manage who has access to the console and how they're grouped for permissions.</p>
            </div>
          )}
          {activeTab === 'Roles & Permissions' && (
            <div>
              <div className="text-[10px] text-neutral-500 font-bold mb-2">
                <span>Settings</span> <span className="text-neutral-600">/</span> <span className="text-white">Roles & Permissions</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight leading-none">Roles & Permissions</h2>
              <p className="text-xs text-neutral-500 mt-2 font-medium">Define what each role can see and do across the security console.</p>
            </div>
          )}
          {activeTab === 'Data Sources' && (
            <div>
              <div className="text-[10px] text-neutral-500 font-bold mb-2">
                <span>Settings</span> <span className="text-neutral-600">/</span> <span className="text-white">Data Sources</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight leading-none">Data Sources</h2>
              <p className="text-xs text-neutral-500 mt-2 font-medium">Connect cloud and network telemetry for ingestion, correlation, and alerting.</p>
            </div>
          )}
          {!['Organization', 'License & Billing', 'Users & Groups', 'Roles & Permissions', 'Data Sources'].includes(activeTab) && (
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight uppercase leading-none">Access & Integrations</h2>
              <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider">Manage API access tokens and connected third-party security tools.</p>
            </div>
          )}
        </div>

        {/* Tab 0: Organization Panel */}
        {activeTab === 'Organization' && (
          <div className="space-y-6 animate-fade-in">
            {/* Organization Profile Card */}
            <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Organization profile</h3>
                  <p className="text-[10px] text-neutral-500 mt-1">Visible to your team across the console</p>
                </div>
                <button 
                  onClick={handleSaveOrganization}
                  disabled={orgSaving}
                  className="bg-[#FF5A1F] hover:bg-[#E54E18] disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold px-5 py-2 rounded-xl text-xs flex items-center gap-1 transition-all focus:outline-none"
                >
                  {orgSaving ? 'Saving...' : 'Save changes'}
                </button>
              </div>

              {orgLoading ? (
                <div className="py-12 text-center text-xs text-neutral-500 font-bold uppercase tracking-widest animate-pulse">
                  Loading Profile Data...
                </div>
              ) : (
                <form onSubmit={handleSaveOrganization} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 text-xs">
                  {/* Row 1 */}
                  <div className="space-y-1.5">
                    <label className="text-neutral-400 font-bold tracking-tight block">Organization name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Organization Name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full bg-[#121214] border border-neutral-800 rounded-lg px-3 py-2.5 text-white placeholder:text-neutral-750 focus:outline-none focus:border-neutral-700 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-neutral-400 font-bold tracking-tight block">Organization ID</label>
                    <input 
                      type="text" 
                      readOnly
                      placeholder="Organization ID"
                      value={orgIdString}
                      className="w-full bg-[#121214]/50 border border-neutral-800/80 rounded-lg px-3 py-2.5 text-neutral-400 focus:outline-none cursor-not-allowed select-all"
                    />
                  </div>

                  {/* Row 2 */}
                  <div className="space-y-1.5">
                    <label className="text-neutral-400 font-bold tracking-tight block">Industry</label>
                    <div className="relative">
                      <select 
                        value={orgIndustry}
                        onChange={(e) => setOrgIndustry(e.target.value)}
                        className="w-full bg-[#121214] border border-neutral-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-neutral-700 transition-colors cursor-pointer"
                      >
                        <option value="Managed Security Services">Managed Security Services</option>
                        <option value="Financial Services">Financial Services</option>
                        <option value="Healthcare & Life Sciences">Healthcare & Life Sciences</option>
                        <option value="Government & Public Sector">Government & Public Sector</option>
                        <option value="Retail & E-commerce">Retail & E-commerce</option>
                        <option value="Technology & Telecom">Technology & Telecom</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-neutral-400 font-bold tracking-tight block">Primary region</label>
                    <div className="relative">
                      <select 
                        value={orgRegion}
                        onChange={(e) => setOrgRegion(e.target.value)}
                        className="w-full bg-[#121214] border border-neutral-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-neutral-700 transition-colors cursor-pointer"
                      >
                        <option value="Asia Pacific (Ghaziabad, IN)">Asia Pacific (Ghaziabad, IN)</option>
                        <option value="US East (N. Virginia)">US East (N. Virginia)</option>
                        <option value="US West (Oregon)">US West (Oregon)</option>
                        <option value="Europe (Frankfurt)">Europe (Frankfurt)</option>
                        <option value="Europe (Ireland)">Europe (Ireland)</option>
                        <option value="Asia Pacific (Singapore)">Asia Pacific (Singapore)</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 3 */}
                  <div className="space-y-1.5">
                    <label className="text-neutral-400 font-bold tracking-tight block">Support email</label>
                    <input 
                      type="email" 
                      required
                      placeholder="support@organization.com"
                      value={orgEmail}
                      onChange={(e) => setOrgEmail(e.target.value)}
                      className="w-full bg-[#121214] border border-neutral-800 rounded-lg px-3 py-2.5 text-white placeholder:text-neutral-750 focus:outline-none focus:border-neutral-700 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-neutral-400 font-bold tracking-tight block">Time zone</label>
                    <div className="relative">
                      <select 
                        value={orgTimeZone}
                        onChange={(e) => setOrgTimeZone(e.target.value)}
                        className="w-full bg-[#121214] border border-neutral-800 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-neutral-700 transition-colors cursor-pointer"
                      >
                        <option value="IST (UTC +5:30)">IST (UTC +5:30)</option>
                        <option value="UTC (Coordinated Universal Time)">UTC (Coordinated Universal Time)</option>
                        <option value="EST (UTC -5:00)">EST (UTC -5:00)</option>
                        <option value="PST (UTC -8:00)">PST (UTC -8:00)</option>
                        <option value="GMT (UTC +0:00)">GMT (UTC +0:00)</option>
                        <option value="JST (UTC +9:00)">JST (UTC +9:00)</option>
                      </select>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {/* Danger Zone Card */}
            <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-6 shadow-sm space-y-6">
              <div className="border-b border-neutral-900 pb-3">
                <h3 className="text-sm font-bold text-white tracking-tight">Danger zone</h3>
                <p className="text-[10px] text-neutral-500 mt-1">Irreversible and destructive actions</p>
              </div>

              <div className="space-y-4 divide-y divide-neutral-900/60">
                {/* Transfer Ownership Row */}
                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-xs font-bold text-white">Transfer ownership</h4>
                    <p className="text-[10px] text-neutral-500 font-semibold">Move this organization to another administrator</p>
                  </div>
                  <button 
                    onClick={handleTransferOwnership}
                    className="border border-neutral-800 hover:bg-neutral-800 text-neutral-350 hover:text-white font-bold px-4 py-2 rounded-xl text-[11px] transition-colors focus:outline-none"
                  >
                    Transfer
                  </button>
                </div>

                {/* Delete Organization Row */}
                <div className="flex items-center justify-between pt-4 pb-2">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-xs font-bold text-white">Delete organization</h4>
                    <p className="text-[10px] text-neutral-500 font-semibold">Permanently remove all data, agents, and integrations</p>
                  </div>
                  <button 
                    onClick={handleDeleteOrganization}
                    className="bg-[#DC2626]/10 hover:bg-[#DC2626] border border-[#DC2626]/20 hover:border-transparent text-[#EF4444] hover:text-white font-bold px-4 py-2 rounded-xl text-[11px] transition-colors focus:outline-none"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 0.5: License & Billing Panel */}
        {activeTab === 'License & Billing' && (
          <div className="space-y-6 animate-fade-in">
            {licenseLoading ? (
              <div className="py-12 text-center text-xs text-neutral-500 font-bold uppercase tracking-widest animate-pulse">
                Loading Subscription Details...
              </div>
            ) : (
              <>
                {/* Current Plan Card */}
                <div className="bg-[#0C0C0D] border border-neutral-800/80 rounded-xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
                  <div className="space-y-2">
                    <span className="text-[10px] text-[#FF5A1F] font-extrabold uppercase tracking-wider block">Current Plan</span>
                    <h3 className="text-lg font-extrabold text-white tracking-tight">{license?.planName || 'Enterprise Shield'}</h3>
                    <p className="text-[11px] text-neutral-500 font-semibold">{license?.planFeatures || 'Unlimited endpoints · 24/7 SOC support · Renews 14 Aug 2026'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2.5 self-stretch md:self-auto border-t md:border-t-0 border-neutral-900 pt-4 md:pt-0">
                    <div className="text-xl md:text-2xl font-extrabold text-white tracking-tight">
                      {license?.planPrice || '₹1,84,999'}<span className="text-[11px] text-neutral-500 font-bold lowercase tracking-normal">/mo</span>
                    </div>
                    <button 
                      onClick={handleChangePlan}
                      disabled={licenseChanging}
                      className="bg-[#121214] hover:bg-[#18181B] border border-neutral-800 hover:border-neutral-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors focus:outline-none"
                    >
                      {licenseChanging ? 'Changing...' : 'Change plan'}
                    </button>
                  </div>
                </div>

                {/* Usage Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Endpoints Monitored */}
                  <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Endpoints monitored</div>
                    <div className="text-lg font-extrabold text-white">
                      {license?.endpointsMonitored || 642} <span className="text-neutral-500 text-xs font-semibold">/ {license?.endpointsLimit || 1000}</span>
                    </div>
                    <div className="w-full bg-[#121214] h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#FF5A1F] h-full rounded-full transition-all duration-500" 
                        style={{ width: `${((license?.endpointsMonitored || 642) / (license?.endpointsLimit || 1000)) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Data Ingestion */}
                  <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Data ingestion</div>
                    <div className="text-lg font-extrabold text-white">
                      {license?.dataIngestion || 1.8} <span className="text-neutral-500 text-xs font-semibold">TB / day of {license?.dataIngestionLimit || 2.5} TB</span>
                    </div>
                    <div className="w-full bg-[#121214] h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#FF5A1F] h-full rounded-full transition-all duration-500" 
                        style={{ width: `${((license?.dataIngestion || 1.8) / (license?.dataIngestionLimit || 2.5)) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* API Calls */}
                  <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">API calls this month</div>
                    <div className="text-lg font-extrabold text-white">
                      {formatNumberWithK(license?.apiCalls || 402000)} <span className="text-neutral-500 text-xs font-semibold">/ {formatNumberWithK(license?.apiCallsLimit || 1000000)}</span>
                    </div>
                    <div className="w-full bg-[#121214] h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#FF5A1F] h-full rounded-full transition-all duration-500" 
                        style={{ width: `${((license?.apiCalls || 402000) / (license?.apiCallsLimit || 1000000)) * 100}%` }}
                      />
                    </div>
                  </div>

                </div>

                {/* Billing History Table */}
                <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-6 shadow-sm space-y-5">
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight">Billing history</h3>
                      <p className="text-[10px] text-neutral-500 mt-1 font-semibold">Invoices for the last 6 months</p>
                    </div>
                    <button 
                      onClick={handleDownloadAllInvoices}
                      className="bg-[#121214] hover:bg-[#18181B] border border-neutral-800 hover:border-neutral-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors focus:outline-none"
                    >
                      Download all
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left border-collapse">
                      <thead>
                        <tr className="text-neutral-500 font-bold border-b border-neutral-900/60 pb-2">
                          <th className="py-2.5 font-bold uppercase tracking-wider">Invoice</th>
                          <th className="py-2.5 font-bold uppercase tracking-wider">Date</th>
                          <th className="py-2.5 font-bold uppercase tracking-wider">Amount</th>
                          <th className="py-2.5 font-bold uppercase tracking-wider">Status</th>
                          <th className="py-2.5 text-right font-bold uppercase tracking-wider">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-900/40">
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="text-neutral-300 font-semibold border-b border-neutral-900/20">
                            <td className="py-3.5 font-bold text-white">{inv.invoiceNumber}</td>
                            <td className="py-3.5 text-neutral-400">{inv.date}</td>
                            <td className="py-3.5 text-white">{inv.amount}</td>
                            <td className="py-3.5">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#10B981]/10 text-[#10B981] text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                                {inv.status}
                              </span>
                            </td>
                            <td className="py-3.5 text-right">
                              <button 
                                onClick={() => handleDownloadInvoice(inv.id, inv.invoiceNumber)}
                                className="bg-[#121214] hover:bg-[#18181B] border border-neutral-850 hover:border-neutral-700 text-neutral-350 hover:text-white font-bold px-3 py-1 rounded-lg transition-colors focus:outline-none"
                              >
                                Download
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Payment Method Card */}
                <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight">Payment method</h3>
                      <p className="text-[10px] text-neutral-500 mt-1 font-semibold">Used for monthly renewal</p>
                    </div>
                    <button 
                      onClick={handleUpdatePayment}
                      className="bg-[#121214] hover:bg-[#18181B] border border-neutral-800 hover:border-neutral-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors focus:outline-none"
                    >
                      Update
                    </button>
                  </div>

                  <div className="bg-[#121214] border border-neutral-850 rounded-xl p-4 flex items-center gap-4">
                    <div className="bg-[#1e1e24] px-3 py-1.5 rounded-lg border border-neutral-800 text-[11px] font-extrabold text-[#FF5A1F] tracking-widest">
                      {license?.cardBrand || 'VISA'}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="text-xs text-white font-bold tracking-wider">
                        •••• •••• •••• {license?.cardLast4 || '4471'}
                      </div>
                      <div className="text-[10px] text-neutral-500 font-semibold">
                        Expires {license?.cardExpiry || '08/28'} &middot; {license?.billingDetails || 'Billed to CyberHaxs Pvt. Ltd.'}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 0.6: Users & Groups Panel */}
        {activeTab === 'Users & Groups' && (
          <div className="space-y-6 animate-fade-in">
            {usersLoading ? (
              <div className="py-12 text-center text-xs text-neutral-500 font-bold uppercase tracking-widest animate-pulse">
                Loading Members & Groups...
              </div>
            ) : (
              <>
                {/* Members Table Card */}
                <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-6 shadow-sm space-y-5">
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight">Members</h3>
                      <p className="text-[10px] text-neutral-500 mt-1 font-semibold">
                        {users.filter(u => u.status === 'Active').length} active &middot; {users.filter(u => u.status === 'Invited').length} invited
                      </p>
                    </div>
                    <button 
                      onClick={() => setInviteModalOpen(true)}
                      className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 transition-colors focus:outline-none"
                    >
                      <Plus className="w-3.5 h-3.5" /> Invite user
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left border-collapse">
                      <thead>
                        <tr className="text-neutral-500 font-bold border-b border-neutral-900/60 pb-2">
                          <th className="py-2.5 font-bold uppercase tracking-wider">Name</th>
                          <th className="py-2.5 font-bold uppercase tracking-wider">Email</th>
                          <th className="py-2.5 font-bold uppercase tracking-wider">Group</th>
                          <th className="py-2.5 font-bold uppercase tracking-wider">Status</th>
                          <th className="py-2.5 font-bold uppercase tracking-wider">Last Login</th>
                          <th className="py-2.5 text-right font-bold uppercase tracking-wider">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-900/40">
                        {users.map((user) => (
                          <tr key={user.id} className="text-neutral-350 font-semibold border-b border-neutral-900/20">
                            <td className="py-3.5 font-bold text-white">{user.name}</td>
                            <td className="py-3.5 text-neutral-455">{user.email}</td>
                            <td className="py-3.5 text-neutral-400">{user.groupName}</td>
                            <td className="py-3.5">
                              {user.status === 'Active' ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#10B981]/10 text-[#10B981] text-[10px] font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#D97706]/10 text-[#F59E0B] text-[10px] font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                                  Invited
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 text-neutral-455">{user.lastLogin}</td>
                            <td className="py-3.5 text-right">
                              {user.status === 'Active' ? (
                                <button 
                                  onClick={() => handleDeleteUser(user.id, user.name)}
                                  className="bg-[#121214] hover:bg-[#DC2626]/10 border border-neutral-850 hover:border-[#DC2626]/20 text-neutral-350 hover:text-[#EF4444] font-bold px-3 py-1.5 rounded-lg transition-colors focus:outline-none"
                                >
                                  Manage
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleResendInvite(user.id, user.name)}
                                  className="bg-[#121214] hover:bg-neutral-800 border border-neutral-855 hover:border-neutral-700 text-neutral-350 hover:text-white font-bold px-3 py-1.5 rounded-lg transition-colors focus:outline-none"
                                >
                                  Resend
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Groups Card */}
                <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-6 shadow-sm space-y-5">
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight">Groups</h3>
                      <p className="text-[10px] text-neutral-500 mt-1 font-semibold">Bundle users to apply permissions in bulk</p>
                    </div>
                    <button 
                      onClick={() => setGroupModalOpen(true)}
                      className="bg-[#121214] hover:bg-[#18181B] border border-neutral-800 hover:border-neutral-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors focus:outline-none"
                    >
                      New group
                    </button>
                  </div>

                  {/* Groups Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {groups.map((group) => (
                      <div key={group.id} className="bg-[#121214] border border-neutral-850 rounded-xl p-5 shadow-sm space-y-4 hover:border-neutral-750 transition-colors flex flex-col justify-between">
                        <div className="space-y-3">
                          {/* Badge Initials Block */}
                          <div className={clsx(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold select-none",
                            group.badgeInitials === 'SA' ? "bg-[#FF5A1F]/10 text-[#FF5A1F]" :
                            group.badgeInitials === 'IR' ? "bg-blue-500/10 text-blue-400" :
                            "bg-neutral-500/10 text-neutral-400"
                          )}>
                            {group.badgeInitials}
                          </div>
                          <h4 className="text-xs font-extrabold text-white">{group.name}</h4>
                          <p className="text-[10px] text-neutral-450 leading-relaxed font-semibold">{group.description}</p>
                        </div>
                        <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider pt-2">
                          {group.memberCount} members
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Invite User Modal Overlay */}
        {inviteModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0C0C0D] border border-neutral-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl animate-fade-in">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-2.5">
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">Invite user</h3>
                <button onClick={() => setInviteModalOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleInviteUser} className="space-y-4 text-[11px]">
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-bold block">Full Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Enter Name"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full bg-[#121214] border border-neutral-850 rounded-lg px-3 py-2 text-white placeholder:text-neutral-750 focus:outline-none focus:border-neutral-700 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-bold block">Email Address</label>
                  <input 
                    type="email" 
                    required
                    placeholder="user@cyberhaxs.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full bg-[#121214] border border-neutral-855 rounded-lg px-3 py-2 text-white placeholder:text-neutral-750 focus:outline-none focus:border-neutral-700 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-bold block">Assign Group</label>
                  <select 
                    value={inviteGroup}
                    onChange={(e) => setInviteGroup(e.target.value)}
                    className="w-full bg-[#121214] border border-neutral-855 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-neutral-700 cursor-pointer"
                  >
                    <option value="Admins">Admins</option>
                    <option value="SOC Analysts">SOC Analysts</option>
                    <option value="Incident Responders">Incident Responders</option>
                    <option value="Auditors">Auditors</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setInviteModalOpen(false)}
                    className="border border-neutral-855 hover:bg-neutral-900 text-neutral-400 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Send Invitation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create Group Modal Overlay */}
        {groupModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0C0C0D] border border-neutral-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl animate-fade-in">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-2.5">
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">New group</h3>
                <button onClick={() => setGroupModalOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleCreateGroup} className="space-y-4 text-[11px]">
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-bold block">Group Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Incident Responders"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full bg-[#121214] border border-neutral-855 rounded-lg px-3 py-2 text-white placeholder:text-neutral-750 focus:outline-none focus:border-neutral-700 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-bold block">Description</label>
                  <textarea 
                    required
                    placeholder="Explain group purpose..."
                    value={groupDesc}
                    onChange={(e) => setGroupDesc(e.target.value)}
                    rows={3}
                    className="w-full bg-[#121214] border border-neutral-855 rounded-lg px-3 py-2 text-white placeholder:text-neutral-750 focus:outline-none focus:border-neutral-700 transition-colors resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setGroupModalOpen(false)}
                    className="border border-neutral-855 hover:bg-neutral-900 text-neutral-400 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Create Group
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tab 0.7: Roles & Permissions Panel */}
        {activeTab === 'Roles & Permissions' && (
          <div className="space-y-6 animate-fade-in text-xs font-sans">
            {rolesLoading ? (
              <div className="py-12 text-center text-xs text-neutral-500 font-bold uppercase tracking-widest animate-pulse">
                Loading Roles & Permissions...
              </div>
            ) : (
              <>
                {/* Tabs row */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* Left: Role Tabs */}
                  <div className="flex flex-wrap gap-2">
                    {roles.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => handleSelectRole(role)}
                        className={clsx(
                          "px-4 py-2.5 rounded-xl text-xs font-bold transition-all focus:outline-none flex items-center gap-1.5",
                          activeRole?.id === role.id
                            ? "border border-[#FF5A1F] text-[#FF5A1F] bg-[#FF5A1F]/5 font-extrabold"
                            : "border border-neutral-800 bg-[#0C0C0D] text-neutral-400 hover:text-white hover:border-neutral-700"
                        )}
                      >
                        <span>{role.name}</span>
                        <span className={clsx(
                          "text-[10px] ml-1 font-bold",
                          activeRole?.id === role.id ? "text-[#FF5A1F]/70" : "text-neutral-500"
                        )}>
                          {role.userCount}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Right: New Role Button */}
                  <button
                    onClick={() => setNewRoleModalOpen(true)}
                    className="border border-neutral-850 bg-[#0C0C0D] hover:bg-neutral-900 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1 transition-all focus:outline-none"
                  >
                    <Plus className="w-3.5 h-3.5" /> New role
                  </button>
                </div>

                {/* Permission Matrix Card */}
                {activeRole && (
                  <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-6 shadow-sm space-y-6 relative">
                    <div className="border-b border-neutral-900 pb-4">
                      <h3 className="text-sm font-bold text-white tracking-tight">
                        Permission matrix — {activeRole.name}
                      </h3>
                      <p className="text-[10px] text-neutral-500 mt-1 font-semibold">Access level per module</p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-neutral-500 font-bold border-b border-neutral-900/60 text-[9px] uppercase tracking-wider">
                            <th className="py-3 px-2 w-[40%] text-left">Module</th>
                            <th className="py-3 px-2 w-[15%] text-center">None</th>
                            <th className="py-3 px-2 w-[15%] text-center">Read</th>
                            <th className="py-3 px-2 w-[15%] text-center">Write</th>
                            <th className="py-3 px-2 w-[15%] text-center">Admin</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-900/40 text-neutral-300">
                          {activeRole.permissions?.map((perm) => {
                            const level = perm.permissionLevel;
                            return (
                              <tr key={perm.moduleName} className="border-b border-neutral-900/20 hover:bg-[#121214]/10 transition-colors">
                                <td className="py-4 px-2 font-bold text-white text-[12px]">{perm.moduleName}</td>
                                
                                {/* NONE column */}
                                <td className="py-4 px-2 text-center align-middle">
                                  {level === 'NONE' && (
                                    <div className="relative inline-block text-left">
                                      <button
                                        type="button"
                                        onClick={() => setActiveDropdownRow(activeDropdownRow === perm.moduleName ? null : perm.moduleName)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-800 text-neutral-450 border border-neutral-700 text-[10px] font-black tracking-tight uppercase hover:bg-neutral-700 transition-all select-none"
                                      >
                                        None <span className="text-[8px]">▼</span>
                                      </button>
                                      {activeDropdownRow === perm.moduleName && renderDropdown(perm.moduleName, 'NONE')}
                                    </div>
                                  )}
                                </td>

                                {/* READ column */}
                                <td className="py-4 px-2 text-center align-middle">
                                  {level === 'READ' && (
                                    <div className="relative inline-block text-left">
                                      <button
                                        type="button"
                                        onClick={() => setActiveDropdownRow(activeDropdownRow === perm.moduleName ? null : perm.moduleName)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black tracking-tight uppercase hover:bg-emerald-500/20 transition-all select-none"
                                      >
                                        Read <span className="text-[8px]">▼</span>
                                      </button>
                                      {activeDropdownRow === perm.moduleName && renderDropdown(perm.moduleName, 'READ')}
                                    </div>
                                  )}
                                </td>

                                {/* WRITE column */}
                                <td className="py-4 px-2 text-center align-middle">
                                  {level === 'WRITE' && (
                                    <div className="relative inline-block text-left">
                                      <button
                                        type="button"
                                        onClick={() => setActiveDropdownRow(activeDropdownRow === perm.moduleName ? null : perm.moduleName)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-black tracking-tight uppercase hover:bg-blue-500/20 transition-all select-none"
                                      >
                                        Write <span className="text-[8px]">▼</span>
                                      </button>
                                      {activeDropdownRow === perm.moduleName && renderDropdown(perm.moduleName, 'WRITE')}
                                    </div>
                                  )}
                                </td>

                                {/* ADMIN column */}
                                <td className="py-4 px-2 text-center align-middle">
                                  {level === 'ADMIN' && (
                                    <div className="relative inline-block text-left">
                                      <button
                                        type="button"
                                        onClick={() => setActiveDropdownRow(activeDropdownRow === perm.moduleName ? null : perm.moduleName)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF5A1F]/10 text-[#FF5A1F] border border-[#FF5A1F]/20 text-[10px] font-black tracking-tight uppercase hover:bg-[#FF5A1F]/20 transition-all select-none"
                                      >
                                        Admin <span className="text-[8px]">▼</span>
                                      </button>
                                      {activeDropdownRow === perm.moduleName && renderDropdown(perm.moduleName, 'ADMIN')}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Actions row at the bottom */}
                    <div className="flex justify-end gap-3 border-t border-neutral-900/60 pt-5 mt-5">
                      <button
                        onClick={handleResetToDefault}
                        className="border border-neutral-800 hover:bg-neutral-850 text-neutral-350 hover:text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors focus:outline-none"
                      >
                        Reset to default
                      </button>
                      <button
                        onClick={handleSaveRole}
                        disabled={rolesSaving}
                        className="bg-[#FF5A1F] hover:bg-[#E54E18] disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition-colors focus:outline-none"
                      >
                        {rolesSaving ? 'Saving...' : 'Save role'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Create Role Modal Overlay */}
        {newRoleModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0C0C0D] border border-neutral-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl animate-fade-in">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-2.5">
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">New role</h3>
                <button onClick={() => setNewRoleModalOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleCreateRole} className="space-y-4 text-[11px] font-sans">
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-bold block">Role Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Threat Hunter"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    className="w-full bg-[#121214] border border-neutral-855 rounded-lg px-3 py-2 text-white placeholder:text-neutral-750 focus:outline-none focus:border-neutral-700 transition-colors"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setNewRoleModalOpen(false)}
                    className="border border-neutral-855 hover:bg-neutral-900 text-neutral-400 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Create Role
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tab 0.8: Data Sources Panel */}
        {activeTab === 'Data Sources' && (
          <div className="space-y-6 animate-fade-in text-xs font-sans">
            {sourcesLoading ? (
              <div className="py-12 text-center text-xs text-neutral-500 font-bold uppercase tracking-widest animate-pulse">
                Loading Data Sources...
              </div>
            ) : (
              <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-6 shadow-sm space-y-6">
                
                {/* Header row */}
                <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">Cloud & log sources</h3>
                    <p className="text-[10px] text-neutral-500 mt-1 font-semibold">
                      {dataSources.length} available &middot; {dataSources.filter(s => s.status === 'Connected').length} connected
                    </p>
                  </div>
                  <button 
                    onClick={() => setAddSourceModalOpen(true)}
                    className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 transition-colors focus:outline-none"
                  >
                    Add data source
                  </button>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {dataSources.map((source) => {
                    const isConnected = source.status === 'Connected';
                    return (
                      <div 
                        key={source.id} 
                        className="bg-[#121214]/60 border border-neutral-850 rounded-xl p-5 hover:border-neutral-700 transition-all flex flex-col justify-between h-[210px]"
                      >
                        {/* Upper row: provider tag and status badge */}
                        <div className="flex items-center justify-between">
                          <div className={clsx(
                            "px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider select-none",
                            source.provider === 'AWS' ? "bg-amber-500/10 text-amber-500" :
                            source.provider === 'AZ' ? "bg-blue-500/10 text-blue-400" :
                            source.provider === 'SP' ? "bg-neutral-800 text-neutral-450 border border-neutral-700" :
                            "bg-neutral-800 text-neutral-350"
                          )}>
                            {source.provider}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-bold">
                            <span className={clsx(
                              "w-1.5 h-1.5 rounded-full inline-block",
                              isConnected ? "bg-emerald-400" : "bg-neutral-650"
                            )} />
                            <span className={isConnected ? "text-emerald-400" : "text-neutral-500"}>
                              {isConnected ? 'Connected' : 'Not connected'}
                            </span>
                          </div>
                        </div>

                        {/* Title & description */}
                        <div className="space-y-1.5 my-3">
                          <h4 className="text-xs font-black text-white">{source.name}</h4>
                          <p className="text-[10px] text-neutral-450 leading-relaxed font-semibold line-clamp-2">
                            {source.description}
                          </p>
                          {isConnected && (
                            <p className="text-[9px] text-neutral-500 font-bold tracking-tight">
                              Last sync: {source.lastSync || 'Never'}
                            </p>
                          )}
                        </div>

                        {/* Footer actions */}
                        <div className="border-t border-neutral-900/60 pt-3">
                          {isConnected ? (
                            <div className="flex items-center justify-between gap-3 text-[10px] font-bold">
                              <button 
                                onClick={() => handleDisconnectSource(source.id)}
                                className="border border-neutral-800 hover:bg-[#DC2626]/10 hover:border-[#DC2626]/20 text-neutral-400 hover:text-red-450 px-3.5 py-1.5 rounded-lg transition-colors focus:outline-none"
                              >
                                Disconnect
                              </button>
                              <button 
                                onClick={() => handleSyncSource(source.id)}
                                disabled={syncingSourceId === source.id}
                                className="bg-[#18181B] hover:bg-neutral-900 border border-neutral-800 text-white px-3.5 py-1.5 rounded-lg transition-colors focus:outline-none flex items-center gap-1 min-w-[75px] justify-center"
                              >
                                {syncingSourceId === source.id ? (
                                  <span className="w-2.5 h-2.5 border-2 border-neutral-400 border-t-white rounded-full animate-spin" />
                                ) : (
                                  'Sync now'
                                )}
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => {
                                setActiveSourceToConnect(source);
                                setConnectModalOpen(true);
                              }}
                              className="w-full bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold py-2 rounded-xl text-center transition-colors focus:outline-none"
                            >
                              Connect
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add Data Source Modal */}
        {addSourceModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0C0C0D] border border-neutral-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl animate-fade-in text-xs font-sans">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-2.5">
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">Add data source</h3>
                <button onClick={() => setAddSourceModalOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleAddDataSource} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-bold block text-[10px] uppercase">Source Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AWS VPC Flow Logs"
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    className="w-full bg-[#121214] border border-neutral-855 rounded-lg px-3 py-2 text-white placeholder:text-neutral-755 focus:outline-none focus:border-neutral-700 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-bold block text-[10px] uppercase">Provider Prefix</label>
                  <select
                    value={newSourceProvider}
                    onChange={(e) => setNewSourceProvider(e.target.value)}
                    className="w-full bg-[#121214] border border-neutral-855 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-neutral-700 cursor-pointer"
                  >
                    <option value="AWS">AWS</option>
                    <option value="AZ">AZ (Azure)</option>
                    <option value="SP">SP (Splunk)</option>
                    <option value="SYS">SYS (System/Network)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-bold block text-[10px] uppercase">Description</label>
                  <textarea
                    required
                    placeholder="Describe log source ingestion..."
                    value={newSourceDesc}
                    onChange={(e) => setNewSourceDesc(e.target.value)}
                    rows={3}
                    className="w-full bg-[#121214] border border-neutral-855 rounded-lg px-3 py-2 text-white placeholder:text-neutral-755 focus:outline-none focus:border-neutral-700 transition-colors resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddSourceModalOpen(false)}
                    className="border border-neutral-855 hover:bg-neutral-900 text-neutral-400 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Add Source
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Connect Credentials Modal */}
        {connectModalOpen && activeSourceToConnect && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0C0C0D] border border-neutral-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl animate-fade-in text-xs font-sans">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-2.5">
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">Configure {activeSourceToConnect.name}</h3>
                <button onClick={() => setConnectModalOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleConnectSource} className="space-y-4">
                <p className="text-[10px] text-neutral-500 font-medium">Enter connection details to link telemetry ingestion.</p>
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-bold block text-[10px] uppercase">
                    {activeSourceToConnect.provider === 'AWS' ? 'AWS Account ID / Role ARN' :
                     activeSourceToConnect.provider === 'AZ' ? 'Azure Client ID / Tenant ID' :
                     activeSourceToConnect.provider === 'SP' ? 'Splunk API HEC Token' : 'Ingestion Port / Endpoint'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter configuration credential"
                    value={connectCred1}
                    onChange={(e) => setConnectCred1(e.target.value)}
                    className="w-full bg-[#121214] border border-neutral-855 rounded-lg px-3 py-2 text-white placeholder:text-neutral-750 focus:outline-none focus:border-neutral-700 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-bold block text-[10px] uppercase">API Region / Secret Key</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••••••"
                    value={connectCred2}
                    onChange={(e) => setConnectCred2(e.target.value)}
                    className="w-full bg-[#121214] border border-neutral-855 rounded-lg px-3 py-2 text-white placeholder:text-neutral-750 focus:outline-none focus:border-neutral-700 transition-colors"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setConnectModalOpen(false)}
                    className="border border-neutral-855 hover:bg-neutral-900 text-neutral-400 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-[#FF5A1F] hover:bg-[#E54E18] text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Confirm Connect
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Placeholder for Development modules */}
        {['Agent Deployment'].includes(activeTab) && (
          <InDevelopment>
            <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-white">{activeTab}</h3>
              <p className="text-[10px] text-neutral-500">Settings panel for managing {activeTab.toLowerCase()}.</p>
            </div>
          </InDevelopment>
        )}

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
