// The main page's wikitext as blocks: layout templates on a line of their own are cards,
// the rest is raw text. Joined, the blocks give the text back byte for byte; only a changed card is rewritten.

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

function readTemplate(raw) {
  const [name, ...parts] = splitTopLevel(raw.slice(2, -2), '|')
  const params = parts.map(part => {
    const named = NAMED.exec(part)
    return named ? { key: named[1].trim(), value: named[2] } : { key: null, value: part }
  })
  return { name: name.trim(), params }
}

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
const BANNER_KEYS = new Set(BANNER_FIELDS.flatMap(([, keys]) => keys))

export function bannerFields(segment) {
  const values = positional(segment)
  const fields = {}
  for (const [field, keys] of BANNER_FIELDS) fields[field] = unescapePipes(named(segment, keys)?.value.trim() ?? '')
  if (!fields.title && values[0]) fields.title = values[0].trim()
  if (!fields.text && values[1]) fields.text = values[1].trim()
  return fields
}

export function setBannerField(segment, field, value) {
  const fields = { ...bannerFields(segment), [field]: String(value ?? '').trim() }
  // Params the form does not know are kept, after the known ones.
  const others = segment.params.filter(param => param.key !== null && !BANNER_KEYS.has(templateKey(param.key)))
  const params = [
    ...BANNER_FIELDS.filter(([name]) => fields[name]).map(([name]) => ({ key: name, value: fields[name] })),
    ...others.map(param => ({ key: param.key, value: param.value.trim() }))
  ]
  const lines = params.map(param => `\n|${param.key} = ${escapePipes(param.value)}`)
  return { ...segment, params, raw: `{{${segment.name}${lines.join('')}\n}}` }
}

const BOX_KEYS = new Set(['title', 'text', 'link', 'color', 'colour', 'icon', 'wide'])

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

export function setBoxField(segment, field, value) {
  const fields = { ...boxFields(segment), [field]: typeof value === 'boolean' ? value : String(value ?? '').trim() }
  const others = segment.params.filter(param => param.key !== null && !BOX_KEYS.has(templateKey(param.key)))
  const parts = []
  // A title containing '=' would parse as a named parameter, so it is named.
  if (fields.title.includes('=')) parts.push(`title=${escapePipes(fields.title)}`)
  else parts.push(escapePipes(fields.title))
  for (const key of ['color', 'icon', 'link']) if (fields[key]) parts.push(`${key}=${fields[key]}`)
  if (fields.wide) parts.push('wide=yes')
  for (const param of others) parts.push(`${param.key}=${param.value.trim()}`)
  // The text goes last, on its own lines; its '|' stays (tables). Text that reads as
  // "name=…" is named.
  const body = fields.text ? `\n${fields.text}\n` : ''
  if (NAMED.test(body)) parts.push(`text=${body}`)
  else parts.push(body)
  const raw = `{{${segment.name}|${parts.join('|')}}}`
  return { ...segment, ...readTemplate(raw), name: segment.name, raw }
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

export function setLinkItems(segment, items) {
  const parts = items.map(linkText).filter(Boolean)
  const raw = `{{${segment.name}${parts.map(part => `|${part}`).join('')}}}`
  return { ...segment, ...readTemplate(raw), name: segment.name, raw }
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
