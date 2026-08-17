import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from './SettingsPage'
import { useAuthStore } from '@/store/authStore'
import { usePermissionsStore, MODULES } from '@/store/permissionsStore'
import { useToastStore } from '@/store/toastStore'
import apiClient from '@/lib/apiClient'

vi.mock('@/lib/apiClient', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/lib/keycloak', () => ({
  default: { authenticated: true, token: 'fake-token', tokenParsed: {}, accountManagement: vi.fn() },
}))

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>
const mockedPut = apiClient.put as unknown as ReturnType<typeof vi.fn>
const mockedDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>

const sampleProfile = {
  name: 'Admin One', email: 'admin@acis.local', phone: '', department: '',
  timezone: 'IST (UTC +05:30)', mfaEnabled: false, passwordLastChangedAt: null,
  emailNotifications: true, soundAlerts: true, criticalOnly: false,
}

const sampleOrg = {
  name: 'Acme Security', orgIdString: 'ORG-0001', industry: 'Financial Services',
  primaryRegion: 'US East (N. Virginia)', supportEmail: 'support@acme.example',
  timeZone: 'EST (UTC -5:00)',
}

const sampleAgent = {
  id: 'agent-1', hostname: 'ACIS-WIN-01', os: 'Windows Server 2022',
  ipAddress: '10.0.0.5', agentVersion: '1.0.0', status: 'ONLINE',
  lastHeartbeatAt: new Date().toISOString(),
}

/** Safe defaults for every endpoint SettingsPage fetches unconditionally on
 * mount (profile, agent fleet/token/policy, keys+integrations, organization,
 * license+invoices, users+groups, roles, and all 8 vendor-integration
 * configs). Individual tests override only the URLs they actually assert on. */
function safeGet(url: string): Promise<any> {
  if (url === '/api/soar/settings/profile') return Promise.resolve({ data: sampleProfile })
  if (url === '/api/soar/settings/agents') return Promise.resolve({ data: { data: [] } })
  if (url === '/api/soar/settings/agent-token') return Promise.resolve({ data: { token: 'enroll-token' } })
  if (url === '/api/soar/settings/keys') return Promise.resolve({ data: [] })
  if (url === '/api/soar/settings/integrations') return Promise.resolve({ data: [] })
  if (url === '/api/soar/settings/organization') return Promise.resolve({ data: sampleOrg })
  if (url === '/api/soar/settings/invoices') return Promise.resolve({ data: [] })
  if (url === '/api/soar/settings/users') return Promise.resolve({ data: [] })
  if (url === '/api/soar/settings/groups') return Promise.resolve({ data: [] })
  if (url === '/api/soar/settings/roles') return Promise.resolve({ data: [] })
  return Promise.resolve({ data: {} })
}

function renderSettingsPage(initialPath = '/dashboard/settings') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SettingsPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({
    user: {
      sub: 'usr-1', email: 'admin@acis.local', name: 'Admin One',
      preferredUsername: 'admin1', roles: ['admin'],
    },
    isAuthenticated: true,
    keycloakReady: true,
  })
  // WRITE + ADMIN on Settings so every save/delete affordance this file
  // exercises is enabled (some destructive buttons are gated on ADMIN, not
  // just WRITE - see the disabled={!canAdminSettings} vendor-integration
  // "Remove" buttons).
  usePermissionsStore.setState({
    permissions: { [MODULES.SETTINGS]: 'ADMIN' },
    loaded: true,
  })
  useToastStore.setState({ toasts: [] })
})

describe('SettingsPage', () => {
  it('loads without crashing for a user with Settings access, on the default Profile tab', async () => {
    mockedGet.mockImplementation((url: string) => safeGet(url))
    renderSettingsPage()

    // profileLoading flips false once /api/soar/settings/profile resolves,
    // swapping the "Loading..." heading placeholder for the real name.
    await waitFor(() => expect(screen.getByText('Admin One')).toBeInTheDocument())
    expect(screen.getByText('admin@acis.local')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save Profile/ })).toBeInTheDocument()
    // No spurious error toasts from any of the many mount-time fetches.
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('Organization "Save changes" calls the real PUT endpoint with the loaded form data and shows a success toast', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    mockedGet.mockImplementation((url: string) => safeGet(url))
    mockedPut.mockImplementation((url: string) => {
      if (url === '/api/soar/settings/organization') return Promise.resolve({ data: { ...sampleOrg } })
      return Promise.resolve({ data: {} })
    })
    renderSettingsPage('/dashboard/settings?tab=Organization')

    // Wait for fetchOrganization to populate the form before saving, so the
    // PUT payload reflects real loaded data rather than the empty initial state.
    await waitFor(() => expect(screen.getByDisplayValue(sampleOrg.name)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedPut).toHaveBeenCalledWith('/api/soar/settings/organization', {
      name: sampleOrg.name,
      orgIdString: sampleOrg.orgIdString,
      industry: sampleOrg.industry,
      primaryRegion: sampleOrg.primaryRegion,
      supportEmail: sampleOrg.supportEmail,
      timeZone: sampleOrg.timeZone,
    }))

    await waitFor(() => expect(useToastStore.getState().toasts.some(
      t => t.type === 'success' && t.message === 'Organization settings updated successfully!'
    )).toBe(true))
  })

  it('shows a toast.error and does not corrupt state when the Organization save fails', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    mockedGet.mockImplementation((url: string) => safeGet(url))
    mockedPut.mockImplementation((url: string) => {
      if (url === '/api/soar/settings/organization') return Promise.reject(new Error('network error'))
      return Promise.resolve({ data: {} })
    })
    renderSettingsPage('/dashboard/settings?tab=Organization')

    await waitFor(() => expect(screen.getByDisplayValue(sampleOrg.name)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(useToastStore.getState().toasts.some(
      t => t.type === 'error' && t.message === 'Failed to update organization settings.'
    )).toBe(true))
    // No success toast fired alongside the failure.
    expect(useToastStore.getState().toasts.some(t => t.type === 'success')).toBe(false)
  })

  it('Remove Agent: Cancel closes the dialog without deleting; Confirm calls the real DELETE endpoint', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/soar/settings/agents') return Promise.resolve({ data: { data: [sampleAgent] } })
      return safeGet(url)
    })
    mockedDelete.mockResolvedValue({})
    renderSettingsPage('/dashboard/settings?tab=Agent%20Deployment')

    await waitFor(() => expect(screen.getByText('ACIS-WIN-01')).toBeInTheDocument())

    // Only the fleet row's "Remove" button exists before the dialog opens.
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    const dialogHeading = await screen.findByText('Remove Agent')
    const dialog = dialogHeading.closest('.fixed') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(within(dialog).getByText(/Remove this agent from the fleet/)).toBeInTheDocument()

    // Cancel must not call the destructive endpoint.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Remove Agent')).not.toBeInTheDocument())
    expect(mockedDelete).not.toHaveBeenCalled()

    // Re-open and actually confirm this time.
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog2 = (await screen.findByText('Remove Agent')).closest('.fixed') as HTMLElement
    await user.click(within(dialog2).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('/api/soar/settings/agents/agent-1'))
    await waitFor(() => expect(screen.queryByText('Remove Agent')).not.toBeInTheDocument())
  })
})
