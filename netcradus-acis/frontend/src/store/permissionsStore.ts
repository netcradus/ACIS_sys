import { create } from 'zustand'
import apiClient from '@/lib/apiClient'

/** Matches acis-common's PermissionLevel — NONE < READ < WRITE < ADMIN. */
export type PermissionLevel = 'NONE' | 'READ' | 'WRITE' | 'ADMIN'

const RANK: Record<PermissionLevel, number> = { NONE: 0, READ: 1, WRITE: 2, ADMIN: 3 }

/** The 6 modules the backend's RbacEnforcementFilter actually enforces — see DefaultRoleProvisioner.MODULES. */
export const MODULES = {
  DASHBOARD: 'Dashboard',
  ALERTS_CORRELATION: 'Alerts & Correlation',
  ASSETS_THREAT_INTEL: 'Assets & Threat Intel',
  SOAR_PLAYBOOKS: 'SOAR Playbooks',
  REPORTS_COMPLIANCE: 'Reports & Compliance',
  SETTINGS: 'Settings',
} as const

interface PermissionsState {
  permissions: Record<string, PermissionLevel>
  loaded: boolean
  fetchPermissions: () => Promise<void>
  clearPermissions: () => void
}

/**
 * Mirrors what RbacEnforcementFilter actually enforces server-side (see
 * GET /api/soar/settings/my-permissions) — this is display/UX gating only,
 * never the real security boundary. The backend rejects with 403 regardless
 * of what this store says, so a stale or manipulated client value can only
 * ever produce a confusing UI, not a bypass.
 */
export const usePermissionsStore = create<PermissionsState>((set) => ({
  permissions: {},
  loaded: false,

  fetchPermissions: async () => {
    try {
      const res = await apiClient.get('/api/soar/settings/my-permissions')
      set({ permissions: res.data || {}, loaded: true })
    } catch (e) {
      console.error('Failed to fetch permissions:', e)
      set({ permissions: {}, loaded: true })
    }
  },

  clearPermissions: () => set({ permissions: {}, loaded: false }),
}))

function levelOf(permissions: Record<string, PermissionLevel>, module: string): PermissionLevel {
  return permissions[module] || 'NONE'
}

/** True if the caller's role grants at least `required` on `module`. */
export function useHasPermission(module: string, required: PermissionLevel): boolean {
  return usePermissionsStore((s) => RANK[levelOf(s.permissions, module)] >= RANK[required])
}

export function useCanRead(module: string): boolean {
  return useHasPermission(module, 'READ')
}

export function useCanWrite(module: string): boolean {
  return useHasPermission(module, 'WRITE')
}

export function useCanAdmin(module: string): boolean {
  return useHasPermission(module, 'ADMIN')
}

export function usePermissionsLoaded(): boolean {
  return usePermissionsStore((s) => s.loaded)
}
