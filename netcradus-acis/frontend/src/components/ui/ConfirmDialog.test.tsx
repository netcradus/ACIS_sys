import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmDialog from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Delete Rule"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the title and message when open=true', () => {
    render(
      <ConfirmDialog
        open
        title="Delete Correlation Rule"
        message="This cannot be undone."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByText('Delete Correlation Rule')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
  })

  it('clicking Cancel calls onCancel and not onConfirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog open title="t" message="m" onConfirm={onConfirm} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('clicking the confirm button calls onConfirm and not onCancel', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Delete Group"
        message="m"
        confirmLabel="Delete"
        danger
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('defaults the confirm button label to "Confirm" when confirmLabel is not given', () => {
    render(<ConfirmDialog open title="t" message="m" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('disables both buttons and shows "Working..." while busy', () => {
    render(
      <ConfirmDialog open title="t" message="m" busy confirmLabel="Delete" onConfirm={() => {}} onCancel={() => {}} />
    )
    expect(screen.getByRole('button', { name: 'Working...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})
