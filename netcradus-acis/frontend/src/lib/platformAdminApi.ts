import apiClient from './apiClient'

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'DEACTIVATED'

export type TenantModule =
  | 'LOG_EXPLORER'
  | 'CORRELATION'
  | 'ALERTS'
  | 'ASSETS'
  | 'THREAT_INTEL'
  | 'SOAR'
  | 'RED_TEAM'
  | 'ENDPOINTS'
  | 'COMPLIANCE'
  | 'REPORTS'
  | 'AI_ANALYST'

export const ALL_TENANT_MODULES: { key: TenantModule; label: string }[] = [
  { key: 'LOG_EXPLORER', label: 'Log Explorer' },
  { key: 'CORRELATION', label: 'Correlation' },
  { key: 'ALERTS', label: 'Alerts & Incidents' },
  { key: 'ASSETS', label: 'Assets & Identities' },
  { key: 'THREAT_INTEL', label: 'Threat Intel' },
  { key: 'SOAR', label: 'SOAR Playbooks' },
  { key: 'RED_TEAM', label: 'Red Team' },
  { key: 'ENDPOINTS', label: 'Endpoints & Network' },
  { key: 'COMPLIANCE', label: 'Compliance & Audit' },
  { key: 'REPORTS', label: 'Reports' },
  { key: 'AI_ANALYST', label: 'AI Analyst' },
]

export interface Tenant {
  id: string
  name: string
  slug: string | null
  status: TenantStatus
  planName: string | null
  enabledModules: TenantModule[]
  contactEmail: string | null
  contactName: string | null
  createdAt: string
  updatedAt: string
  suspendedAt: string | null
  suspendedReason: string | null
}

export interface CreateTenantRequest {
  name: string
  slug?: string
  planName?: string
  contactEmail?: string
  contactName?: string
}

export interface UpdateTenantRequest {
  name?: string
  contactEmail?: string
  contactName?: string
}

const BASE = '/api/platform/tenants'

export async function listTenants(): Promise<Tenant[]> {
  const res = await apiClient.get<Tenant[]>(BASE)
  return res.data
}

export async function getTenant(tenantId: string): Promise<Tenant> {
  const res = await apiClient.get<Tenant>(`${BASE}/${tenantId}`)
  return res.data
}

export async function createTenant(payload: CreateTenantRequest): Promise<Tenant> {
  const res = await apiClient.post<Tenant>(BASE, payload)
  return res.data
}

export async function updateTenant(tenantId: string, payload: UpdateTenantRequest): Promise<Tenant> {
  const res = await apiClient.put<Tenant>(`${BASE}/${tenantId}`, payload)
  return res.data
}

export async function suspendTenant(tenantId: string, reason?: string): Promise<Tenant> {
  const res = await apiClient.post<Tenant>(`${BASE}/${tenantId}/suspend`, { reason })
  return res.data
}

export async function reactivateTenant(tenantId: string): Promise<Tenant> {
  const res = await apiClient.post<Tenant>(`${BASE}/${tenantId}/reactivate`, {})
  return res.data
}

export async function setTenantPlan(tenantId: string, planName: string): Promise<Tenant> {
  const res = await apiClient.patch<Tenant>(`${BASE}/${tenantId}/plan`, { planName })
  return res.data
}

export async function setTenantModules(tenantId: string, enabledModules: TenantModule[]): Promise<Tenant> {
  const res = await apiClient.patch<Tenant>(`${BASE}/${tenantId}/modules`, { enabledModules })
  return res.data
}

export async function deleteTenant(tenantId: string): Promise<void> {
  await apiClient.delete(`${BASE}/${tenantId}`)
}

// ── Cross-tenant user management (Phase 1c) ─────────────────────────

export const ALL_REALM_ROLES: { key: string; label: string }[] = [
  { key: 'viewer', label: 'Viewer' },
  { key: 'analyst', label: 'Analyst' },
  { key: 'engineer', label: 'Engineer' },
  { key: 'admin', label: 'Admin' },
  { key: 'company-admin', label: 'Company Admin' },
  { key: 'platform-admin', label: 'Platform Admin' },
]

export interface PlatformUser {
  id: string
  username: string
  email: string | null
  firstName: string | null
  lastName: string | null
  enabled: boolean
  tenantId: string | null
  tenantName: string | null
  roles: string[]
  totp: boolean
  createdTimestamp: number | null
}

export interface PlatformUserDetail extends PlatformUser {
  requiredActions: string[]
  locked: boolean
  failedLoginAttempts: number
}

export interface CreateUserRequest {
  tenantId: string
  username: string
  email?: string
  firstName?: string
  lastName?: string
  tempPassword?: string
  forcePasswordResetNextLogin?: boolean
  initialRoles?: string[]
}

export interface UpdateUserRequest {
  username?: string
  email?: string
  firstName?: string
  lastName?: string
}

const USERS_BASE = '/api/platform/users'

export async function listUsers(): Promise<PlatformUser[]> {
  const res = await apiClient.get<PlatformUser[]>(USERS_BASE)
  return res.data
}

export async function getUser(userId: string): Promise<PlatformUserDetail> {
  const res = await apiClient.get<PlatformUserDetail>(`${USERS_BASE}/${userId}`)
  return res.data
}

export async function createUser(payload: CreateUserRequest): Promise<{ id: string }> {
  const res = await apiClient.post<{ id: string }>(USERS_BASE, payload)
  return res.data
}

export async function updateUserProfile(userId: string, payload: UpdateUserRequest): Promise<PlatformUserDetail> {
  const res = await apiClient.put<PlatformUserDetail>(`${USERS_BASE}/${userId}`, payload)
  return res.data
}

export async function deleteUser(userId: string): Promise<void> {
  await apiClient.delete(`${USERS_BASE}/${userId}`)
}

export async function activateUser(userId: string): Promise<PlatformUserDetail> {
  const res = await apiClient.post<PlatformUserDetail>(`${USERS_BASE}/${userId}/activate`, {})
  return res.data
}

export async function deactivateUser(userId: string): Promise<PlatformUserDetail> {
  const res = await apiClient.post<PlatformUserDetail>(`${USERS_BASE}/${userId}/deactivate`, {})
  return res.data
}

export async function moveUserTenant(userId: string, newTenantId: string): Promise<PlatformUserDetail> {
  const res = await apiClient.post<PlatformUserDetail>(`${USERS_BASE}/${userId}/move-tenant`, { newTenantId })
  return res.data
}

export async function assignRole(userId: string, role: string): Promise<string[]> {
  const res = await apiClient.post<string[]>(`${USERS_BASE}/${userId}/roles`, { role })
  return res.data
}

export async function removeRole(userId: string, role: string): Promise<string[]> {
  const res = await apiClient.delete<string[]>(`${USERS_BASE}/${userId}/roles/${role}`)
  return res.data
}
