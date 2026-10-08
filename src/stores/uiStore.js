import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useMapStore } from './mapStore'
import { usePersistentState } from '../composables/usePersistentState'
import { parseRoute } from '../utils/hashRoute'
import { findSatellite } from '../utils/satellites'
import { DEFAULT_WINDOW_STATE, normalizeWindowState } from '../utils/windowLayout'
import { textDocument } from '../utils/richText/lore'
import { pageKey, toSlug } from '../utils/wikiPages'
import { randomPage, servicePage } from '../utils/wikiService'
import { pushRecent } from '../utils/wikiCrumbs'
import { t } from '../i18n'
import { prefersReducedMotion } from '../utils/reducedMotion'

const NO_PLACE = Object.freeze({ starId: null, planetIndex: null, satelliteIndex: null, wiki: null, wikiSection: null })

const GALAXY_TARGET = Object.freeze({ kind: 'galaxy' })
const WIKI_TARGET = Object.freeze({ kind: 'wiki' })
const starTarget = starId => ({ kind: 'star', starId })

// Each loader line stands at least its pace (ms) while the screen is still being built,
// so the loader lasts as long as the work; once the screen is ready, the rest catch up.
export const BOOT_LINE_MS = 120
export const LINE_MS = 90
export const CATCH_UP_MS = 45
export const FINAL_OK_MS = 100

function initialRoute() {
  return parseRoute(typeof window === 'undefined' ? '' : window.location.hash)
}

export const useUIStore = defineStore('ui', () => {
  const route = initialRoute()
  const currentView = ref(route.wiki !== null ? 'wiki' : route.starId ? 'system' : 'galaxy') // 'galaxy' | 'system' | 'wiki'
  const selectedStar = ref(route.starId)
  const selectedPlanetIndex = ref(route.starId ? route.planetIndex : null)
  const selectedSatelliteIndex = ref(route.starId ? route.satelliteIndex : null)
  const cursorTarget = ref(null) // { x, y, size } in viewport px
  // 'drag' | null
  const cursorMode = ref(null)

  // '' is the main page
  const wikiSlug = ref(route.wiki)
  const lastMapView = ref('galaxy')
  // { slug, section, place }: the page the lever reopens when thrown back from that same place.
  let wikiReturn = null
  // An anchor, or null.
  const wikiSection = ref(route.wiki !== null ? route.wikiSection : null)
  // { index } (-1: the top) or { section }; `at` makes each request new.
  const wikiSectionRequest = ref(route.wiki !== null && route.wikiSection ? { section: route.wikiSection, at: 0 } : null)
  // An index of the contents (-1: above the first).
  const wikiActiveSection = ref(-1)

  const wikiRecent = usePersistentState('wiki-recent', [])
  if (!Array.isArray(wikiRecent.value) || wikiRecent.value.some(slug => typeof slug !== 'string')) wikiRecent.value = []

  const systemWindows = usePersistentState('system-windows', { ...DEFAULT_WINDOW_STATE })
  systemWindows.value = normalizeWindowState(systemWindows.value)

  const syndicateHack = ref(false)

  // 'closing' -> 'waiting' -> 'opening' -> 'idle'; the app starts closed while the first view builds.
  const transitionPhase = ref('waiting')
  const loaderVisible = ref(false)
  const loadingLog = ref([]) // [{ key, params, done }]: keys of src/i18n/strings.js
  const booting = ref(true)
  const loadError = ref(null) // { key, params }, or null
  const loadErrorDetails = ref([])
  // { kind: 'star', starId } | { kind: 'galaxy' } | { kind: 'wiki' }, null when idle.
  // Objects, not names: a star may have the id 'wiki' or 'galaxy'.
  const transitionTarget = ref(null)
  let pendingSwitch = null
  let openTimer = null
  let pendingLines = []
  let lineTimer = null
  let lineDueAt = 0
  let viewReady = false

  const selectedPlanet = computed(() => {
    if (currentView.value !== 'system' || selectedPlanetIndex.value === null) return null
    const system = useMapStore().getSystemByStarId(selectedStar.value)
    return system?.planets?.[selectedPlanetIndex.value] ?? null
  })

  const selectedSatellite = computed(() => {
    if (!selectedPlanet.value || selectedSatelliteIndex.value === null) return null
    return findSatellite(selectedPlanet.value, selectedSatelliteIndex.value)?.data ?? null
  })
  const selectedBody = computed(() => selectedSatellite.value ?? selectedPlanet.value)

  const wikiPage = computed(() => {
    if (currentView.value !== 'wiki') return null
    const index = useMapStore().wikiIndex
    if (!wikiSlug.value) return index.home
    return index.get(wikiSlug.value) ?? index.find(wikiSlug.value) ?? servicePage(wikiSlug.value)
  })

  const wikiRedirectedFrom = computed(() => {
    if (!wikiPage.value || !wikiSlug.value || wikiPage.value.kind === 'special' || useMapStore().wikiIndex.get(wikiSlug.value)) return null
    const key = pageKey(wikiSlug.value)
    return wikiPage.value.aliases.find(alias => pageKey(alias) === key) ?? wikiSlug.value.replace(/_/g, ' ').trim()
  })

  const currentRoute = computed(() => {
    if (currentView.value === 'wiki') {
      return { ...NO_PLACE, wiki: wikiPage.value?.slug ?? wikiSlug.value ?? '', wikiSection: wikiSection.value }
    }
    return currentView.value === 'system' && selectedStar.value
      ? {
          ...NO_PLACE,
          starId: selectedStar.value,
          planetIndex: selectedPlanet.value ? selectedPlanetIndex.value : null,
          satelliteIndex: selectedSatellite.value ? selectedSatelliteIndex.value : null
        }
      : { ...NO_PLACE }
  })

  const activeLore = computed(() => {
    const mapStore = useMapStore()

    if (selectedStar.value) {
      const star = mapStore.getStarById(selectedStar.value)
      return star?.loreDoc || textDocument(t('panels.noStarLore'))
    }

    return mapStore.homeLoreDoc || mapStore.worldLoreDoc || textDocument(t('panels.noWorldLore'))
  })

  function requestTransition(applySwitch, target) {
    if (transitionPhase.value !== 'idle') return false
    clearCursorTarget()
    pendingSwitch = applySwitch
    transitionTarget.value = target
    transitionPhase.value = 'closing'
    return true
  }

  function selectStar(starId, planetIndex = null, satelliteIndex = null) {
    return requestTransition(() => {
      selectedStar.value = starId
      currentView.value = 'system'
      // Drop a planet or satellite this system lacks (an old link); before the catalog loads, validateSelection does it.
      if (useMapStore().isLoaded) {
        selectSatellite(planetIndex, satelliteIndex)
      } else {
        selectedPlanetIndex.value = planetIndex
        selectedSatelliteIndex.value = planetIndex === null ? null : satelliteIndex
      }
    }, starTarget(starId))
  }

  function jumpToStar(starId, planetIndex = null, satelliteIndex = null) {
    if (starId === selectedStar.value) return false
    return selectStar(starId, planetIndex, satelliteIndex)
  }

  function selectPlanet(index) {
    const system = useMapStore().getSystemByStarId(selectedStar.value)
    const count = system?.planets?.length ?? 0
    selectedPlanetIndex.value = Number.isInteger(index) && index >= 0 && index < count ? index : null
    selectedSatelliteIndex.value = null
  }

  function selectSatellite(planetIndex, satelliteIndex) {
    selectPlanet(planetIndex)
    if (!selectedPlanet.value || !Number.isInteger(satelliteIndex)) return
    if (findSatellite(selectedPlanet.value, satelliteIndex)) selectedSatelliteIndex.value = satelliteIndex
  }

  function closeSystemView() {
    return requestTransition(() => {
      currentView.value = 'galaxy'
      selectedStar.value = null
      selectedPlanetIndex.value = null
      selectedSatelliteIndex.value = null
    }, GALAXY_TARGET)
  }

  // slug: a page, '' the main page, null the page read last.
  function openWiki(slug = null, section = null) {
    const target = slug ?? wikiSlug.value ?? ''
    const open = () => {
      if (target !== wikiSlug.value) wikiActiveSection.value = -1
      wikiSlug.value = target
      wikiSection.value = section || null
      wikiSectionRequest.value = section ? { section, at: Date.now() } : null
    }
    if (currentView.value === 'wiki') {
      open()
      return true
    }
    const fromView = currentView.value
    return requestTransition(() => {
      lastMapView.value = fromView
      open()
      currentView.value = 'wiki'
    }, WIKI_TARGET)
  }

  function rememberWikiPage(slug) {
    const next = pushRecent(wikiRecent.value, slug)
    if (next.length !== wikiRecent.value.length || next.some((item, index) => item !== wikiRecent.value[index])) wikiRecent.value = next
  }

  function openRandomWiki() {
    const page = randomPage(useMapStore().wikiIndex, wikiPage.value)
    return page ? openWiki(page.slug) : false
  }

  function followSection(anchor, index = -1) {
    wikiActiveSection.value = index
    if (currentView.value === 'wiki') wikiSection.value = anchor || null
  }

  function closeWiki() {
    if (currentView.value !== 'wiki') return false
    if (wikiPage.value?.mapTarget) return showOnMap(wikiPage.value.mapTarget)
    const toSystem = lastMapView.value === 'system' && !!selectedStar.value
    return leaveWiki(() => {
      currentView.value = toSystem ? 'system' : 'galaxy'
    }, toSystem ? starTarget(selectedStar.value) : GALAXY_TARGET)
  }

  function mapPlaceKey() {
    if (currentView.value !== 'system' || !selectedStar.value) return 'galaxy'
    return [selectedStar.value, selectedPlanet.value ? selectedPlanetIndex.value : null, selectedSatellite.value ? selectedSatelliteIndex.value : null].join(':')
  }

  function leaveWiki(applySwitch, target) {
    const page = { slug: wikiPage.value?.slug ?? wikiSlug.value ?? '', section: wikiSection.value }
    return requestTransition(() => {
      applySwitch()
      wikiReturn = { ...page, place: mapPlaceKey() }
    }, target)
  }

  function pageForMapPlace() {
    const index = useMapStore().wikiIndex
    if (currentView.value === 'system' && selectedStar.value) {
      const starId = selectedStar.value
      const planetIndex = selectedPlanet.value ? selectedPlanetIndex.value : null
      const places = [{ kind: 'star', starId }]
      if (planetIndex !== null) places.unshift({ kind: 'planet', starId, planetIndex })
      if (selectedSatellite.value) places.unshift({ kind: 'satellite', starId, planetIndex, satelliteIndex: selectedSatelliteIndex.value })
      for (const place of places) {
        const page = index.forPlace(place)
        if (page) return page
      }
    }
    return index.home
  }

  function toggleMode() {
    if (currentView.value === 'wiki') return closeWiki()
    if (wikiReturn && wikiReturn.place === mapPlaceKey()) return openWiki(wikiReturn.slug, wikiReturn.section)
    return openWiki(pageForMapPlace()?.slug ?? '')
  }

  function showOnMap({ starId: requestedStar = null, planetIndex = null, satelliteIndex = null } = {}) {
    if (currentView.value !== 'wiki') return applyRoute({ starId: requestedStar, planetIndex, satelliteIndex })
    const starId = requestedStar && useMapStore().getStarById(requestedStar) ? requestedStar : null
    return leaveWiki(() => {
      selectedStar.value = starId
      selectedPlanetIndex.value = starId ? planetIndex : null
      selectedSatelliteIndex.value = starId && planetIndex !== null ? satelliteIndex : null
      currentView.value = starId ? 'system' : 'galaxy'
      if (starId) validateSelection()
    }, starId ? starTarget(starId) : GALAXY_TARGET)
  }

  function applyRoute({ starId: requestedStar, planetIndex, satelliteIndex = null, wiki = null, wikiSection: section = null }) {
    // Mid-transition the current view is about to change: decide once idle.
    if (transitionPhase.value !== 'idle') return false
    if (typeof wiki === 'string') return openWiki(wiki, section)
    if (currentView.value === 'wiki') return showOnMap({ starId: requestedStar, planetIndex, satelliteIndex })
    const mapStore = useMapStore()
    // A star without planets (no entry in systems) is still a system to open.
    const starId = requestedStar && mapStore.getStarById(requestedStar) ? requestedStar : null
    if (!starId) return currentView.value === 'galaxy' || closeSystemView()
    if (currentView.value !== 'system') return selectStar(starId, planetIndex, satelliteIndex)
    if (starId !== selectedStar.value) return jumpToStar(starId, planetIndex, satelliteIndex)
    if (satelliteIndex === null || satelliteIndex === undefined) selectPlanet(planetIndex)
    else selectSatellite(planetIndex, satelliteIndex)
    return true
  }

  function openLoreLink(target) {
    const { kind, starId, planetIndex = null, satelliteIndex = null, section = null } = target
    if (kind === 'wiki') return openWiki(target.slug)
    if (kind === 'missing') return openWiki(toSlug(target.page))
    if (kind === 'section') {
      if (currentView.value !== 'wiki') return false
      wikiSection.value = section
      wikiSectionRequest.value = { section, at: Date.now() }
      return true
    }
    if (kind === 'article' || kind === 'world' || currentView.value === 'wiki') {
      const page = useMapStore().wikiIndex.forTarget(target)
      if (page) return openWiki(target.via && useMapStore().wikiIndex.find(target.via) === page ? target.via : page.slug, section)
      if (kind === 'article' || kind === 'world') return false
      return showOnMap({ starId, planetIndex: kind === 'star' ? null : planetIndex, satelliteIndex: kind === 'satellite' ? satelliteIndex : null })
    }
    const body = kind === 'planet' || kind === 'satellite'
    return applyRoute({
      starId,
      planetIndex: body ? planetIndex : null,
      satelliteIndex: kind === 'satellite' ? satelliteIndex : null
    })
  }

  function validateSelection() {
    const mapStore = useMapStore()
    if (currentView.value !== 'system') return
    if (!mapStore.getStarById(selectedStar.value)) {
      currentView.value = 'galaxy'
      selectedStar.value = null
      selectedPlanetIndex.value = null
      selectedSatelliteIndex.value = null
      return
    }
    selectSatellite(selectedPlanetIndex.value, selectedSatelliteIndex.value)
  }

  function setWindows(next) {
    systemWindows.value = normalizeWindowState(next)
  }

  function minimizeWindow(id) {
    const { minimized, maximized } = systemWindows.value
    setWindows({ minimized: [...minimized, id], maximized: maximized === id ? null : maximized })
  }

  function restoreWindow(id) {
    setWindows({ minimized: systemWindows.value.minimized.filter(item => item !== id), maximized: null })
  }

  function toggleMaximizeWindow(id) {
    const { minimized, maximized } = systemWindows.value
    setWindows({ minimized: minimized.filter(item => item !== id), maximized: maximized === id ? null : id })
  }

  function resetWindows() {
    setWindows(DEFAULT_WINDOW_STATE)
  }

  function startSyndicateHack() {
    if (syndicateHack.value) return false
    clearCursorTarget()
    syndicateHack.value = true
    return true
  }

  function scrollWikiTo(index) {
    wikiSectionRequest.value = { index, at: Date.now() }
  }

  function stopLines() {
    clearTimeout(lineTimer)
    clearTimeout(openTimer)
    lineTimer = null
    openTimer = null
    pendingLines = []
    viewReady = false
  }

  function startWaiting() {
    stopLines()
    transitionPhase.value = 'waiting'
    loaderVisible.value = true
  }

  function finishClosing() {
    if (transitionPhase.value !== 'closing') return
    clearCursorTarget()
    loadingLog.value = []
    const applySwitch = pendingSwitch
    pendingSwitch = null
    startWaiting()
    applySwitch?.()
  }

  function markViewReady(view) {
    if (transitionPhase.value !== 'waiting' || view !== currentView.value) return
    if (loadError.value || viewReady) return
    viewReady = true
    // The current line no longer has to stand its full time.
    if (lineTimer && lineDueAt - Date.now() > CATCH_UP_MS) {
      clearTimeout(lineTimer)
      lineTimer = null
      waitForNextLine(CATCH_UP_MS)
      return
    }
    showNextLine()
  }

  function linePace() {
    if (prefersReducedMotion()) return 0
    if (viewReady) return CATCH_UP_MS
    return booting.value ? BOOT_LINE_MS : LINE_MS
  }

  function waitForNextLine(ms) {
    lineDueAt = Date.now() + ms
    lineTimer = setTimeout(() => {
      lineTimer = null
      showNextLine()
    }, ms)
  }

  function showNextLine() {
    if (lineTimer || openTimer || loadError.value || transitionPhase.value !== 'waiting') return
    const pace = linePace()
    if (pendingLines.length) {
      completeLoadingLog()
      loadingLog.value.push({ ...pendingLines.shift(), done: false })
      if (pace) waitForNextLine(pace)
      else showNextLine()
      return
    }
    if (!viewReady) return
    completeLoadingLog()
    // No lines: no final OK to show.
    if (pace && loadingLog.value.length) openTimer = setTimeout(beginOpening, FINAL_OK_MS)
    else beginOpening()
  }

  function beginOpening() {
    openTimer = null
    loaderVisible.value = false
    booting.value = false
    transitionPhase.value = 'opening'
  }

  function finishOpening() {
    if (transitionPhase.value !== 'opening') return
    transitionTarget.value = null
    transitionPhase.value = 'idle'
  }

  function completeLoadingLog() {
    loadingLog.value.forEach(step => { step.done = true })
  }

  function logLoadingStep(key, params = {}) {
    pendingLines.push({ key, params })
    showNextLine()
  }

  function failLoading(key, params = {}, details = []) {
    const waiting = pendingLines
    stopLines()
    if (waiting.length) {
      completeLoadingLog()
      waiting.forEach((line, index) => loadingLog.value.push({ ...line, done: index < waiting.length - 1 }))
    }
    loadError.value = { key, params }
    loadErrorDetails.value = details
    loaderVisible.value = true
  }

  function setCursorTarget(x, y, size = null) {
    const currentTarget = cursorTarget.value
    if (currentTarget?.x === x && currentTarget?.y === y && currentTarget?.size === size) return

    cursorTarget.value = { x, y, size }
  }

  function clearCursorTarget() {
    cursorTarget.value = null
  }

  function setCursorMode(mode) {
    cursorMode.value = mode
  }

  startWaiting()

  return {
    currentView,
    selectedStar,
    selectedPlanetIndex,
    selectedPlanet,
    selectedSatelliteIndex,
    selectedSatellite,
    selectedBody,
    currentRoute,
    wikiSlug,
    wikiRedirectedFrom,
    openRandomWiki,
    wikiSection,
    wikiActiveSection,
    followSection,
    wikiPage,
    wikiSectionRequest,
    systemWindows,
    cursorTarget,
    cursorMode,
    transitionPhase,
    transitionTarget,
    loaderVisible,
    loadingLog,
    booting,
    loadError,
    loadErrorDetails,
    activeLore,
    selectStar,
    jumpToStar,
    selectPlanet,
    selectSatellite,
    closeSystemView,
    applyRoute,
    openLoreLink,
    openWiki,
    closeWiki,
    toggleMode,
    showOnMap,
    scrollWikiTo,
    validateSelection,
    minimizeWindow,
    restoreWindow,
    toggleMaximizeWindow,
    resetWindows,
    syndicateHack,
    startSyndicateHack,
    finishClosing,
    markViewReady,
    finishOpening,
    logLoadingStep,
    failLoading,
    setCursorTarget,
    clearCursorTarget,
    wikiRecent,
    rememberWikiPage,
    setCursorMode
  }
})
