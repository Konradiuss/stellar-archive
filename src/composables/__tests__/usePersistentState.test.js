import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { readStoredValue, siteFolder, usePersistentState, writeStoredValue } from '../usePersistentState'

function memoryStorage() {
  const data = new Map()
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data
  }
}

describe('usePersistentState', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts from the default and remembers changes', async () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    const scope = effectScope()
    const state = scope.run(() => usePersistentState('test', { a: 1, b: true }))

    expect(state.value).toEqual({ a: 1, b: true })
    state.value = { ...state.value, a: 2 }
    await nextTick()
    expect(readStoredValue('test', {})).toEqual({ a: 2, b: true })
    scope.stop()
  })

  it('merges stored objects over the defaults and ignores values of another type', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    storage.setItem('spacemap:v1:obj', JSON.stringify({ a: 5 }))
    storage.setItem('spacemap:v1:num', JSON.stringify('text'))
    storage.setItem('spacemap:v1:broken', '{not json')

    expect(readStoredValue('obj', { a: 1, b: 2 })).toEqual({ a: 5, b: 2 })
    expect(readStoredValue('num', 3)).toBe(3)
    expect(readStoredValue('broken', 'fallback')).toBe('fallback')
  })

  // Was: all GitHub Pages sites of a user are one origin, so two maps shared their window layout and camera.
  it('keeps the values of each site under its own folder, and reads the old shared ones', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('location', { pathname: '/first-map/index.html' })
    storage.setItem('spacemap:v1:camera', JSON.stringify('kept before'))
    expect(readStoredValue('camera', '')).toBe('kept before')

    writeStoredValue('camera', 'first')
    vi.stubGlobal('location', { pathname: '/second-map/' })
    writeStoredValue('camera', 'second')
    expect(readStoredValue('camera', '')).toBe('second')
    vi.stubGlobal('location', { pathname: '/first-map/' })
    expect(readStoredValue('camera', '')).toBe('first')
    expect(storage.data.get('spacemap:v1:/first-map/camera')).toBe('"first"')
    expect(siteFolder('/')).toBe('/')
  })

  it('keeps working when the storage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') }
    })
    const scope = effectScope()
    const state = scope.run(() => usePersistentState('test', 7))
    expect(state.value).toBe(7)
    state.value = 8
    await nextTick()
    expect(state.value).toBe(8)
    scope.stop()
  })
})
