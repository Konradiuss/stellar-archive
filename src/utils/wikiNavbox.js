// Order: the main page, the map file's groups, the map's places, pages without a group, service pages.

import { cssColor } from './mapLegend'
import { getSatellites } from './satellites'
import { placesTitle } from './wikiPages'
import { serviceLinks } from './wikiService'
import { compareText, t } from '../i18n'

const leaf = page => ({ title: page.title, page, items: [] })
const byName = (a, b) => compareText(a.name ?? '', b.name ?? '')

/**
 * → { home, groups: [Group] }; groups without pages are left out.
 * Group: { id, title, page, icon, color, items: [Item], groups: [Group], slugs: Set of every page inside }.
 * Item: { title, page (null when only its items have pages), items: [Item] }.
 */
export function buildNavbox({ index = null, wiki = null, stars = [], systems = {}, factions = {} } = {}) {
  const pages = index?.pages ?? []
  const home = index?.home ?? null
  const placed = new Set()
  const articleNamed = title => index?.forTarget({ kind: 'article', title }) ?? null

  function group({ id, title, icon = null, color = null, items = [], groups = [] }) {
    const slugs = new Set()
    const collect = list => list.forEach(item => {
      if (item.page) slugs.add(item.page.slug)
      collect(item.items)
    })
    collect(items)
    for (const inner of groups) inner.slugs.forEach(slug => slugs.add(slug))
    slugs.forEach(slug => placed.add(slug))
    return slugs.size ? { id, title, page: articleNamed(title), icon, color, items, groups, slugs } : null
  }

  function wikiGroup(source) {
    return group({
      id: `group:${source.id}`,
      title: source.title,
      icon: source.icon ?? null,
      items: pages.filter(page => (page.kind === 'article' || page.kind === 'world') && page.group === source.id).map(leaf),
      groups: source.groups.map(wikiGroup).filter(Boolean)
    })
  }

  function starItem(star) {
    const planets = (systems?.[star.id]?.planets ?? []).map((planet, planetIndex) => ({
      title: planet?.name ?? '',
      page: index.forTarget({ kind: 'planet', starId: star.id, planetIndex }),
      items: getSatellites(planet)
        .map(satellite => index.forTarget({ kind: 'satellite', starId: star.id, planetIndex, satelliteIndex: satellite.index }))
        .filter(Boolean)
        .map(leaf)
    }))
    return {
      title: star.name ?? star.id,
      page: index.forTarget({ kind: 'star', starId: star.id }),
      items: planets.filter(item => item.page || item.items.length)
    }
  }

  // Stars of an unknown faction go with the factionless ones.
  function placesGroup() {
    if (!index) return null
    const known = factions && typeof factions === 'object' ? factions : {}
    const starsOf = new Map([...Object.keys(known).map(id => [id, []]), [null, []]])
    for (const star of stars ?? []) {
      if (!star?.id) continue
      // Own keys only: a faction "constructor" is not one of Object's.
      starsOf.get(star.faction && Object.hasOwn(known, star.faction) ? star.faction : null).push(star)
    }
    const factionGroups = [...starsOf].map(([id, list]) => {
      const faction = id === null ? null : known[id]
      return group({
        id: `faction:${id ?? ''}`,
        title: id === null ? t('pages.noFaction') : faction?.name || id,
        color: id === null ? '#9a9a9a' : cssColor(faction?.borderColor) ?? cssColor(faction?.fillColor) ?? '#ffffff',
        items: [...list].sort(byName).map(starItem).filter(item => item.page || item.items.length)
      })
    }).filter(Boolean)
    return group({ id: 'places', title: placesTitle(), icon: 'planet', groups: factionGroups })
  }

  const groups = [...(wiki?.groups ?? []).map(wikiGroup), placesGroup()].filter(Boolean)
  const misc = group({ id: 'misc', title: t('pages.misc'), icon: 'document', items: pages.filter(page => page !== home && !placed.has(page.slug)).map(leaf) })
  if (misc) groups.push(misc)
  if (index) groups.push(group({ id: 'service', title: t('pages.servicePages'), icon: 'search', items: serviceLinks().map(leaf) }))
  return { home, groups }
}

/** 'Sol (Earth [Moon, Ring], Mars) · Terra' as unbreakable words: [[{ text, page?, depth? }]]. */
export function navboxWords(items) {
  const words = [[]]
  const push = token => words[words.length - 1].push(token)
  const walk = (list, depth) => list.forEach((item, position) => {
    if (position) {
      push({ text: depth ? ',' : '\u00a0·' })
      words.push([])
    }
    push({ text: item.title, page: item.page, depth })
    if (!item.items.length) return
    push({ text: depth ? '\u00a0[' : '\u00a0(' })
    walk(item.items, depth + 1)
    push({ text: depth ? ']' : ')' })
  })
  walk(items, 0)
  return words[0].length ? words : []
}
