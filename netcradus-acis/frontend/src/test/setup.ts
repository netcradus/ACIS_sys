import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom implements neither ResizeObserver nor matchMedia - recharts (used
// by DashboardPage/CorrelationPage) and AG Grid both call ResizeObserver on
// mount, and would throw "ResizeObserver is not defined" for every page
// test otherwise.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList
}

// Ensures each test starts with a clean DOM tree and no leftover React
// portals/subscriptions from the previous test.
afterEach(() => {
  cleanup()
})
