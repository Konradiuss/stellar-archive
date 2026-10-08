// The main page's wikitext as blocks: layout templates on a line of their own are cards,
// the rest is raw text. Joined, the blocks give the text back byte for byte. A change to a card
// rewrites only the parameter changed, in its place and spacing: what the form does not know stays.

import { findClosing, splitTopLevel } from '../utils/richText/inline'
import { BANNERS, BOXES, LINK_ROWS, PORTALS, templateKey } from '../utils/richText/templates'

// Comments, <nowiki> and <pre>: not read as wikitext.
const QUIET = /<!--[\s\S]*?(?:-->|$)|<nowiki\b[^>]*>[\s\S]*?(?:<\/nowiki>|$)|<pre\b[^>]*>[\s\S]*?(?:<\/pre>|$)/gi
// Must match how the wikitext parser tells a named parameter.
const NAMED = /^\s*([^=[\]{}]+?)\s*=([\s\S]*)$/

const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)

const KINDS = [[BANNERS, 'banner'], [BOXES, 'box'], [LINK_ROWS, 'links'], [PORTALS, 'portal']]
const kindOf = name => KINDS.find(([names]) => names.has(templateKey(name)))?.[1] ?? null

// Each param keeps its text as written (`raw`), so the template can be put back together around a change.
function readTemplate(raw) {
  const [name, ...parts] = splitTopLevel(raw.slice(2, -2), '|')
  const params = parts.map(part => {
    const named = NAMED.exec(part)
    return named ? { key: named[1].trim(), value: named[2], raw: part } : { key: null, value: part, raw: part }
  })
  return { name: name.trim(), nameRaw: name, params }
}

function withParams(segment, params) {
  const raw = `{{${segment.nameRaw ?? segment.name}${params.map(param => `|${param.raw}`).join('')}}}`
  return { ...segment, ...readTemplate(raw), raw }
}

// The new value where the old one was, with the old one's spacing around it.
function withValue(param, value) {
  const lead = /^\s*/.exec(param.value)[0]
  const trail = /\s*$/.exec(param.value)[0]
  const head = param.raw.slice(0, param.raw.length - param.value.length)
  const spaced = `${lead}${value}${trail}`
  return { ...param, value: spaced, raw: `${head}${spaced}` }
}

// Written as the named params there are: one a line ("|key = value") or all on one line ("|key=value").
function newParam(params, key, value) {
  const last = params.filter(param => param.key !== null).at(-1)
  const multiline = last ? /\n\s*$/.test(last.raw) : false
  return multiline ? { key, value: ` ${value}\n`, raw: `${key} = ${value}\n` } : { key, value, raw: `${key}=${value}` }
}

/**
 * Sets the first param named by one of `keys` ('' removes it). A new one goes after the last param
 * that comes before it in the template's order: `rankOf(param, index)` gives a param's place in it, -1 for none.
 */
function setNamed(params, keys, value, rankOf, rank) {
  const wanted = keys.map(templateKey)
  const index = params.findIndex(param => param.key !== null && wanted.includes(templateKey(param.key)))
  const list = [...params]
  if (!String(value ?? '').trim()) {
    if (index >= 0) list.splice(index, 1)
    return list
  }
  if (index >= 0) {
    list[index] = withValue(list[index], value)
    return list
  }
  let at = 0
  list.forEach((param, place) => {
    const own = rankOf(param, place)
    if (own >= 0 && own < rank) at = place + 1
  })
  list.splice(at, 0, newParam(list, keys[0], value))
  return list
}

// A param's place in an order of [field, names] (-1 when the order has not its name).
const rankIn = order => param => (param.key === null ? -1 : order.findIndex(([, names]) => names.map(templateKey).includes(templateKey(param.key))))

const positionalIndexes = params => params.flatMap((param, index) => (param.key === null ? [index] : []))

/** [{ kind: 'banner' | 'box' | 'links' | 'portal' | 'text', raw, name?, params? }] */
export function parseLayout(text) {
  const source = String(text ?? '')
  const quiet = [...source.matchAll(QUIET)].map(match => [match.index, match.index + match[0].length])
  const isQuiet = at => quiet.some(([from, to]) => at >= from && at < to)
  const segments = []
  let last = 0
  let at = source.indexOf('{{')
  while (at >= 0) {
    if (isQuiet(at)) {
      at = source.indexOf('{{', at + 2)
      continue
    }
    const close = findClosing(source, at, '{{', '}}')
    if (close < 0) break
    const raw = source.slice(at, close + 2)
    const template = readTemplate(raw)
    const kind = kindOf(template.name)
    const lineStart = /^[ \t]*$/.test(source.slice(source.lastIndexOf('\n', at - 1) + 1, at))
    if (kind && lineStart) {
      if (at > last) segments.push({ kind: 'text', raw: source.slice(last, at) })
      segments.push({ kind, raw, ...template })
      last = close + 2
    }
    at = source.indexOf('{{', close + 2)
  }
  if (last < source.length) segments.push({ kind: 'text', raw: source.slice(last) })
  return segments
}

export function readPage(text) {
  const source = String(text ?? '')
  return { eol: source.includes(CRLF) ? CRLF : LF, segments: parseLayout(source.replaceAll(CRLF, LF)) }
}

export const writePage = (segments, eol = LF) => (eol === LF ? serializeLayout(segments) : serializeLayout(segments).replaceAll(LF, eol))

export function serializeLayout(segments) {
  let text = ''
  for (const segment of segments) {
    if (segment.kind !== 'text' && text && !text.endsWith('\n')) text += '\n'
    text += segment.raw
  }
  return text
}

export const isGap = segment => segment.kind === 'text' && !segment.raw.trim()

const named = (segment, keys) => {
  const wanted = keys.map(templateKey)
  return segment.params.find(param => param.key !== null && wanted.includes(templateKey(param.key)) && param.value.trim()) ?? null
}
const positional = segment => segment.params.filter(param => param.key === null).map(param => param.value)

// An author's '|' outside [[…]] and {{…}} would end the parameter: {{!}} escapes it.
export function escapePipes(value) {
  const parts = splitTopLevel(String(value ?? ''), '|')
  return parts.join('{{!}}')
}
const unescapePipes = value => value.replace(/\{\{\s*!\s*\}\}/g, '|')

// [field, names it is read by], in write order.
const BANNER_FIELDS = [
  ['title', ['title', 'name']],
  ['logo', ['logo', 'image']],
  ['style', ['style']],
  ['colors', ['colors', 'colours']],
  ['outline', ['outline']],
  ['shadow', ['shadow']],
  ['font', ['font']],
  ['scale', ['scale']],
  ['animation', ['animation']],
  ['frame', ['frame']],
  ['caption', ['caption', 'subtitle']],
  ['text', ['text']]
]

export function bannerFields(segment) {
  const values = positional(segment)
  const fields = {}
  for (const [field, keys] of BANNER_FIELDS) fields[field] = unescapePipes(named(segment, keys)?.value.trim() ?? '')
  if (!fields.title && values[0]) fields.title = values[0].trim()
  if (!fields.text && values[1]) fields.text = values[1].trim()
  return fields
}

export function setBannerField(segment, field, value) {
  const keys = BANNER_FIELDS.find(([name]) => name === field)[1]
  const text = escapePipes(String(value ?? '').trim())
  const wanted = keys.map(templateKey)
  const hasNamed = segment.params.some(param => param.key !== null && wanted.includes(templateKey(param.key)))
  // The title and the text may be the first two values without a name.
  const loose = positionalIndexes(segment.params)
  const slot = { title: 0, text: 1 }[field]
  const at = slot === undefined || hasNamed ? undefined : loose[slot]
  if (at !== undefined) {
    const params = [...segment.params]
    params[at] = withValue(params[at], text)
    return withParams(segment, params)
  }
  const named = rankIn(BANNER_FIELDS)
  const rankOf = (param, index) => (param.key !== null ? named(param) : [0, BANNER_FIELDS.length - 1][loose.indexOf(index)] ?? -1)
  return withParams(segment, setNamed(segment.params, keys, text, rankOf, BANNER_FIELDS.findIndex(([name]) => name === field)))
}

export function boxFields(segment) {
  const values = positional(segment)
  const titled = named(segment, ['title'])
  const text = named(segment, ['text'])?.value ?? values.slice(titled ? 0 : 1).join('|')
  return {
    title: unescapePipes(titled?.value.trim() ?? values[0]?.trim() ?? ''),
    color: named(segment, ['color', 'colour'])?.value.trim() ?? '',
    icon: named(segment, ['icon'])?.value.trim() ?? '',
    link: named(segment, ['link'])?.value.trim() ?? '',
    wide: ['yes', 'true', '1', 'on'].includes(templateKey(named(segment, ['wide'])?.value ?? '')),
    text: text.replace(/^\n+|\s+$/g, '')
  }
}

// The order a box is written in: {{Box|title|color=…|icon=…|link=…|wide=yes|\ntext\n}}.
const BOX_FIELDS = [['title', ['title']], ['color', ['color', 'colour']], ['icon', ['icon']], ['link', ['link']], ['wide', ['wide']], ['text', ['text']]]

// The title first and the text last, either may go without a name.
export function setBoxField(segment, field, value) {
  const params = [...segment.params]
  const loose = positionalIndexes(params)
  const titled = params.some(param => param.key !== null && templateKey(param.key) === 'title')
  // The text is every value without a name after the title (a table's '|' splits it).
  const body = loose.filter(index => titled || index !== loose[0])
  const bodyAt = body[0] ?? params.length
  const named = rankIn(BOX_FIELDS)
  const rankOf = (param, index) => (param.key !== null ? named(param) : body.includes(index) ? BOX_FIELDS.length - 1 : 0)
  const set = (keys, text) => withParams(segment, setNamed(params, keys, text, rankOf, BOX_FIELDS.findIndex(([name]) => name === field)))
  if (field === 'title') {
    const title = escapePipes(String(value ?? '').trim())
    if (titled) return set(['title'], title)
    // A title containing '=' would parse as a named parameter, so it is named.
    const named = title.includes('=') ? { key: 'title', value: title, raw: `title=${title}` } : null
    if (loose.length) params[loose[0]] = named ?? withValue(params[loose[0]], title)
    else params.unshift(named ?? { key: null, value: title, raw: title })
    return withParams(segment, params)
  }
  if (field === 'text') {
    const text = String(value ?? '').replace(/^\n+|\s+$/g, '')
    if (params.some(param => param.key !== null && templateKey(param.key) === 'text')) return set(['text'], text ? `\n${text}\n` : '')
    const kept = params.filter((_, index) => !body.includes(index))
    if (text) {
      const raw = `\n${text}\n`
      // Text that reads as "name=…" is named.
      kept.splice(bodyAt - body.filter(index => index < bodyAt).length, 0, NAMED.test(raw) ? { key: 'text', value: raw, raw: `text=${raw}` } : { key: null, value: raw, raw })
    }
    return withParams(segment, kept)
  }
  if (field === 'wide') return set(['wide'], value ? 'yes' : '')
  return set(BOX_FIELDS.find(([name]) => name === field)[1], String(value ?? '').trim())
}

/** [{ kind: 'page' | 'url', target, label } | { kind: 'raw', raw }] */
export function linkItems(segment) {
  return positional(segment).map(value => value.trim()).filter(Boolean).map(raw => {
    const page = /^\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]$/.exec(raw)
    if (page) return { kind: 'page', target: page[1].trim(), label: (page[2] ?? '').trim() }
    const url = /^\[(\S+)(?:\s+([^\]]*))?\]$/.exec(raw)
    if (url) return { kind: 'url', target: url[1], label: (url[2] ?? '').trim() }
    return { kind: 'raw', raw }
  })
}

export function linkText(item) {
  if (item.kind === 'raw') return item.raw
  const target = String(item.target ?? '').trim()
  const label = String(item.label ?? '').trim()
  if (!target) return ''
  if (/^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:)/i.test(target)) return label ? `[${target} ${label}]` : `[${target}]`
  return label && label !== target ? `[[${target}|${label}]]` : `[[${target}]]`
}

// The links take the place of the old ones; named params stay where they were.
export function setLinkItems(segment, items) {
  const links = items.map(linkText).filter(Boolean).map(raw => ({ key: null, value: raw, raw }))
  const params = []
  let placed = false
  for (const param of segment.params) {
    if (param.key !== null) params.push(param)
    else if (!placed) {
      params.push(...links)
      placed = true
    }
  }
  if (!placed) params.push(...links)
  return withParams(segment, params)
}

export const textOfBlock = segment => segment.raw.replace(/^\s*\n/, '').replace(/\n\s*$/, '')

export function setBlockText(segment, value) {
  const lead = /^\s*\n/.exec(segment.raw)?.[0] ?? ''
  const trail = /\n\s*$/.exec(segment.raw)?.[0] ?? '\n'
  return { ...segment, raw: `${lead}${value}${trail}` }
}

export function newBlock(kind, { title = 'ARCHIVE' } = {}) {
  const raws = {
    banner: `{{Banner\n|title = ${title}\n|style = steel\n}}`,
    box: '{{Box|New box|color=blue|icon=book|\nThe text of the box.\n}}',
    links: '{{Links|[[Special:All pages|All pages]]}}',
    portal: '{{Archive sections}}'
  }
  if (kind === 'text') return { kind: 'text', raw: 'New text.\n' }
  return { kind, raw: raws[kind], ...readTemplate(raws[kind]) }
}

function mergeGaps(segments) {
  const result = []
  for (const segment of segments) {
    const previous = result.at(-1)
    if (previous?.kind === 'text' && segment.kind === 'text') {
      const joined = `${previous.raw}${segment.raw}`
      result[result.length - 1] = { kind: 'text', raw: joined.replace(/\n(?:[ \t]*\n){2,}/g, '\n\n') }
    } else result.push(segment)
  }
  return result
}

export function appendBlock(segments, block) {
  const list = [...segments]
  const last = list.at(-1)
  if (last && !last.raw.endsWith('\n')) list.push({ kind: 'text', raw: '\n' })
  list.push(block)
  if (block.kind !== 'text') list.push({ kind: 'text', raw: '\n' })
  return mergeGaps(list)
}

export const replaceBlock = (segments, index, block) => segments.map((segment, at) => (at === index ? block : segment))

export function moveBlock(segments, index, step) {
  let other = index + step
  while (other >= 0 && other < segments.length && isGap(segments[other])) other += step
  if (other < 0 || other >= segments.length) return segments
  const list = [...segments]
  ;[list[index], list[other]] = [list[other], list[index]]
  // A text moved before a card must end its line, so the card still starts one.
  return list.map((segment, at) => (segment.kind === 'text' && list[at + 1] && list[at + 1].kind !== 'text' && !segment.raw.endsWith('\n') ? { ...segment, raw: `${segment.raw}\n` } : segment))
}

export function removeBlock(segments, index) {
  return mergeGaps(segments.filter((_, at) => at !== index))
}
