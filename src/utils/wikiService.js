import { docText, forEachInline } from './richText/walk'
import { CATEGORY_NAMESPACE, SPECIAL_NAMESPACE, pageKey, toSlug } from './wikiPages'
import { compareText, t } from '../i18n'

// Namespaces stay as MediaWiki writes them, in every language: they are part of the addresses.
export const SPECIAL_TITLE = 'Special'
export const CATEGORY_TITLE = 'Category'

const SPECIALS = [
  { kind: 'search', name: 'Search', names: ['search'], param: true },
  { kind: 'allpages', name: 'All pages', names: ['allpages', 'all pages'] },
  { kind: 'categories', name: 'Categories', names: ['categories'] },
  { kind: 'wanted', name: 'Wanted pages', names: ['wantedpages', 'wanted pages'] },
  { kind: 'backlinks', name: 'What links here', names: ['whatlinkshere', 'what links here'], param: true },
  { kind: 'icons', name: 'Icons', names: ['icons'] },
  { kind: 'banners', name: 'Banners', names: ['banners'] },
  { kind: 'sounds', name: 'Sounds', names: ['sounds'] },
  { kind: 'mapcheck', name: 'Map check', names: ['mapcheck', 'map check'] }
]

const KIND_CATEGORIES = { star: 'pages.starSystems', planet: 'pages.planets', moon: 'pages.moons', station: 'pages.stations' }
export const kindCategory = tag => (KIND_CATEGORIES[tag] ? t(KIND_CATEGORIES[tag]) : null)

const upper = text => String(text).toUpperCase().replace(/\s+/g, '_')

const virtual = page => ({
  kind: 'special', tag: 'special', doc: null, aliases: [], tabTitle: null, mapTarget: null, path: [], group: null, categories: [], ...page
})

function describe(kind, param) {
  switch (kind) {
    case 'search': return { title: param ? t('special.searchFor', { query: param }) : t('special.search'), command: `FIND "${param}" *.TXT` }
    case 'allpages': return { title: t('special.allPages'), command: 'DIR *.TXT /O:N' }
    case 'categories': return { title: t('special.categories'), command: 'DIR CATEGORY' }
    case 'wanted': return { title: t('special.wanted'), command: 'CHKDSK /LINKS' }
    case 'icons': return { title: t('special.icons'), command: 'DIR ICONS\\*.ICO /W' }
    case 'banners': return { title: t('special.banners'), command: 'DIR LOGOS\\*.* /W' }
    case 'sounds': return { title: t('special.sounds'), command: 'DIR SOUNDS\\*.WAV /W' }
    case 'mapcheck': return { title: t('special.mapCheck'), command: 'CHKDSK MAP.JSON' }
    default: return { title: param ? t('special.backlinksTo', { page: param }) : t('special.backlinks'), command: `FIND "[[${param}]]" *.TXT` }
  }
}

/** → a page like the index's, with kind 'special', no document, `special: { kind, param }` and a DOS `command`; or null. */
export function servicePage(slug) {
  const name = String(slug ?? '').replace(/_/g, ' ').trim()
  if (CATEGORY_NAMESPACE.test(name)) {
    const category = name.replace(CATEGORY_NAMESPACE, '').trim()
    if (!category) return servicePage(`${SPECIAL_TITLE}:Categories`)
    return virtual({
      slug: toSlug(`${CATEGORY_TITLE}:${category}`),
      title: `${CATEGORY_TITLE}:${category}`,
      special: { kind: 'category', param: category },
      command: `DIR CATEGORY\\${upper(category)}`
    })
  }
  if (!SPECIAL_NAMESPACE.test(name)) return null
  const rest = name.replace(SPECIAL_NAMESPACE, '')
  const slash = rest.indexOf('/')
  const head = slash < 0 ? rest : rest.slice(0, slash)
  const entry = SPECIALS.find(item => item.names.includes(pageKey(head)))
  if (!entry) return null
  const param = entry.param && slash >= 0 ? rest.slice(slash + 1).trim() : ''
  return virtual({
    slug: toSlug(`${SPECIAL_TITLE}:${entry.name}${param ? `/${param}` : ''}`),
    ...describe(entry.kind, param),
    special: { kind: entry.kind, param }
  })
}

export const serviceLinks = () => ['All pages', 'Categories', 'Wanted pages'].map(name => servicePage(`${SPECIAL_TITLE}:${name}`))

export const searchSlug = query => toSlug(`${SPECIAL_TITLE}:Search/${String(query ?? '').trim()}`)
export const backlinksSlug = page => toSlug(`${SPECIAL_TITLE}:What links here/${page.title}`)
export const categorySlug = name => toSlug(`${CATEGORY_TITLE}:${name}`)

const byTitle = (a, b) => compareText(a.title, b.title)
const byName = (a, b) => compareText(a.name, b.name)

/**
 * The links and categories of all the pages (utils/wikiPages.js index):
 * { linksTo(page) → pages that link to it, wanted → [{ name, slug, from }]
 * (links to pages nobody wrote, the most wanted first), wantedFrom(name),
 * categories → [{ name, slug, pages }], category(name), categoriesOf(page) }.
 */
export function buildWikiGraph(index) {
  const pages = index?.pages ?? []
  const incoming = new Map()
  const wanted = new Map()
  const categories = new Map()
  const ownCategories = new Map()

  for (const page of pages) {
    forEachInline(page.doc?.blocks, node => {
      if (node.type !== 'link' || node.page === undefined) return
      if (node.missing) {
        const key = pageKey(node.page)
        if (!wanted.has(key)) wanted.set(key, { name: node.page.replace(/_/g, ' ').trim(), slug: toSlug(node.page), from: new Set() })
        wanted.get(key).from.add(page)
        return
      }
      const kind = node.action?.kind
      if (!kind || kind === 'section' || kind === 'wiki') return
      const target = index.forTarget(node.action)
      if (!target || target === page) return
      if (!incoming.has(target)) incoming.set(target, new Set())
      incoming.get(target).add(page)
    })

    const names = [...page.categories, ...(page.doc?.categories ?? []), kindCategory(page.tag)].filter(Boolean)
    const own = []
    for (const name of names) {
      const key = pageKey(name)
      if (own.some(item => pageKey(item.name) === key)) continue
      if (!categories.has(key)) categories.set(key, { name, slug: categorySlug(name), pages: [] })
      const category = categories.get(key)
      category.pages.push(page)
      own.push(category)
    }
    ownCategories.set(page, own)
  }

  for (const category of categories.values()) category.pages.sort(byTitle)
  const wantedList = [...wanted.values()]
    .map(item => ({ ...item, from: [...item.from].sort(byTitle) }))
    .sort((a, b) => b.from.length - a.from.length || byName(a, b))

  return {
    linksTo: page => [...(incoming.get(page) ?? [])].sort(byTitle),
    wanted: wantedList,
    wantedFrom: name => wantedList.find(item => pageKey(item.name) === pageKey(name))?.from ?? [],
    categories: [...categories.values()].sort(byName),
    category: name => categories.get(pageKey(name)) ?? null,
    categoriesOf: page => ownCategories.get(page) ?? []
  }
}

export const foldText = text => String(text ?? '').toLowerCase()
const wordsOf = query => foldText(query).split(/[\s_]+/).filter(Boolean)

const texts = new WeakMap()
function textOf(page) {
  if (!texts.has(page)) {
    const text = docText(page.doc)
    texts.set(page, { text, folded: foldText(text) })
  }
  return texts.get(page)
}

const SNIPPET_BEFORE = 50
const SNIPPET_AFTER = 110

// [{ text, hit }]: the text around the first word found, with the words marked.
function snippetOf({ text, folded }, words) {
  const first = Math.min(...words.map(word => folded.indexOf(word)).filter(at => at >= 0))
  let start = Math.max(0, first - SNIPPET_BEFORE)
  let end = Math.min(text.length, first + SNIPPET_AFTER)
  const before = text.indexOf(' ', start)
  if (start > 0 && before >= 0 && before < first) start = before + 1
  const after = text.lastIndexOf(' ', end)
  if (end < text.length && after > first) end = after
  const piece = text.slice(start, end).replace(/\s+/g, ' ')
  const foldedPiece = foldText(piece)
  const parts = []
  let at = 0
  while (at < piece.length) {
    const next = words
      .map(word => ({ word, index: foldedPiece.indexOf(word, at) }))
      .filter(item => item.index >= 0)
      .sort((a, b) => a.index - b.index || b.word.length - a.word.length)[0]
    if (!next) {
      parts.push({ text: piece.slice(at), hit: false })
      break
    }
    if (next.index > at) parts.push({ text: piece.slice(at, next.index), hit: false })
    parts.push({ text: piece.slice(next.index, next.index + next.word.length), hit: true })
    at = next.index + next.word.length
  }
  if (start > 0) parts.unshift({ text: '…', hit: false })
  if (end < text.length) parts.push({ text: '…', hit: false })
  return parts
}

const countOf = (folded, word) => folded.split(word).length - 1

/**
 * Every word must be found, whatever the case. → { exact (the page of this name or an alias),
 * titles (found in the name), text: [{ page, count, snippet }] (found in the text only, most mentions first) }.
 */
export function searchWiki(index, query) {
  const words = wordsOf(query)
  const empty = { exact: null, titles: [], text: [] }
  if (!index || !words.length) return empty
  const exact = index.get(query) ?? index.find(query) ?? null
  const titles = []
  const text = []
  for (const page of index.pages) {
    const names = foldText([page.title, ...page.aliases].join('\n'))
    if (words.every(word => names.includes(word))) {
      titles.push(page)
      continue
    }
    const content = textOf(page)
    const all = `${names}\n${content.folded}`
    if (!words.every(word => all.includes(word))) continue
    const found = words.filter(word => content.folded.includes(word))
    text.push({
      page,
      count: words.reduce((sum, word) => sum + countOf(content.folded, word), 0),
      snippet: found.length ? snippetOf(content, found) : []
    })
  }
  const start = page => (foldText(page.title).startsWith(words[0]) ? 0 : 1)
  titles.sort((a, b) => (a === exact ? -1 : b === exact ? 1 : 0) || start(a) - start(b) || byTitle(a, b))
  text.sort((a, b) => b.count - a.count || byTitle(a.page, b.page))
  return { exact, titles, text }
}

/** Names that begin with the query, then ones that contain it: [{ page, alias }] (alias: the other name that matched). */
export function suggestPages(index, query, limit = 8) {
  const wanted = foldText(query).trim().replace(/_/g, ' ')
  if (!index || !wanted) return []
  const found = []
  for (const page of index.pages) {
    const names = [page.title, ...page.aliases]
    const starts = names.find(name => foldText(name).startsWith(wanted))
    const contains = starts ?? names.find(name => foldText(name).includes(wanted))
    if (!contains) continue
    found.push({ page, alias: contains === page.title ? null : contains, rank: starts ? 0 : 1 })
  }
  return found
    .sort((a, b) => a.rank - b.rank || byTitle(a.page, b.page))
    .slice(0, limit)
    .map(({ page, alias }) => ({ page, alias }))
}

const RANDOM_KINDS = new Set(['article', 'world', 'star', 'planet', 'satellite'])

export function randomPage(index, current = null, random = Math.random) {
  const pool = (index?.pages ?? []).filter(page => RANDOM_KINDS.has(page.kind) && page !== current)
  return pool.length ? pool[Math.floor(random() * pool.length)] : current
}
