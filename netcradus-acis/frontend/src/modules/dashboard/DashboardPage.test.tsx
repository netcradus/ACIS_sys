import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from './DashboardPage'
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

// Fixed reference instant for this test file - all sample alert timestamps
// are expressed as real offsets from it, so the derived widgets (MTTD, MTTR,
// Incident Timeline) get real, deterministic, computable values instead of
// depending on wall-clock time at the moment the test happens to run.
const NOW = Date.now()
const minutesAgo = (m: number) => new Date(NOW - m * 60000).toISOString()

const sampleSummary = { totalAlerts: 4, criticalAlerts: 1, highAlerts: 1, openIncidents: 2, events24h: 500 }

const sampleAlerts = [
  {
    id: 'AL-1', title: 'Critical Alert One', severity: 'CRITICAL', status: 'OPEN', source: 'EDR',
    ownerId: 'u1', createdAt: minutesAgo(30), updatedAt: minutesAgo(30), eventOccurredAt: minutesAgo(40),
  },
  {
    id: 'AL-2', title: 'High Alert Two', severity: 'HIGH', status: 'MITIGATED', source: 'NIDS',
    ownerId: null, createdAt: minutesAgo(120), updatedAt: minutesAgo(90), eventOccurredAt: null,
  },
  {
    id: 'AL-3', title: 'Medium Alert Three', severity: 'MEDIUM', status: 'OPEN', source: 'EDR',
    ownerId: 'u2', createdAt: minutesAgo(60), updatedAt: minutesAgo(60), eventOccurredAt: null,
  },
  {
    id: 'AL-4', title: 'Low Alert Four', severity: 'LOW', status: 'CLOSED', source: 'EDR',
    ownerId: null, createdAt: minutesAgo(200), updatedAt: minutesAgo(190), eventOccurredAt: null,
  },
]

// AL-1: eventOccurredAt -> createdAt is 10 real minutes -> mttdMinutes = 10 -> "10.0m"
// Resolved (MITIGATED/CLOSED) alerts AL-2 (30min) and AL-4 (10min) -> mttrMinutes avg = 20 -> "20.0m"
// openHighSeverityAlerts (CRITICAL/HIGH + OPEN/INVESTIGATING): only AL-1 -> count 1
// ownerBreakdown: assigned = AL-1, AL-3 = 2 of 4 -> 50% / 50%

/** Resolves every non-alert polling/summary endpoint DashboardPage calls on
 * mount with safe, empty data - these all intentionally have no visible
 * loading/error UI, so tests only need them to not crash the render. */
function safeGet(url: string): Promise<any> {
  if (url === '/api/logs/ai-metrics') return Promise.resolve({ data: null })
  if (url === '/api/soar/settings/users') return Promise.resolve({ data: [] })
  if (url === '/api/logs/ingest-stats') return Promise.resolve({ data: null })
  if (url === '/api/logs/ai-model-status') return Promise.resolve({ data: null })
  if (url === '/api/logs/category-counts') return Promise.resolve({ data: null })
  if (url === '/api/soar/settings/agents') return Promise.resolve({ data: { data: [] } })
  if (url === '/api/soar/settings/integrations/status') return Promise.resolve({ data: [] })
  if (url === '/api/threat-intel') return Promise.resolve({ data: { content: [] } })
  if (url === '/api/logs/ingest-volume-errors') return Promise.resolve({ data: null })
  if (url === '/api/red-team/simulations') return Promise.resolve({ data: [] })
  if (url === '/api/soar/playbooks') return Promise.resolve({ data: [] })
  if (url === '/api/soar/executions') return Promise.resolve({ data: [] })
  return Promise.resolve({ data: [] })
}

function renderDashboardPage() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DashboardPage />
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

describe('DashboardPage', () => {
  it('renders without error while the primary alerts/summary fetch is in flight', () => {
    // Never-resolving promise for every endpoint - keeps the page in the
    // "loading" state for the duration of this assertion.
    mockedGet.mockReturnValue(new Promise(() => {}))
    renderDashboardPage()

    // Static hero content renders immediately regardless of fetch state.
    expect(screen.getByText('Secure operations at the speed of threat.')).toBeInTheDocument()
    expect(screen.getByText('OPERATIONAL READINESS')).toBeInTheDocument()
    // Nothing has loaded yet, so no error banner should be showing.
    expect(screen.queryByText('Unable to load dashboard data. Please try again.')).not.toBeInTheDocument()
  })

  it('renders real KPI numbers derived from the fetched alerts once the fetch succeeds', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/alerts/dashboard/summary') return Promise.resolve({ data: sampleSummary })
      if (url === '/api/alerts') return Promise.resolve({ data: sampleAlerts })
      return safeGet(url)
    })
    const { container } = renderDashboardPage()

    await waitFor(() => expect(container.querySelector('.big-num')).toHaveTextContent('1'))

    // Notable Events: 1 open CRITICAL/HIGH alert (AL-1), shown by title too.
    expect(screen.getByText('Critical Alert One')).toBeInTheDocument()

    // Alert Severity Mix donut legend: one alert per severity tier.
    const legendCounts = Array.from(container.querySelectorAll('.donut-legend .n')).map(n => n.textContent)
    expect(legendCounts).toEqual(['1', '1', '1', '1'])

    // Owner Breakdown: 2 of 4 alerts have a real owner (AL-1, AL-3) -> 50/50.
    expect(screen.getByText('2 of 4 alerts have a real assigned owner.')).toBeInTheDocument()
    const ownerPercents = container.querySelectorAll('.owner .owner-row b')
    expect(Array.from(ownerPercents).map(n => n.textContent)).toEqual(['50%', '50%'])

    // Mean Time to Detect / Respond gauges, computed from real timestamps.
    const gaugeVals = Array.from(container.querySelectorAll('.gauge-val')).map(n => n.textContent)
    expect(gaugeVals).toEqual(['10.0m', '20.0m'])

    expect(screen.queryByText('Unable to load dashboard data. Please try again.')).not.toBeInTheDocument()
  })

  it('shows reasonable empty states (no crash) when the fetch succeeds with zero alerts', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/alerts/dashboard/summary') return Promise.resolve({ data: { totalAlerts: 0, criticalAlerts: 0, highAlerts: 0, openIncidents: 0, events24h: 0 } })
      if (url === '/api/alerts') return Promise.resolve({ data: [] })
      return safeGet(url)
    })
    renderDashboardPage()

    await waitFor(() => expect(screen.getByText('No alerts yet.')).toBeInTheDocument())
    expect(screen.getByText('No open high/critical severity alerts.')).toBeInTheDocument()
    expect(screen.getByText('No alerts to attribute ownership to yet.')).toBeInTheDocument()
    // Both MTTD and MTTR gauges render "No data" when there's nothing to compute from.
    expect(screen.getAllByText('No data').length).toBe(2)
    expect(screen.queryByText('Unable to load dashboard data. Please try again.')).not.toBeInTheDocument()
  })

  it('shows the dataError banner with a Retry action when the primary fetch fails', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/alerts/dashboard/summary') return Promise.resolve({ data: sampleSummary })
      if (url === '/api/alerts') return Promise.reject(new Error('network error'))
      return safeGet(url)
    })
    renderDashboardPage()

    await waitFor(() => expect(screen.getByText('Unable to load dashboard data. Please try again.')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('clicking Retry re-invokes fetchData and recovers to showing real data', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    let alertsCallCount = 0
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/alerts/dashboard/summary') return Promise.resolve({ data: sampleSummary })
      if (url === '/api/alerts') {
        alertsCallCount += 1
        if (alertsCallCount === 1) return Promise.reject(new Error('network error'))
        return Promise.resolve({ data: sampleAlerts })
      }
      return safeGet(url)
    })
    const { container } = renderDashboardPage()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(container.querySelector('.big-num')).toHaveTextContent('1'))
    expect(alertsCallCount).toBe(2)
    expect(screen.queryByText('Unable to load dashboard data. Please try again.')).not.toBeInTheDocument()
  })
})
