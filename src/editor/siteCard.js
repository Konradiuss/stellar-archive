// The link preview of the site's home, as the build draws it (scripts/socialPreview.js),
// from the draft: only what the card needs is built, at once and quietly.

import { checkMap } from '../utils/mapCheck'
import { collectMapNotes } from '../utils/mapJournal'
import { normalizeSiteConfig } from '../utils/siteConfig'
import { normalizeGalaxyConfig } from '../config/mapGeometry'
import { applyHyperlineStyles } from '../utils/hyperlineStyle'
import { routeHyperlines } from '../utils/hyperlineRouter'
import { buildTerritories } from '../utils/territoryBuilder'
import { detectLoreFormat, normalizeLoreConfig, parseLore } from '../utils/richText/lore'
import { simplifyPage } from '../utils/richText/simplify'
import { pageKey } from '../utils/wikiPages'
import { cardSvg } from '../social/card'
import { clip, describe } from '../social/preview'
import { isObject } from '../utils/guards'

// readText(path) → the text of a file of the draft, or null.
function textOf(entry, readText) {
  if (typeof entry.file === 'string' && entry.file.trim()) {
    const text = readText(entry.file.trim().replace(/^\.\//, ''))
    if (typeof text === 'string') return text
  }
  return typeof entry.text === 'string' ? entry.text : ''
}

function docOf(entry, config, readText) {
  const text = textOf(entry, readText)
  return text.trim() ? parseLore(text, detectLoreFormat({ loreFormat: entry.format, loreFile: entry.file }, config)) : null
}

// As wikiPages: the page the map names, else the world page, else the first article.
function homeEntry(map) {
  const articles = Array.isArray(map.wiki?.articles) ? map.wiki.articles.filter(article => isObject(article) && article.title) : []
  const named = map.wiki?.home ? articles.find(article => pageKey(article.title) === pageKey(map.wiki.home)) : null
  if (named) return named
  if (map.worldLore || map.worldLoreFile) return null
  return articles[0] ?? null
}

/** → { svg, title, description, url }, or null for a map that is not one. */
export function siteCard(raw, readText = () => null) {
  return collectMapNotes(() => {
    // A copy: the card's builders may write on what they are given.
    const checked = checkMap(structuredClone(raw))
    if (checked.fatal) return null
    const map = checked.data
    const site = normalizeSiteConfig(map.site)
    const config = normalizeLoreConfig(map.loreConfig)
    const world = { text: map.worldLore, file: map.worldLoreFile, format: map.worldLoreFormat }
    const home = homeEntry(map)
    const homeDoc = home ? docOf(home, config, readText) : null
    const worldDoc = docOf(world, config, readText)
    const description = clip(site.description) || describe(homeDoc ? simplifyPage(homeDoc) : null, map) || describe(worldDoc, map)

    const stars = Array.isArray(map.stars) ? map.stars : []
    const factions = isObject(map.factions) ? map.factions : {}
    const galaxy = normalizeGalaxyConfig(map.galaxy, stars)
    const hyperlines = applyHyperlineStyles(Array.isArray(map.hyperlines) ? map.hyperlines : [], isObject(map.hyperlineTypes) ? map.hyperlineTypes : {})
    const built = {
      galaxy,
      stars,
      factions,
      territories: buildTerritories(stars, factions, galaxy),
      routedHyperlines: routeHyperlines(hyperlines, stars, { columns: galaxy.columns, rows: galaxy.rows })
    }
    const svg = cardSvg({ map: built, colors: checked.theme.colors, title: site.title, subtitle: description })
    return { svg, title: site.title, description, url: site.url }
  }).result
}
