// The lore is left as it is (the side panel shows it too): the page gets a document of its own.

import { markRaw } from 'vue'
import { textNode } from './richText/inline'
import { hyperlineTypeName } from './mapLegend'
import { getOrbitNumbers, toRoman } from './planetOrbit'
import { getSatellites } from './satellites'
import { findNeighborStars } from './starNeighbors'
import { pageKey } from './wikiPages'
import { compareText, t } from '../i18n'

// Aliases: a field the author already wrote under any of these names is not repeated.
const FIELD_NAMES = {
  type: ['type', 'class', 'kind'],
  faction: ['faction', 'owner'],
  sector: ['sector', 'coordinates'],
  planets: ['planets'],
  hyperlines: ['hyperlines'],
  system: ['system', 'star'],
  orbit: ['orbit'],
  moons: ['moons', 'satellites'],
  stations: ['stations'],
  planet: ['planet']
}
const field = (id, children) => ({ id, key: t(`card.${id}`), children })
export const systemsTitle = () => t('pages.systems')
// Sections that close an article: a faction's systems go before them.
const CLOSING_SECTIONS = new Set(['see also', 'notes', 'references', 'further reading', 'external links'])

const byName = (a, b) => compareText(a.name ?? '', b.name ?? '')
const blockText = children => children.map(node => node.value ?? blockText(node.children ?? [])).join('')

const placeLink = (title, action) => ({ type: 'link', page: title, action, children: [textNode(title)] })

// 'A, B and C' of inline nodes.
function listOf(nodes) {
  const children = []
  nodes.forEach((node, index) => {
    if (index) children.push(textNode(index === nodes.length - 1 ? t('templates.and') : ', '))
    children.push(node)
  })
  return children
}

/** map: { stars, systems, factions, hyperlines, hyperlineTypes } */
export function decorateWikiPages(index, { stars = [], systems = {}, factions = {}, hyperlines = [], hyperlineTypes = {} } = {}) {
  if (!index) return index
  const starsById = new Map((stars ?? []).filter(star => star?.id).map(star => [star.id, star]))
  const known = factions && typeof factions === 'object' ? factions : {}
  const factionName = id => (id && Object.hasOwn(known, id) ? known[id].name || id : null)
  const factionArticle = id => {
    const name = factionName(id)
    const page = name ? index.find(name) : null
    return page?.kind === 'article' ? page : null
  }
  const place = placeLink

  function factionValue(star) {
    const name = factionName(star?.faction)
    if (!name) return [textNode(t('pages.noFaction'))]
    const article = factionArticle(star.faction)
    return [article ? placeLink(name, { kind: 'article', title: article.title }) : textNode(name)]
  }

  const starValue = star => [place(star.name ?? star.id, { kind: 'star', starId: star.id })]
  const planetValue = (starId, planetIndex) => {
    const planet = systems?.[starId]?.planets?.[planetIndex]
    return [place(planet?.name ?? '?', { kind: 'planet', starId, planetIndex })]
  }

  function starCard(star) {
    const planets = systems?.[star.id]?.planets ?? []
    const numbers = getOrbitNumbers(planets)
    const inOrder = planets.map((planet, planetIndex) => ({ planet, planetIndex })).sort((a, b) => numbers[a.planetIndex] - numbers[b.planetIndex])
    const neighbors = findNeighborStars(stars, hyperlines, star.id)
    return [
      field('type', [textNode(t('card.starSystem'))]),
      field('faction', factionValue(star)),
      field('sector', [textNode(`${star.sectorX},${star.sectorY}`)]),
      planets.length && field('planets', listOf(inOrder.flatMap(({ planetIndex }) => planetValue(star.id, planetIndex)))),
      neighbors.length && field('hyperlines', listOf(neighbors.map(({ star: other, hyperline }) => ({
        type: 'span',
        children: [...starValue(other), textNode(` (${hyperlineTypeName(hyperline.type || 'other', hyperlineTypes)})`)]
      }))))
    ]
  }

  function planetCard(star, planetIndex) {
    const planets = systems?.[star.id]?.planets ?? []
    const satellites = getSatellites(planets[planetIndex])
    const group = kind => satellites
      .filter(satellite => satellite.kind === kind)
      .map(satellite => place(satellite.data.name ?? '?', { kind: 'satellite', starId: star.id, planetIndex, satelliteIndex: satellite.index }))
    const moons = group('moon')
    const stations = group('station')
    return [
      field('type', [textNode(t('card.planetType'))]),
      field('system', starValue(star)),
      field('faction', factionValue(star)),
      field('orbit', [textNode(t('card.orbitOf', { orbit: toRoman(getOrbitNumbers(planets)[planetIndex]), orbits: toRoman(planets.length) }))]),
      moons.length && field('moons', listOf(moons)),
      stations.length && field('stations', listOf(stations))
    ]
  }

  function satelliteCard(star, planetIndex, satelliteIndex) {
    const planet = systems?.[star.id]?.planets?.[planetIndex]
    const satellite = getSatellites(planet).find(item => item.index === satelliteIndex)
    const type = satellite?.kind === 'station'
      ? t('card.stationType', { type: t(`stationTypes.${satellite.type}`).toLowerCase() })
      : t('card.moonType')
    return [
      field('type', [textNode(type)]),
      field('planet', planetValue(star.id, planetIndex)),
      field('system', starValue(star)),
      field('faction', factionValue(star))
    ]
  }

  function cardOf(page) {
    const { starId, planetIndex = null, satelliteIndex = null } = page.mapTarget ?? {}
    const star = starsById.get(starId)
    if (!star) return null
    const rows = page.kind === 'star'
      ? starCard(star)
      : page.kind === 'planet' ? planetCard(star, planetIndex) : satelliteCard(star, planetIndex, satelliteIndex)
    return { type: 'infobox', name: page.title, auto: true, params: rows.filter(Boolean) }
  }

  function systemsSection(factionId) {
    const own = [...starsById.values()].filter(star => star.faction === factionId).sort(byName)
    if (!own.length) return []
    const items = own.map(star => {
      const planets = (systems?.[star.id]?.planets ?? []).map((planet, planetIndex) => planetValue(star.id, planetIndex)[0])
      return { children: planets.length ? [...starValue(star), textNode(' — '), ...listOf(planets)] : starValue(star), blocks: [] }
    })
    return [
      { type: 'heading', level: 2, children: [textNode(systemsTitle())] },
      { type: 'paragraph', children: [textNode(t('pages.factionHolds', { count: own.length }))] },
      { type: 'list', ordered: false, items }
    ]
  }

  function withSystems(blocks, factionId) {
    if (blocks.some(block => block.type === 'heading' && pageKey(blockText(block.children)) === pageKey(systemsTitle()))) return null
    const section = systemsSection(factionId)
    if (!section.length) return null
    const closing = blocks.findIndex(block => (
      (block.type === 'heading' && block.level <= 2 && CLOSING_SECTIONS.has(pageKey(blockText(block.children)))) || block.type === 'references'
    ))
    const at = closing < 0 ? blocks.length : closing
    return [...blocks.slice(0, at), ...section, ...blocks.slice(at)]
  }

  const factionOfArticle = new Map()
  for (const id of Object.keys(known)) {
    const article = factionArticle(id)
    if (article && !factionOfArticle.has(article)) factionOfArticle.set(article, id)
  }

  for (const page of index.pages) {
    const blocks = page.doc?.blocks ?? []
    if (['star', 'planet', 'satellite'].includes(page.kind)) {
      const card = cardOf(page)
      if (!card) continue
      // A card written in the lore stays the only one: what the map knows is appended to it.
      const own = blocks.findIndex(block => block.type === 'infobox')
      if (own < 0) {
        page.doc = markRaw({ ...page.doc, blocks: [card, ...blocks] })
        continue
      }
      const written = new Set(blocks[own].params.map(param => pageKey(param.key ?? '')))
      const missing = card.params.filter(param => ![param.key, ...FIELD_NAMES[param.id]].some(name => written.has(pageKey(name))))
      const merged = { ...blocks[own], params: [...blocks[own].params, ...missing] }
      page.doc = markRaw({ ...page.doc, blocks: blocks.map((block, position) => (position === own ? merged : block)) })
    } else if (factionOfArticle.has(page)) {
      const next = withSystems(blocks, factionOfArticle.get(page))
      if (next) page.doc = markRaw({ ...page.doc, blocks: next })
    }
  }
  return index
}
