import { describe, expect, it, vi } from 'vitest'
import { STALE_RELOAD_GUARD_MS, reloadForStaleBuild } from '../staleBuild'

function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) }
}
const preloadError = () => ({ preventDefault: vi.fn() })
const START = 1_800_000_000_000

// Was: a tab opened before a deploy asked for the old build's SystemView-<hash>.js, got a 404, and stayed broken until a manual reload.
describe('a file of an older build', () => {
  it('reloads the page once, and keeps the error from the loader', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    const event = preloadError()
    expect(reloadForStaleBuild(event, { storage, now: START, reload })).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload again soon after: the file is missing in the new build too', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    reloadForStaleBuild(preloadError(), { storage, now: START, reload })
    const again = preloadError()
    expect(reloadForStaleBuild(again, { storage, now: START + STALE_RELOAD_GUARD_MS - 1, reload })).toBe(false)
    expect(again.preventDefault).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadForStaleBuild(preloadError(), { storage, now: START + STALE_RELOAD_GUARD_MS, reload })).toBe(true)
  })

  it('never reloads without a storage to guard against a loop', () => {
    const reload = vi.fn()
    const event = preloadError()
    expect(reloadForStaleBuild(event, { storage: null, reload })).toBe(false)
    const refusing = { getItem: () => { throw new Error('blocked') }, setItem: () => {} }
    expect(reloadForStaleBuild(event, { storage: refusing, reload })).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})
