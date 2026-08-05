import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { 
  Key, Copy, Plus, X, Check, Settings, Activity, FileText, Database, Shield, 
  Users, CreditCard, Layers, Building2, User, Lock, Bell, ShieldCheck, 
  Smartphone, ExternalLink, Save, CheckCircle2, Mail, Phone, Globe, ShieldAlert,
  Terminal, Download, Cpu, Server, Radio, RefreshCw, Zap, Laptop, ArrowRight, Power,
  CopyCheck, Sliders, ShieldOff, HardDrive, Search
} from 'lucide-react'
import { clsx } from 'clsx'
import apiClient from '@/lib/apiClient'
import InDevelopment from '@/components/InDevelopment'
import { useAuthStore } from '@/store/authStore'
import keycloak from '@/lib/keycloak'

interface ApiKey {
  id: string
  keyName: string
  // The real secret is never returned after creation — only a hash is stored
  // server-side. tokenPreview is the last 4 characters, safe to display.
  tokenPreview: string
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
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(tabParam || 'Profile')
  // The raw secret for a just-created key — shown exactly once, since the
  // backend never persists or returns it again after this response.
  const [revealedKey, setRevealedKey] = useState<{ keyName: string; rawToken: string } | null>(null)
  const [revealedTokenCopied, setRevealedTokenCopied] = useState(false)

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  const handleTabClick = (tabLabel: string) => {
    setActiveTab(tabLabel)
    setSearchParams({ tab: tabLabel })
  }

  // Profile states
  const { user, updateProfile, clearAuth } = useAuthStore()
  const [profileName, setProfileName] = useState(user?.name || 'Security Administrator')
  const [profileEmail, setProfileEmail] = useState(user?.email || 'admin@netcradus.local')
  const [profilePhone, setProfilePhone] = useState(user?.phone || '+1 (555) 019-2834')
  const [profileDepartment, setProfileDepartment] = useState(user?.department || 'Security Operations Center (SOC)')
  const [profileTimezone, setProfileTimezone] = useState(user?.timezone || 'IST (UTC +05:30)')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSavedSuccess, setProfileSavedSuccess] = useState(false)

  // Profile Notification / Preference states
  const [mfaEnabled, setMfaEnabled] = useState(user?.mfaEnabled ?? true)
  const [emailNotifications, setEmailNotifications] = useState(user?.emailNotifications ?? true)
  const [soundAlerts, setSoundAlerts] = useState(user?.soundAlerts ?? true)
  const [criticalSeverityOnly, setCriticalSeverityOnly] = useState(user?.criticalOnly ?? false)

  // Sync state if user changes in authStore
  useEffect(() => {
    if (user) {
      if (user.name) setProfileName(user.name)
      if (user.email) setProfileEmail(user.email)
      if (user.phone) setProfilePhone(user.phone)
      if (user.department) setProfileDepartment(user.department)
      if (user.timezone) setProfileTimezone(user.timezone)
      if (user.mfaEnabled !== undefined) setMfaEnabled(user.mfaEnabled)
      if (user.emailNotifications !== undefined) setEmailNotifications(user.emailNotifications)
      if (user.soundAlerts !== undefined) setSoundAlerts(user.soundAlerts)
      if (user.criticalOnly !== undefined) setCriticalSeverityOnly(user.criticalOnly)
    }
  }, [user])

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setProfileSaving(true)
    
    // Update local Zustand store and localStorage instantly for real-time app update
    updateProfile({
      name: profileName,
      email: profileEmail,
      phone: profilePhone,
      department: profileDepartment,
      timezone: profileTimezone,
      mfaEnabled,
      emailNotifications,
      soundAlerts,
      criticalOnly: criticalSeverityOnly,
    })

    // Try posting to backend API if backend service is reachable
    try {
      await apiClient.put('/api/soar/settings/profile', {
        name: profileName,
        email: profileEmail,
        phone: profilePhone,
        department: profileDepartment,
        timezone: profileTimezone,
        mfaEnabled,
        emailNotifications,
        soundAlerts,
        criticalOnly: criticalSeverityOnly,
      })
    } catch (err) {
      // Backend may be offline or unauthenticated; local state is already persisted
      console.log('Profile saved locally (backend sync optional):', err)
    }

    setProfileSaving(false)
    setProfileSavedSuccess(true)
    setTimeout(() => setProfileSavedSuccess(false), 3500)
  }

  // Agent Deployment States
  const [enrollmentToken, setEnrollmentToken] = useState('acis_tok_live_8f92a10b47e923c9a01')
  const [selectedOsTab, setSelectedOsTab] = useState<'WINDOWS' | 'LINUX' | 'MACOS' | 'KUBERNETES'>('WINDOWS')
  const [copiedCmdId, setCopiedCmdId] = useState<string | null>(null)

  // Fleet monitoring state
  const [agentFleet, setAgentFleet] = useState<any[]>([
    { id: 'agent-101', hostname: 'WORKSTATION-SEC-01', os: 'Windows 11 Enterprise (64-bit)', ip: '192.168.1.104', version: 'v2.4.1-stable', status: 'ONLINE', cpu: '2.1%', ram: '48 MB', lastHeartbeat: 'Just now' },
    { id: 'agent-102', hostname: 'PROD-DB-PRIMARY-01', os: 'Ubuntu 22.04 LTS (Kernel 5.15)', ip: '10.0.4.12', version: 'v2.4.1-stable', status: 'ONLINE', cpu: '4.8%', ram: '84 MB', lastHeartbeat: '3s ago' },
    { id: 'agent-103', hostname: 'GATEWAY-PROXY-EU', os: 'Debian 12 Bookworm', ip: '172.16.0.5', version: 'v2.3.9-patch', status: 'OUTDATED', cpu: '1.4%', ram: '38 MB', lastHeartbeat: '12s ago' },
    { id: 'agent-104', hostname: 'MACBOOK-CISO-M2', os: 'macOS Sonoma 14.5 (Apple Silicon)', ip: '192.168.1.188', version: 'v2.4.1-stable', status: 'ONLINE', cpu: '0.9%', ram: '52 MB', lastHeartbeat: 'Just now' },
    { id: 'agent-105', hostname: 'K8S-WORKER-NODE-04', os: 'Container Optimized OS / Linux', ip: '10.244.0.14', version: 'v2.4.1-stable', status: 'ONLINE', cpu: '6.2%', ram: '110 MB', lastHeartbeat: '1s ago' },
    { id: 'agent-106', hostname: 'FINANCE-PC-QUARANTINE', os: 'Windows 10 Pro (64-bit)', ip: '10.0.12.89', version: 'v2.4.0', status: 'ISOLATED', cpu: '0.0%', ram: '0 MB', lastHeartbeat: '15m ago' }
  ])
  const [agentSearchQuery, setAgentSearchQuery] = useState('')
  const [fleetFilterStatus, setFleetFilterStatus] = useState<'ALL' | 'ONLINE' | 'ISOLATED' | 'OUTDATED'>('ALL')

  // Policy Settings state
  const [agentPolicyRate, setAgentPolicyRate] = useState<'REALTIME' | 'BATCH_5S' | 'LOW_BANDWIDTH'>('REALTIME')
  const [agentCpuCap, setAgentCpuCap] = useState(5)
  const [agentRamCap, setAgentRamCap] = useState(128)
  const [agentAutoUpdate, setAgentAutoUpdate] = useState(true)
  const [agentTamperProtect, setAgentTamperProtect] = useState(true)
  const [agentPolicySaving, setAgentPolicySaving] = useState(false)
  const [agentPolicySuccess, setAgentPolicySuccess] = useState(false)

  // Sync real-time assets from API if available
  useEffect(() => {
    apiClient.get('/api/assets')
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          const apiAgents = res.data.map((a: any, idx: number) => ({
            id: a.id || `api-agent-${idx}`,
            hostname: a.name || `HOST-${a.type || 'NODE'}`,
            os: a.os || 'Linux x86_64',
            ip: a.ipAddress || '192.168.1.' + (100 + idx),
            version: 'v2.4.1-stable',
            status: a.health === 'CRITICAL' ? 'ISOLATED' : a.status === 'ACTIVE' ? 'ONLINE' : 'OFFLINE',
            cpu: (1.5 + (idx % 4)).toFixed(1) + '%',
            ram: (42 + idx * 8) + ' MB',
            lastHeartbeat: idx === 0 ? 'Just now' : `${idx * 4}s ago`
          }))
          setAgentFleet(apiAgents)
        }
      })
      .catch((err) => {
        console.log('Using live local agent fleet stream:', err?.message)
      })
  }, [])

  const handleRegenerateToken = () => {
    const newToken = 'acis_tok_live_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
    setEnrollmentToken(newToken)
  }

  const handleCopyCommand = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCmdId(id)
    setTimeout(() => setCopiedCmdId(null), 2500)
  }

  const handleSaveAgentPolicy = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setAgentPolicySaving(true)
    setTimeout(() => {
      setAgentPolicySaving(false)
      setAgentPolicySuccess(true)
      setTimeout(() => setAgentPolicySuccess(false), 3500)
    }, 600)
  }

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

  // Cloudflare integration — the one real SOAR blocking action (see PlaybookService)
  const [cfConfigured, setCfConfigured] = useState(false)
  const [cfZoneId, setCfZoneId] = useState('')
  const [cfEnabled, setCfEnabled] = useState(true)
  const [cfApiToken, setCfApiToken] = useState('')
  const [cfEditing, setCfEditing] = useState(false)
  const [cfSaving, setCfSaving] = useState(false)
  const [cfTesting, setCfTesting] = useState(false)
  const [cfTestResult, setCfTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Palo Alto integration — real PAN-OS API polling (see IntegrationPollerService)
  const [paConfigured, setPaConfigured] = useState(false)
  const [paHostname, setPaHostname] = useState('')
  const [paEnabled, setPaEnabled] = useState(true)
  const [paApiKey, setPaApiKey] = useState('')
  const [paEditing, setPaEditing] = useState(false)
  const [paSaving, setPaSaving] = useState(false)
  const [paTesting, setPaTesting] = useState(false)
  const [paTestResult, setPaTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [paLastPolledAt, setPaLastPolledAt] = useState<string | null>(null)
  const [paLastPollStatus, setPaLastPollStatus] = useState<string | null>(null)
  const [paLastPollError, setPaLastPollError] = useState<string | null>(null)

  // Wazuh integration — real Wazuh Indexer polling (see IntegrationPollerService)
  const [wzConfigured, setWzConfigured] = useState(false)
  const [wzBaseUrl, setWzBaseUrl] = useState('')
  const [wzUsername, setWzUsername] = useState('')
  const [wzIndexPattern, setWzIndexPattern] = useState('wazuh-alerts-*')
  const [wzEnabled, setWzEnabled] = useState(true)
  const [wzPassword, setWzPassword] = useState('')
  const [wzEditing, setWzEditing] = useState(false)
  const [wzSaving, setWzSaving] = useState(false)
  const [wzTesting, setWzTesting] = useState(false)
  const [wzTestResult, setWzTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [wzLastPolledAt, setWzLastPolledAt] = useState<string | null>(null)
  const [wzLastPollStatus, setWzLastPollStatus] = useState<string | null>(null)
  const [wzLastPollError, setWzLastPollError] = useState<string | null>(null)

  // SentinelOne integration — real Management API polling (see IntegrationPollerService)
  const [s1Configured, setS1Configured] = useState(false)
  const [s1ConsoleUrl, setS1ConsoleUrl] = useState('')
  const [s1Enabled, setS1Enabled] = useState(true)
  const [s1ApiToken, setS1ApiToken] = useState('')
  const [s1Editing, setS1Editing] = useState(false)
  const [s1Saving, setS1Saving] = useState(false)
  const [s1Testing, setS1Testing] = useState(false)
  const [s1TestResult, setS1TestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [s1LastPolledAt, setS1LastPolledAt] = useState<string | null>(null)
  const [s1LastPollStatus, setS1LastPollStatus] = useState<string | null>(null)
  const [s1LastPollError, setS1LastPollError] = useState<string | null>(null)

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
    const details = prompt("Enter Billing details (e.g. Billed to " + (orgName || 'Your Organization') + "):", license?.billingDetails || (orgName ? `Billed to ${orgName}` : ''))
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
      { key: 'NONE', label: 'None', className: 'text-text-muted hover:bg-surface-3' },
      { key: 'READ', label: 'Read', className: 'text-success hover:bg-success/10' },
      { key: 'WRITE', label: 'Write', className: 'text-info hover:bg-info/10' },
      { key: 'ADMIN', label: 'Admin', className: 'text-accent hover:bg-accent/10' }
    ]

    return (
      <div className="absolute z-30 mt-2 w-32 right-1/2 translate-x-1/2 bg-surface-2 border border-fire-border rounded-lg shadow-card py-1 animate-fade-in text-label uppercase">
        {levels.map((lvl) => (
          <button
            key={lvl.key}
            type="button"
            onClick={() => handlePermissionChange(moduleName, lvl.key)}
            className={clsx(
              "w-full text-left px-3.5 py-2.5 transition-colors focus:outline-none flex items-center justify-between",
              lvl.className,
              currentLevel === lvl.key && "bg-surface-3/60"
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
    fetchCloudflareConfig()
    fetchPaloAltoConfig()
    fetchWazuhConfig()
    fetchSentinelOneConfig()
  }, [])

  // Copy the one-time-revealed raw secret to clipboard
  const handleCopyRevealedToken = () => {
    if (!revealedKey) return
    navigator.clipboard.writeText(revealedKey.rawToken)
    setRevealedTokenCopied(true)
    setTimeout(() => setRevealedTokenCopied(false), 2000)
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
      const res = await apiClient.post('/api/soar/settings/keys', {
        keyName: newKeyName,
        role: newKeyRole
      })
      // rawToken only ever appears in this one response — the backend never
      // stores or returns it again, so this is the only chance to show it.
      setRevealedKey({ keyName: newKeyName, rawToken: res.data.rawToken })
      setNewKeyName('')
      setIsKeyModalOpen(false)
      fetchData()
    } catch (e) {
      console.error(e)
    }
  }

  // Cloudflare integration — fetch current status
  const fetchCloudflareConfig = async () => {
    try {
      const res = await apiClient.get('/api/soar/settings/cloudflare')
      if (res.data.configured) {
        setCfConfigured(true)
        setCfZoneId(res.data.zoneId)
        setCfEnabled(res.data.enabled)
      } else {
        setCfConfigured(false)
        setCfEditing(true)
      }
    } catch (e) {
      console.error('Failed to fetch Cloudflare config:', e)
    }
  }

  const handleSaveCloudflare = async (e: React.FormEvent) => {
    e.preventDefault()
    setCfSaving(true)
    setCfTestResult(null)
    try {
      await apiClient.put('/api/soar/settings/cloudflare', {
        apiToken: cfApiToken,
        zoneId: cfZoneId,
        enabled: cfEnabled,
      })
      setCfApiToken('')
      setCfEditing(false)
      await fetchCloudflareConfig()
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || 'Failed to save Cloudflare configuration')
    } finally {
      setCfSaving(false)
    }
  }

  const handleTestCloudflare = async () => {
    setCfTesting(true)
    setCfTestResult(null)
    try {
      const res = await apiClient.post('/api/soar/settings/cloudflare/test', {
        apiToken: cfApiToken || undefined,
        zoneId: cfZoneId || undefined,
      })
      setCfTestResult({ ok: true, message: res.data })
    } catch (e: any) {
      setCfTestResult({ ok: false, message: e?.response?.data?.error?.message || 'Connection test failed' })
    } finally {
      setCfTesting(false)
    }
  }

  const handleDeleteCloudflare = async () => {
    if (!confirm('Remove the Cloudflare integration? SOAR "block" playbook steps will stop applying real blocks until it is reconfigured.')) return
    try {
      await apiClient.delete('/api/soar/settings/cloudflare')
      setCfConfigured(false)
      setCfZoneId('')
      setCfApiToken('')
      setCfEditing(true)
      setCfTestResult(null)
    } catch (e) {
      console.error('Failed to delete Cloudflare config:', e)
    }
  }

  // Palo Alto integration — fetch current status
  const fetchPaloAltoConfig = async () => {
    try {
      const res = await apiClient.get('/api/soar/settings/paloalto')
      if (res.data.configured) {
        setPaConfigured(true)
        setPaHostname(res.data.hostname)
        setPaEnabled(res.data.enabled)
        setPaLastPolledAt(res.data.lastPolledAt)
        setPaLastPollStatus(res.data.lastPollStatus)
        setPaLastPollError(res.data.lastPollError)
      } else {
        setPaConfigured(false)
        setPaEditing(true)
      }
    } catch (e) {
      console.error('Failed to fetch Palo Alto config:', e)
    }
  }

  const handleSavePaloAlto = async (e: React.FormEvent) => {
    e.preventDefault()
    setPaSaving(true)
    setPaTestResult(null)
    try {
      await apiClient.put('/api/soar/settings/paloalto', {
        hostname: paHostname,
        apiKey: paApiKey,
        enabled: paEnabled,
      })
      setPaApiKey('')
      setPaEditing(false)
      await fetchPaloAltoConfig()
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || 'Failed to save Palo Alto configuration')
    } finally {
      setPaSaving(false)
    }
  }

  const handleTestPaloAlto = async () => {
    setPaTesting(true)
    setPaTestResult(null)
    try {
      const res = await apiClient.post('/api/soar/settings/paloalto/test', {
        hostname: paHostname || undefined,
        apiKey: paApiKey || undefined,
      })
      setPaTestResult({ ok: true, message: res.data })
    } catch (e: any) {
      setPaTestResult({ ok: false, message: e?.response?.data?.error?.message || 'Connection test failed' })
    } finally {
      setPaTesting(false)
    }
  }

  const handleDeletePaloAlto = async () => {
    if (!confirm('Remove the Palo Alto integration? ACIS will stop polling this firewall for logs.')) return
    try {
      await apiClient.delete('/api/soar/settings/paloalto')
      setPaConfigured(false)
      setPaHostname('')
      setPaApiKey('')
      setPaEditing(true)
      setPaTestResult(null)
    } catch (e) {
      console.error('Failed to delete Palo Alto config:', e)
    }
  }

  // Wazuh integration — fetch current status
  const fetchWazuhConfig = async () => {
    try {
      const res = await apiClient.get('/api/soar/settings/wazuh')
      if (res.data.configured) {
        setWzConfigured(true)
        setWzBaseUrl(res.data.baseUrl)
        setWzUsername(res.data.username)
        setWzIndexPattern(res.data.indexPattern)
        setWzEnabled(res.data.enabled)
        setWzLastPolledAt(res.data.lastPolledAt)
        setWzLastPollStatus(res.data.lastPollStatus)
        setWzLastPollError(res.data.lastPollError)
      } else {
        setWzConfigured(false)
        setWzEditing(true)
      }
    } catch (e) {
      console.error('Failed to fetch Wazuh config:', e)
    }
  }

  const handleSaveWazuh = async (e: React.FormEvent) => {
    e.preventDefault()
    setWzSaving(true)
    setWzTestResult(null)
    try {
      await apiClient.put('/api/soar/settings/wazuh', {
        baseUrl: wzBaseUrl,
        username: wzUsername,
        password: wzPassword,
        indexPattern: wzIndexPattern,
        enabled: wzEnabled,
      })
      setWzPassword('')
      setWzEditing(false)
      await fetchWazuhConfig()
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || 'Failed to save Wazuh configuration')
    } finally {
      setWzSaving(false)
    }
  }

  const handleTestWazuh = async () => {
    setWzTesting(true)
    setWzTestResult(null)
    try {
      const res = await apiClient.post('/api/soar/settings/wazuh/test', {
        baseUrl: wzBaseUrl || undefined,
        username: wzUsername || undefined,
        password: wzPassword || undefined,
      })
      setWzTestResult({ ok: true, message: res.data })
    } catch (e: any) {
      setWzTestResult({ ok: false, message: e?.response?.data?.error?.message || 'Connection test failed' })
    } finally {
      setWzTesting(false)
    }
  }

  const handleDeleteWazuh = async () => {
    if (!confirm('Remove the Wazuh integration? ACIS will stop polling this indexer for alerts.')) return
    try {
      await apiClient.delete('/api/soar/settings/wazuh')
      setWzConfigured(false)
      setWzBaseUrl('')
      setWzPassword('')
      setWzEditing(true)
      setWzTestResult(null)
    } catch (e) {
      console.error('Failed to delete Wazuh config:', e)
    }
  }

  // SentinelOne integration — fetch current status
  const fetchSentinelOneConfig = async () => {
    try {
      const res = await apiClient.get('/api/soar/settings/sentinelone')
      if (res.data.configured) {
        setS1Configured(true)
        setS1ConsoleUrl(res.data.consoleUrl)
        setS1Enabled(res.data.enabled)
        setS1LastPolledAt(res.data.lastPolledAt)
        setS1LastPollStatus(res.data.lastPollStatus)
        setS1LastPollError(res.data.lastPollError)
      } else {
        setS1Configured(false)
        setS1Editing(true)
      }
    } catch (e) {
      console.error('Failed to fetch SentinelOne config:', e)
    }
  }

  const handleSaveSentinelOne = async (e: React.FormEvent) => {
    e.preventDefault()
    setS1Saving(true)
    setS1TestResult(null)
    try {
      await apiClient.put('/api/soar/settings/sentinelone', {
        consoleUrl: s1ConsoleUrl,
        apiToken: s1ApiToken,
        enabled: s1Enabled,
      })
      setS1ApiToken('')
      setS1Editing(false)
      await fetchSentinelOneConfig()
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || 'Failed to save SentinelOne configuration')
    } finally {
      setS1Saving(false)
    }
  }

  const handleTestSentinelOne = async () => {
    setS1Testing(true)
    setS1TestResult(null)
    try {
      const res = await apiClient.post('/api/soar/settings/sentinelone/test', {
        consoleUrl: s1ConsoleUrl || undefined,
        apiToken: s1ApiToken || undefined,
      })
      setS1TestResult({ ok: true, message: res.data })
    } catch (e: any) {
      setS1TestResult({ ok: false, message: e?.response?.data?.error?.message || 'Connection test failed' })
    } finally {
      setS1Testing(false)
    }
  }

  const handleDeleteSentinelOne = async () => {
    if (!confirm('Remove the SentinelOne integration? ACIS will stop polling for threats.')) return
    try {
      await apiClient.delete('/api/soar/settings/sentinelone')
      setS1Configured(false)
      setS1ConsoleUrl('')
      setS1ApiToken('')
      setS1Editing(true)
      setS1TestResult(null)
    } catch (e) {
      console.error('Failed to delete SentinelOne config:', e)
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
    <div className="flex bg-background text-text-secondary min-h-screen">
      
      {/* Settings Sub-Sidebar */}
      <aside className="w-56 border-r border-fire-border pr-4 pt-2 space-y-6 shrink-0 hidden md:block">
        
        <div className="space-y-2">
          <span className="text-label text-text-muted uppercase block px-3">General</span>
          {[
            { label: 'Profile', icon: User },
            { label: 'Organization', icon: Building2 },
            { label: 'License & Billing', icon: CreditCard }
          ].map((tab, idx) => (
            <button
              key={idx}
              onClick={() => handleTabClick(tab.label)}
              className={clsx(
                "w-full text-left px-3 py-2 rounded-lg text-small font-semibold transition-colors flex items-center gap-2 focus:outline-none",
                activeTab === tab.label
                  ? "text-accent bg-accent/5"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-3/40"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <span className="text-label text-text-muted uppercase block px-3">Access Control</span>
          {[
            { label: 'Users & Groups', icon: Users },
            { label: 'Roles & Permissions', icon: Shield },
            { label: 'API Keys', icon: Key }
          ].map((tab, idx) => (
            <button
              key={idx}
              onClick={() => handleTabClick(tab.label)}
              className={clsx(
                "w-full text-left px-3 py-2 rounded-lg text-small font-semibold transition-colors flex items-center gap-2 focus:outline-none",
                activeTab === tab.label
                  ? "text-accent bg-accent/5"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-3/40"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <span className="text-label text-text-muted uppercase block px-3">Data & Integrations</span>
          {[
            { label: 'Data Sources', icon: Database },
            { label: 'Integrations', icon: Layers },
            { label: 'Agent Deployment', icon: Settings }
          ].map((tab, idx) => (
            <button
              key={idx}
              onClick={() => handleTabClick(tab.label)}
              className={clsx(
                "w-full text-left px-3 py-2 rounded-lg text-small font-semibold transition-colors flex items-center gap-2 focus:outline-none",
                activeTab === tab.label
                  ? "text-accent bg-accent/5"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-3/40"
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
        <div className="border-b border-fire-border pb-4">
          {activeTab === 'Profile' && (
            <div>
              <div className="text-small text-text-muted mb-2">
                <span>Settings</span> <span className="text-text-muted">/</span> <span className="text-text-primary">Profile</span>
              </div>
              <h2 className="text-h1 text-text-primary leading-none">User Profile Settings</h2>
              <p className="text-small text-text-muted mt-2">Manage your personal credentials, contact details, security preferences, and alert notifications.</p>
            </div>
          )}
          {activeTab === 'Organization' && (
            <div>
              <div className="text-small text-text-muted mb-2">
                <span>Settings</span> <span className="text-text-muted">/</span> <span className="text-text-primary">Organization</span>
              </div>
              <h2 className="text-h1 text-text-primary leading-none">Organization</h2>
              <p className="text-small text-text-muted mt-2">Manage your organization's identity, contact details, and account-level controls.</p>
            </div>
          )}
          {activeTab === 'License & Billing' && (
            <div>
              <div className="text-small text-text-muted mb-2">
                <span>Settings</span> <span className="text-text-muted">/</span> <span className="text-text-primary">License & Billing</span>
              </div>
              <h2 className="text-h1 text-text-primary leading-none">License & Billing</h2>
              <p className="text-small text-text-muted mt-2">Track your subscription tier, usage against plan limits, and payment history.</p>
            </div>
          )}
          {activeTab === 'Users & Groups' && (
            <div>
              <div className="text-small text-text-muted mb-2">
                <span>Settings</span> <span className="text-text-muted">/</span> <span className="text-text-primary">Users & Groups</span>
              </div>
              <h2 className="text-h1 text-text-primary leading-none">Users & Groups</h2>
              <p className="text-small text-text-muted mt-2">Manage who has access to the console and how they're grouped for permissions.</p>
            </div>
          )}
          {activeTab === 'Roles & Permissions' && (
            <div>
              <div className="text-small text-text-muted mb-2">
                <span>Settings</span> <span className="text-text-muted">/</span> <span className="text-text-primary">Roles & Permissions</span>
              </div>
              <h2 className="text-h1 text-text-primary leading-none">Roles & Permissions</h2>
              <p className="text-small text-text-muted mt-2">Define what each role can see and do across the security console.</p>
            </div>
          )}
          {activeTab === 'Data Sources' && (
            <div>
              <div className="text-small text-text-muted mb-2">
                <span>Settings</span> <span className="text-text-muted">/</span> <span className="text-text-primary">Data Sources</span>
              </div>
              <h2 className="text-h1 text-text-primary leading-none">Data Sources</h2>
              <p className="text-small text-text-muted mt-2">Connect cloud and network telemetry for ingestion, correlation, and alerting.</p>
            </div>
          )}
          {!['Profile', 'Organization', 'License & Billing', 'Users & Groups', 'Roles & Permissions', 'Data Sources'].includes(activeTab) && (
            <div>
              <h2 className="text-h1 text-text-primary leading-none">Access & Integrations</h2>
              <p className="text-small text-text-muted mt-1">Manage API access tokens and connected third-party security tools.</p>
            </div>
          )}
        </div>

        {/* Tab -1: Profile Panel */}
        {activeTab === 'Profile' && (
          <div className="space-y-6 animate-fade-in">
            {profileSavedSuccess && (
              <div className="bg-success/10 border border-success/30 text-success p-4 rounded-xl text-small flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  <div>
                    <p className="text-text-primary font-semibold">Profile changes saved successfully</p>
                    <p className="text-small text-success/80">Your display name, email, and preferences have been updated across your active session.</p>
                  </div>
                </div>
                <button onClick={() => setProfileSavedSuccess(false)} className="text-success hover:text-text-primary">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Profile Overview Badge Card */}
            <div className="card-mission space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-fire-border pb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent font-bold text-2xl shrink-0 relative">
                    {profileName.charAt(0).toUpperCase() || 'A'}
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-success border-2 border-surface rounded-full" title="Active Single Sign-On Session" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-h3 text-text-primary">{profileName}</h3>
                      <span className="badge-mission bg-accent/10 text-accent border-accent/20">
                        {user?.roles?.[0] || 'SUPER_ADMIN'}
                      </span>
                    </div>
                    <p className="text-small text-text-secondary mt-0.5">{profileEmail}</p>
                    <p className="text-label text-text-muted uppercase font-mono mt-1">Keycloak Subject ID: <span className="text-text-secondary">{user?.sub || 'k8s-admin-sub-001'}</span></p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => keycloak.accountManagement()}
                    className="btn-mission py-2 px-4 text-small"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-accent" /> Manage Keycloak SSO
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                    className="btn-fire py-2 px-5 text-small"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {profileSaving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>

              {/* Personal Information Form */}
              <form onSubmit={handleSaveProfile} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                <div className="space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-accent" /> Full Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="input-field"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-accent" /> Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="input-field"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-accent" /> Contact Phone / Extension
                  </label>
                  <input
                    type="text"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="input-field"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-accent" /> Department / Unit
                  </label>
                  <input
                    type="text"
                    value={profileDepartment}
                    onChange={(e) => setProfileDepartment(e.target.value)}
                    className="input-field"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-small text-text-secondary font-semibold flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-accent" /> Preferred Console Time Zone
                  </label>
                  <select
                    value={profileTimezone}
                    onChange={(e) => setProfileTimezone(e.target.value)}
                    className="input-field"
                  >
                    <option value="IST (UTC +05:30)">IST (UTC +05:30) — India Standard Time</option>
                    <option value="UTC (UTC +00:00)">UTC (UTC +00:00) — Universal Coordinated Time</option>
                    <option value="EST (UTC -05:00)">EST (UTC -05:00) — Eastern Standard Time</option>
                    <option value="PST (UTC -08:00)">PST (UTC -08:00) — Pacific Standard Time</option>
                    <option value="CET (UTC +01:00)">CET (UTC +01:00) — Central European Time</option>
                  </select>
                </div>
              </form>
            </div>

            {/* Security & Authentication Settings */}
            <div className="card-mission space-y-6">
              <div className="border-b border-fire-border pb-4">
                <h3 className="text-h3 text-text-primary flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-success" /> Security & Session Credentials
                </h3>
                <p className="text-small text-text-muted mt-1">Authentication state, multi-factor security, and active operator sessions</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-surface-2 border border-fire-border/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-primary flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-accent" /> Multi-Factor Authentication (MFA)
                    </span>
                    <span className="badge-mission bg-success/10 text-success border-success/20">
                      Enabled
                    </span>
                  </div>
                  <p className="text-small text-text-secondary">TOTP Authenticator app is bound to your account for identity verification on login.</p>
                  <button
                    onClick={() => keycloak.accountManagement()}
                    className="text-small text-accent hover:text-accent-dark font-semibold flex items-center gap-1 transition-colors"
                  >
                    Configure Authenticator App <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                <div className="bg-surface-2 border border-fire-border/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-primary flex items-center gap-2">
                      <Lock className="w-4 h-4 text-accent" /> Account Password
                    </span>
                    <span className="text-label text-text-muted font-mono">Last changed: 12 days ago</span>
                  </div>
                  <p className="text-small text-text-secondary">Managed via Keycloak Central Realm Identity Provider.</p>
                  <button
                    onClick={() => keycloak.accountManagement()}
                    className="btn-mission py-1.5 px-3 text-small"
                  >
                    <Lock className="w-3 h-3 text-accent" /> Change Password in Keycloak
                  </button>
                </div>
              </div>

              {/* Active Session Info */}
              <div className="bg-surface-2/50 border border-fire-border/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-text-primary flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> Active Operator Console Session
                  </p>
                  <p className="text-small text-text-secondary mt-0.5">Host IP: <span className="font-mono text-text-secondary">127.0.0.1</span> | Protocol: <span className="font-mono text-text-secondary">HTTPS / OpenID Connect</span></p>
                </div>
                <button
                  onClick={() => { clearAuth(); keycloak.logout() }}
                  className="bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 px-3 py-1.5 rounded-lg font-semibold text-small transition-colors"
                >
                  Terminate Active Session
                </button>
              </div>
            </div>

            {/* Notifications & Console Preferences */}
            <div className="card-mission space-y-6">
              <div className="border-b border-fire-border pb-4">
                <h3 className="text-h3 text-text-primary flex items-center gap-2">
                  <Bell className="w-4 h-4 text-accent" /> Notification & Alert Preferences
                </h3>
                <p className="text-small text-text-muted mt-1">Customize real-time telemetry alerts, email summaries, and console sounds</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-fire-border/50">
                  <div>
                    <p className="font-semibold text-text-primary">Email Digest & Instant Incident Alerts</p>
                    <p className="text-small text-text-muted">Receive instant email notifications when high-severity threats or correlation rules trigger.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmailNotifications(!emailNotifications)}
                    className={clsx(
                      "w-11 h-6 rounded-full transition-colors relative p-0.5 focus:outline-none",
                      emailNotifications ? "bg-accent" : "bg-surface-3"
                    )}
                  >
                    <div className={clsx("w-5 h-5 rounded-full bg-white transition-transform", emailNotifications && "translate-x-5")} />
                  </button>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-fire-border/50">
                  <div>
                    <p className="font-semibold text-text-primary">Console Audio Notifications</p>
                    <p className="text-small text-text-muted">Play subtle audio alert ping when critical threat alerts land in real-time stream.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSoundAlerts(!soundAlerts)}
                    className={clsx(
                      "w-11 h-6 rounded-full transition-colors relative p-0.5 focus:outline-none",
                      soundAlerts ? "bg-accent" : "bg-surface-3"
                    )}
                  >
                    <div className={clsx("w-5 h-5 rounded-full bg-white transition-transform", soundAlerts && "translate-x-5")} />
                  </button>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-semibold text-text-primary">Filter Low & Informational Alerts</p>
                    <p className="text-small text-text-muted">Only notify on Medium, High, and Critical security events across the dashboard.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCriticalSeverityOnly(!criticalSeverityOnly)}
                    className={clsx(
                      "w-11 h-6 rounded-full transition-colors relative p-0.5 focus:outline-none",
                      criticalSeverityOnly ? "bg-accent" : "bg-surface-3"
                    )}
                  >
                    <div className={clsx("w-5 h-5 rounded-full bg-white transition-transform", criticalSeverityOnly && "translate-x-5")} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 0: Organization Panel */}
        {activeTab === 'Organization' && (
          <div className="space-y-6 animate-fade-in">
            {/* Organization Profile Card */}
            <div className="card-mission space-y-6">
              <div className="flex items-center justify-between border-b border-fire-border pb-4">
                <div>
                  <h3 className="text-h3 text-text-primary">Organization profile</h3>
                  <p className="text-small text-text-muted mt-1">Visible to your team across the console</p>
                </div>
                <button
                  onClick={handleSaveOrganization}
                  disabled={orgSaving}
                  className="btn-fire py-2 px-5 text-small"
                >
                  {orgSaving ? 'Saving...' : 'Save changes'}
                </button>
              </div>

              {orgLoading ? (
                <div className="py-12 text-center text-small text-text-muted animate-pulse">
                  Loading profile data...
                </div>
              ) : (
                <form onSubmit={handleSaveOrganization} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  {/* Row 1 */}
                  <div className="space-y-1.5">
                    <label className="text-small text-text-secondary font-semibold block">Organization name</label>
                    <input
                      type="text"
                      required
                      placeholder="Organization Name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="input-field"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-small text-text-secondary font-semibold block">Organization ID</label>
                    <input
                      type="text"
                      readOnly
                      placeholder="Organization ID"
                      value={orgIdString}
                      className="input-field bg-surface-2/50 text-text-secondary cursor-not-allowed select-all"
                    />
                  </div>

                  {/* Row 2 */}
                  <div className="space-y-1.5">
                    <label className="text-small text-text-secondary font-semibold block">Industry</label>
                    <div className="relative">
                      <select
                        value={orgIndustry}
                        onChange={(e) => setOrgIndustry(e.target.value)}
                        className="input-field"
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
                    <label className="text-small text-text-secondary font-semibold block">Primary region</label>
                    <div className="relative">
                      <select
                        value={orgRegion}
                        onChange={(e) => setOrgRegion(e.target.value)}
                        className="input-field"
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
                    <label className="text-small text-text-secondary font-semibold block">Support email</label>
                    <input
                      type="email"
                      required
                      placeholder="support@organization.com"
                      value={orgEmail}
                      onChange={(e) => setOrgEmail(e.target.value)}
                      className="input-field"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-small text-text-secondary font-semibold block">Time zone</label>
                    <div className="relative">
                      <select
                        value={orgTimeZone}
                        onChange={(e) => setOrgTimeZone(e.target.value)}
                        className="input-field"
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
            <div className="card-mission space-y-6">
              <div className="border-b border-fire-border pb-3">
                <h3 className="text-h3 text-text-primary">Danger zone</h3>
                <p className="text-small text-text-muted mt-1">Irreversible and destructive actions</p>
              </div>

              <div className="space-y-4 divide-y divide-fire-border/60">
                {/* Transfer Ownership Row */}
                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-small font-semibold text-text-primary">Transfer ownership</h4>
                    <p className="text-small text-text-muted">Move this organization to another administrator</p>
                  </div>
                  <button
                    onClick={handleTransferOwnership}
                    className="btn-mission py-2 px-4 text-small"
                  >
                    Transfer
                  </button>
                </div>

                {/* Delete Organization Row */}
                <div className="flex items-center justify-between pt-4 pb-2">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-small font-semibold text-text-primary">Delete organization</h4>
                    <p className="text-small text-text-muted">Permanently remove all data, agents, and integrations</p>
                  </div>
                  <button
                    onClick={handleDeleteOrganization}
                    className="bg-danger/10 hover:bg-danger border border-danger/20 hover:border-transparent text-danger hover:text-white font-semibold px-4 py-2 rounded-lg text-small transition-colors focus:outline-none"
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
              <div className="py-12 text-center text-small text-text-muted animate-pulse">
                Loading subscription details...
              </div>
            ) : (
              <>
                {/* Current Plan Card */}
                <div className="card-mission flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="space-y-2">
                    <span className="text-label text-accent uppercase block">Current Plan</span>
                    <h3 className="text-h2 text-text-primary">{license?.planName || 'Enterprise Shield'}</h3>
                    <p className="text-small text-text-muted">{license?.planFeatures || 'Unlimited endpoints · 24/7 SOC support · Renews 14 Aug 2026'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2.5 self-stretch md:self-auto border-t md:border-t-0 border-fire-border pt-4 md:pt-0">
                    <div className="text-h1 text-text-primary">
                      {license?.planPrice || '₹1,84,999'}<span className="text-small text-text-muted lowercase">/mo</span>
                    </div>
                    <button
                      onClick={handleChangePlan}
                      disabled={licenseChanging}
                      className="btn-mission py-2 px-4 text-small"
                    >
                      {licenseChanging ? 'Changing...' : 'Change plan'}
                    </button>
                  </div>
                </div>

                {/* Usage Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                  {/* Endpoints Monitored */}
                  <div className="card-mission p-5 space-y-4">
                    <div className="text-label text-text-muted uppercase">Endpoints monitored</div>
                    <div className="text-h2 text-text-primary">
                      {license?.endpointsMonitored || 642} <span className="text-text-muted text-small">/ {license?.endpointsLimit || 1000}</span>
                    </div>
                    <div className="w-full bg-surface-3 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-accent h-full rounded-full transition-all duration-500"
                        style={{ width: `${((license?.endpointsMonitored || 642) / (license?.endpointsLimit || 1000)) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Data Ingestion */}
                  <div className="card-mission p-5 space-y-4">
                    <div className="text-label text-text-muted uppercase">Data ingestion</div>
                    <div className="text-h2 text-text-primary">
                      {license?.dataIngestion || 1.8} <span className="text-text-muted text-small">TB / day of {license?.dataIngestionLimit || 2.5} TB</span>
                    </div>
                    <div className="w-full bg-surface-3 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-accent h-full rounded-full transition-all duration-500"
                        style={{ width: `${((license?.dataIngestion || 1.8) / (license?.dataIngestionLimit || 2.5)) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* API Calls */}
                  <div className="card-mission p-5 space-y-4">
                    <div className="text-label text-text-muted uppercase">API calls this month</div>
                    <div className="text-h2 text-text-primary">
                      {formatNumberWithK(license?.apiCalls || 402000)} <span className="text-text-muted text-small">/ {formatNumberWithK(license?.apiCallsLimit || 1000000)}</span>
                    </div>
                    <div className="w-full bg-surface-3 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-accent h-full rounded-full transition-all duration-500"
                        style={{ width: `${((license?.apiCalls || 402000) / (license?.apiCallsLimit || 1000000)) * 100}%` }}
                      />
                    </div>
                  </div>

                </div>

                {/* Billing History Table */}
                <div className="card-mission space-y-5">
                  <div className="flex items-center justify-between border-b border-fire-border pb-4">
                    <div>
                      <h3 className="text-h3 text-text-primary">Billing history</h3>
                      <p className="text-small text-text-muted mt-1">Invoices for the last 6 months</p>
                    </div>
                    <button
                      onClick={handleDownloadAllInvoices}
                      className="btn-mission py-1.5 px-3 text-small"
                    >
                      Download all
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="table-enterprise">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => (
                          <tr key={inv.id}>
                            <td className="font-semibold text-text-primary">{inv.invoiceNumber}</td>
                            <td>{inv.date}</td>
                            <td>{inv.amount}</td>
                            <td>
                              <span className="badge-mission bg-success/10 text-success border-success/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                {inv.status}
                              </span>
                            </td>
                            <td className="text-right">
                              <button
                                onClick={() => handleDownloadInvoice(inv.id, inv.invoiceNumber)}
                                className="btn-ghost py-1 px-3 text-small"
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
                <div className="card-mission space-y-4">
                  <div className="flex items-center justify-between border-b border-fire-border pb-4">
                    <div>
                      <h3 className="text-h3 text-text-primary">Payment method</h3>
                      <p className="text-small text-text-muted mt-1">Used for monthly renewal</p>
                    </div>
                    <button
                      onClick={handleUpdatePayment}
                      className="btn-mission py-2 px-4 text-small"
                    >
                      Update
                    </button>
                  </div>

                  <div className="bg-surface-2 border border-fire-border rounded-xl p-4 flex items-center gap-4">
                    <div className="bg-surface-3 px-3 py-1.5 rounded-lg border border-fire-border text-small font-bold text-accent">
                      {license?.cardBrand || 'VISA'}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="text-small text-text-primary font-semibold">
                        •••• •••• •••• {license?.cardLast4 || '4471'}
                      </div>
                      <div className="text-label text-text-muted">
                        Expires {license?.cardExpiry || '08/28'} &middot; {license?.billingDetails || (orgName ? `Billed to ${orgName}` : 'Billing details not set')}
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
              <div className="py-12 text-center text-small text-text-muted animate-pulse">
                Loading members & groups...
              </div>
            ) : (
              <>
                {/* Members Table Card */}
                <div className="card-mission space-y-5">
                  <div className="flex items-center justify-between border-b border-fire-border pb-4">
                    <div>
                      <h3 className="text-h3 text-text-primary">Members</h3>
                      <p className="text-small text-text-muted mt-1">
                        {users.filter(u => u.status === 'Active').length} active &middot; {users.filter(u => u.status === 'Invited').length} invited
                      </p>
                    </div>
                    <button
                      onClick={() => setInviteModalOpen(true)}
                      className="btn-fire py-2 px-4 text-small"
                    >
                      <Plus className="w-3.5 h-3.5" /> Invite user
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="table-enterprise">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Group</th>
                          <th>Status</th>
                          <th>Last Login</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.id}>
                            <td className="font-semibold text-text-primary">{user.name}</td>
                            <td className="text-text-muted">{user.email}</td>
                            <td>{user.groupName}</td>
                            <td>
                              {user.status === 'Active' ? (
                                <span className="badge-mission bg-success/10 text-success border-success/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                  Active
                                </span>
                              ) : (
                                <span className="badge-mission bg-warning/10 text-warning border-warning/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                                  Invited
                                </span>
                              )}
                            </td>
                            <td className="text-text-muted">{user.lastLogin}</td>
                            <td className="text-right">
                              {user.status === 'Active' ? (
                                <button
                                  onClick={() => handleDeleteUser(user.id, user.name)}
                                  className="bg-surface-3 hover:bg-danger/10 border border-fire-border hover:border-danger/20 text-text-secondary hover:text-danger font-semibold px-3 py-1.5 rounded-lg text-small transition-colors focus:outline-none"
                                >
                                  Manage
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleResendInvite(user.id, user.name)}
                                  className="btn-mission py-1.5 px-3 text-small"
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
                <div className="card-mission space-y-5">
                  <div className="flex items-center justify-between border-b border-fire-border pb-4">
                    <div>
                      <h3 className="text-h3 text-text-primary">Groups</h3>
                      <p className="text-small text-text-muted mt-1">Bundle users to apply permissions in bulk</p>
                    </div>
                    <button
                      onClick={() => setGroupModalOpen(true)}
                      className="btn-mission py-1.5 px-3 text-small"
                    >
                      New group
                    </button>
                  </div>

                  {/* Groups Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {groups.map((group) => (
                      <div key={group.id} className="bg-surface-2 border border-fire-border rounded-xl p-5 shadow-sm space-y-4 hover:border-accent/30 transition-colors flex flex-col justify-between">
                        <div className="space-y-3">
                          {/* Badge Initials Block */}
                          <div className={clsx(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-small font-bold select-none",
                            group.badgeInitials === 'SA' ? "bg-accent/10 text-accent" :
                            group.badgeInitials === 'IR' ? "bg-info/10 text-info" :
                            "bg-text-muted/10 text-text-secondary"
                          )}>
                            {group.badgeInitials}
                          </div>
                          <h4 className="text-small font-bold text-text-primary">{group.name}</h4>
                          <p className="text-small text-text-muted leading-relaxed">{group.description}</p>
                        </div>
                        <div className="text-label text-text-muted uppercase pt-2">
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
          <div className="fixed inset-0 bg-background/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-fire-border rounded-xl w-full max-w-sm overflow-hidden shadow-card animate-scale-in">
              <div className="flex items-center justify-between p-5 border-b border-fire-border">
                <h3 className="text-h3 text-text-primary">Invite user</h3>
                <button onClick={() => setInviteModalOpen(false)} className="text-text-muted hover:text-text-primary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleInviteUser} className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold block">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter Name"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold block">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold block">Assign Group</label>
                  <select
                    value={inviteGroup}
                    onChange={(e) => setInviteGroup(e.target.value)}
                    className="input-field"
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
                    className="btn-mission py-2 px-4 text-small"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-fire py-2 px-4 text-small"
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
          <div className="fixed inset-0 bg-background/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-fire-border rounded-xl w-full max-w-sm overflow-hidden shadow-card animate-scale-in">
              <div className="flex items-center justify-between p-5 border-b border-fire-border">
                <h3 className="text-h3 text-text-primary">New group</h3>
                <button onClick={() => setGroupModalOpen(false)} className="text-text-muted hover:text-text-primary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleCreateGroup} className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold block">Group Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Incident Responders"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold block">Description</label>
                  <textarea
                    required
                    placeholder="Explain group purpose..."
                    value={groupDesc}
                    onChange={(e) => setGroupDesc(e.target.value)}
                    rows={3}
                    className="input-field resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setGroupModalOpen(false)}
                    className="btn-mission py-2 px-4 text-small"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-fire py-2 px-4 text-small"
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
          <div className="space-y-6 animate-fade-in">
            {rolesLoading ? (
              <div className="py-12 text-center text-small text-text-muted animate-pulse">
                Loading roles & permissions...
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
                          "px-4 py-2.5 rounded-lg text-small font-semibold transition-all focus:outline-none flex items-center gap-1.5",
                          activeRole?.id === role.id
                            ? "border border-accent text-accent bg-accent/5"
                            : "border border-fire-border bg-surface-2 text-text-secondary hover:text-text-primary hover:border-accent/30"
                        )}
                      >
                        <span>{role.name}</span>
                        <span className={clsx(
                          "text-label ml-1",
                          activeRole?.id === role.id ? "text-accent/70" : "text-text-muted"
                        )}>
                          {role.userCount}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Right: New Role Button */}
                  <button
                    onClick={() => setNewRoleModalOpen(true)}
                    className="btn-mission py-2.5 px-4 text-small"
                  >
                    <Plus className="w-3.5 h-3.5" /> New role
                  </button>
                </div>

                {/* Permission Matrix Card */}
                {activeRole && (
                  <div className="card-mission space-y-6 relative">
                    <div className="border-b border-fire-border pb-4">
                      <h3 className="text-h3 text-text-primary">
                        Permission matrix — {activeRole.name}
                      </h3>
                      <p className="text-small text-text-muted mt-1">Access level per module</p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="table-enterprise">
                        <thead>
                          <tr>
                            <th className="w-[40%] text-left">Module</th>
                            <th className="w-[15%] text-center">None</th>
                            <th className="w-[15%] text-center">Read</th>
                            <th className="w-[15%] text-center">Write</th>
                            <th className="w-[15%] text-center">Admin</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeRole.permissions?.map((perm) => {
                            const level = perm.permissionLevel;
                            return (
                              <tr key={perm.moduleName}>
                                <td className="font-semibold text-text-primary">{perm.moduleName}</td>

                                {/* NONE column */}
                                <td className="text-center align-middle">
                                  {level === 'NONE' && (
                                    <div className="relative inline-block text-left">
                                      <button
                                        type="button"
                                        onClick={() => setActiveDropdownRow(activeDropdownRow === perm.moduleName ? null : perm.moduleName)}
                                        className="badge-mission bg-surface-3 text-text-muted border-fire-border hover:bg-surface-3/70 transition-all select-none"
                                      >
                                        None <span className="text-[8px]">▼</span>
                                      </button>
                                      {activeDropdownRow === perm.moduleName && renderDropdown(perm.moduleName, 'NONE')}
                                    </div>
                                  )}
                                </td>

                                {/* READ column */}
                                <td className="text-center align-middle">
                                  {level === 'READ' && (
                                    <div className="relative inline-block text-left">
                                      <button
                                        type="button"
                                        onClick={() => setActiveDropdownRow(activeDropdownRow === perm.moduleName ? null : perm.moduleName)}
                                        className="badge-mission bg-success/10 text-success border-success/20 hover:bg-success/20 transition-all select-none"
                                      >
                                        Read <span className="text-[8px]">▼</span>
                                      </button>
                                      {activeDropdownRow === perm.moduleName && renderDropdown(perm.moduleName, 'READ')}
                                    </div>
                                  )}
                                </td>

                                {/* WRITE column */}
                                <td className="text-center align-middle">
                                  {level === 'WRITE' && (
                                    <div className="relative inline-block text-left">
                                      <button
                                        type="button"
                                        onClick={() => setActiveDropdownRow(activeDropdownRow === perm.moduleName ? null : perm.moduleName)}
                                        className="badge-mission bg-info/10 text-info border-info/20 hover:bg-info/20 transition-all select-none"
                                      >
                                        Write <span className="text-[8px]">▼</span>
                                      </button>
                                      {activeDropdownRow === perm.moduleName && renderDropdown(perm.moduleName, 'WRITE')}
                                    </div>
                                  )}
                                </td>

                                {/* ADMIN column */}
                                <td className="text-center align-middle">
                                  {level === 'ADMIN' && (
                                    <div className="relative inline-block text-left">
                                      <button
                                        type="button"
                                        onClick={() => setActiveDropdownRow(activeDropdownRow === perm.moduleName ? null : perm.moduleName)}
                                        className="badge-mission bg-accent/10 text-accent border-accent/20 hover:bg-accent/20 transition-all select-none"
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
                    <div className="flex justify-end gap-3 border-t border-fire-border/60 pt-5 mt-5">
                      <button
                        onClick={handleResetToDefault}
                        className="btn-mission py-2 px-4 text-small"
                      >
                        Reset to default
                      </button>
                      <button
                        onClick={handleSaveRole}
                        disabled={rolesSaving}
                        className="btn-fire py-2 px-5 text-small"
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
          <div className="fixed inset-0 bg-background/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-fire-border rounded-xl w-full max-w-sm overflow-hidden shadow-card animate-scale-in">
              <div className="flex items-center justify-between p-5 border-b border-fire-border">
                <h3 className="text-h3 text-text-primary">New role</h3>
                <button onClick={() => setNewRoleModalOpen(false)} className="text-text-muted hover:text-text-primary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleCreateRole} className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold block">Role Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Threat Hunter"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setNewRoleModalOpen(false)}
                    className="btn-mission py-2 px-4 text-small"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-fire py-2 px-4 text-small"
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
          <div className="space-y-6 animate-fade-in">
            {sourcesLoading ? (
              <div className="py-12 text-center text-small text-text-muted animate-pulse">
                Loading data sources...
              </div>
            ) : (
              <div className="card-mission space-y-6">

                {/* Header row */}
                <div className="flex items-center justify-between border-b border-fire-border pb-4">
                  <div>
                    <h3 className="text-h3 text-text-primary">Cloud & log sources</h3>
                    <p className="text-small text-text-muted mt-1">
                      {dataSources.length} available &middot; {dataSources.filter(s => s.status === 'Connected').length} connected
                    </p>
                  </div>
                  <button
                    onClick={() => setAddSourceModalOpen(true)}
                    className="btn-fire py-2 px-4 text-small"
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
                        className="bg-surface-2 border border-fire-border rounded-xl p-5 hover:border-accent/30 transition-all flex flex-col justify-between h-[210px]"
                      >
                        {/* Upper row: provider tag and status badge */}
                        <div className="flex items-center justify-between">
                          <div className={clsx(
                            "px-2.5 py-1 rounded text-label uppercase select-none",
                            source.provider === 'AWS' ? "bg-severity-medium/10 text-severity-medium" :
                            source.provider === 'AZ' ? "bg-info/10 text-info" :
                            source.provider === 'SP' ? "bg-surface-3 text-text-muted border border-fire-border" :
                            "bg-surface-3 text-text-secondary"
                          )}>
                            {source.provider}
                          </div>
                          <div className="flex items-center gap-1.5 text-label">
                            <span className={clsx(
                              "w-1.5 h-1.5 rounded-full inline-block",
                              isConnected ? "bg-success" : "bg-text-muted"
                            )} />
                            <span className={isConnected ? "text-success" : "text-text-muted"}>
                              {isConnected ? 'Connected' : 'Not connected'}
                            </span>
                          </div>
                        </div>

                        {/* Title & description */}
                        <div className="space-y-1.5 my-3">
                          <h4 className="text-small font-bold text-text-primary">{source.name}</h4>
                          <p className="text-small text-text-muted leading-relaxed line-clamp-2">
                            {source.description}
                          </p>
                          {isConnected && (
                            <p className="text-label text-text-muted">
                              Last sync: {source.lastSync || 'Never'}
                            </p>
                          )}
                        </div>

                        {/* Footer actions */}
                        <div className="border-t border-fire-border/60 pt-3">
                          {isConnected ? (
                            <div className="flex items-center justify-between gap-3">
                              <button
                                onClick={() => handleDisconnectSource(source.id)}
                                className="border border-fire-border hover:bg-danger/10 hover:border-danger/20 text-text-secondary hover:text-danger px-3.5 py-1.5 rounded-lg text-small transition-colors focus:outline-none"
                              >
                                Disconnect
                              </button>
                              <button
                                onClick={() => handleSyncSource(source.id)}
                                disabled={syncingSourceId === source.id}
                                className="btn-mission px-3.5 py-1.5 text-small min-w-[75px] justify-center"
                              >
                                {syncingSourceId === source.id ? (
                                  <span className="w-2.5 h-2.5 border-2 border-fire-border border-t-accent rounded-full animate-spin" />
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
                              className="btn-fire w-full py-2 text-small"
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
          <div className="fixed inset-0 bg-background/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-fire-border rounded-xl w-full max-w-sm overflow-hidden shadow-card animate-scale-in">
              <div className="flex items-center justify-between p-5 border-b border-fire-border">
                <h3 className="text-h3 text-text-primary">Add data source</h3>
                <button onClick={() => setAddSourceModalOpen(false)} className="text-text-muted hover:text-text-primary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleAddDataSource} className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-label text-text-muted uppercase block">Source Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AWS VPC Flow Logs"
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-label text-text-muted uppercase block">Provider Prefix</label>
                  <select
                    value={newSourceProvider}
                    onChange={(e) => setNewSourceProvider(e.target.value)}
                    className="input-field"
                  >
                    <option value="AWS">AWS</option>
                    <option value="AZ">AZ (Azure)</option>
                    <option value="SP">SP (Splunk)</option>
                    <option value="SYS">SYS (System/Network)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-label text-text-muted uppercase block">Description</label>
                  <textarea
                    required
                    placeholder="Describe log source ingestion..."
                    value={newSourceDesc}
                    onChange={(e) => setNewSourceDesc(e.target.value)}
                    rows={3}
                    className="input-field resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddSourceModalOpen(false)}
                    className="btn-mission py-2 px-4 text-small"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-fire py-2 px-4 text-small"
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
          <div className="fixed inset-0 bg-background/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-fire-border rounded-xl w-full max-w-sm overflow-hidden shadow-card animate-scale-in">
              <div className="flex items-center justify-between p-5 border-b border-fire-border">
                <h3 className="text-h3 text-text-primary">Configure {activeSourceToConnect.name}</h3>
                <button onClick={() => setConnectModalOpen(false)} className="text-text-muted hover:text-text-primary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleConnectSource} className="p-5 space-y-4">
                <p className="text-small text-text-muted">Enter connection details to link telemetry ingestion.</p>
                <div className="space-y-1.5">
                  <label className="text-label text-text-muted uppercase block">
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
                    className="input-field"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-label text-text-muted uppercase block">API Region / Secret Key</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••••••"
                    value={connectCred2}
                    onChange={(e) => setConnectCred2(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setConnectModalOpen(false)}
                    className="btn-mission py-2 px-4 text-small"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-fire py-2 px-4 text-small"
                  >
                    Confirm Connect
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Real-Time Agent Deployment Panel */}
        {activeTab === 'Agent Deployment' && (
          <div className="space-y-6 animate-fade-in">

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card-mission p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-label text-text-muted uppercase">Total Active Fleet</span>
                  <Server className="w-4 h-4 text-accent" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-h1 text-text-primary font-mono">{agentFleet.length}</span>
                  <span className="text-label text-success flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> Live Stream
                  </span>
                </div>
              </div>

              <div className="card-mission p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-label text-text-muted uppercase">Online & Healthy</span>
                  <ShieldCheck className="w-4 h-4 text-success" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-h1 text-success font-mono">
                    {agentFleet.filter(a => a.status === 'ONLINE').length}
                  </span>
                  <span className="text-label text-text-muted">
                    {Math.round((agentFleet.filter(a => a.status === 'ONLINE').length / (agentFleet.length || 1)) * 100)}% Fleet Capacity
                  </span>
                </div>
              </div>

              <div className="card-mission p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-label text-text-muted uppercase">Quarantined / Isolated</span>
                  <ShieldAlert className="w-4 h-4 text-danger" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-h1 text-danger font-mono">
                    {agentFleet.filter(a => a.status === 'ISOLATED').length}
                  </span>
                  <span className="text-label text-danger/80">EDR Containment</span>
                </div>
              </div>

              <div className="card-mission p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-label text-text-muted uppercase">Ingest Throughput</span>
                  <Zap className="w-4 h-4 text-severity-medium" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-h1 text-text-primary font-mono">4.2 MB/s</span>
                  <span className="text-label text-severity-medium font-mono">~1,840 EPS</span>
                </div>
              </div>
            </div>

            {/* Token & Enrollment Key Card */}
            <div className="card-mission space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-fire-border pb-4">
                <div>
                  <h3 className="text-h3 text-text-primary flex items-center gap-2">
                    <Key className="w-4 h-4 text-accent" /> Enterprise Enrollment Key & Endpoint Gateway
                  </h3>
                  <p className="text-small text-text-muted mt-1">Authenticates newly provisioned security agents with your ACIS SOC Gateway.</p>
                </div>
                <button
                  onClick={handleRegenerateToken}
                  className="btn-mission text-small px-4 py-2 self-start sm:self-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-accent" /> Regenerate Secret Key
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold block">Live Enrollment Token Secret</label>
                  <div className="flex items-center gap-2 bg-surface-2 border border-fire-border rounded-lg p-2.5 font-mono text-small text-text-primary">
                    <span className="truncate flex-1 text-accent">{enrollmentToken}</span>
                    <button
                      onClick={() => handleCopyCommand('token', enrollmentToken)}
                      className="btn-ghost px-3 py-1.5 text-small shrink-0"
                    >
                      {copiedCmdId === 'token' ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedCmdId === 'token' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-small text-text-secondary font-semibold block">Target Gateway Endpoint</label>
                  <div className="bg-surface-2 border border-fire-border rounded-lg px-3 py-2.5 font-mono text-small text-text-secondary truncate">
                    http://{typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080
                  </div>
                </div>
              </div>
            </div>

            {/* Installation Scripts Generator Card */}
            <div className="card-mission space-y-6">
              <div className="border-b border-fire-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-h3 text-text-primary flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-accent" /> Multi-OS Silent Installation Commands
                  </h3>
                  <p className="text-small text-text-muted mt-1">One-line terminal deployment scripts pre-configured with active enrollment token</p>
                </div>

                {/* OS Selector Tabs */}
                <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-lg border border-fire-border text-label">
                  {[
                    { id: 'WINDOWS', label: 'Windows (PS/MSI)', icon: Laptop },
                    { id: 'LINUX', label: 'Linux (Bash/APT)', icon: Server },
                    { id: 'MACOS', label: 'macOS (PKG)', icon: HardDrive },
                    { id: 'KUBERNETES', label: 'Kubernetes (K8s)', icon: Layers }
                  ].map((os) => (
                    <button
                      key={os.id}
                      onClick={() => setSelectedOsTab(os.id as any)}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5",
                        selectedOsTab === os.id
                          ? "bg-accent text-white shadow"
                          : "text-text-secondary hover:text-text-primary"
                      )}
                    >
                      <os.icon className="w-3.5 h-3.5" />
                      {os.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* OS Command Output View */}
              <div className="space-y-4">
                {selectedOsTab === 'WINDOWS' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-small font-semibold text-text-primary flex items-center gap-2">
                          <Terminal className="w-3.5 h-3.5 text-accent" /> Option 1: PowerShell Unattended One-Liner
                        </span>
                        <button
                          onClick={() => handleCopyCommand(
                            'win-ps',
                            `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; iex ((New-Object System.Net.WebClient).DownloadString('http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080/api/agent/install.ps1')) -EnrollmentToken "${enrollmentToken}" -ServerUrl "http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080"`
                          )}
                          className="text-small text-accent hover:text-accent-dark font-semibold flex items-center gap-1"
                        >
                          {copiedCmdId === 'win-ps' ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedCmdId === 'win-ps' ? 'Copied to Clipboard' : 'Copy PowerShell Command'}
                        </button>
                      </div>
                      <pre className="bg-surface-2 border border-fire-border rounded-lg p-4 text-small font-mono text-success overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
                        {`[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; iex ((New-Object System.Net.WebClient).DownloadString('http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080/api/agent/install.ps1')) -EnrollmentToken "${enrollmentToken}" -ServerUrl "http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080"`}
                      </pre>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-small font-semibold text-text-primary flex items-center gap-2">
                          <Download className="w-3.5 h-3.5 text-accent" /> Option 2: MSI Installer Executable (GPO / Active Directory)
                        </span>
                        <button
                          onClick={() => handleCopyCommand(
                            'win-msi',
                            `msiexec.exe /i "ACIS-Agent-v2.4.1-x64.msi" /qn ENROLLMENT_TOKEN="${enrollmentToken}" SERVER_URL="http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080" AUTO_START=1`
                          )}
                          className="text-small text-accent hover:text-accent-dark font-semibold flex items-center gap-1"
                        >
                          {copiedCmdId === 'win-msi' ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedCmdId === 'win-msi' ? 'Copied MSI Command' : 'Copy MSI Command'}
                        </button>
                      </div>
                      <pre className="bg-surface-2 border border-fire-border rounded-lg p-4 text-small font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap select-all">
                        {`msiexec.exe /i "ACIS-Agent-v2.4.1-x64.msi" /qn ENROLLMENT_TOKEN="${enrollmentToken}" SERVER_URL="http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080" AUTO_START=1`}
                      </pre>
                    </div>
                  </div>
                )}

                {selectedOsTab === 'LINUX' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-small font-semibold text-text-primary flex items-center gap-2">
                          <Terminal className="w-3.5 h-3.5 text-accent" /> Linux Automated Installer (Ubuntu/Debian/RHEL/CentOS)
                        </span>
                        <button
                          onClick={() => handleCopyCommand(
                            'linux-cmd',
                            `curl -sSL http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080/api/agent/install.sh | sudo bash -s -- --token="${enrollmentToken}" --server="http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080" --enable-service`
                          )}
                          className="text-small text-accent hover:text-accent-dark font-semibold flex items-center gap-1"
                        >
                          {copiedCmdId === 'linux-cmd' ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedCmdId === 'linux-cmd' ? 'Copied Bash Command' : 'Copy Bash Command'}
                        </button>
                      </div>
                      <pre className="bg-surface-2 border border-fire-border rounded-lg p-4 text-small font-mono text-success overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
                        {`curl -sSL http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080/api/agent/install.sh | sudo bash -s -- --token="${enrollmentToken}" --server="http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080" --enable-service`}
                      </pre>
                    </div>
                  </div>
                )}

                {selectedOsTab === 'MACOS' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-small font-semibold text-text-primary flex items-center gap-2">
                          <Terminal className="w-3.5 h-3.5 text-accent" /> macOS Terminal Silent Deployment (Intel & Apple Silicon)
                        </span>
                        <button
                          onClick={() => handleCopyCommand(
                            'mac-cmd',
                            `curl -sSL http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080/api/agent/install-mac.sh | sudo bash -s -- --token="${enrollmentToken}" --server="http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080"`
                          )}
                          className="text-small text-accent hover:text-accent-dark font-semibold flex items-center gap-1"
                        >
                          {copiedCmdId === 'mac-cmd' ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedCmdId === 'mac-cmd' ? 'Copied macOS Script' : 'Copy macOS Script'}
                        </button>
                      </div>
                      <pre className="bg-surface-2 border border-fire-border rounded-lg p-4 text-small font-mono text-success overflow-x-auto whitespace-pre-wrap select-all">
                        {`curl -sSL http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080/api/agent/install-mac.sh | sudo bash -s -- --token="${enrollmentToken}" --server="http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080"`}
                      </pre>
                    </div>
                  </div>
                )}

                {selectedOsTab === 'KUBERNETES' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-small font-semibold text-text-primary flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-accent" /> Kubernetes DaemonSet Installation Manifest
                        </span>
                        <button
                          onClick={() => handleCopyCommand(
                            'k8s-cmd',
                            `kubectl apply -f http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080/api/agent/k8s-daemonset.yaml --namespace=acis-security`
                          )}
                          className="text-small text-accent hover:text-accent-dark font-semibold flex items-center gap-1"
                        >
                          {copiedCmdId === 'k8s-cmd' ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedCmdId === 'k8s-cmd' ? 'Copied kubectl Command' : 'Copy kubectl Command'}
                        </button>
                      </div>
                      <pre className="bg-surface-2 border border-fire-border rounded-lg p-4 text-small font-mono text-success overflow-x-auto whitespace-pre-wrap select-all">
                        {`kubectl apply -f http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8080/api/agent/k8s-daemonset.yaml --namespace=acis-security`}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Active Fleet & Real-time Heartbeat Monitoring Table */}
            <div className="card-mission space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-fire-border pb-4">
                <div>
                  <h3 className="text-h3 text-text-primary flex items-center gap-2">
                    <Radio className="w-4 h-4 text-success animate-pulse" /> Live Enrolled Agent Fleet & Telemetry
                  </h3>
                  <p className="text-small text-text-muted mt-1">Real-time status stream synced with ACIS Assets CMDB and WebSockets</p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Search box */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filter host or IP..."
                      value={agentSearchQuery}
                      onChange={(e) => setAgentSearchQuery(e.target.value)}
                      className="input-field pl-8 py-1.5 w-44"
                    />
                  </div>

                  {/* Filter Status Pills */}
                  <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-lg border border-fire-border text-label">
                    <button
                      onClick={() => setFleetFilterStatus('ALL')}
                      className={clsx("px-2.5 py-1 rounded transition-colors", fleetFilterStatus === 'ALL' ? "bg-surface-3 text-text-primary" : "text-text-muted hover:text-text-primary")}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFleetFilterStatus('ONLINE')}
                      className={clsx("px-2.5 py-1 rounded transition-colors", fleetFilterStatus === 'ONLINE' ? "bg-success/20 text-success" : "text-text-muted hover:text-text-primary")}
                    >
                      Online
                    </button>
                    <button
                      onClick={() => setFleetFilterStatus('ISOLATED')}
                      className={clsx("px-2.5 py-1 rounded transition-colors", fleetFilterStatus === 'ISOLATED' ? "bg-danger/20 text-danger" : "text-text-muted hover:text-text-primary")}
                    >
                      Isolated
                    </button>
                  </div>
                </div>
              </div>

              {/* Fleet Table */}
              <div className="overflow-x-auto">
                <table className="table-enterprise">
                  <thead>
                    <tr>
                      <th>Hostname & OS</th>
                      <th>IP Address</th>
                      <th>Agent Version</th>
                      <th>Status</th>
                      <th>CPU / RAM</th>
                      <th>Heartbeat</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentFleet
                      .filter(agent => {
                        const q = agentSearchQuery.toLowerCase()
                        const matchesQuery = agent.hostname.toLowerCase().includes(q) || agent.ip.toLowerCase().includes(q)
                        if (fleetFilterStatus === 'ONLINE') return matchesQuery && agent.status === 'ONLINE'
                        if (fleetFilterStatus === 'ISOLATED') return matchesQuery && agent.status === 'ISOLATED'
                        if (fleetFilterStatus === 'OUTDATED') return matchesQuery && agent.status === 'OUTDATED'
                        return matchesQuery
                      })
                      .map((agent) => (
                        <tr key={agent.id}>
                          <td>
                            <div>
                              <p className="font-semibold text-text-primary flex items-center gap-1.5">
                                {agent.os.toLowerCase().includes('windows') ? <Laptop className="w-3.5 h-3.5 text-accent" /> : <Server className="w-3.5 h-3.5 text-info" />}
                                {agent.hostname}
                              </p>
                              <p className="text-label text-text-muted mt-0.5 truncate max-w-[200px]">{agent.os}</p>
                            </div>
                          </td>
                          <td className="font-mono text-text-secondary">{agent.ip}</td>
                          <td className="font-mono text-text-secondary">{agent.version}</td>
                          <td>
                            <span className={clsx(
                              "badge-mission inline-flex items-center gap-1",
                              agent.status === 'ONLINE' && "bg-success/10 text-success border-success/20",
                              agent.status === 'ISOLATED' && "bg-danger/10 text-danger border-danger/20",
                              agent.status === 'OUTDATED' && "bg-severity-medium/10 text-severity-medium border-severity-medium/20",
                              agent.status === 'OFFLINE' && "bg-surface-3 text-text-secondary border-fire-border"
                            )}>
                              {agent.status === 'ONLINE' && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
                              {agent.status}
                            </span>
                          </td>
                          <td className="font-mono text-text-secondary">
                            {agent.cpu} / {agent.ram}
                          </td>
                          <td className="font-mono text-text-muted text-small">{agent.lastHeartbeat}</td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setAgentFleet(prev => prev.map(a => a.id === agent.id ? { ...a, status: a.status === 'ISOLATED' ? 'ONLINE' : 'ISOLATED' } : a))
                                }}
                                className={clsx(
                                  "px-2.5 py-1 rounded-md text-label font-semibold transition-colors border",
                                  agent.status === 'ISOLATED'
                                    ? "bg-success/10 text-success border-success/30 hover:bg-success/20"
                                    : "bg-danger/10 text-danger border-danger/30 hover:bg-danger/20"
                                )}
                              >
                                {agent.status === 'ISOLATED' ? 'Unisolate' : 'Isolate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Global Agent Configuration & Ingestion Policy */}
            <div className="card-mission space-y-6">
              <div className="flex items-center justify-between border-b border-fire-border pb-4">
                <div>
                  <h3 className="text-h3 text-text-primary flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-accent" /> Agent Performance & Ingestion Policy
                  </h3>
                  <p className="text-small text-text-muted mt-1">Configure global agent CPU caps, telemetry buffering, and EDR self-protection</p>
                </div>
                <button
                  onClick={handleSaveAgentPolicy}
                  disabled={agentPolicySaving}
                  className="btn-fire py-2 px-5 text-small"
                >
                  <Save className="w-3.5 h-3.5" />
                  {agentPolicySaving ? 'Saving...' : 'Save Agent Policy'}
                </button>
              </div>

              {agentPolicySuccess && (
                <div className="bg-success/10 border border-success/30 text-success p-3.5 rounded-xl text-small font-semibold flex items-center gap-2 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  Agent policy updated successfully! Pushed to active agent fleet via WebSocket broadcast.
                </div>
              )}

              <form onSubmit={handleSaveAgentPolicy} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-small text-text-secondary font-semibold block">Telemetry Streaming Frequency</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'REALTIME', label: 'Real-Time' },
                      { id: 'BATCH_5S', label: '5s Batch' },
                      { id: 'LOW_BANDWIDTH', label: 'Low-Band' }
                    ].map((rate) => (
                      <button
                        key={rate.id}
                        type="button"
                        onClick={() => setAgentPolicyRate(rate.id as any)}
                        className={clsx(
                          "py-2 rounded-lg text-center font-semibold border transition-all text-small",
                          agentPolicyRate === rate.id
                            ? "bg-accent/10 text-accent border-accent/40"
                            : "bg-surface-2 text-text-secondary border-fire-border hover:text-text-primary"
                        )}
                      >
                        {rate.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-small text-text-secondary font-semibold block">Host CPU Limit Cap ({agentCpuCap}%)</label>
                  <input
                    type="range"
                    min="1"
                    max="25"
                    value={agentCpuCap}
                    onChange={(e) => setAgentCpuCap(Number(e.target.value))}
                    className="w-full accent-accent cursor-pointer"
                  />
                  <div className="flex justify-between text-label text-text-muted font-mono">
                    <span>1% (Silent)</span>
                    <span>5% (Default)</span>
                    <span>25% (High Perf)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-fire-border md:col-span-2">
                  <div>
                    <p className="font-semibold text-text-primary">EDR Tamper Resistance & Anti-Kill Protection</p>
                    <p className="text-small text-text-muted">Prevents non-system administrators or malware processes from terminating the ACIS agent service.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAgentTamperProtect(!agentTamperProtect)}
                    className={clsx(
                      "w-11 h-6 rounded-full transition-colors relative p-0.5 focus:outline-none",
                      agentTamperProtect ? "bg-accent" : "bg-surface-3"
                    )}
                  >
                    <div className={clsx("w-5 h-5 rounded-full bg-white transition-transform", agentTamperProtect && "translate-x-5")} />
                  </button>
                </div>
              </form>
            </div>

          </div>
        )}

        {/* Tab 1: API Keys Panel */}
        {activeTab === 'API Keys' && (
          <div className="space-y-6">
            
            {/* API Keys Table Card */}
            <div className="card-mission p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-fire-border pb-3">
                <div>
                  <h3 className="text-h3 text-text-primary">API Keys</h3>
                  <p className="text-small text-text-muted mt-1">Tokens for external API access and automation scripts.</p>
                </div>
                <button
                  onClick={() => setIsKeyModalOpen(true)}
                  className="btn-fire py-2 px-4 text-small"
                >
                  <Plus className="w-3.5 h-3.5" /> Generate Key
                </button>
              </div>

              {/* API Keys Table */}
              <div className="overflow-x-auto">
                <table className="table-enterprise">
                  <thead>
                    <tr>
                      <th className="w-[25%]">Key Name</th>
                      <th className="w-[25%]">Token</th>
                      <th className="w-[15%]">Role</th>
                      <th className="w-[12%]">Created</th>
                      <th className="w-[11%]">Last Used</th>
                      <th className="w-[12%] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map(k => (
                      <tr key={k.id}>
                        <td>
                          {k.keyName}
                          {k.status === 'Revoked' && (
                            <span className="badge-mission ml-2 bg-surface-3 text-text-muted border-fire-border">Revoked</span>
                          )}
                        </td>
                        <td className="font-mono text-small text-text-secondary">
                          acis_live_••••••••••••••••{k.tokenPreview}
                        </td>
                        <td className="font-mono text-text-secondary text-small">{k.role}</td>
                        <td>{new Date(k.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td>
                          {k.lastUsedAt ? `${Math.floor((Date.now() - new Date(k.lastUsedAt).getTime()) / 60000)} mins ago` : 'Never'}
                        </td>
                        <td className="text-right">
                          {k.status === 'Active' ? (
                            <button
                              onClick={() => handleRevokeKey(k.id)}
                              className="text-danger hover:text-danger/80 font-semibold text-small transition-colors focus:outline-none"
                            >
                              Revoke
                            </button>
                          ) : (
                            <button
                              onClick={() => alert("Key is already revoked")}
                              className="text-text-muted font-semibold text-small focus:outline-none cursor-not-allowed"
                            >
                              Revoked
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {keys.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-text-muted text-small">
                          No API keys configured
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* Full Ingestion Integrations Panel */}
        {activeTab === 'Integrations' && (
          <div className="space-y-6 animate-fade-in">

            {/* Connected Integrations Card */}
            <div className="card-mission p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-fire-border pb-3">
                <div>
                  <h3 className="text-h3 text-text-primary">Connected Integrations</h3>
                  <p className="text-small text-text-muted mt-1">Third-party services connected to ACIS for ingestion and SOAR actions.</p>
                </div>
                <button
                  onClick={() => setIsIntegrationModalOpen(true)}
                  className="btn-fire py-2 px-4 text-small"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Integration
                </button>
              </div>

              {/* Integrations Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {integrations.map(int => (
                  <div key={int.id} className="bg-surface-2 border border-fire-border rounded-xl p-4 flex flex-col justify-between h-[150px] shadow-sm hover:border-accent/30 transition-all">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-3 border border-fire-border flex items-center justify-center font-bold text-accent text-small">
                          {int.logoLetter}
                        </div>
                        <h4 className="text-small font-bold text-text-primary">{int.name}</h4>
                      </div>
                      <p className="text-small text-text-muted leading-normal mt-2.5">
                        {int.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-fire-border/60 pt-2.5 mt-2.5">
                      <button
                        onClick={() => handleToggleIntegration(int.id)}
                        className="flex items-center gap-1.5 focus:outline-none"
                      >
                        <span className={clsx(
                          "w-1.5 h-1.5 rounded-full inline-block",
                          int.status === 'Connected' ? "bg-success" : "bg-text-muted"
                        )} />
                        <span className={clsx(
                          "text-label uppercase",
                          int.status === 'Connected' ? "text-success hover:text-success" : "text-text-muted hover:text-text-secondary"
                        )}>
                          {int.status}
                        </span>
                      </button>
                      <button
                        onClick={() => alert("Configuration settings options")}
                        className="text-text-muted hover:text-text-primary transition-colors focus:outline-none text-label uppercase"
                      >
                        Configure
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cloudflare — the one real, working SOAR blocking integration */}
            <div className="card-mission p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-fire-border pb-3">
                <div>
                  <h3 className="text-h3 text-text-primary flex items-center gap-2">
                    Cloudflare
                    <span className={clsx(
                      'badge-mission',
                      cfConfigured ? 'bg-success/10 text-success border-success/20' : 'bg-surface-3 text-text-muted border-fire-border'
                    )}>
                      {cfConfigured ? 'Configured' : 'Not Configured'}
                    </span>
                  </h3>
                  <p className="text-small text-text-muted mt-1">
                    Powers real IP blocking in SOAR playbooks — a "block" step calls Cloudflare's edge firewall
                    for any site behind it, regardless of where it's actually hosted (Vercel, AWS, Azure, etc.).
                  </p>
                </div>
              </div>

              {!cfEditing && cfConfigured ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-small">
                    <div>
                      <span className="text-label text-text-muted uppercase block mb-1">Zone ID</span>
                      <span className="font-mono text-text-secondary">{cfZoneId}</span>
                    </div>
                    <div>
                      <span className="text-label text-text-muted uppercase block mb-1">Blocking</span>
                      <span className={cfEnabled ? 'text-success font-semibold' : 'text-text-muted font-semibold'}>
                        {cfEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  {cfTestResult && (
                    <div className={clsx(
                      'text-small px-3 py-2 rounded-lg',
                      cfTestResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                    )}>
                      {cfTestResult.message}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={handleTestCloudflare} disabled={cfTesting} className="btn-mission py-2 px-4 text-small">
                      {cfTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button onClick={() => { setCfEditing(true); setCfTestResult(null) }} className="btn-mission py-2 px-4 text-small">
                      Edit
                    </button>
                    <button onClick={handleDeleteCloudflare} className="text-danger hover:text-danger/80 text-small font-semibold ml-auto">
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveCloudflare} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-label text-text-muted uppercase block">API Token</label>
                      <input
                        type="password"
                        placeholder={cfConfigured ? 'Leave blank to keep current token' : 'Cloudflare API token (Zone:Firewall Services:Edit)'}
                        value={cfApiToken}
                        onChange={(e) => setCfApiToken(e.target.value)}
                        className="input-field"
                        required={!cfConfigured}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-label text-text-muted uppercase block">Zone ID</label>
                      <input
                        type="text"
                        placeholder="e.g. 023e105f4ecef8ad9ca31a8372d0c353"
                        value={cfZoneId}
                        onChange={(e) => setCfZoneId(e.target.value)}
                        className="input-field font-mono"
                        required
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-small text-text-secondary font-medium">
                    <input type="checkbox" checked={cfEnabled} onChange={(e) => setCfEnabled(e.target.checked)} className="accent-accent" />
                    Enable real blocking for "block" playbook steps
                  </label>
                  {cfTestResult && (
                    <div className={clsx(
                      'text-small px-3 py-2 rounded-lg',
                      cfTestResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                    )}>
                      {cfTestResult.message}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button type="submit" disabled={cfSaving} className="btn-fire py-2 px-4 text-small">
                      {cfSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" onClick={handleTestCloudflare} disabled={cfTesting || !cfZoneId} className="btn-mission py-2 px-4 text-small">
                      {cfTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                    {cfConfigured && (
                      <button type="button" onClick={() => { setCfEditing(false); setCfApiToken(''); setCfTestResult(null) }} className="text-text-muted hover:text-text-primary text-small font-medium ml-auto">
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>

            {/* AWS CloudTrail — push-based, reuses the API key + external ingestion endpoint already built and verified. No stored config needed on ACIS's side. */}
            <div className="card-mission p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-fire-border pb-3">
                <div>
                  <h3 className="text-h3 text-text-primary flex items-center gap-2">
                    AWS CloudTrail
                    <span className="badge-mission bg-surface-3 text-text-muted border-fire-border">Push-based — no config needed here</span>
                  </h3>
                  <p className="text-small text-text-muted mt-1">
                    AWS pushes CloudTrail events to ACIS directly — there's no polling or credential storage on ACIS's side.
                  </p>
                </div>
              </div>
              <ol className="space-y-2 text-small text-text-secondary list-decimal list-inside">
                <li>Generate an API key in the <strong className="text-text-primary">API Keys</strong> tab (role: Data Ingest Only).</li>
                <li>In AWS, create an EventBridge rule (or a small Lambda) that matches CloudTrail events.</li>
                <li>
                  Target: an HTTPS POST to <code className="font-mono text-accent">/api/ingest/external/json</code> on your
                  ACIS instance, with header <code className="font-mono text-accent">X-API-Key: &lt;your key&gt;</code> and the
                  event(s) as a JSON array in the body.
                </li>
              </ol>
              <button onClick={() => handleTabClick('API Keys')} className="btn-mission py-2 px-4 text-small">
                <Key className="w-3.5 h-3.5" /> Go generate a key
              </button>
            </div>

            {/* Palo Alto — real PAN-OS API polling, see IntegrationPollerService */}
            <div className="card-mission p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-fire-border pb-3">
                <div>
                  <h3 className="text-h3 text-text-primary flex items-center gap-2">
                    Palo Alto NGFW
                    <span className={clsx('badge-mission', paConfigured ? 'bg-success/10 text-success border-success/20' : 'bg-surface-3 text-text-muted border-fire-border')}>
                      {paConfigured ? 'Configured' : 'Not Configured'}
                    </span>
                  </h3>
                  <p className="text-small text-text-muted mt-1">Polls your firewall's PAN-OS API for traffic logs every couple of minutes.</p>
                </div>
              </div>

              {!paEditing && paConfigured ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-small">
                    <div>
                      <span className="text-label text-text-muted uppercase block mb-1">Hostname</span>
                      <span className="font-mono text-text-secondary">{paHostname}</span>
                    </div>
                    <div>
                      <span className="text-label text-text-muted uppercase block mb-1">Last Poll</span>
                      <span className={clsx('font-semibold', paLastPollStatus === 'Failed' ? 'text-danger' : paLastPollStatus === 'Success' ? 'text-success' : 'text-text-muted')}>
                        {paLastPolledAt ? `${paLastPollStatus || 'Pending'} — ${new Date(paLastPolledAt).toLocaleString()}` : 'Not polled yet'}
                      </span>
                    </div>
                  </div>
                  {paLastPollError && (
                    <div className="text-small px-3 py-2 rounded-lg bg-danger/10 text-danger">{paLastPollError}</div>
                  )}
                  {paTestResult && (
                    <div className={clsx('text-small px-3 py-2 rounded-lg', paTestResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                      {paTestResult.message}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={handleTestPaloAlto} disabled={paTesting} className="btn-mission py-2 px-4 text-small">
                      {paTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button onClick={() => { setPaEditing(true); setPaTestResult(null) }} className="btn-mission py-2 px-4 text-small">Edit</button>
                    <button onClick={handleDeletePaloAlto} className="text-danger hover:text-danger/80 text-small font-semibold ml-auto">Remove</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSavePaloAlto} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-label text-text-muted uppercase block">Firewall Hostname / IP</label>
                      <input type="text" placeholder="fw.example.com" value={paHostname} onChange={(e) => setPaHostname(e.target.value)} className="input-field font-mono" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-label text-text-muted uppercase block">API Key</label>
                      <input
                        type="password"
                        placeholder={paConfigured ? 'Leave blank to keep current key' : 'Generated on the firewall via type=keygen'}
                        value={paApiKey}
                        onChange={(e) => setPaApiKey(e.target.value)}
                        className="input-field"
                        required={!paConfigured}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-small text-text-secondary font-medium">
                    <input type="checkbox" checked={paEnabled} onChange={(e) => setPaEnabled(e.target.checked)} className="accent-accent" />
                    Enable scheduled polling
                  </label>
                  {paTestResult && (
                    <div className={clsx('text-small px-3 py-2 rounded-lg', paTestResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                      {paTestResult.message}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button type="submit" disabled={paSaving} className="btn-fire py-2 px-4 text-small">{paSaving ? 'Saving...' : 'Save'}</button>
                    <button type="button" onClick={handleTestPaloAlto} disabled={paTesting || !paHostname} className="btn-mission py-2 px-4 text-small">
                      {paTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                    {paConfigured && (
                      <button type="button" onClick={() => { setPaEditing(false); setPaApiKey(''); setPaTestResult(null) }} className="text-text-muted hover:text-text-primary text-small font-medium ml-auto">Cancel</button>
                    )}
                  </div>
                </form>
              )}
            </div>

            {/* Wazuh — real Indexer API polling, see IntegrationPollerService */}
            <div className="card-mission p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-fire-border pb-3">
                <div>
                  <h3 className="text-h3 text-text-primary flex items-center gap-2">
                    Wazuh
                    <span className={clsx('badge-mission', wzConfigured ? 'bg-success/10 text-success border-success/20' : 'bg-surface-3 text-text-muted border-fire-border')}>
                      {wzConfigured ? 'Configured' : 'Not Configured'}
                    </span>
                  </h3>
                  <p className="text-small text-text-muted mt-1">Polls your Wazuh Indexer's alert search API every couple of minutes.</p>
                </div>
              </div>

              {!wzEditing && wzConfigured ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-small">
                    <div>
                      <span className="text-label text-text-muted uppercase block mb-1">Indexer URL</span>
                      <span className="font-mono text-text-secondary">{wzBaseUrl}</span>
                    </div>
                    <div>
                      <span className="text-label text-text-muted uppercase block mb-1">Last Poll</span>
                      <span className={clsx('font-semibold', wzLastPollStatus === 'Failed' ? 'text-danger' : wzLastPollStatus === 'Success' ? 'text-success' : 'text-text-muted')}>
                        {wzLastPolledAt ? `${wzLastPollStatus || 'Pending'} — ${new Date(wzLastPolledAt).toLocaleString()}` : 'Not polled yet'}
                      </span>
                    </div>
                  </div>
                  {wzLastPollError && (
                    <div className="text-small px-3 py-2 rounded-lg bg-danger/10 text-danger">{wzLastPollError}</div>
                  )}
                  {wzTestResult && (
                    <div className={clsx('text-small px-3 py-2 rounded-lg', wzTestResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                      {wzTestResult.message}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={handleTestWazuh} disabled={wzTesting} className="btn-mission py-2 px-4 text-small">
                      {wzTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button onClick={() => { setWzEditing(true); setWzTestResult(null) }} className="btn-mission py-2 px-4 text-small">Edit</button>
                    <button onClick={handleDeleteWazuh} className="text-danger hover:text-danger/80 text-small font-semibold ml-auto">Remove</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveWazuh} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-label text-text-muted uppercase block">Indexer Base URL</label>
                      <input type="text" placeholder="https://wazuh-indexer.example.com:9200" value={wzBaseUrl} onChange={(e) => setWzBaseUrl(e.target.value)} className="input-field font-mono" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-label text-text-muted uppercase block">Index Pattern</label>
                      <input type="text" placeholder="wazuh-alerts-*" value={wzIndexPattern} onChange={(e) => setWzIndexPattern(e.target.value)} className="input-field font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-label text-text-muted uppercase block">Username</label>
                      <input type="text" value={wzUsername} onChange={(e) => setWzUsername(e.target.value)} className="input-field" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-label text-text-muted uppercase block">Password</label>
                      <input
                        type="password"
                        placeholder={wzConfigured ? 'Leave blank to keep current password' : ''}
                        value={wzPassword}
                        onChange={(e) => setWzPassword(e.target.value)}
                        className="input-field"
                        required={!wzConfigured}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-small text-text-secondary font-medium">
                    <input type="checkbox" checked={wzEnabled} onChange={(e) => setWzEnabled(e.target.checked)} className="accent-accent" />
                    Enable scheduled polling
                  </label>
                  {wzTestResult && (
                    <div className={clsx('text-small px-3 py-2 rounded-lg', wzTestResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                      {wzTestResult.message}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button type="submit" disabled={wzSaving} className="btn-fire py-2 px-4 text-small">{wzSaving ? 'Saving...' : 'Save'}</button>
                    <button type="button" onClick={handleTestWazuh} disabled={wzTesting || !wzBaseUrl} className="btn-mission py-2 px-4 text-small">
                      {wzTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                    {wzConfigured && (
                      <button type="button" onClick={() => { setWzEditing(false); setWzPassword(''); setWzTestResult(null) }} className="text-text-muted hover:text-text-primary text-small font-medium ml-auto">Cancel</button>
                    )}
                  </div>
                </form>
              )}
            </div>

            {/* SentinelOne — real Management API polling, see IntegrationPollerService */}
            <div className="card-mission p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-fire-border pb-3">
                <div>
                  <h3 className="text-h3 text-text-primary flex items-center gap-2">
                    SentinelOne
                    <span className={clsx('badge-mission', s1Configured ? 'bg-success/10 text-success border-success/20' : 'bg-surface-3 text-text-muted border-fire-border')}>
                      {s1Configured ? 'Configured' : 'Not Configured'}
                    </span>
                  </h3>
                  <p className="text-small text-text-muted mt-1">Polls your SentinelOne console's Threats API every couple of minutes.</p>
                </div>
              </div>

              {!s1Editing && s1Configured ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-small">
                    <div>
                      <span className="text-label text-text-muted uppercase block mb-1">Console URL</span>
                      <span className="font-mono text-text-secondary">{s1ConsoleUrl}</span>
                    </div>
                    <div>
                      <span className="text-label text-text-muted uppercase block mb-1">Last Poll</span>
                      <span className={clsx('font-semibold', s1LastPollStatus === 'Failed' ? 'text-danger' : s1LastPollStatus === 'Success' ? 'text-success' : 'text-text-muted')}>
                        {s1LastPolledAt ? `${s1LastPollStatus || 'Pending'} — ${new Date(s1LastPolledAt).toLocaleString()}` : 'Not polled yet'}
                      </span>
                    </div>
                  </div>
                  {s1LastPollError && (
                    <div className="text-small px-3 py-2 rounded-lg bg-danger/10 text-danger">{s1LastPollError}</div>
                  )}
                  {s1TestResult && (
                    <div className={clsx('text-small px-3 py-2 rounded-lg', s1TestResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                      {s1TestResult.message}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={handleTestSentinelOne} disabled={s1Testing} className="btn-mission py-2 px-4 text-small">
                      {s1Testing ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button onClick={() => { setS1Editing(true); setS1TestResult(null) }} className="btn-mission py-2 px-4 text-small">Edit</button>
                    <button onClick={handleDeleteSentinelOne} className="text-danger hover:text-danger/80 text-small font-semibold ml-auto">Remove</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveSentinelOne} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-label text-text-muted uppercase block">Console URL</label>
                      <input type="text" placeholder="https://usea1-partners.sentinelone.net" value={s1ConsoleUrl} onChange={(e) => setS1ConsoleUrl(e.target.value)} className="input-field font-mono" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-label text-text-muted uppercase block">API Token</label>
                      <input
                        type="password"
                        placeholder={s1Configured ? 'Leave blank to keep current token' : 'Settings > API Tokens in your console'}
                        value={s1ApiToken}
                        onChange={(e) => setS1ApiToken(e.target.value)}
                        className="input-field"
                        required={!s1Configured}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-small text-text-secondary font-medium">
                    <input type="checkbox" checked={s1Enabled} onChange={(e) => setS1Enabled(e.target.checked)} className="accent-accent" />
                    Enable scheduled polling
                  </label>
                  {s1TestResult && (
                    <div className={clsx('text-small px-3 py-2 rounded-lg', s1TestResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                      {s1TestResult.message}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button type="submit" disabled={s1Saving} className="btn-fire py-2 px-4 text-small">{s1Saving ? 'Saving...' : 'Save'}</button>
                    <button type="button" onClick={handleTestSentinelOne} disabled={s1Testing || !s1ConsoleUrl} className="btn-mission py-2 px-4 text-small">
                      {s1Testing ? 'Testing...' : 'Test Connection'}
                    </button>
                    {s1Configured && (
                      <button type="button" onClick={() => { setS1Editing(false); setS1ApiToken(''); setS1TestResult(null) }} className="text-text-muted hover:text-text-primary text-small font-medium ml-auto">Cancel</button>
                    )}
                  </div>
                </form>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Generate API Key Modal */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-fire-border rounded-xl w-full max-w-md overflow-hidden shadow-card animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-fire-border">
              <h3 className="text-h3 text-text-primary">Generate API Access Key</h3>
              <button
                onClick={() => setIsKeyModalOpen(false)}
                className="text-text-muted hover:text-text-primary transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleGenerateKey} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Key Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jenkins CI/CD Deployer"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Access Role</label>
                <select
                  value={newKeyRole}
                  onChange={(e) => setNewKeyRole(e.target.value)}
                  className="input-field"
                >
                  <option value="API Read/Write">API Read/Write</option>
                  <option value="Data Ingest Only">Data Ingest Only</option>
                  <option value="API Read Only">API Read Only</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-fire-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsKeyModalOpen(false)}
                  className="btn-mission py-2 px-4 text-small"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-fire py-2 px-4 text-small"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* API Key Created — one-time secret reveal */}
      {revealedKey && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-fire-border rounded-xl w-full max-w-lg overflow-hidden shadow-card animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-fire-border">
              <h3 className="text-h3 text-text-primary">API Key Created — {revealedKey.keyName}</h3>
              <button
                onClick={() => setRevealedKey(null)}
                className="text-text-muted hover:text-text-primary transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-warning/10 border border-warning/30 text-warning px-4 py-3 rounded-lg text-small font-semibold">
                Copy this key now — for your security, it's shown only this once and can't be retrieved again.
                If you lose it, you'll need to revoke it and generate a new one.
              </div>
              <div className="flex items-center gap-2 bg-surface-2 border border-fire-border rounded-lg p-3">
                <code className="flex-1 font-mono text-small text-text-primary break-all select-all">
                  {revealedKey.rawToken}
                </code>
                <button
                  onClick={handleCopyRevealedToken}
                  className="text-text-muted hover:text-text-primary transition-colors focus:outline-none shrink-0"
                >
                  {revealedTokenCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center justify-end pt-2">
                <button
                  onClick={() => setRevealedKey(null)}
                  className="btn-fire py-2 px-4 text-small"
                >
                  Done, I've saved it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Integration Modal */}
      {isIntegrationModalOpen && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-fire-border rounded-xl w-full max-w-md overflow-hidden shadow-card animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-fire-border">
              <h3 className="text-h3 text-text-primary">Connect Custom Integration</h3>
              <button
                onClick={() => setIsIntegrationModalOpen(false)}
                className="text-text-muted hover:text-text-primary transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddIntegration} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Service Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SentinelOne EDR"
                  value={newIntName}
                  onChange={(e) => setNewIntName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Description</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Falcon EDR agent telemetry ingestion and quarantined action logs."
                  value={newIntDesc}
                  onChange={(e) => setNewIntDesc(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1">
                <label className="text-label text-text-muted uppercase block">Logo Letter (optional)</label>
                <input
                  type="text"
                  maxLength={2}
                  placeholder="e.g. S1"
                  value={newIntLogo}
                  onChange={(e) => setNewIntLogo(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-fire-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsIntegrationModalOpen(false)}
                  className="btn-mission py-2 px-4 text-small"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-fire py-2 px-4 text-small"
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
