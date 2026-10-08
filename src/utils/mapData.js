import { markRaw } from 'vue'
import { buildTerritories } from './territoryBuilder'
import { routeHyperlines } from './hyperlineRouter'
import { layoutStarLabels } from './starLabels'
import { normalizeGalaxyConfig } from '../config/mapGeometry'
import { prepareLore } from './richText/lore'
import { textCount } from './loaderCounts'
import { normalizeSiteConfig } from './siteConfig'
import { normalizeMusicConfig } from './musicPlaylist'
import { normalizeSoundConfig } from '../sound/soundConfig'
import { applyHyperlineStyles } from './hyperlineStyle'
import { buildWikiIndex, normalizeWiki } from './wikiPages'
import { buildNavbox } from './wikiNavbox'
import { decorateWikiPages } from './wikiPlaces'
import { buildWikiGraph } from './wikiService'
import { simplifyPage } from './richText/simplify'
import { prepareTerminal } from './terminal'

/**
 * `baseUrl`: the map file address (map paths are relative to it). `fetchText(url)`: a lore or terminal file.
 * `step(key, params)`: awaited before each stage for the loader log, so the page can paint in between.
 */
export async function buildMapData(data, { baseUrl, fetchText, step = () => {} }) {
  // Articles are checked before their lore is loaded onto them.
  data.wiki = normalizeWiki(data.wiki)

  await step('loader.loadingArchives', { count: textCount(data) })
  const [loreConfig, terminal] = await Promise.all([
    prepareLore(data, { baseUrl, fetchText }),
    prepareTerminal(data.terminal, { baseUrl, fetchText })
  ])

  await step('loader.buildingTerritories')
  const factions = data.factions || {}
  const galaxy = normalizeGalaxyConfig(data.galaxy, data.stars)
  const hyperlineTypes = data.hyperlineTypes && typeof data.hyperlineTypes === 'object' ? data.hyperlineTypes : {}
  const hyperlines = applyHyperlineStyles(data.hyperlines || [], hyperlineTypes)
  // Hyperlines first: a star name goes above its star when a line leaves downwards.
  const routedHyperlines = routeHyperlines(hyperlines, data.stars, { columns: galaxy.columns, rows: galaxy.rows })
  const starLabels = layoutStarLabels(data.stars, routedHyperlines)
  const territories = buildTerritories(data.stars, factions, galaxy)

  const wikiIndex = markRaw(decorateWikiPages(buildWikiIndex({
    wiki: data.wiki,
    worldLoreDoc: data.worldLoreDoc,
    stars: data.stars,
    systems: data.systems
  }), {
    stars: data.stars,
    systems: data.systems,
    factions,
    hyperlines,
    hyperlineTypes
  }))
  // Only a main page the map names; otherwise the world lore stays.
  const home = data.wiki?.home ? wikiIndex.home : null

  return {
    worldLore: data.worldLore,
    worldLoreDoc: data.worldLoreDoc,
    legendDoc: data.legendDoc,
    loreConfig,
    siteConfig: normalizeSiteConfig(data.site, baseUrl),
    galaxy,
    legend: data.legend,
    stars: data.stars,
    systems: data.systems,
    planetTextColors: data.planetTextColors || {},
    hyperlines,
    routedHyperlines,
    starLabels,
    factions,
    hyperlineTypes,
    music: normalizeMusicConfig(data.music, baseUrl),
    sounds: normalizeSoundConfig(data.sounds, baseUrl),
    wiki: markRaw(data.wiki),
    wikiIndex,
    wikiGraph: markRaw(buildWikiGraph(wikiIndex)),
    homeLoreDoc: home?.doc ? markRaw(simplifyPage(home.doc)) : null,
    wikiNavbox: markRaw(buildNavbox({ index: wikiIndex, wiki: data.wiki, stars: data.stars, systems: data.systems, factions })),
    territories,
    terminal
  }
}
