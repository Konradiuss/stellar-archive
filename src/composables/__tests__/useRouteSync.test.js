import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useUIStore } from '../../stores/uiStore'
import { useMapStore } from '../../stores/mapStore'
import { useRouteSync } from '../useRouteSync'
import { buildWikiIndex, normalizeWiki } from '../../utils/wikiPages'

function fakeBrowser(initialHash = '') {
  const listeners = new Set()
  const history = {
    entries: [initialHash],
    index: 0,
    pushState: vi.fn((state, title, url) => {
      history.entries.splice(history.index + 1, Infinity, hashOf(url))
      history.index++
      location.hash = hashOf(url)
    }),
    replaceState: vi.fn((state, title, url) => {
      history.entries[history.index] = hashOf(url)
      location.hash = hashOf(url)
    }),
    visit(hash) {
      history.entries.splice(history.index + 1, Infinity, hash)
      history.index++
      location.hash = hash
      listeners.forEach(listener => listener())
    },
    back() {
      history.index--
      location.hash = history.entries[history.index]
      listeners.forEach(listener => listener())
    }
  }
  const location = { hash: initialHash, pathname: '/', search: '' }
  const hashOf = url => (url.includes('#') ? url.slice(url.indexOf('#')) : '')
  vi.stubGlobal('window', {
    location,
    history,
    addEventListener: (type, listener) => { if (type === 'popstate') listeners.add(listener) },
    removeEventListener: (type, listener) => listeners.delete(listener)
  })
  return history
}

function loadCatalog() {
  const mapStore = useMapStore()
  mapStore.stars = [{ id: 'sol', name: 'Sol' }, { id: 'pelagos', name: 'Pelagos' }]
  mapStore.systems = { sol: { planets: [{ name: 'Mercury' }, { name: 'Venus' }] }, pelagos: { planets: [] } }
}

// Phases change in separate frames in the app: let watchers see each one.
async function finishTransition(store) {
  await nextTick()
  store.finishClosing()
  await nextTick()
  store.markViewReady(store.currentView)
  await nextTick()
  store.finishOpening()
  await nextTick()
}

describe('useRouteSync', () => {
  let scope

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  async function bootOnGalaxy() {
    const history = fakeBrowser('')
    const store = useUIStore()
    loadCatalog()
    scope.run(() => useRouteSync())
    store.markViewReady('galaxy')
    store.finishOpening()
    await nextTick()
    return { history, store }
  }

  it('adds a history entry for a system and replaces it for a planet', async () => {
    const { history, store } = await bootOnGalaxy()

    store.selectStar('sol')
    await finishTransition(store)
    await nextTick()
    expect(history.pushState).toHaveBeenCalledTimes(1)
    expect(history.entries).toEqual(['', '#/system/sol'])

    store.selectPlanet(1)
    await nextTick()
    vi.advanceTimersByTime(250)
    expect(history.replaceState).toHaveBeenCalled()
    expect(history.entries).toEqual(['', '#/system/sol/2'])
  })

  // Was: stepping through planets or sections rewrote the address on every step; Safari refuses that many writes and throws.
  it('writes the address of planets stepped through at most every 250 ms', async () => {
    const { history, store } = await bootOnGalaxy()
    store.selectStar('sol')
    await finishTransition(store)
    await nextTick()
    history.replaceState.mockClear()

    for (const index of [0, 1, 0, 1]) {
      store.selectPlanet(index)
      await nextTick()
    }
    expect(history.replaceState).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(history.replaceState).toHaveBeenCalledTimes(1)
    expect(history.entries).toEqual(['', '#/system/sol/2'])
  })

  // Was: Back to an address naming a page otherwise ('#/wiki/mars' for "Mars") pushed a new entry, so Back had to be pressed twice.
  it('writes the place reached by Back over its own entry', async () => {
    const history = fakeBrowser('#/wiki/Galaxy')
    const store = useUIStore()
    loadCatalog()
    const wiki = normalizeWiki({ articles: [{ title: 'Crucible Combine' }] })
    const doc = { blocks: [] }
    wiki.articles[0].loreDoc = doc
    useMapStore().wikiIndex = buildWikiIndex({ wiki, worldLoreDoc: doc })
    scope.run(() => useRouteSync())
    store.markViewReady('wiki')
    store.finishOpening()
    await nextTick()

    history.visit('#/wiki/crucible_combine')
    await nextTick()
    vi.advanceTimersByTime(250)
    expect(history.pushState).not.toHaveBeenCalled()
    expect(history.entries.map(decodeURIComponent)).toEqual(['#/wiki/Galaxy', '#/wiki/Crucible_Combine'])
  })

  it('follows Back pressed during a transition without extra history entries', async () => {
    const { history, store } = await bootOnGalaxy()
    store.selectStar('sol')
    await finishTransition(store)
    await nextTick()

    store.jumpToStar('pelagos')
    history.back()
    await finishTransition(store)
    await nextTick()
    expect(history.pushState).toHaveBeenCalledTimes(1)

    await finishTransition(store)
    await nextTick()
    expect(store.currentView).toBe('galaxy')
    expect(history.entries).toEqual(['', '#/system/sol'])
    expect(history.index).toBe(0)
    expect(window.location.hash).toBe('')
  })

  it('shows another name of a page by the address of the page, without a new entry', async () => {
    const history = fakeBrowser('#/wiki/Galaxy')
    const store = useUIStore()
    loadCatalog()
    const wiki = normalizeWiki({ articles: [{ title: 'Crucible Combine', aliases: ['Combine'] }] })
    const doc = { blocks: [] }
    wiki.articles[0].loreDoc = doc
    useMapStore().wikiIndex = buildWikiIndex({ wiki, worldLoreDoc: doc })
    scope.run(() => useRouteSync())
    store.markViewReady('wiki')
    store.finishOpening()
    await nextTick()

    history.visit('#/wiki/Combine')
    await nextTick()
    expect(store.wikiRedirectedFrom).toBe('Combine')
    expect(history.entries.map(decodeURIComponent)).toEqual(['#/wiki/Galaxy', '#/wiki/Crucible_Combine'])
    store.openWiki('Galaxy')
    await nextTick()
    expect(history.entries.map(decodeURIComponent)).toEqual(['#/wiki/Galaxy', '#/wiki/Crucible_Combine', '#/wiki/Galaxy'])
  })
})
