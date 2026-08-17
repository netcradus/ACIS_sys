import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ToastContainer from './ToastContainer'
import { useToastStore, toast } from '@/store/toastStore'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

describe('ToastContainer', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(<ToastContainer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a success toast message', () => {
    toast.success('Organization settings updated successfully!')
    render(<ToastContainer />)
    expect(screen.getByText('Organization settings updated successfully!')).toBeInTheDocument()
  })

  it('renders an error toast message', () => {
    toast.error('Failed to save agent policy')
    render(<ToastContainer />)
    expect(screen.getByText('Failed to save agent policy')).toBeInTheDocument()
  })

  it('renders a warning toast message', () => {
    toast.warning('No invoices available to download.')
    render(<ToastContainer />)
    expect(screen.getByText('No invoices available to download.')).toBeInTheDocument()
  })

  it('renders an info toast message', () => {
    toast.info('Key is already revoked')
    render(<ToastContainer />)
    expect(screen.getByText('Key is already revoked')).toBeInTheDocument()
  })

  it('renders multiple simultaneous toasts, each visible', () => {
    toast.success('first one')
    toast.error('second one')
    render(<ToastContainer />)
    expect(screen.getByText('first one')).toBeInTheDocument()
    expect(screen.getByText('second one')).toBeInTheDocument()
  })

  it('clicking the dismiss button removes only that toast', async () => {
    const user = userEvent.setup()
    toast.success('keep me visible')
    toast.error('dismiss me')
    render(<ToastContainer />)

    const dismissButtons = screen.getAllByRole('button')
    // The second toast rendered is "dismiss me" - click its own dismiss button.
    await user.click(dismissButtons[1])

    await waitFor(() => expect(screen.queryByText('dismiss me')).not.toBeInTheDocument())
    expect(screen.getByText('keep me visible')).toBeInTheDocument()
  })
})
