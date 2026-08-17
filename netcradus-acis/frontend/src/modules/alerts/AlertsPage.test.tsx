import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AlertsPage from './AlertsPage'
import { useAuthStore } from '@/store/authStore'
import { usePermissionsStore, MODULES } from '@/store/permissionsStore'
import apiClient from '@/lib/apiClient'

vi.mock('@/lib/apiClient', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/lib/wsClient', () => ({
  default: { subscribe: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }) },
}))

vi.mock('@/lib/keycloak', () => ({
  default: { authenticated: true, token: 'fake-token', tokenParsed: {} },
}))

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>

const sampleAlert = {
  id: 'AL-0001',
  title: 'Suspicious PowerShell Execution',
  severity: 'CRITICAL',
  source: 'EDR',
  status: 'OPEN',
  ownerId: null,
  rawEvent: null,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  confirmedCategory: null,
  labeledAt: null,
  anomalyScore: null,
  isAnomaly: null,
  anomalyFeatures: null,
}

function renderAlertsPage() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/alerts']}>
      <AlertsPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({
    user: {
      sub: 'usr-1', email: 'analyst@acis.local', name: 'Analyst One',
      preferredUsername: 'analyst1', roles: ['analyst'],
    },
    isAuthenticated: true,
    keycloakReady: true,
  })
  usePermissionsStore.setState({
    permissions: { [MODULES.ALERTS_CORRELATION]: 'WRITE' },
    loaded: true,
  })
})

describe('AlertsPage', () => {
  it('shows a loading indicator while the initial alerts fetch is in flight', () => {
    // Never-resolving promise - keeps the page in the "loading" state for
    // the duration of this assertion.
    mockedGet.mockReturnValue(new Promise(() => {}))
    renderAlertsPage()

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders real alert rows once the fetch succeeds', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/alerts') return Promise.resolve({ data: [sampleAlert] })
      if (url === '/api/incidents') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })
    renderAlertsPage()

    // The first alert auto-selects on load, so its title legitimately
    // renders twice (the table row + the detail panel) - assert presence
    // via getAllByText rather than getByText.
    await waitFor(() => expect(screen.getAllByText('Suspicious PowerShell Execution').length).toBeGreaterThan(0))
    expect(screen.queryByText('Unable to load alerts. Please try again.')).not.toBeInTheDocument()
  })

  it('shows a distinct empty state ("No notable alerts found") when the fetch succeeds with zero alerts', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/alerts') return Promise.resolve({ data: [] })
      if (url === '/api/incidents') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })
    renderAlertsPage()

    await waitFor(() => expect(screen.getByText('No notable alerts found')).toBeInTheDocument())
    expect(screen.queryByText('Unable to load alerts. Please try again.')).not.toBeInTheDocument()
  })

  it('shows an error message with a Retry action when the alerts fetch fails - not the empty state', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/alerts') return Promise.reject(new Error('network error'))
      if (url === '/api/incidents') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })
    renderAlertsPage()

    await waitFor(() => expect(screen.getByText('Unable to load alerts. Please try again.')).toBeInTheDocument())
    // A failed fetch must never look identical to a genuinely empty tenant.
    expect(screen.queryByText('No notable alerts found')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('clicking Retry re-invokes the fetch and recovers to showing real data', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    let alertsCallCount = 0
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/alerts') {
        alertsCallCount += 1
        if (alertsCallCount === 1) return Promise.reject(new Error('network error'))
        return Promise.resolve({ data: [sampleAlert] })
      }
      if (url === '/api/incidents') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })
    renderAlertsPage()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    // The first alert auto-selects on load, so its title legitimately
    // renders twice (the table row + the detail panel) - assert presence
    // via getAllByText rather than getByText.
    await waitFor(() => expect(screen.getAllByText('Suspicious PowerShell Execution').length).toBeGreaterThan(0))
    expect(alertsCallCount).toBe(2)
    expect(screen.queryByText('Unable to load alerts. Please try again.')).not.toBeInTheDocument()
  })
})
