// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, onMounted } from 'vue'
import { createPinia } from 'pinia'
import { useUIStore } from '../../stores/uiStore'
import { installErrorReport, reportAppError } from '../errorReport'

const quiet = () => {}

describe('an error of the site', () => {
  it('is shown in the loader while a screen is built behind the shutters', () => {
    const uiStore = { transitionPhase: 'waiting', loadError: null, failLoading: vi.fn() }
    expect(reportAppError(new Error('orbits are NaN'), { uiStore, log: quiet })).toBe(true)
    expect(uiStore.failLoading).toHaveBeenCalledWith('loader.unexpectedError', {}, ['orbits are NaN'])
  })

  it('is only logged on a screen already open, or after another error', () => {
    const log = vi.fn()
    const open = { transitionPhase: 'idle', loadError: null, failLoading: vi.fn() }
    expect(reportAppError(new Error('x'), { uiStore: open, info: 'render function', log })).toBe(false)
    expect(open.failLoading).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('SpaceMap error (render function):', expect.any(Error))
    const failed = { transitionPhase: 'waiting', loadError: { key: 'loader.mapNotFound' }, failLoading: vi.fn() }
    expect(reportAppError('second', { uiStore: failed, log: quiet })).toBe(false)
    expect(failed.failLoading).not.toHaveBeenCalled()
  })
})

// Was: an error thrown while a screen was built behind the shutters left them closed for good, the loader waiting forever.
describe('the error handler of the app', () => {
  let root
  let app
  beforeEach(() => {
    root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(console, 'error').mockImplementation(quiet)
    // Vue warns of the error in development on its own.
    vi.spyOn(console, 'warn').mockImplementation(quiet)
  })
  afterEach(() => {
    app?.unmount()
    root.remove()
    vi.restoreAllMocks()
  })

  function mountFailing(component) {
    const pinia = createPinia()
    app = createApp(component)
    app.use(pinia)
    installErrorReport(app, () => useUIStore(pinia))
    app.mount(root)
    return useUIStore(pinia)
  }

  it('shows an error thrown in setup in the loader', () => {
    const uiStore = mountFailing(defineComponent({
      setup() { throw new Error('no planets') }
    }))
    expect(uiStore.loadError).toEqual({ key: 'loader.unexpectedError', params: {} })
    expect(uiStore.loadErrorDetails).toEqual(['no planets'])
    expect(uiStore.loaderVisible).toBe(true)
  })

  it('shows a failed async hook too', async () => {
    const uiStore = mountFailing(defineComponent({
      setup() {
        onMounted(async () => { throw new Error('pixi lost') })
        return () => h('div')
      }
    }))
    await nextTick()
    await Promise.resolve()
    expect(uiStore.loadErrorDetails).toEqual(['pixi lost'])
  })
})
