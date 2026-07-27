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

// ── Phase 1c.2: Advanced Security Management ────────────────────────

export interface UserSecurityInfo {
  userId: string
  username: string
  accountStatus: 'ACTIVE' | 'DISABLED' | 'TEMPORARILY_BLOCKED'
  enabled: boolean
  bruteForceLocked: boolean
  failedLoginAttempts: number
  lastFailureTimestamp: string | null
  mfaEnabled: boolean
  mfaRequired: boolean
  otpDeviceCount: number
  passwordChangeRequired: boolean
  requiredActions: string[]
  activeSessionCount: number
  createdTimestamp: number | null
}

export interface UserSessionInfo {
  sessionId: string
  startTimestamp: number | null
  lastAccessTimestamp: number | null
  ipAddress: string | null
  clients: string | null
  userAgent: string | null
}

export interface AuditEvent {
  id: string
  timestamp: string
  adminUserId: string
  adminUsername: string
  adminEmail: string | null
  targetUserId: string | null
  targetUsername: string | null
  targetEmail: string | null
  tenantId: string | null
  tenantName: string | null
  action: string
  resourceType: string
  previousValue: string | null
  newValue: string | null
  ipAddress: string | null
  userAgent: string | null
  status: 'SUCCESS' | 'FAILURE'
  failureReason: string | null
}

export interface AuditSearchResult {
  content: AuditEvent[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface AuditSearchParams {
  startDate?: string
  endDate?: string
  tenantId?: string
  adminUserId?: string
  targetUserId?: string
  action?: string
  status?: string
  search?: string
  page?: number
  size?: number
}

const SECURITY_BASE = (userId: string) => `${USERS_BASE}/${userId}/security`

export async function getUserSecurityInfo(userId: string): Promise<UserSecurityInfo> {
  const res = await apiClient.get<UserSecurityInfo>(SECURITY_BASE(userId))
  return res.data
}

export async function resetUserPassword(userId: string, newPassword: string, temporary: boolean): Promise<void> {
  await apiClient.post(`${SECURITY_BASE(userId)}/password/reset`, { newPassword, temporary })
}

export async function generateTempPassword(userId: string): Promise<string> {
  const res = await apiClient.post<{ tempPassword: string }>(`${SECURITY_BASE(userId)}/password/temp-generate`, {})
  return res.data.tempPassword
}

export async function forcePasswordChange(userId: string): Promise<void> {
  await apiClient.post(`${SECURITY_BASE(userId)}/password/force-change`, {})
}

export async function sendPasswordResetEmail(userId: string): Promise<void> {
  await apiClient.post(`${SECURITY_BASE(userId)}/password/send-reset-email`, {})
}

export async function lockUserAccount(userId: string): Promise<void> {
  await apiClient.post(`${SECURITY_BASE(userId)}/lock`, {})
}

export async function unlockUserAccount(userId: string): Promise<void> {
  await apiClient.post(`${SECURITY_BASE(userId)}/unlock`, {})
}

export async function clearBruteForce(userId: string): Promise<void> {
  await apiClient.post(`${SECURITY_BASE(userId)}/brute-force/clear`, {})
}

export async function requireMfa(userId: string): Promise<void> {
  await apiClient.post(`${SECURITY_BASE(userId)}/mfa/require`, {})
}

export async function removeMfa(userId: string): Promise<void> {
  await apiClient.post(`${SECURITY_BASE(userId)}/mfa/remove`, {})
}

export async function resetMfaDevices(userId: string): Promise<void> {
  await apiClient.post(`${SECURITY_BASE(userId)}/mfa/reset`, {})
}

export async function listUserSessions(userId: string): Promise<UserSessionInfo[]> {
  const res = await apiClient.get<UserSessionInfo[]>(`${SECURITY_BASE(userId)}/sessions`)
  return res.data
}

export async function terminateSession(userId: string, sessionId: string): Promise<void> {
  await apiClient.delete(`${SECURITY_BASE(userId)}/sessions/${sessionId}`)
}

export async function terminateAllSessions(userId: string): Promise<void> {
  await apiClient.delete(`${SECURITY_BASE(userId)}/sessions`)
}

// ── Audit Log API ───────────────────────────────────────────────────

const AUDIT_BASE = '/api/platform/audit'

export async function searchAuditLogs(params: AuditSearchParams): Promise<AuditSearchResult> {
  const queryParams = new URLSearchParams()
  if (params.startDate) queryParams.set('startDate', params.startDate)
  if (params.endDate) queryParams.set('endDate', params.endDate)
  if (params.tenantId) queryParams.set('tenantId', params.tenantId)
  if (params.adminUserId) queryParams.set('adminUserId', params.adminUserId)
  if (params.targetUserId) queryParams.set('targetUserId', params.targetUserId)
  if (params.action) queryParams.set('action', params.action)
  if (params.status) queryParams.set('status', params.status)
  if (params.search) queryParams.set('search', params.search)
  queryParams.set('page', String(params.page ?? 0))
  queryParams.set('size', String(params.size ?? 50))

  const res = await apiClient.get<AuditSearchResult>(`${AUDIT_BASE}?${queryParams.toString()}`)
  return res.data
}

export async function getAuditActions(): Promise<string[]> {
  const res = await apiClient.get<string[]>(`${AUDIT_BASE}/actions`)
  return res.data
}

export function getAuditExportCsvUrl(params: AuditSearchParams): string {
  const queryParams = new URLSearchParams()
  if (params.startDate) queryParams.set('startDate', params.startDate)
  if (params.endDate) queryParams.set('endDate', params.endDate)
  if (params.tenantId) queryParams.set('tenantId', params.tenantId)
  if (params.adminUserId) queryParams.set('adminUserId', params.adminUserId)
  if (params.targetUserId) queryParams.set('targetUserId', params.targetUserId)
  if (params.action) queryParams.set('action', params.action)
  if (params.status) queryParams.set('status', params.status)
  if (params.search) queryParams.set('search', params.search)
  return `${AUDIT_BASE}/export/csv?${queryParams.toString()}`
}
