import { textNode } from './inline'
import { safeColor } from './sanitize'
import { t } from '../../i18n'

// Own keys only, so {{constructor}} or color=toString never reaches Object.prototype.
const own = (table, key) => (Object.hasOwn(table, key) ? table[key] : undefined)

const HATNOTES = {
  main: 'main',
  'main article': 'main',
  'see also': 'see-also',
  further: 'further',
  details: 'further'
}
// i18n keys, plural by the number of links.
const HATNOTE_WORDS = {
  main: 'templates.main',
  'see-also': 'templates.seeAlso',
  further: 'templates.further'
}

// Notice kind → i18n keys of its title and of its default text.
const NOTICE_KINDS = {
  stub: { title: 'templates.stub', text: 'templates.stubText' },
  warning: { title: 'templates.warning', text: null },
  notice: { title: 'templates.notice', text: null }
}
const NOTICES = {
  stub: 'stub',
  warning: 'warning',
  caution: 'warning',
  notice: 'notice',
  note: 'notice',
  info: 'notice'
}

// Counted only when the page is shown (RichText reads the index). Name (lower case) → what it counts.
export const MAGIC_WORDS = {
  numberofpages: 'pages',
  numberofarticles: 'articles',
  numberofplaces: 'places',
  numberofsystems: 'systems',
  sitename: 'sitename'
}
export const magicWord = name => own(MAGIC_WORDS, templateKey(name).replace(/\s+/g, '')) ?? null

// Also read by the main page form (editor/pageLayout.js).
export const BANNERS = new Set(['banner'])
export const BOXES = new Set(['box', 'portal box'])
export const LINK_ROWS = new Set(['links'])
const CENTERS = new Set(['center', 'centre'])
export const PORTALS = new Set(['archive sections', 'portal sections', 'portal'])

export const LOGO_STYLE_NAMES = {
  steel: 'steel',
  sunset: 'sunset',
  phosphor: 'phosphor',
  amber: 'amber',
  ice: 'ice',
  plasma: 'plasma',
  gold: 'gold'
}
export const LOGO_FONTS = ['tiny5', 'press']
export const DEFAULT_LOGO_SCALE = 8
export const MAX_LOGO_SCALE = 12
export const BANNER_FRAMES = ['double', 'single', 'none']
export const LOGO_ANIMATIONS = ['none', 'bounce', 'wave', 'float', 'shine', 'flicker']

// Any other value must be a #hex colour.
export const BOX_COLORS = {
  green: '#2f8f46',
  blue: '#2f62c8',
  red: '#b8352b',
  purple: '#7c52c4',
  yellow: '#b8901c',
  cyan: '#2a93ad',
  orange: '#c8641e',
  grey: '#5a5a5a', gray: '#5a5a5a'
}
export const DEFAULT_BOX_COLOR = BOX_COLORS.grey

const FILE_PREFIX = /^(?:file|image)\s*:/i
const YES = new Set(['yes', 'true', '1', 'on'])
const NO = new Set(['no', 'false', '0', 'off'])

const pick = (named, ...keys) => {
  for (const key of keys) if (named.get(key)) return named.get(key)
  return null
}

function boxColor(value) {
  if (!value) return DEFAULT_BOX_COLOR
  return own(BOX_COLORS, templateKey(value)) ?? (safeColor(value) && value.startsWith('#') ? value : DEFAULT_BOX_COLOR)
}

// 'File:logo.png', '[[File:logo.png]]' or 'logo.png' → { file, alt }.
function imageOf(value) {
  const file = String(value ?? '').trim().replace(/^\[\[|\]\]$/g, '').split('|')[0].replace(FILE_PREFIX, '').trim()
  return file ? { file, alt: file } : null
}

function inlineOf(text, parseText) {
  if (!text) return []
  const blocks = parseText(text)
  return blocks.flatMap(block => (block.type === 'paragraph' || block.type === 'heading' ? block.children : []))
}

function bannerBlock(values, named, parseText) {
  const title = pick(named, 'title', 'name') ?? values[0] ?? null
  const image = imageOf(pick(named, 'logo', 'image'))
  const colors = (pick(named, 'colors', 'colours') ?? '')
    .split(',').map(color => color.trim()).filter(color => safeColor(color) && color.startsWith('#'))
  const shadow = pick(named, 'shadow')
  const font = templateKey(pick(named, 'font') ?? '')
  const scale = parseInt(pick(named, 'scale') ?? '', 10)
  const outline = pick(named, 'outline')
  const animation = templateKey(pick(named, 'animation') ?? '')
  const frame = templateKey(pick(named, 'frame') ?? '')
  return {
    type: 'banner',
    image,
    logo: !image && title
      ? {
          text: title,
          style: own(LOGO_STYLE_NAMES, templateKey(pick(named, 'style') ?? '')) ?? 'steel',
          colors: colors.length ? colors : null,
          outline: outline && safeColor(outline) && outline.startsWith('#') ? outline : null,
          shadow: shadow ? !NO.has(templateKey(shadow)) : true,
          font: LOGO_FONTS.includes(font) ? font : 'tiny5',
          scale: Number.isFinite(scale) ? Math.min(MAX_LOGO_SCALE, Math.max(1, scale)) : DEFAULT_LOGO_SCALE,
          animation: LOGO_ANIMATIONS.includes(animation) ? animation : 'none'
        }
      : null,
    frame: BANNER_FRAMES.includes(frame) ? frame : 'double',
    caption: inlineOf(pick(named, 'caption', 'subtitle'), parseText),
    blocks: parseText(pick(named, 'text') ?? values[1] ?? '')
  }
}

function boxBlock(values, named, parseText) {
  const title = pick(named, 'title') ?? values[0] ?? ''
  // The text may hold '|' of its own (a table): the rest of the values is the text.
  const text = pick(named, 'text') ?? values.slice(named.has('title') ? 0 : 1).join('|')
  const link = pick(named, 'link')
  let heading = inlineOf(title, parseText)
  if (link) {
    const target = link.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim()
    const hash = target.indexOf('#')
    const node = { type: 'link', page: (hash < 0 ? target : target.slice(0, hash)).trim(), children: heading.length ? heading : [textNode(target)] }
    if (hash >= 0) node.section = target.slice(hash + 1).trim()
    heading = [node]
  }
  const wide = pick(named, 'wide')
  return {
    type: 'box',
    title: heading,
    color: boxColor(pick(named, 'color', 'colour')),
    icon: pick(named, 'icon') ? templateKey(pick(named, 'icon')) : null,
    wide: wide ? YES.has(templateKey(wide)) : false,
    blocks: parseText(text)
  }
}

// A page the author laid out: the main page then gets no portal of its own.
const LAYOUT_BLOCKS = new Set(['banner', 'box', 'portal'])
export const hasPageLayout = doc => (doc?.blocks ?? []).some(block => LAYOUT_BLOCKS.has(block.type))

export function layoutTemplateBlock(name, params, parseText) {
  const key = templateKey(name)
  const values = params.filter(param => param.key === null).map(param => param.value.trim())
  const named = new Map(params.filter(param => param.key !== null).map(param => [templateKey(param.key), param.value.trim()]))
  if (BANNERS.has(key)) return bannerBlock(values, named, parseText)
  if (BOXES.has(key)) return boxBlock(values, named, parseText)
  if (LINK_ROWS.has(key)) {
    const items = values.map(value => inlineOf(value, parseText)).filter(item => item.length)
    return items.length ? { type: 'links', items } : null
  }
  if (CENTERS.has(key)) return { type: 'center', blocks: parseText(pick(named, 'text') ?? values.join('|')) }
  if (PORTALS.has(key)) return { type: 'portal' }
  return null
}

// Where <ref> notes go.
const REFERENCE_LISTS = new Set(['reflist', 'references', 'notes'])

export const templateKey = name => String(name ?? '').trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase()

export const isReferenceList = key => REFERENCE_LISTS.has(key)

function hatnoteLink(target, label) {
  const hash = target.indexOf('#')
  const page = (hash < 0 ? target : target.slice(0, hash)).replace(/_/g, ' ').trim()
  const section = hash < 0 ? '' : target.slice(hash + 1).replace(/_/g, ' ').trim()
  if (!page && !section) return null
  const shown = label || [page, section].filter(Boolean).join(' § ')
  const node = { type: 'link', page, children: [textNode(shown)] }
  if (section) node.section = section
  return node
}

// params: [{ key (null if positional), value }] as written; parseText(text) → blocks in the article's markup.
// Returns a hatnote, a notice, a layout block, or null.
export function sharedTemplateBlock(name, params, parseText) {
  const key = templateKey(name)
  const values = params.filter(param => param.key === null).map(param => param.value.trim())
  const named = new Map(params.filter(param => param.key !== null).map(param => [templateKey(param.key), param.value.trim()]))

  const hatnote = own(HATNOTES, key)
  if (hatnote) {
    // {{Main|A|B|l1=label}}: 'Main articles: A and B'.
    const links = values
      .map((value, index) => hatnoteLink(value, named.get(`l${index + 1}`)))
      .filter(Boolean)
    if (!links.length) return null
    const children = [textNode(`${t(HATNOTE_WORDS[hatnote], { count: links.length })}: `)]
    links.forEach((link, index) => {
      if (index) children.push(textNode(index === links.length - 1 ? t('templates.and') : ', '))
      children.push(link)
    })
    return { type: 'hatnote', kind: hatnote, children }
  }

  const notice = own(NOTICES, key)
  if (notice) {
    const { title, text: fallback } = NOTICE_KINDS[notice]
    const text = values[0] || named.get('text') || (fallback ? t(fallback) : '')
    return { type: 'notice', kind: notice, title: t(title), blocks: text ? parseText(text) : [] }
  }
  return layoutTemplateBlock(name, params, parseText)
}
