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

// Node ≥24 ships a built-in global localStorage/sessionStorage. Under vitest's
// jsdom environment globalThis === window, and Node's accessor is already on
// globalThis before jsdom installs its own — so jsdom's real Storage never
// wins, and Node's version resolves to a bare object with no prototype
// methods (no --localstorage-file was given). Guard rather than override: on
// a Node where jsdom's Storage installs correctly (e.g. CI's Node 22), this
// is a no-op. Do not delete this as redundant.
function hasWorkingStorage(value: unknown): value is Storage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Storage).getItem === 'function' &&
    typeof (value as Storage).setItem === 'function' &&
    typeof (value as Storage).removeItem === 'function' &&
    typeof (value as Storage).clear === 'function'
  )
}

if (!hasWorkingStorage(globalThis.localStorage)) {
  // Keys are stored as the instance's own enumerable properties (not in a
  // Map) so that Object.keys(localStorage) reflects them, matching how real
  // Storage implementations enumerate — callers rely on this to assert which
  // keys are present.
  class MemoryStorage {
    getItem(key: string) {
      const data = this as unknown as Record<string, string>
      return Object.prototype.hasOwnProperty.call(this, key) ? data[key] : null
    }
    setItem(key: string, value: string) {
      Object.defineProperty(this, key, { value: String(value), writable: true, enumerable: true, configurable: true })
    }
    removeItem(key: string) { delete (this as unknown as Record<string, string>)[key] }
    clear() {
      const data = this as unknown as Record<string, string>
      for (const key of Object.keys(this)) delete data[key]
    }
    key(index: number) { return Object.keys(this)[index] ?? null }
    get length() { return Object.keys(this).length }
  }
  globalThis.localStorage = new MemoryStorage() as unknown as Storage
}
