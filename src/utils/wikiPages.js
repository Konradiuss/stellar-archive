// A page is found by its title, its slug or an alias, whatever the case and '_' or spaces.

import { getSatellites } from './satellites'
import { createPlaceFinder } from './placeFinder'
import { warnMap } from './mapJournal'
import { t } from '../i18n'

// "Galaxy" leads to the world page in any language, so links written in English keep working.
export const worldPageTitle = () => t('pages.world')
export const placesTitle = () => t('pages.places')
export const WORLD_PAGE_ALIAS = 'Galaxy'

const WIKI_FORMATS = ['wikitext', 'markdown']

// Service and category pages: made by the wiki, never articles.
export const SPECIAL_NAMESPACE = /^special\s*:\s*/i
export const CATEGORY_NAMESPACE = /^category\s*:\s*/i
export const isServiceName = name => SPECIAL_NAMESPACE.test(String(name ?? '').trim()) || CATEGORY_NAMESPACE.test(String(name ?? '').trim())

export const pageKey = name => String(name ?? '').trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase()
export const toSlug = title => String(title ?? '').trim().replace(/\s+/g, '_')

const text = value => (typeof value === 'string' && value.trim() ? value.trim() : null)

// Levels of groups, the outermost one counted: a group, its subgroup and the subgroup of that.
export const MAX_GROUP_DEPTH = 3

// A group below the last level folds into `owner`: its articles go there.
function foldGroups(list, known, owner) {
  for (const raw of Array.isArray(list) ? list : []) {
    const id = text(raw?.id)
    if (!id || known.has(id)) {
      warnMap('wiki.groups', `Group ${JSON.stringify(raw?.id ?? raw?.title)} has no "id" or repeats one: left out.`)
      continue
    }
    warnMap('wiki.groups', `Group "${id}" is deeper than ${MAX_GROUP_DEPTH} levels: its articles go to "${owner.id}".`)
    known.set(id, owner)
    foldGroups(raw.groups, known, owner)
  }
}

function normalizeGroups(list, known, parentId = null, depth = 1) {
  if (!Array.isArray(list)) return []
  const groups = []
  for (const raw of list) {
    const id = text(raw?.id)
    const title = text(raw?.title) ?? id
    if (!id || known.has(id)) {
      warnMap('wiki.groups', `Group ${JSON.stringify(raw?.id ?? raw?.title)} has no "id" or repeats one: left out.`)
      continue
    }
    // utils/wikiIcons.js; null: the usual one.
    const icon = text(raw?.icon)
    const group = { id, title, icon, parentId, groups: [] }
    known.set(id, group)
    if (depth < MAX_GROUP_DEPTH) group.groups = normalizeGroups(raw.groups, known, id, depth + 1)
    else foldGroups(raw.groups, known, group)
    groups.push(group)
  }
  return groups
}

/**
 * The `wiki` section of the map file, checked:
 * { home, portal, groups: [{ id, title, icon, parentId, groups }], groupsById, worldGroup, articles:
 * [{ title, file, text, format, group, aliases, categories, tabTitle, place }] }. Broken entries
 * are reported and skipped.
 */
export function normalizeWiki(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const groupsById = new Map()
  const groups = normalizeGroups(source.groups, groupsById)
  const titles = new Set()
  const articles = []
  for (const entry of Array.isArray(source.articles) ? source.articles : []) {
    const title = text(entry?.title)
    if (!title) {
      warnMap('wiki.articles', 'An article without a "title": left out.')
      continue
    }
    if (titles.has(pageKey(title))) {
      warnMap(`wiki.articles "${title}"`, 'Another article has this title: left out.')
      continue
    }
    titles.add(pageKey(title))
    let group = text(entry.group)
    if (group && !groupsById.has(group)) {
      warnMap(`wiki.articles "${title}"`, `Group "${group}" is not in "wiki.groups": the article has no group.`)
      group = null
    }
    if (group) group = groupsById.get(group).id
    articles.push({
      title,
      file: text(entry.file) ?? undefined,
      text: typeof entry.text === 'string' ? entry.text : undefined,
      format: WIKI_FORMATS.includes(entry.format) ? entry.format : undefined,
      group,
      aliases: (Array.isArray(entry.aliases) ? entry.aliases : []).map(text).filter(Boolean),
      categories: (Array.isArray(entry.categories) ? entry.categories : []).map(text).filter(Boolean),
      tabTitle: text(entry.tabTitle),
      place: text(entry.place)
    })
  }
  let worldGroup = text(source.worldGroup)
  if (worldGroup && !groupsById.has(worldGroup)) {
    warnMap('wiki.worldGroup', `Group "${worldGroup}" is not in "wiki.groups": the world page has no group.`)
    worldGroup = null
  }
  if (worldGroup) worldGroup = groupsById.get(worldGroup).id
  return { home: text(source.home), portal: source.portal !== false, groups, groupsById, worldGroup, articles }
}

function groupPath(groupsById, id) {
  const path = []
  for (let group = groupsById.get(id); group; group = groupsById.get(group.parentId)) path.unshift(group.title)
  return path
}

const targetKey = ({ kind, starId, planetIndex = null, satelliteIndex = null }) => `${kind}:${starId}:${planetIndex}:${satelliteIndex}`

/**
 * → { pages, home, get(slug), find(name), forTarget(link target), forPlace(place) }.
 * A page: { slug, title, kind: 'world'|'star'|'planet'|'satellite'|'article', tag (the kind, or
 * 'moon' / 'station' for a satellite), doc, path (titles above it), aliases, tabTitle, mapTarget
 * (a map route, the article's `place`, or null), group (group id or null), categories }.
 * map: { wiki (normalized), worldLoreDoc, stars, systems }.
 */
export function buildWikiIndex({ wiki = normalizeWiki(null), worldLoreDoc = null, stars = [], systems = {} } = {}) {
  const pages = []
  const bySlug = new Map()
  const byName = new Map()
  const byTarget = new Map()
  const articlesByPlace = new Map()

  // A title taken by another page gets what tells them apart: "Terra (Sol)".
  function add(page, qualifier) {
    let slug = toSlug(page.title)
    if (bySlug.has(pageKey(slug))) slug = toSlug(`${page.title} (${qualifier})`)
    for (let number = 2; bySlug.has(pageKey(slug)); number++) slug = toSlug(`${page.title} (${qualifier} ${number})`)
    const full = { aliases: [], tabTitle: null, mapTarget: null, path: [], group: null, categories: [], tag: page.kind, ...page, slug }
    pages.push(full)
    bySlug.set(pageKey(slug), full)
    for (const name of [full.title, slug, ...full.aliases]) {
      if (!byName.has(pageKey(name))) byName.set(pageKey(name), full)
    }
    if (full.mapTarget && full.kind !== 'world' && full.kind !== 'article') byTarget.set(targetKey({ kind: full.kind, ...full.mapTarget }), full)
    return full
  }

  const world = worldLoreDoc
    ? add({
      title: worldPageTitle(),
      aliases: pageKey(worldPageTitle()) === pageKey(WORLD_PAGE_ALIAS) ? [] : [WORLD_PAGE_ALIAS],
      kind: 'world',
      doc: worldLoreDoc,
      group: wiki.worldGroup ?? null,
      path: wiki.worldGroup ? groupPath(wiki.groupsById, wiki.worldGroup) : [],
      mapTarget: { starId: null }
    }, 'world')
    : null

  const starNames = new Map((stars ?? []).map(star => [star.id, star.name]))
  for (const star of stars ?? []) {
    if (!star?.loreDoc) continue
    add({ title: star.name, kind: 'star', doc: star.loreDoc, tabTitle: text(star.tabTitle), path: [placesTitle()], mapTarget: { starId: star.id } }, 'star')
  }
  for (const [starId, system] of Object.entries(systems ?? {})) {
    const starName = starNames.get(starId) ?? starId
    ;(system?.planets ?? []).forEach((planet, planetIndex) => {
      if (planet?.loreDoc) {
        add({
          title: planet.name,
          kind: 'planet',
          doc: planet.loreDoc,
          tabTitle: text(planet.tabTitle),
          path: [placesTitle(), starName],
          mapTarget: { starId, planetIndex }
        }, starName)
      }
      for (const satellite of getSatellites(planet)) {
        if (!satellite.data.loreDoc) continue
        add({
          title: satellite.data.name,
          kind: 'satellite',
          tag: satellite.kind === 'station' ? 'station' : 'moon',
          doc: satellite.data.loreDoc,
          tabTitle: text(satellite.data.tabTitle),
          path: [placesTitle(), starName, planet.name],
          mapTarget: { starId, planetIndex, satelliteIndex: satellite.index }
        }, planet.name)
      }
    })
  }
  const findPlace = createPlaceFinder(stars ?? [], systems ?? {})
  for (const article of wiki.articles ?? []) {
    const place = article.place ? findPlace(article.place) : null
    if (article.place && !place) warnMap(`wiki.articles "${article.title}"`, `Place "${article.place}" is not on the map.`)
    const page = add({
      title: article.title,
      kind: 'article',
      doc: article.loreDoc ?? null,
      aliases: article.aliases,
      tabTitle: article.tabTitle,
      group: article.group,
      categories: article.categories ?? [],
      path: article.group ? groupPath(wiki.groupsById, article.group) : [],
      mapTarget: place && {
        starId: place.starId,
        planetIndex: place.planetIndex ?? null,
        satelliteIndex: place.satelliteIndex ?? null
      }
    }, 'article')
    const key = place && targetKey(place)
    if (key && !articlesByPlace.has(key)) articlesByPlace.set(key, page)
  }

  const articles = new Map(pages.filter(page => page.kind === 'article').map(page => [pageKey(page.title), page]))
  const home = (wiki.home && byName.get(pageKey(wiki.home))) || world || pages[0] || null
  if (wiki.home && home && pageKey(home.title) !== pageKey(wiki.home)) {
    warnMap('wiki.home', `Page "${wiki.home}" is not found: "${home.title}" is the main page.`)
  }

  return {
    pages,
    home,
    get: slug => bySlug.get(pageKey(slug)) ?? null,
    find: name => byName.get(pageKey(name)) ?? null,
    forTarget(target) {
      if (!target) return null
      if (target.kind === 'article') return articles.get(pageKey(target.title)) ?? null
      if (target.kind === 'world') return world
      return byTarget.get(targetKey(target)) ?? null
    },
    forPlace(place) {
      if (!place) return null
      return byTarget.get(targetKey(place)) ?? articlesByPlace.get(targetKey(place)) ?? null
    }
  }
}
