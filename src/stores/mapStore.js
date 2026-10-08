import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'
import { DEFAULT_GALAXY } from '../config/mapGeometry'
import { nextFrame } from '../utils/nextFrame'
import { DEFAULT_SITE_CONFIG } from '../utils/siteConfig'
import { buildWikiIndex, normalizeWiki } from '../utils/wikiPages'
import { buildNavbox } from '../utils/wikiNavbox'
import { buildWikiGraph } from '../utils/wikiService'
import { buildMapData } from '../utils/mapData'
import { MAP_FILE, checkMap, isWebPage, parseMapJson } from '../utils/mapCheck'
import { mapJournal, mapProblems, startMapJournal } from '../utils/mapJournal'
import { useUIStore } from './uiStore'
import { setStrings, t } from '../i18n'
import { setFontSample } from '../utils/fontLoader'
import { applyTheme } from '../theme'
import { DEFAULT_TERMINAL } from '../utils/terminal'
import { draftFetch, draftTracks, previewDraft } from '../editor/draft'
import { freshFetch } from '../utils/freshFetch'
import { normalizeSoundConfig } from '../sound/soundConfig'

async function fetchText(url) {
  const response = await freshFetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = await response.text()
  // Static hosts answer a missing file with index.html.
  if (isWebPage(text, { contentType: response.headers?.get('content-type'), path: url })) {
    throw new Error('not found: the host sent a web page instead')
  }
  return text
}

// Every letter the map shows in the pixel fonts, so their alphabets load before Pixi draws them.
function mapLetters(data, strings) {
  const names = [
    data.site?.title,
    ...data.stars.map(star => star.name),
    ...Object.values(data.systems ?? {}).flatMap(system => (system.planets ?? []).map(planet => planet.name)),
    ...Object.values(data.factions ?? {}).map(faction => faction?.name),
    ...[...strings.values()].flatMap(value => (typeof value === 'string' ? [value] : Object.values(value)))
  ]
  return names.filter(name => typeof name === 'string').join(' ')
}

export const useMapStore = defineStore('map', () => {
  const worldLore = ref('')
  const worldLoreDoc = shallowRef(null)
  const homeLoreDoc = shallowRef(null)
  const legendDoc = shallowRef(null)
  const loreConfig = ref(null)
  const siteConfig = ref({ ...DEFAULT_SITE_CONFIG })
  const galaxy = ref(DEFAULT_GALAXY)
  const legend = ref('')
  // Replaced whole, never changed in place: shallow, no reactive proxy over every star and border point of a big map.
  const stars = shallowRef([])
  const systems = shallowRef({})
  const territories = shallowRef([])
  const planetTextColors = ref({})
  const hyperlines = shallowRef([])
  // [{ hyperline, path }]
  const routedHyperlines = shallowRef([])
  // star id -> its name layout in its sector
  const starLabels = shallowRef(new Map())
  const factions = ref({})
  // { type: name }
  const hyperlineTypes = ref({})
  const music = ref([])
  const sounds = ref(normalizeSoundConfig(undefined))
  const wiki = shallowRef(normalizeWiki(null))
  const wikiIndex = shallowRef(markRaw(buildWikiIndex()))
  const wikiNavbox = shallowRef(markRaw(buildNavbox()))
  const wikiGraph = shallowRef(markRaw(buildWikiGraph(null)))
  // [{ level, where, message }]
  const mapIssues = shallowRef([])
  // { script, files, syndicate }
  const terminal = shallowRef(DEFAULT_TERMINAL)
  const isLoaded = ref(false)

  let resolveLoaded
  const loadedPromise = new Promise(resolve => { resolveLoaded = resolve })

  function whenLoaded() {
    return loadedPromise
  }

  // { text } | { failure }
  async function readMapFile(url) {
    let response
    try {
      response = await freshFetch(url)
    } catch (error) {
      const details = [`${url}: ${error?.message ?? error}.`]
      // Opened by a double click: the browser does not let a page read files.
      if (window.location.protocol === 'file:') details.push(t('loader.openFromServer'))
      return { failure: { key: 'loader.mapUnavailable', details } }
    }
    const failed = status => ({
      failure: {
        key: status === 404 ? 'loader.mapNotFound' : 'loader.mapHttpError',
        params: { status },
        details: [url, t('loader.mapLocation', { file: MAP_FILE })]
      }
    })
    if (!response.ok) return failed(response.status)
    const text = await response.text()
    // index.html in place of a missing map.json: "not found", not a JSON error at line 1.
    return isWebPage(text, { contentType: response.headers?.get('content-type'), path: url }) ? failed(404) : { text }
  }

  async function loadMapData() {
    const uiStore = useUIStore()

    try {
      uiStore.logLoadingStep('loader.loadingCatalog')
      startMapJournal()
      // Relative, so the site works from any folder of a static host (github.io/<repo>/).
      const baseUrl = new URL(MAP_FILE, document.baseURI).href
      // An editor draft being previewed: its files over those of the host.
      const draft = previewDraft()
      const readText = draft ? draftFetch(fetchText, draft, baseUrl) : fetchText
      const file = draft && Object.hasOwn(draft.files, MAP_FILE) ? { text: draft.files[MAP_FILE] } : await readMapFile(baseUrl)
      if (file.failure) {
        uiStore.failLoading(file.failure.key, file.failure.params, file.failure.details)
        return
      }

      const parsed = parseMapJson(file.text)
      if (parsed.error) {
        const { line, column, excerpt, message } = parsed.error
        uiStore.failLoading('loader.mapSyntax', { file: MAP_FILE.toUpperCase(), line, column }, [...excerpt, '', message])
        return
      }
      uiStore.logLoadingStep('loader.checkingMap', { count: Array.isArray(parsed.data?.stars) ? parsed.data.stars.length : 0 })
      const checked = checkMap(parsed.data)
      if (checked.fatal) {
        uiStore.failLoading('loader.notAMap', { file: MAP_FILE.toUpperCase() }, [checked.fatal])
        return
      }

      // Strings and theme first: the wiki is built in those texts, the canvases drawn in those colours.
      setStrings(checked.strings, checked.language)
      applyTheme(checked.theme)
      document.documentElement.lang = checked.language
      setFontSample(mapLetters(checked.data, checked.strings))

      const built = await buildMapData(checked.data, {
        baseUrl,
        fetchText: readText,
        // nextFrame lets the loader paint each stage before the heavy work.
        step: async (key, params) => {
          uiStore.logLoadingStep(key, params)
          await nextFrame()
        }
      })

      const tracks = draft ? await draftTracks(built.music, baseUrl, draft) : built.music
      worldLore.value = built.worldLore
      worldLoreDoc.value = built.worldLoreDoc
      legendDoc.value = built.legendDoc
      loreConfig.value = built.loreConfig
      siteConfig.value = built.siteConfig
      galaxy.value = built.galaxy
      legend.value = built.legend
      stars.value = built.stars
      systems.value = built.systems
      planetTextColors.value = built.planetTextColors
      hyperlines.value = built.hyperlines
      routedHyperlines.value = built.routedHyperlines
      starLabels.value = built.starLabels
      factions.value = built.factions
      hyperlineTypes.value = built.hyperlineTypes
      music.value = tracks
      sounds.value = built.sounds
      wiki.value = built.wiki
      wikiIndex.value = built.wikiIndex
      wikiGraph.value = built.wikiGraph
      homeLoreDoc.value = built.homeLoreDoc
      wikiNavbox.value = built.wikiNavbox
      territories.value = built.territories
      terminal.value = built.terminal
      mapIssues.value = mapJournal()
      const count = mapProblems(mapIssues.value).length
      if (count) {
        uiStore.logLoadingStep('loader.mapProblems', { count })
        console.warn(`The map file has ${count} problem(s): open the wiki page Special:Map check.`)
      }

      isLoaded.value = true
      // A system opened from the URL must exist before any view uses it.
      uiStore.validateSelection()
      resolveLoaded()
    } catch (error) {
      console.error('Failed to load map data:', error)
      uiStore.failLoading('loader.catalogUnavailable', {}, [String(error?.message ?? error)])
    }
  }

  function getStarById(id) {
    return stars.value.find(star => star.id === id)
  }

  function getSystemByStarId(starId) {
    return systems.value[starId]
  }

  return {
    worldLore,
    worldLoreDoc,
    homeLoreDoc,
    legendDoc,
    loreConfig,
    siteConfig,
    terminal,
    galaxy,
    legend,
    stars,
    systems,
    territories,
    planetTextColors,
    hyperlines,
    routedHyperlines,
    starLabels,
    factions,
    hyperlineTypes,
    music,
    sounds,
    wiki,
    wikiIndex,
    wikiNavbox,
    wikiGraph,
    mapIssues,
    isLoaded,
    whenLoaded,
    loadMapData,
    getStarById,
    getSystemByStarId
  }
})
