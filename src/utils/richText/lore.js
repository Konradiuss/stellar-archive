import { markRaw } from 'vue'
import { parseMarkdown } from './markdownParser'
import { parseWikitext } from './wikitextParser'
import { safeImageSrc } from './sanitize'
import { textNode } from './inline'
import { WORLD_PAGE_ALIAS, isServiceName, toSlug, worldPageTitle } from '../wikiPages'
import { createPlaceFinder } from '../placeFinder'
import { t } from '../../i18n'
import { warnMap } from '../mapJournal'
import { noteFileSource } from '../fileSources'

export const LORE_FORMATS = ['wikitext', 'markdown']

export const DEFAULT_LORE_CONFIG = Object.freeze({
  format: 'wikitext',
  // Folder of [[File:…]] images, relative to the map file.
  images: 'lore/images/',
  // Base of a server wiki: unresolved page links go there, [[File:…]] images come from its Special:FilePath.
  wikiUrl: null
})

const MARKDOWN_EXTENSION = /\.(?:md|markdown)$/i
const WIKI_EXTENSION = /\.(?:wiki|wikitext|mediawiki|txt)$/i

export function normalizeLoreConfig(raw = {}) {
  const config = { ...DEFAULT_LORE_CONFIG }
  if (LORE_FORMATS.includes(raw?.format)) config.format = raw.format
  if (typeof raw?.images === 'string' && raw.images.trim()) {
    config.images = raw.images.trim().replace(/\/?$/, '/')
  }
  if (typeof raw?.wikiUrl === 'string' && /^https?:\/\//i.test(raw.wikiUrl.trim())) {
    // Page names are appended directly: add a "/" unless it ends in "/" or "title=".
    const url = raw.wikiUrl.trim()
    config.wikiUrl = /[/=]$/.test(url) ? url : `${url}/`
  }
  return config
}

export function detectLoreFormat({ loreFormat, loreFile } = {}, config = DEFAULT_LORE_CONFIG) {
  if (LORE_FORMATS.includes(loreFormat)) return loreFormat
  if (typeof loreFile === 'string') {
    if (MARKDOWN_EXTENSION.test(loreFile)) return 'markdown'
    if (WIKI_EXTENSION.test(loreFile)) return 'wikitext'
  }
  return config.format
}

export function parseLore(text, format = 'wikitext') {
  return format === 'markdown' ? parseMarkdown(text) : parseWikitext(text)
}

export function textDocument(text) {
  return markRaw({ blocks: [{ type: 'paragraph', children: [textNode(text)] }] })
}

const normalizeName = name => String(name ?? '').trim().replace(/_/g, ' ').toLowerCase()

// [[Name]] resolves to a place of the map first (utils/placeFinder.js), then a wiki page.
// wikiPages: [{ names: [title, ...aliases], target: { kind: 'article', title } | { kind: 'world' } }]
export function createPageFinder(stars = [], systems = {}, wikiPages = []) {
  const findPlace = createPlaceFinder(stars, systems)
  const pagesByName = new Map()
  for (const { names, target } of wikiPages) {
    for (const name of names) {
      const key = normalizeName(name)
      if (key && !pagesByName.has(key)) pagesByName.set(key, target)
    }
  }

  return function findPage(name, contextStarId = null) {
    const place = findPlace(name, contextStarId)
    if (place) return place
    const key = normalizeName(name)
    return key && pagesByName.has(key) ? { ...pagesByName.get(key) } : null
  }
}

const wikiPath = name => encodeURIComponent(name.trim().replace(/ /g, '_')).replace(/%2F/gi, '/').replace(/%3A/gi, ':')

function resolveImage(image, { config, baseUrl }) {
  let source = null
  if (image.file) {
    source = config.wikiUrl
      ? `${config.wikiUrl}Special:FilePath/${wikiPath(image.file)}`
      : `${config.images}${wikiPath(image.file)}`
  } else if (image.url) {
    source = image.url
  }
  const safe = safeImageSrc(source)
  image.src = safe ? resolveUrl(safe, baseUrl) : null
  if (image.src) noteFileSource(image.src, baseUrl, { what: 'picture' })
}

// An unreadable address ("https://", a port past 65535) must not stop the whole map from loading.
function resolveUrl(path, baseUrl) {
  try {
    return new URL(path, baseUrl).href
  } catch {
    warnMap(`picture "${path}"`, 'Is not an address a browser can read: left out.')
    return null
  }
}

function resolveInline(children, options) {
  for (const node of children ?? []) {
    if (node.type === 'image' || node.type === 'figure') resolveImage(node.image, options)
    if (node.type === 'figure') resolveInline(node.caption, options)
    // [[File:…|link=Page]]: the picture links to the page.
    if (node.link) resolveInline([node.link], options)
    if (node.type === 'link' && node.page !== undefined) {
      if (!node.page && node.section) {
        // [[#Section]]: a section of the current page.
        node.action = { kind: 'section', section: node.section }
      } else if (isServiceName(node.page)) {
        // [[:Category:…]], [[Special:…]]: pages the wiki generates itself.
        node.action = { kind: 'wiki', slug: toSlug(node.page) }
      } else {
        let action = options.findPage?.(node.page, options.contextStarId) ?? null
        // Reached by an alias: shown as "redirected from".
        if (action?.kind === 'article' && normalizeName(action.title) !== normalizeName(node.page)) action = { ...action, via: node.page }
        // The section rides along; the map has no sections and ignores it.
        if (action) node.action = node.section ? { ...action, section: node.section } : action
        else if (options.config.wikiUrl) node.href = `${options.config.wikiUrl}${wikiPath(node.page)}${node.section ? `#${wikiPath(node.section)}` : ''}`
        else node.missing = true
      }
    }
    resolveInline(node.children, options)
  }
}

function resolveBlocks(blocks, options) {
  for (const block of blocks ?? []) {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
      case 'hatnote':
        resolveInline(block.children, options)
        break
      case 'notice':
        resolveBlocks(block.blocks, options)
        break
      case 'references':
        for (const note of block.notes) resolveInline(note.children, options)
        break
      case 'gallery':
        for (const item of block.items) {
          resolveImage(item.image, options)
          resolveInline(item.caption, options)
          if (item.link) resolveInline([item.link], options)
        }
        break
      case 'figure':
        resolveImage(block.image, options)
        resolveInline(block.caption, options)
        if (block.link) resolveInline([block.link], options)
        break
      case 'banner':
        if (block.image) resolveImage(block.image, options)
        resolveInline(block.caption, options)
        resolveBlocks(block.blocks, options)
        break
      case 'box':
        resolveInline(block.title, options)
        resolveBlocks(block.blocks, options)
        break
      case 'center':
        resolveBlocks(block.blocks, options)
        break
      case 'links':
        for (const item of block.items) resolveInline(item, options)
        break
      case 'quote':
        resolveBlocks(block.blocks, options)
        break
      case 'list':
      case 'definitions':
        for (const item of block.items) {
          resolveInline(item.children, options)
          resolveBlocks(item.blocks, options)
        }
        break
      case 'table':
        resolveInline(block.caption, options)
        for (const row of block.rows) for (const cell of row.cells) resolveBlocks(cell.blocks, options)
        break
      case 'infobox':
        for (const param of block.params) resolveInline(param.children, options)
        break
    }
  }
}

/** options: { config, baseUrl, findPage, contextStarId }. Fills image src and link targets in place. */
export function resolveLoreDocument(doc, options) {
  resolveBlocks(doc.blocks, { config: DEFAULT_LORE_CONFIG, ...options })
  return doc
}

export function loreEntries(data) {
  const entries = [
    { owner: data, field: 'worldLoreDoc', text: data.worldLore, file: data.worldLoreFile, format: data.worldLoreFormat, starId: null },
    { owner: data, field: 'legendDoc', text: data.legend, file: data.legendFile, format: data.legendFormat, starId: null }
  ]
  for (const star of data.stars ?? []) {
    entries.push({ owner: star, field: 'loreDoc', text: star.lore, file: star.loreFile, format: star.loreFormat, starId: star.id })
  }
  for (const article of Array.isArray(data.wiki?.articles) ? data.wiki.articles : []) {
    if (!article || typeof article !== 'object') continue
    entries.push({ owner: article, field: 'loreDoc', text: article.text, file: article.file, format: article.format, starId: null })
  }
  for (const [starId, system] of Object.entries(data.systems ?? {})) {
    if (system) entries.push({ owner: system, field: 'legendDoc', text: system.legend, file: system.legendFile, format: system.legendFormat, starId })
    for (const planet of system?.planets ?? []) {
      entries.push({ owner: planet, field: 'loreDoc', text: planet.lore, file: planet.loreFile, format: planet.loreFormat, starId })
      for (const satellite of Array.isArray(planet?.satellites) ? planet.satellites : []) {
        if (!satellite || typeof satellite !== 'object') continue
        entries.push({ owner: satellite, field: 'loreDoc', text: satellite.lore, file: satellite.loreFile, format: satellite.loreFormat, starId })
      }
    }
  }
  return entries
}

export function wikiLinkTargets(data) {
  const targets = []
  if (data.worldLore || data.worldLoreFile) targets.push({ names: [worldPageTitle(), WORLD_PAGE_ALIAS], target: { kind: 'world' } })
  for (const article of Array.isArray(data.wiki?.articles) ? data.wiki.articles : []) {
    if (!article?.title) continue
    targets.push({ names: [article.title, ...(article.aliases ?? [])], target: { kind: 'article', title: article.title } })
  }
  return targets
}

/** Attaches a parsed document (or null) to every lore owner's *Doc field. fetchText(url) resolves to the file text. */
export async function prepareLore(data, { baseUrl, fetchText }) {
  const config = normalizeLoreConfig(data.loreConfig)
  const findPage = createPageFinder(data.stars, data.systems, wikiLinkTargets(data))
  const entries = loreEntries(data)

  const files = new Map()
  const paths = [...new Set(entries.map(entry => entry.file).filter(file => typeof file === 'string' && file.trim()))]
  await Promise.all(paths.map(async path => {
    try {
      files.set(path, await fetchText(new URL(path, baseUrl).href))
    } catch (error) {
      warnMap(`file "${path}"`, `Cannot be loaded (${error?.message ?? error}): "ARCHIVE CORRUPTED" is shown instead.`)
      files.set(path, null)
    }
  }))

  for (const entry of entries) {
    // A text the parser cannot read breaks only its own page, not the map.
    try {
      entry.owner[entry.field] = loreDocument(entry, files, { config, baseUrl, findPage })
    } catch (error) {
      const name = entry.file ?? entryName(entry)
      warnMap(entry.file ? `file "${name}"` : `lore of "${name}"`, `Cannot be read (${error?.message ?? error}): "ARCHIVE CORRUPTED" is shown instead.`)
      entry.owner[entry.field] = textDocument(t('wiki.archiveCorrupted', { file: name }))
    }
  }
  return config
}

const entryName = entry => String(entry.owner?.title ?? entry.owner?.name ?? entry.owner?.id ?? entry.field)

function loreDocument(entry, files, { config, baseUrl, findPage }) {
  const fileText = entry.file ? files.get(entry.file) : undefined
  let doc = null
  if (typeof fileText === 'string') {
    doc = parseLore(fileText, detectLoreFormat({ loreFormat: entry.format, loreFile: entry.file }, config))
  } else if (typeof entry.text === 'string' && entry.text.trim()) {
    doc = parseLore(entry.text, detectLoreFormat({ loreFormat: entry.format }, config))
  } else if (entry.file) {
    doc = textDocument(t('wiki.archiveCorrupted', { file: entry.file }))
  }
  if (!doc) return null
  resolveLoreDocument(doc, { config, baseUrl, findPage, contextStarId: entry.starId })
  return markRaw(doc)
}
