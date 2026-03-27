import '@testing-library/jest-dom'

// jsdom does not implement IntersectionObserver — provide a minimal stub
// Minimal IntersectionObserver stub — reports all targets as intersecting
globalThis.IntersectionObserver = class {
  _callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) { this._callback = callback }
  observe(target: Element) {
    this._callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
  get root() { return null }
  get rootMargin() { return '' }
  get thresholds() { return [] as number[] }
} as unknown as typeof IntersectionObserver
