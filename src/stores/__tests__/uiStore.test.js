import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { BOOT_LINE_MS, CATCH_UP_MS, FINAL_OK_MS, LINE_MS, useUIStore } from '../uiStore'
import { useMapStore } from '../mapStore'
import { buildWikiIndex, normalizeWiki } from '../../utils/wikiPages'

function createIdleStore() {
  const store = useUIStore()
  store.markViewReady('galaxy')
  store.finishOpening()
  return store
}

describe('uiStore cursor transitions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the drag of the map for the cursor', () => {
    const store = useUIStore()
    expect(store.cursorMode).toBeNull()

    store.setCursorMode('drag')
    expect(store.cursorMode).toBe('drag')
    store.setCursorMode(null)
    expect(store.cursorMode).toBeNull()
  })

  it('does not publish the same cursor target more than once', () => {
    const store = useUIStore()

    store.setCursorTarget(120, 80)
    const firstTarget = store.cursorTarget
    store.setCursorTarget(120, 80)

    expect(store.cursorTarget).toBe(firstTarget)
  })

  it('keeps the target size and publishes a new target when only the size changes', () => {
    const store = useUIStore()

    store.setCursorTarget(120, 80, 44)
    const firstTarget = store.cursorTarget
    expect(firstTarget).toEqual({ x: 120, y: 80, size: 44 })

    store.setCursorTarget(120, 80, 44)
    expect(store.cursorTarget).toBe(firstTarget)

    store.setCursorTarget(120, 80, 74)
    expect(store.cursorTarget).not.toBe(firstTarget)
    expect(store.cursorTarget.size).toBe(74)
  })

  // Was: a star with the id "wiki" was taken for the wiki during the switch: the mode switch flipped to WIKI and the tab named no jump.
  it('tells a star named like a view from that view', () => {
    const map = useMapStore()
    map.stars = [{ id: 'wiki', name: 'Wiki Prime' }]
    map.isLoaded = true
    const store = createIdleStore()
    store.selectStar('wiki')
    expect(store.transitionTarget).toEqual({ kind: 'star', starId: 'wiki' })
  })

  // Was: Back to '#/system/sol/99' kept planet 99 selected: the planet list showed "page 12/2" and the keys picked nothing.
  it('keeps no planet or satellite the system has not got', () => {
    const map = useMapStore()
    map.stars = [{ id: 'sol', name: 'Sol' }]
    map.systems = { sol: { planets: [{ name: 'Earth', satellites: [{ name: 'Moon' }] }] } }
    map.isLoaded = true
    const store = createIdleStore()

    store.selectStar('sol', 99, 0)
    store.finishClosing()
    expect(store.selectedPlanetIndex).toBeNull()
    expect(store.selectedSatelliteIndex).toBeNull()

    store.markViewReady('system')
    store.finishOpening()
    store.closeSystemView()
    store.finishClosing()
    store.markViewReady('galaxy')
    store.finishOpening()
    store.selectStar('sol', 0, 7)
    store.finishClosing()
    expect([store.selectedPlanetIndex, store.selectedSatelliteIndex]).toEqual([0, null])
  })

  it('clears the cursor target before entering and leaving the system view', () => {
    const store = createIdleStore()

    store.setCursorTarget(20, 30)
    store.selectStar('sol')
    expect(store.cursorTarget).toBeNull()
    store.finishClosing()
    expect(store.currentView).toBe('system')

    store.markViewReady('system')
    store.finishOpening()
    store.setCursorTarget(40, 50)
    store.closeSystemView()
    expect(store.cursorTarget).toBeNull()
    store.finishClosing()
    expect(store.currentView).toBe('galaxy')
    expect(store.cursorTarget).toBeNull()
  })
})

describe('uiStore view transitions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with closed shutters until the galaxy map is ready', () => {
    const store = useUIStore()
    expect(store.transitionPhase).toBe('waiting')

    store.markViewReady('galaxy')
    expect(store.transitionPhase).toBe('opening')
    store.finishOpening()
    expect(store.transitionPhase).toBe('idle')
  })

  it('switches the view only after the shutters have closed', () => {
    const store = createIdleStore()

    store.selectStar('sol')
    expect(store.transitionPhase).toBe('closing')
    expect(store.currentView).toBe('galaxy')
    expect(store.selectedStar).toBeNull()

    store.finishClosing()
    expect(store.transitionPhase).toBe('waiting')
    expect(store.currentView).toBe('system')
    expect(store.selectedStar).toBe('sol')
  })

  it('ignores navigation while a transition is running', () => {
    const store = createIdleStore()

    store.selectStar('sol')
    store.selectStar('pelagos')
    store.closeSystemView()
    store.finishClosing()

    expect(store.currentView).toBe('system')
    expect(store.selectedStar).toBe('sol')
  })

  // Was: the loader came only for a screen not ready in 150 ms, so one visitor saw it and another did not.
  it('shows the loader behind every closed shutter, however quick the view', () => {
    const store = createIdleStore()
    store.selectStar('sol')
    store.finishClosing()
    expect(store.loaderVisible).toBe(true)

    store.logLoadingStep('loader.openingSystem', { star: 'SOL' })
    store.markViewReady('system')
    // The line stands with its OK for a moment before the shutters open.
    expect(store.transitionPhase).toBe('waiting')
    vi.advanceTimersByTime(LINE_MS)
    expect(store.loadingLog.every(step => step.done)).toBe(true)
    expect(store.transitionPhase).toBe('waiting')
    vi.advanceTimersByTime(FINAL_OK_MS)
    expect(store.transitionPhase).toBe('opening')
    expect(store.loaderVisible).toBe(false)
  })

  // Was: the lines kept their pace after the screen was ready, and a fast computer waited 1.8 s at every start.
  it('prints the lines still waiting quickly once the view is ready', () => {
    const store = createIdleStore()
    store.selectStar('sol')
    store.finishClosing()
    store.logLoadingStep('loader.openingSystem', { star: 'SOL' })
    store.logLoadingStep('loader.calculatingOrbits', { count: 3 })
    store.logLoadingStep('loader.renderingPlanets', { count: 2 })
    store.markViewReady('system')
    expect(store.loadingLog.map(step => step.key)).toEqual(['loader.openingSystem'])

    vi.advanceTimersByTime(CATCH_UP_MS)
    expect(store.loadingLog).toEqual([
      { key: 'loader.openingSystem', params: { star: 'SOL' }, done: true },
      { key: 'loader.calculatingOrbits', params: { count: 3 }, done: false }
    ])
    vi.advanceTimersByTime(CATCH_UP_MS)
    expect(store.loadingLog).toHaveLength(3)
    vi.advanceTimersByTime(CATCH_UP_MS)
    expect(store.transitionPhase).toBe('waiting')
    vi.advanceTimersByTime(FINAL_OK_MS)
    expect(store.transitionPhase).toBe('opening')
  })

  it('starts the site in well under a second when the map is ready in 300 ms', () => {
    const store = useUIStore()
    const keys = ['loadingCatalog', 'checkingMap', 'loadingArchives', 'buildingTerritories', 'initRenderer', 'drawingMap', 'routingHyperlines', 'ignitingStars']
    for (const key of keys) store.logLoadingStep(`loader.${key}`, { count: 1 })
    vi.advanceTimersByTime(300)
    // Three lines stood their time meanwhile: at 0, 120 and 240 ms.
    expect(store.loadingLog).toHaveLength(3)
    store.markViewReady('galaxy')
    // The other five come each 45 ms, the last stands 45 ms more, then its OK.
    const left = keys.length - store.loadingLog.length
    const after = (left + 1) * CATCH_UP_MS + FINAL_OK_MS
    expect(300 + after).toBeLessThan(700)
    vi.advanceTimersByTime(after - 1)
    expect(store.transitionPhase).toBe('waiting')
    vi.advanceTimersByTime(1)
    expect(store.loadingLog).toHaveLength(keys.length)
    expect(store.transitionPhase).toBe('opening')
  })

  it('cuts short the line on the screen when the view becomes ready', () => {
    const store = useUIStore()
    store.logLoadingStep('loader.loadingCatalog')
    store.logLoadingStep('loader.checkingMap', { count: 1 })
    vi.advanceTimersByTime(10)
    store.markViewReady('galaxy')
    // Not the 110 ms left of its BOOT_LINE_MS.
    vi.advanceTimersByTime(CATCH_UP_MS)
    expect(store.loadingLog).toHaveLength(2)
  })

  it('lets a slow stage take its time, and each line stand its least', () => {
    const store = createIdleStore()
    store.selectStar('sol')
    store.finishClosing()
    store.logLoadingStep('loader.openingSystem', { star: 'SOL' })
    store.logLoadingStep('loader.calculatingOrbits', { count: 3 })
    vi.advanceTimersByTime(LINE_MS - 1)
    expect(store.loadingLog).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(store.loadingLog).toHaveLength(2)
    // A slow device: Pixi takes seconds to start.
    vi.advanceTimersByTime(4000)
    expect(store.loadingLog.at(-1).done).toBe(false)
    expect(store.transitionPhase).toBe('waiting')
    store.logLoadingStep('loader.renderingPlanets', { count: 2 })
    expect(store.loadingLog).toHaveLength(3)
  })

  it('waits for a slow view after its lines are shown', () => {
    const store = createIdleStore()
    store.selectStar('sol')
    store.finishClosing()
    store.logLoadingStep('loader.openingSystem', { star: 'SOL' })
    vi.advanceTimersByTime(5000)
    expect(store.transitionPhase).toBe('waiting')
    expect(store.loadingLog[0].done).toBe(false)
    store.markViewReady('system')
    expect(store.loadingLog[0].done).toBe(true)
    vi.advanceTimersByTime(FINAL_OK_MS)
    expect(store.transitionPhase).toBe('opening')
  })

  it('starts the site at a slower pace than a switch of screens', () => {
    const store = useUIStore()
    store.logLoadingStep('loader.loadingCatalog')
    store.logLoadingStep('loader.checkingMap', { count: 42 })
    vi.advanceTimersByTime(BOOT_LINE_MS - 1)
    expect(store.loadingLog).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(store.loadingLog).toHaveLength(2)
    expect(store.booting).toBe(true)
    store.markViewReady('galaxy')
    vi.advanceTimersByTime(BOOT_LINE_MS + FINAL_OK_MS)
    expect(store.transitionPhase).toBe('opening')
    expect(store.booting).toBe(false)
  })

  it('prints every line at once for a visitor who asked for less motion', () => {
    vi.stubGlobal('window', { location: { hash: '' }, matchMedia: query => ({ matches: query.includes('reduce') }) })
    try {
      const store = createIdleStore()
      store.selectStar('sol')
      store.finishClosing()
      store.logLoadingStep('loader.openingSystem', { star: 'SOL' })
      store.logLoadingStep('loader.calculatingOrbits', { count: 3 })
      expect(store.loadingLog).toHaveLength(2)
      store.markViewReady('system')
      expect(store.transitionPhase).toBe('opening')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('prints the lines still waiting at once when loading fails', () => {
    const store = useUIStore()
    store.logLoadingStep('loader.loadingCatalog')
    store.logLoadingStep('loader.checkingMap', { count: 42 })
    store.logLoadingStep('loader.loadingArchives', { count: 7 })
    store.failLoading('loader.catalogUnavailable')
    expect(store.loadingLog.map(step => [step.key, step.done])).toEqual([
      ['loader.loadingCatalog', true],
      ['loader.checkingMap', true],
      ['loader.loadingArchives', false]
    ])
    vi.advanceTimersByTime(5000)
    expect(store.loadingLog).toHaveLength(3)
  })

  it('ignores readiness reported by a view that is not current', () => {
    const store = createIdleStore()
    store.selectStar('sol')
    store.finishClosing()

    store.markViewReady('galaxy')
    expect(store.transitionPhase).toBe('waiting')
  })

  it('logs loading steps and completes the previous one', () => {
    const store = useUIStore()

    store.logLoadingStep('loader.loadingCatalog')
    store.logLoadingStep('loader.openingSystem', { star: 'SOL' })
    vi.advanceTimersByTime(BOOT_LINE_MS)

    expect(store.loadingLog).toEqual([
      { key: 'loader.loadingCatalog', params: {}, done: true },
      { key: 'loader.openingSystem', params: { star: 'SOL' }, done: false }
    ])
  })

  it('keeps the shutters closed after a loading failure', () => {
    const store = useUIStore()

    store.failLoading('loader.catalogUnavailable')
    store.markViewReady('galaxy')

    expect(store.loaderVisible).toBe(true)
    expect(store.loadError).toEqual({ key: 'loader.catalogUnavailable', params: {} })
    expect(store.transitionPhase).toBe('waiting')
  })
})

function loadCatalog() {
  const mapStore = useMapStore()
  mapStore.stars = [{ id: 'sol', name: 'Sol' }, { id: 'pelagos', name: 'Pelagos' }]
  mapStore.systems = {
    sol: { planets: [{ name: 'Mercury' }, { name: 'Venus' }] },
    pelagos: { planets: [{ name: 'Thalassa' }] }
  }
  return mapStore
}

function completeTransition(store) {
  store.finishClosing()
  store.markViewReady(store.currentView)
  store.finishOpening()
}

describe('uiStore routes and planets', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('boots straight into the system from the URL hash', () => {
    vi.stubGlobal('window', { location: { hash: '#/system/sol/2' } })
    const store = useUIStore()
    loadCatalog()
    store.validateSelection()

    expect(store.currentView).toBe('system')
    expect(store.selectedStar).toBe('sol')
    expect(store.selectedPlanet.name).toBe('Venus')
    expect(store.currentRoute).toEqual({ starId: 'sol', planetIndex: 1, satelliteIndex: null, wiki: null, wikiSection: null })
  })

  it('falls back to the galaxy for an unknown star in the URL', () => {
    vi.stubGlobal('window', { location: { hash: '#/system/nowhere/1' } })
    const store = useUIStore()
    loadCatalog()
    store.validateSelection()

    expect(store.currentView).toBe('galaxy')
    expect(store.selectedStar).toBeNull()
    expect(store.currentRoute).toEqual({ starId: null, planetIndex: null, satelliteIndex: null, wiki: null, wikiSection: null })
  })

  it('opens a star without planets from the URL', () => {
    vi.stubGlobal('window', { location: { hash: '#/system/empty' } })
    const store = useUIStore()
    const mapStore = loadCatalog()
    mapStore.stars = [...mapStore.stars, { id: 'empty', name: 'Empty' }]
    store.validateSelection()

    expect(store.currentView).toBe('system')
    expect(store.selectedStar).toBe('empty')
    expect(store.currentRoute).toEqual({ starId: 'empty', planetIndex: null, satelliteIndex: null, wiki: null, wikiSection: null })
  })

  it('selects planets by index and ignores indexes out of range', () => {
    loadCatalog()
    const store = createIdleStore()
    store.selectStar('sol')
    completeTransition(store)

    store.selectPlanet(1)
    expect(store.selectedPlanet.name).toBe('Venus')
    store.selectPlanet(5)
    expect(store.selectedPlanet).toBeNull()
    expect(store.currentRoute).toEqual({ starId: 'sol', planetIndex: null, satelliteIndex: null, wiki: null, wikiSection: null })
  })

  it('selects a satellite of a planet, and a planet again without it', () => {
    const mapStore = loadCatalog()
    mapStore.systems.sol.planets[1].satellites = [{ name: 'Moon' }, { name: 'Probe', kind: 'station-later' }]
    const store = createIdleStore()
    store.selectStar('sol')
    completeTransition(store)

    store.selectSatellite(1, 0)
    expect(store.selectedPlanet.name).toBe('Venus')
    expect(store.selectedSatellite.name).toBe('Moon')
    expect(store.selectedBody.name).toBe('Moon')
    expect(store.currentRoute).toEqual({ starId: 'sol', planetIndex: 1, satelliteIndex: 0, wiki: null, wikiSection: null })

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    store.selectSatellite(1, 1)
    expect(store.selectedSatellite).toBeNull()
    expect(store.selectedBody.name).toBe('Venus')

    store.selectSatellite(1, 0)
    store.selectPlanet(0)
    expect(store.selectedSatellite).toBeNull()
    expect(store.currentRoute).toEqual({ starId: 'sol', planetIndex: 0, satelliteIndex: null, wiki: null, wikiSection: null })
  })

  it('boots into a satellite from the URL and drops one that does not exist', () => {
    vi.stubGlobal('window', { location: { hash: '#/system/sol/2/1' } })
    let store = useUIStore()
    let mapStore = loadCatalog()
    mapStore.systems.sol.planets[1].satellites = [{ name: 'Moon' }]
    store.validateSelection()
    expect(store.selectedBody.name).toBe('Moon')

    setActivePinia(createPinia())
    vi.stubGlobal('window', { location: { hash: '#/system/sol/2/3' } })
    store = useUIStore()
    mapStore = loadCatalog()
    store.validateSelection()
    expect(store.selectedBody.name).toBe('Venus')
    expect(store.currentRoute).toEqual({ starId: 'sol', planetIndex: 1, satelliteIndex: null, wiki: null, wikiSection: null })
  })

  it('jumps to another system through the transition', () => {
    loadCatalog()
    const store = createIdleStore()
    store.selectStar('sol')
    completeTransition(store)
    store.selectPlanet(0)

    expect(store.jumpToStar('sol')).toBe(false)
    expect(store.jumpToStar('pelagos')).toBe(true)
    expect(store.transitionPhase).toBe('closing')
    expect(store.selectedStar).toBe('sol')

    store.finishClosing()
    expect(store.currentView).toBe('system')
    expect(store.selectedStar).toBe('pelagos')
    expect(store.selectedPlanet).toBeNull()
  })

  it('knows where the running transition leads until it is idle', () => {
    loadCatalog()
    const store = createIdleStore()
    expect(store.transitionTarget).toBeNull()

    store.selectStar('sol')
    expect(store.transitionTarget).toEqual({ kind: 'star', starId: 'sol' })
    store.finishClosing()
    expect(store.transitionTarget).toEqual({ kind: 'star', starId: 'sol' })
    completeTransition(store)
    expect(store.transitionTarget).toBeNull()

    store.closeSystemView()
    expect(store.transitionTarget).toEqual({ kind: 'galaxy' })
    expect(store.jumpToStar('pelagos')).toBe(false)
    expect(store.transitionTarget).toEqual({ kind: 'galaxy' })
  })

  it('applies routes from browser history and waits while a transition runs', () => {
    loadCatalog()
    const store = createIdleStore()

    expect(store.applyRoute({ starId: 'sol', planetIndex: 1 })).toBe(true)
    expect(store.applyRoute({ starId: null, planetIndex: null })).toBe(false)
    completeTransition(store)
    expect(store.selectedPlanet.name).toBe('Venus')

    expect(store.applyRoute({ starId: 'sol', planetIndex: 0 })).toBe(true)
    expect(store.selectedPlanet.name).toBe('Mercury')

    expect(store.applyRoute({ starId: null, planetIndex: null })).toBe(true)
    completeTransition(store)
    expect(store.currentView).toBe('galaxy')

    expect(store.applyRoute({ starId: 'nowhere', planetIndex: 0 })).toBe(true)
    expect(store.transitionPhase).toBe('idle')
    expect(store.currentView).toBe('galaxy')
  })
})

describe('uiStore sector windows', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('minimizes, maximizes and restores windows', () => {
    const store = useUIStore()

    store.minimizeWindow('data')
    expect(store.systemWindows).toEqual({ minimized: ['data'], maximized: null })

    store.toggleMaximizeWindow('system')
    expect(store.systemWindows).toEqual({ minimized: ['data'], maximized: 'system' })

    store.restoreWindow('visual')
    expect(store.systemWindows).toEqual({ minimized: ['data'], maximized: null })

    store.toggleMaximizeWindow('data')
    expect(store.systemWindows).toEqual({ minimized: [], maximized: 'data' })
    store.toggleMaximizeWindow('data')
    expect(store.systemWindows).toEqual({ minimized: [], maximized: null })

    store.minimizeWindow('system')
    store.resetWindows()
    expect(store.systemWindows).toEqual({ minimized: [], maximized: null })
  })
})

describe('uiStore text wiki', () => {
  const doc = text => ({ blocks: [{ type: 'paragraph', children: [{ type: 'text', value: text }] }] })

  function loadWiki() {
    const mapStore = loadCatalog()
    mapStore.systems.sol.planets[1].loreDoc = doc('Venus')
    const wiki = normalizeWiki({ articles: [{ title: 'Crucible Combine', aliases: ['Combine'] }] })
    wiki.articles[0].loreDoc = doc('Combine')
    mapStore.wikiIndex = buildWikiIndex({ wiki, worldLoreDoc: doc('world'), stars: mapStore.stars, systems: mapStore.systems })
    return mapStore
  }

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('boots into a page of the wiki, or its main page, from the URL', () => {
    vi.stubGlobal('window', { location: { hash: '#/wiki/Crucible_Combine' } })
    let store = useUIStore()
    loadWiki()
    expect(store.currentView).toBe('wiki')
    expect(store.wikiPage.title).toBe('Crucible Combine')
    expect(store.currentRoute).toEqual({ starId: null, planetIndex: null, satelliteIndex: null, wiki: 'Crucible_Combine', wikiSection: null })

    setActivePinia(createPinia())
    vi.stubGlobal('window', { location: { hash: '#/wiki' } })
    store = useUIStore()
    loadWiki()
    expect(store.wikiPage.title).toBe('Galaxy')
    expect(store.currentRoute.wiki).toBe('Galaxy')
  })

  it('goes to the wiki and back to the same planet with the lever', () => {
    loadWiki()
    const store = createIdleStore()
    store.selectStar('sol', 1)
    completeTransition(store)

    expect(store.toggleMode()).toBe(true)
    expect(store.transitionTarget).toEqual({ kind: 'wiki' })
    completeTransition(store)
    expect(store.currentView).toBe('wiki')
    expect(store.wikiPage.title).toBe('Venus')
    expect(store.selectedPlanet).toBeNull()

    store.toggleMode()
    expect(store.transitionTarget).toEqual({ kind: 'star', starId: 'sol' })
    completeTransition(store)
    expect(store.currentView).toBe('system')
    expect(store.selectedPlanet.name).toBe('Venus')

    store.selectPlanet(0)
    store.toggleMode()
    completeTransition(store)
    expect(store.wikiPage.title).toBe('Galaxy')

    store.openWiki('Crucible_Combine')
    store.closeWiki()
    completeTransition(store)
    store.openWiki()
    completeTransition(store)
    expect(store.wikiPage.title).toBe('Crucible Combine')
  })

  function loadPlaces() {
    const mapStore = loadCatalog()
    mapStore.stars[0].loreDoc = doc('Sun')
    const venus = mapStore.systems.sol.planets[1]
    venus.loreDoc = doc('Venus')
    venus.satellites = [{ name: 'Moon of Venus', loreDoc: doc('moon') }, { name: 'Port', kind: 'station' }]
    const wiki = normalizeWiki({
      home: 'Main',
      articles: [{ title: 'Main' }, { title: 'Project Mercury', place: 'Mercury' }, { title: 'Nacre Beacon' }]
    })
    mapStore.wikiIndex = buildWikiIndex({ wiki, worldLoreDoc: doc('world'), stars: mapStore.stars, systems: mapStore.systems })
    return mapStore
  }

  it('throws the lever to the same place: a satellite, its planet, the star or the main page', () => {
    loadPlaces()
    const store = createIdleStore()
    const lever = () => {
      store.toggleMode()
      completeTransition(store)
    }

    lever()
    expect(store.wikiPage.title).toBe('Main')

    store.openWiki('Venus')
    lever()
    expect(store.currentRoute).toMatchObject({ starId: 'sol', planetIndex: 1, satelliteIndex: null })

    store.selectSatellite(1, 0)
    lever()
    expect(store.wikiPage.title).toBe('Moon of Venus')
    lever()
    expect(store.currentRoute).toMatchObject({ starId: 'sol', planetIndex: 1, satelliteIndex: 0 })

    store.selectSatellite(1, 1)
    lever()
    expect(store.wikiPage.title).toBe('Venus')

    store.openWiki('Sol')
    store.closeWiki()
    expect(store.transitionTarget).toEqual({ kind: 'star', starId: 'sol' })
    completeTransition(store)
    expect(store.currentRoute).toMatchObject({ starId: 'sol', planetIndex: null })

    store.selectPlanet(0)
    lever()
    expect(store.wikiPage.title).toBe('Project Mercury')
    store.openWiki('Sol')
    store.openWiki('Project_Mercury')
    lever()
    expect(store.selectedPlanet.name).toBe('Mercury')

    lever()
    store.openWiki('Galaxy')
    lever()
    expect(store.currentView).toBe('galaxy')
  })

  it('returns to the page the wiki was left on while the map stays where it was', () => {
    loadPlaces()
    const store = createIdleStore()
    store.selectStar('sol', 1)
    completeTransition(store)
    store.toggleMode()
    completeTransition(store)

    store.openWiki('Nacre_Beacon', 'History')
    store.toggleMode()
    expect(store.transitionTarget).toEqual({ kind: 'star', starId: 'sol' })
    completeTransition(store)
    expect(store.selectedPlanet.name).toBe('Venus')

    store.toggleMode()
    completeTransition(store)
    expect(store.wikiPage.title).toBe('Nacre Beacon')
    expect(store.wikiSection).toBe('History')
    expect(store.wikiSectionRequest).toMatchObject({ section: 'History' })

    store.toggleMode()
    completeTransition(store)
    store.selectPlanet(null)
    store.toggleMode()
    completeTransition(store)
    expect(store.wikiPage.title).toBe('Sol')

    store.openWiki('')
    store.closeWiki()
    completeTransition(store)
    expect(store.currentView).toBe('system')
    store.closeSystemView()
    completeTransition(store)
    store.toggleMode()
    completeTransition(store)
    expect(store.wikiPage.title).toBe('Main')
  })

  it('turns pages of the wiki without a transition', () => {
    loadWiki()
    const store = createIdleStore()
    store.openWiki()
    completeTransition(store)
    expect(store.openWiki('Crucible_Combine')).toBe(true)
    expect(store.transitionPhase).toBe('idle')
    expect(store.wikiPage.title).toBe('Crucible Combine')
    store.openWiki('No_such_page')
    expect(store.wikiPage).toBeNull()
    expect(store.currentRoute.wiki).toBe('No_such_page')
  })

  it('opens an article by another of its names and says so', () => {
    loadWiki()
    const store = createIdleStore()
    store.openWiki('combine')
    completeTransition(store)
    expect(store.wikiPage.title).toBe('Crucible Combine')
    expect(store.wikiRedirectedFrom).toBe('Combine')
    expect(store.currentRoute.wiki).toBe('Crucible_Combine')
    store.openWiki('crucible_combine')
    expect(store.wikiRedirectedFrom).toBeNull()
    store.openLoreLink({ kind: 'article', title: 'Crucible Combine', via: 'COMBINE' })
    expect(store.wikiRedirectedFrom).toBe('Combine')
    store.openLoreLink({ kind: 'article', title: 'Crucible Combine' })
    expect(store.wikiRedirectedFrom).toBeNull()
    store.openWiki('No_such_page')
    expect(store.wikiRedirectedFrom).toBeNull()
  })

  it('opens service pages, categories, red links and a random page', () => {
    loadWiki()
    const store = createIdleStore()
    store.openWiki('Special:AllPages')
    completeTransition(store)
    expect(store.wikiPage).toMatchObject({ kind: 'special', title: 'All pages' })
    expect(store.currentRoute.wiki).toBe('Special:All_pages')
    expect(store.wikiRedirectedFrom).toBeNull()
    store.openLoreLink({ kind: 'wiki', slug: 'Category:Factions' })
    expect(store.wikiPage.title).toBe('Category:Factions')
    store.openLoreLink({ kind: 'missing', page: 'Gate Registry' })
    expect(store.wikiSlug).toBe('Gate_Registry')
    expect(store.wikiPage).toBeNull()

    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    store.openWiki('Galaxy')
    store.openRandomWiki()
    const first = store.wikiPage
    expect(first).not.toBeNull()
    store.openRandomWiki()
    expect(store.wikiPage).not.toBe(first)
    random.mockRestore()
  })

  it('follows lore links into the wiki and inside it', () => {
    loadWiki()
    const store = createIdleStore()
    store.openLoreLink({ kind: 'article', title: 'Crucible Combine' })
    expect(store.transitionTarget).toEqual({ kind: 'wiki' })
    completeTransition(store)
    expect(store.wikiPage.title).toBe('Crucible Combine')

    store.openLoreLink({ kind: 'planet', starId: 'sol', planetIndex: 1 })
    expect(store.transitionPhase).toBe('idle')
    expect(store.wikiPage.title).toBe('Venus')

    store.openLoreLink({ kind: 'planet', starId: 'sol', planetIndex: 0 })
    expect(store.transitionTarget).toEqual({ kind: 'star', starId: 'sol' })
    completeTransition(store)
    expect(store.currentView).toBe('system')
    expect(store.selectedPlanet.name).toBe('Mercury')
  })

  it('shows a place of a page on the map and follows Back between the modes', () => {
    loadWiki()
    const store = createIdleStore()
    store.openWiki('Venus')
    completeTransition(store)

    store.showOnMap(store.wikiPage.mapTarget)
    completeTransition(store)
    expect(store.currentView).toBe('system')
    expect(store.currentRoute).toEqual({ starId: 'sol', planetIndex: 1, satelliteIndex: null, wiki: null, wikiSection: null })

    expect(store.applyRoute({ starId: null, planetIndex: null, wiki: 'Venus' })).toBe(true)
    completeTransition(store)
    expect(store.wikiPage.title).toBe('Venus')
    store.applyRoute({ starId: 'pelagos', planetIndex: 0, wiki: null })
    completeTransition(store)
    expect(store.currentView).toBe('system')
    expect(store.selectedPlanet.name).toBe('Thalassa')
  })

  it('opens a page at a section and keeps it in the address', () => {
    loadWiki()
    const store = createIdleStore()
    store.openLoreLink({ kind: 'article', title: 'Crucible Combine', section: 'History' })
    completeTransition(store)
    expect(store.wikiPage.title).toBe('Crucible Combine')
    expect(store.currentRoute.wikiSection).toBe('History')
    expect(store.wikiSectionRequest).toMatchObject({ section: 'History' })

    store.openWiki('Venus')
    expect(store.currentRoute.wikiSection).toBeNull()
    expect(store.wikiSectionRequest).toBeNull()

    expect(store.openLoreLink({ kind: 'section', section: 'Climate' })).toBe(true)
    expect(store.wikiPage.title).toBe('Venus')
    expect(store.wikiSectionRequest).toMatchObject({ section: 'Climate' })
    expect(store.currentRoute.wikiSection).toBe('Climate')

    store.applyRoute({ starId: null, planetIndex: null, wiki: 'Crucible_Combine', wikiSection: 'Economy' })
    expect(store.wikiPage.title).toBe('Crucible Combine')
    expect(store.wikiSectionRequest).toMatchObject({ section: 'Economy' })
  })

  it('follows the section being read without asking the article to scroll', () => {
    loadWiki()
    const store = createIdleStore()
    store.openWiki('Crucible_Combine')
    completeTransition(store)
    store.scrollWikiTo(2)
    const request = store.wikiSectionRequest
    store.followSection('Economy', 2)
    expect(store.wikiActiveSection).toBe(2)
    expect(store.currentRoute.wikiSection).toBe('Economy')
    expect(store.wikiSectionRequest).toBe(request)
    store.followSection(null)
    expect(store.currentRoute.wikiSection).toBeNull()
    expect(store.wikiActiveSection).toBe(-1)

    store.closeWiki()
    completeTransition(store)
    expect(store.openLoreLink({ kind: 'section', section: 'X' })).toBe(false)
    store.followSection('X', 0)
    expect(store.currentRoute.wikiSection).toBeNull()
  })

  it('boots at a section of a page from the URL', () => {
    vi.stubGlobal('window', { location: { hash: '#/wiki/Crucible_Combine#Economy' } })
    const store = useUIStore()
    loadWiki()
    expect(store.currentRoute.wikiSection).toBe('Economy')
    expect(store.wikiSectionRequest).toMatchObject({ section: 'Economy' })
  })
})
