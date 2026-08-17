import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RequirePermission from './RequirePermission'
import { usePermissionsStore, MODULES } from '@/store/permissionsStore'

beforeEach(() => {
  usePermissionsStore.setState({ permissions: {}, loaded: false })
})

describe('RequirePermission', () => {
  it('renders children before permissions have loaded (fails open to avoid an access-denied flash on every page load)', () => {
    usePermissionsStore.setState({ permissions: {}, loaded: false })
    render(
      <RequirePermission module={MODULES.SETTINGS}>
        <div>Settings Page Content</div>
      </RequirePermission>
    )
    expect(screen.getByText('Settings Page Content')).toBeInTheDocument()
  })

  it('renders the restricted page for a role with no permission on that module, once loaded', () => {
    usePermissionsStore.setState({ permissions: {}, loaded: true })
    render(
      <RequirePermission module={MODULES.SETTINGS}>
        <div>Settings Page Content</div>
      </RequirePermission>
    )
    expect(screen.queryByText('Settings Page Content')).not.toBeInTheDocument()
    expect(screen.getByText('Access Restricted')).toBeInTheDocument()
  })

  it('renders the protected content for a role with at least READ on the module', () => {
    usePermissionsStore.setState({ permissions: { [MODULES.ALERTS_CORRELATION]: 'READ' }, loaded: true })
    render(
      <RequirePermission module={MODULES.ALERTS_CORRELATION}>
        <div>Alerts Content</div>
      </RequirePermission>
    )
    expect(screen.getByText('Alerts Content')).toBeInTheDocument()
  })

  it('denies a WRITE-level page to a role that only has READ on that module', () => {
    usePermissionsStore.setState({ permissions: { [MODULES.SOAR_PLAYBOOKS]: 'READ' }, loaded: true })
    render(
      <RequirePermission module={MODULES.SOAR_PLAYBOOKS} level="WRITE">
        <div>Playbook Editor</div>
      </RequirePermission>
    )
    expect(screen.queryByText('Playbook Editor')).not.toBeInTheDocument()
    expect(screen.getByText('Access Restricted')).toBeInTheDocument()
  })

  it('grants a WRITE-level page to a role with ADMIN (higher than required) on that module', () => {
    usePermissionsStore.setState({ permissions: { [MODULES.SOAR_PLAYBOOKS]: 'ADMIN' }, loaded: true })
    render(
      <RequirePermission module={MODULES.SOAR_PLAYBOOKS} level="WRITE">
        <div>Playbook Editor</div>
      </RequirePermission>
    )
    expect(screen.getByText('Playbook Editor')).toBeInTheDocument()
  })

  it('a permission granted on a DIFFERENT module does not leak access to this one', () => {
    usePermissionsStore.setState({ permissions: { [MODULES.REPORTS_COMPLIANCE]: 'ADMIN' }, loaded: true })
    render(
      <RequirePermission module={MODULES.SETTINGS}>
        <div>Settings Page Content</div>
      </RequirePermission>
    )
    expect(screen.queryByText('Settings Page Content')).not.toBeInTheDocument()
    expect(screen.getByText('Access Restricted')).toBeInTheDocument()
  })
})
