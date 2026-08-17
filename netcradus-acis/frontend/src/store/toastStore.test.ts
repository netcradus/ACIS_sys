import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToastStore, toast } from './toastStore'

// Zustand stores are singletons that persist state across tests in the same
// module - reset to the store's own initial shape before every test so one
// test's toasts can't leak into the next.
beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

describe('toastStore', () => {
  it('toast.success adds a toast with type "success"', () => {
    toast.success('Saved successfully')
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ type: 'success', message: 'Saved successfully' })
  })

  it('toast.error adds a toast with type "error"', () => {
    toast.error('Failed to save')
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error', message: 'Failed to save' })
  })

  it('toast.warning adds a toast with type "warning"', () => {
    toast.warning('Nothing to export')
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'warning', message: 'Nothing to export' })
  })

  it('toast.info adds a toast with type "info"', () => {
    toast.info('Key is already revoked')
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'info', message: 'Key is already revoked' })
  })

  it('each toast gets a unique id, and multiple toasts stack in order', () => {
    toast.success('first')
    toast.error('second')
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(2)
    expect(toasts[0].id).not.toEqual(toasts[1].id)
    expect(toasts.map((t) => t.message)).toEqual(['first', 'second'])
  })

  it('dismiss(id) removes exactly that toast and leaves the others', () => {
    toast.success('keep me')
    toast.error('remove me')
    const idToRemove = useToastStore.getState().toasts[1].id
    useToastStore.getState().dismiss(idToRemove)
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('keep me')
  })

  describe('auto-dismiss after 5s', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('a toast is automatically removed 5 seconds after it is shown', () => {
      toast.success('will vanish')
      expect(useToastStore.getState().toasts).toHaveLength(1)

      vi.advanceTimersByTime(4999)
      expect(useToastStore.getState().toasts).toHaveLength(1)

      vi.advanceTimersByTime(1)
      expect(useToastStore.getState().toasts).toHaveLength(0)
    })
  })
})
