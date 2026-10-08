// MediaWiki wikitext → lore document ({ blocks }): the subset server wikis use. Plain text is valid
// wikitext, so old one-line lore stays a single paragraph.

import {
  buildInline,
  decodeEntities,
  findClosing,
  inlineToText,
  matchBareUrl,
  matchHtmlTag,
  splitTopLevel,
  textNode
} from './inline'
import { safeHref } from './sanitize'
import { isReferenceList, magicWord, sharedTemplateBlock, templateKey } from './templates'

// Protected parts of the source (templates, nowiki, pre) are swapped for
// placeholders first, so their pipes and brackets do not confuse the parser.
const SLOT_START = ''
const SLOT_END = ''
const SLOT_PATTERN = /(\d+)/g
const SLOT_ONLY = /^(\d+)$/

const FILE_NAMESPACE = /^(?:file|image)\s*:/i
// [[Category:Factions]] puts the page into a category; [[:Category:Factions]] links to it.
const CATEGORY_NAMESPACE = /^category\s*:/i
// [[de:Erde]]: a language link of a pasted page, shown nowhere. Lower case with no space after the
// colon, so [[War: Part 1]] stays a link.
const INTERWIKI = /^[a-z]{2,3}(?:-[a-z]+)?:(?!\s)/
const IMAGE_FILE = /\.(?:png|gif|jpe?g|webp|bmp|svg)$/i
const IMAGE_PARAM = /image|img|icon|sprite|picture/i

function store(context, kind, raw, content) {
  context.slots.push({ kind, raw, content })
  return `${SLOT_START}${context.slots.length - 1}${SLOT_END}`
}

const MAX_UNCLOSED_TEMPLATES = 50

// Outermost {{…}} only: parameters are protected again when the template is read, so nesting works.
function protectTemplates(text, context) {
  let result = ''
  let index = 0
  let unclosed = 0
  while (index < text.length) {
    const start = text.indexOf('{{', index)
    if (start < 0) break
    const end = findClosing(text, start, '{{', '}}')
    if (end < 0) {
      // An unclosed {{ stays text. Each one scans to the end of the text, so past the limit the rest
      // is text: a paste of many "{{" must not freeze the page.
      if (++unclosed > MAX_UNCLOSED_TEMPLATES) break
      result += text.slice(index, start + 2)
      index = start + 2
      continue
    }
    result += text.slice(index, start) + store(context, 'template', text.slice(start, end + 2), text.slice(start + 2, end))
    index = end + 2
  }
  return result + text.slice(index)
}

function protect(source, context) {
  const text = source
    // Placeholder marks typed by the author (e.g. from an icon font) would hit a wrong slot or loop forever.
    .replace(/[]/g, '�')
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<nowiki\s*>([\s\S]*?)<\/nowiki\s*>/gi, (raw, content) => store(context, 'nowiki', raw, content))
    .replace(/<nowiki\s*\/>/gi, '')
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (raw, content) => store(context, 'pre', raw, content))
    .replace(/<gallery\b([^>]*)>([\s\S]*?)<\/gallery\s*>/gi, (raw, attrs, content) => store(context, 'gallery', raw, { attrs, content }))
    // <ref name="a" /> repeats a footnote, <ref>…</ref> writes one.
    .replace(/<ref\b([^<>]*?)\/>/gi, (raw, attrs) => store(context, 'ref', raw, { attrs, text: null }))
    .replace(/<ref\b([^<>]*)>([\s\S]*?)<\/ref\s*>/gi, (raw, attrs, text) => store(context, 'ref', raw, { attrs, text }))
    .replace(/<references\b[^<>]*?(?:\/>|>[\s\S]*?<\/references\s*>)/gi, raw => store(context, 'references', raw, ''))
    .replace(/__[A-Z]+__/g, '')
  return protectTemplates(text, context)
}

function restoreRaw(text, context) {
  return text.replace(SLOT_PATTERN, (match, index) => {
    const slot = context.slots[Number(index)]
    return slot.kind === 'nowiki' ? slot.content : restoreRaw(slot.raw, context)
  })
}

function parseTemplate(content, context) {
  const [rawName, ...parts] = splitTopLevel(content, '|')
  const name = rawName.trim().replace(/^template\s*:/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ')
  const params = parts.map(part => {
    const named = /^\s*([^=[\]{}]+?)\s*=([\s\S]*)$/.exec(part)
    return named
      ? { key: named[1], value: protectTemplates(named[2].trim(), context) }
      : { key: null, value: protectTemplates(part.trim(), context) }
  })
  return { name, key: templateKey(name), params }
}

const positional = params => params.filter(param => param.key === null).map(param => param.value)

// Unknown templates leave their positional text.
function templateTokens(content, context) {
  const { key, params } = parseTemplate(content, context)
  const values = positional(params)
  // A magic word: counted when the page is shown.
  const magic = magicWord(key)
  if (magic) return [{ node: { type: 'magic', name: magic } }]
  switch (key) {
    case 'color':
    case 'colour':
    case 'font color':
      return [{ open: 'color', attrs: { color: values[0] } }, ...inlineTokensOf(values[1] ?? '', context), { close: 'color' }]
    case 'br':
      return [{ node: { type: 'break' } }]
    case '!':
      return [{ text: '|' }]
    case '=':
      return [{ text: '=' }]
    case 'clear':
      return []
    case 'nowrap':
    case 'small':
    case 'big':
      return [{ open: key }, ...inlineTokensOf(values.join(' '), context), { close: key }]
    default:
      // Parser functions ({{#if:…}}) need a real wiki behind them.
      if (key.startsWith('#') || isReferenceList(key)) return []
      return values.length ? inlineTokensOf(values.join(' '), context) : []
  }
}

const BLOCK_QUOTE_TEMPLATES = new Set(['quote', 'blockquote'])
// A template line that shows nothing: the text around goes on as if it were not there.
const NOTHING = Symbol('nothing')
const INLINE_ONLY_TEMPLATES = new Set(['color', 'colour', 'font color', 'br', '!', '=', 'clear', 'nowrap', 'small', 'big'])

// An unknown template without named data is read as its text, in the paragraph (null).
function templateBlock(content, context) {
  const { name, key, params } = parseTemplate(content, context)
  if (INLINE_ONLY_TEMPLATES.has(key) || key.startsWith('#') || magicWord(key)) return null
  if (isReferenceList(key)) return referencesBlock(context)

  const shared = sharedTemplateBlock(name, params, text => parseBlocks(text, context))
  if (shared) return shared

  if (BLOCK_QUOTE_TEMPLATES.has(key)) {
    const [text = '', author] = positional(params)
    const blocks = parseBlocks(text, context)
    if (author) blocks.push({ type: 'paragraph', children: [textNode('— '), ...parseInline(author, context)] })
    return { type: 'quote', blocks }
  }

  if (!params.some(param => param.key !== null)) return positional(params).some(value => value.trim()) ? null : NOTHING
  return {
    type: 'infobox',
    name,
    params: params
      .filter(param => param.value)
      .map(param => {
        const value = param.value.trim()
        // Infoboxes of game wikis name their sprite in a parameter.
        const isImage = param.key && IMAGE_PARAM.test(param.key) && IMAGE_FILE.test(value) && !value.includes('[[')
        return {
          key: param.key,
          children: isImage
            ? [{ type: 'image', image: { file: value.replace(FILE_NAMESPACE, '').trim(), alt: value } }]
            : parseInline(value, context)
        }
      })
  }
}

// Numbered in order of first use; a named footnote is shown once however often it is used.
function refNode({ attrs, text }, context) {
  const match = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'/>]+))/i.exec(attrs ?? '')
  const name = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim() || null
  let note = name ? context.notes.find(item => item.name === name) : null
  if (!note) {
    if (!name && !text?.trim()) return null
    note = { number: context.notes.length + 1, name, children: [] }
    context.notes.push(note)
  }
  if (text?.trim() && !note.children.length) note.children = parseInline(protectTemplates(text.trim(), context), context)
  return { type: 'ref', number: note.number }
}

// Notes go where <references /> stands; without one they close the article.
function referencesBlock(context) {
  context.referencesPlaced = true
  return { type: 'references', notes: context.notes }
}

// Shown as tiles: frameless pictures, captions under them, each linking to its page (link=).
const TILE_MODES = new Set(['tiles', 'nolines', 'packed', 'packed-hover', 'packed-overlay'])

// <gallery>: a file on each line, 'File:a.png|Caption|link=Page'.
function galleryBlock({ attrs, content }, context) {
  const attribute = name => new RegExp(`\\b${name}\\s*=\\s*["']?([^"'\\s>]+)`, 'i').exec(attrs ?? '')?.[1] ?? null
  const items = content.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [file, ...options] = splitTopLevel(protectTemplates(line, context), '|')
    if (!IMAGE_FILE.test(file.trim())) return null
    // Read as a thumbnail, so its caption is kept.
    const node = parseFileLink(file.trim(), [...options, 'thumb'], context)
    const item = { image: node.image, caption: node.caption }
    if (node.link) item.link = node.link
    return item
  }).filter(Boolean)
  if (!items.length) return null
  const block = { type: 'gallery', items }
  if (TILE_MODES.has((attribute('mode') ?? '').toLowerCase())) block.mode = 'tiles'
  const width = parseInt(attribute('widths') ?? '', 10)
  if (width > 0) block.width = width
  return block
}

// link=Page of a file; empty or an external address gives none.
function fileLinkNode(value) {
  const target = value.replace(/^\[\[|\]\]$/g, '').trim()
  if (!target || /^https?:\/\//i.test(target)) return null
  const hash = target.indexOf('#')
  const node = { type: 'link', page: (hash < 0 ? target : target.slice(0, hash)).trim(), children: [] }
  if (hash >= 0) node.section = target.slice(hash + 1).trim()
  return node
}

function parseFileLink(name, options, context) {
  const image = { file: name.replace(FILE_NAMESPACE, '').trim(), alt: '' }
  let framed = false
  let align = null
  let caption = null
  let link = null

  for (const option of options) {
    const value = option.trim()
    const lower = value.toLowerCase()
    if (['thumb', 'thumbnail', 'frame', 'framed', 'mini'].includes(lower)) framed = true
    else if (lower === 'left') align = 'left'
    else if (lower === 'right') align = 'right'
    else if (['center', 'centre'].includes(lower)) align = 'center'
    else if (['none', 'frameless', 'border', 'upright', 'baseline', 'middle', 'top', 'bottom'].includes(lower)) continue
    else if (/^(\d+)?(?:x\d+)?\s*px$/.test(lower)) {
      const width = parseInt(lower, 10)
      if (width > 0) image.width = width
    } else if (/^alt\s*=/.test(lower)) image.alt = value.replace(/^alt\s*=\s*/i, '')
    else if (/^link\s*=/.test(lower)) link = fileLinkNode(value.replace(/^[^=]*=\s*/, ''))
    else if (/^(?:class|page|lang|upright)\s*=/.test(lower)) continue
    else caption = value
  }

  const captionChildren = caption ? parseInline(caption, context) : []
  if (!image.alt) image.alt = inlineToText(captionChildren) || image.file
  if (framed || align) {
    const figure = { type: 'figure', image, align: align ?? 'right', caption: captionChildren }
    if (link) figure.link = link
    return figure
  }
  return link ? { type: 'image', image, link } : { type: 'image', image }
}

function inlineTokensOf(text, context) {
  return text.split('\n').flatMap((line, index) => (
    index ? [{ text: ' ' }, ...lineTokens(line, context)] : lineTokens(line, context)
  ))
}

export function parseInline(text, context) {
  return buildInline(inlineTokensOf(text, context))
}

// Tokens of one line. Bold and italic end with the line, as in MediaWiki.
function lineTokens(line, context) {
  const tokens = []
  let buffer = ''
  const open = { strong: false, em: false }
  const flush = () => {
    if (buffer) tokens.push({ text: decodeEntities(buffer) })
    buffer = ''
  }
  const toggle = type => {
    tokens.push(open[type] ? { close: type } : { open: type })
    open[type] = !open[type]
  }

  let index = 0
  while (index < line.length) {
    const char = line[index]

    if (char === "'" && line[index + 1] === "'") {
      let run = 0
      while (line[index + run] === "'") run++
      flush()
      if (run > 5) {
        tokens.push({ text: "'".repeat(run - 5) })
      } else if (run === 4) {
        tokens.push({ text: "'" })
      }
      const effective = run >= 5 ? 5 : run === 4 ? 3 : run
      if (effective === 2) toggle('em')
      else if (effective === 3) toggle('strong')
      else if (open.strong && open.em) {
        toggle('em')
        toggle('strong')
      } else {
        // Opens both, or closes the open one and opens the other.
        toggle('strong')
        toggle('em')
      }
      index += run
      continue
    }

    if (char === SLOT_START) {
      const end = line.indexOf(SLOT_END, index)
      const slot = context.slots[Number(line.slice(index + 1, end))]
      flush()
      if (slot.kind === 'nowiki') tokens.push({ text: decodeEntities(slot.content) })
      else if (slot.kind === 'pre') tokens.push({ open: 'code' }, { text: slot.content }, { close: 'code' })
      else if (slot.kind === 'ref') {
        const node = refNode(slot.content, context)
        if (node) tokens.push({ node })
      } else if (slot.kind === 'template') tokens.push(...templateTokens(slot.content, context))
      // A gallery or the notes in the middle of a line have no place there.
      index = end + 1
      continue
    }

    if (line.startsWith('[[', index)) {
      const end = findClosing(line, index, '[[', ']]')
      if (end > 0) {
        flush()
        const consumed = internalLinkTokens(line, index, end, context, tokens)
        index = consumed
        continue
      }
    }

    if (char === '[') {
      // Explicit brackets delimit the address: punctuation may be part of the URL.
      const url = /^(?:https?:\/\/|mailto:)[^\s<>[\]"'{}|]+/i.exec(line.slice(index + 1, index + 2001))?.[0]
      const close = url ? line.indexOf(']', index + 1 + url.length) : -1
      if (url && close > 0) {
        flush()
        const label = line.slice(index + 1 + url.length, close).trim()
        const href = safeHref(url)
        const children = label ? parseInline(label, context) : [textNode(url)]
        if (href) tokens.push({ node: { type: 'link', href, children } })
        else tokens.push(...children.map(node => ({ node })))
        index = close + 1
        continue
      }
    }

    if ((char === 'h' || char === 'm') && !/[\p{L}\p{N}]/u.test(line[index - 1] ?? '')) {
      const url = matchBareUrl(line, index)
      if (url) {
        flush()
        tokens.push({ node: { type: 'link', href: url, children: [textNode(url)] } })
        index += url.length
        continue
      }
    }

    if (char === '<') {
      const tag = matchHtmlTag(line, index)
      if (tag) {
        flush()
        tokens.push(tag.token)
        index += tag.length
        continue
      }
    }

    buffer += char
    index++
  }

  flush()
  if (open.em) tokens.push({ close: 'em' })
  if (open.strong) tokens.push({ close: 'strong' })
  return tokens
}

// [[Page]], [[Page|label]], [[Page]]s, [[File:…]]; returns the next index.
function internalLinkTokens(line, start, end, context, tokens) {
  const [rawTarget, ...rest] = splitTopLevel(line.slice(start + 2, end), '|')
  const target = rawTarget.trim()
  let next = end + 2

  if (FILE_NAMESPACE.test(target)) {
    tokens.push({ node: parseFileLink(target, rest, context) })
    return next
  }
  if (CATEGORY_NAMESPACE.test(target)) {
    const name = target.replace(CATEGORY_NAMESPACE, '').replace(/_/g, ' ').trim()
    if (name && !context.categories.includes(name)) context.categories.push(name)
    return next
  }
  if (!target.startsWith(':') && INTERWIKI.test(target) && !/^[a-z]{2,3}:\/\//.test(target)) return next

  const page = target.replace(/^:/, '')
  // [[Article#Section]]: a section of a page; [[#Section]]: of this very page.
  const hash = page.indexOf('#')
  const pageName = (hash < 0 ? page : page.slice(0, hash)).trim()
  const section = hash < 0 ? '' : page.slice(hash + 1).trim()
  // A link to its own section reads as the section name, without the '#'.
  const label = rest.length ? rest.join('|') : (pageName || section || page)
  // Letters right after the link belong to its label: [[planet]]s.
  const trail = /^[\p{L}]+/u.exec(line.slice(next))?.[0] ?? ''
  next += trail.length
  const children = [...parseInline(label || page, context)]
  if (trail) children.push(textNode(trail))
  const node = { type: 'link', page: pageName, children }
  if (section) node.section = section
  if (pageName || section) tokens.push({ node })
  return next
}

function splitCells(text, separator) {
  const cells = []
  let depth = 0
  let current = ''
  for (let index = 0; index < text.length; index++) {
    const pair = text.slice(index, index + 2)
    if (pair === '[[') depth++
    else if (pair === ']]' && depth > 0) depth--
    if (depth === 0 && text.startsWith(separator, index)) {
      cells.push(current)
      current = ''
      index += separator.length - 1
    } else {
      current += text[index]
    }
  }
  cells.push(current)
  return cells
}

function tableCell(raw, header) {
  const parts = splitTopLevel(raw, '|')
  let attributes = ''
  let content = raw
  if (parts.length > 1 && /^\s*[\w-]+\s*=/.test(parts[0])) {
    attributes = parts[0]
    content = parts.slice(1).join('|')
  }
  const colspan = parseInt(/colspan\s*=\s*["']?(\d+)/i.exec(attributes)?.[1] ?? '1', 10)
  return { header, colspan: Math.max(1, Math.min(colspan, 20)), text: content.trim() }
}

function parseTable(lines, context) {
  const table = { type: 'table', caption: null, rows: [] }
  let row = null
  let cell = null
  let nested = 0
  const newRow = () => {
    row = { cells: [] }
    table.rows.push(row)
    return row
  }

  for (const line of lines.slice(1, -1)) {
    const trimmed = line.trim()
    if (cell && (nested > 0 || trimmed.startsWith('{|'))) {
      if (trimmed.startsWith('{|')) nested++
      if (trimmed.startsWith('|}')) nested--
      cell.text += `\n${line}`
      continue
    }
    if (trimmed.startsWith('|+')) {
      table.caption = parseInline(tableCell(trimmed.slice(2), false).text, context)
    } else if (trimmed.startsWith('|-')) {
      newRow()
      cell = null
    } else if (trimmed.startsWith('!') || trimmed.startsWith('|')) {
      const header = trimmed.startsWith('!')
      const parts = header
        ? splitCells(trimmed.slice(1), '!!').flatMap(part => splitCells(part, '||'))
        : splitCells(trimmed.slice(1), '||')
      for (const part of parts) {
        cell = tableCell(part, header)
        ;(row ?? newRow()).cells.push(cell)
      }
    } else if (cell) {
      cell.text += `\n${line}`
    }
  }

  table.rows = table.rows
    .filter(tableRow => tableRow.cells.length)
    .map(tableRow => ({
      cells: tableRow.cells.map(({ header, colspan, text }) => ({
        header,
        colspan,
        blocks: parseBlocks(text, context)
      }))
    }))
  return table
}

function parseListEntries(lines) {
  return lines.flatMap(line => {
    const prefix = /^[*#:;]+/.exec(line)[0]
    const text = line.slice(prefix.length).trim()
    // ;Term : definition on one line
    if (prefix.endsWith(';')) {
      const split = definitionColon(text)
      if (split > 0) {
        return [
          { prefix, text: text.slice(0, split).trim() },
          { prefix: `${prefix.slice(0, -1)}:`, text: text.slice(split + 1).trim() }
        ]
      }
    }
    return [{ prefix, text }]
  })
}

// The ':' that separates a term from its definition, outside links and URLs.
function definitionColon(text) {
  let depth = 0
  for (let index = 0; index < text.length; index++) {
    if (text.startsWith('[[', index)) depth++
    else if (text.startsWith(']]', index) && depth > 0) depth--
    else if (depth === 0 && text[index] === ':' && !text.startsWith('//', index + 1)) return index
  }
  return -1
}

const listKind = char => (char === '*' ? 'ul' : char === '#' ? 'ol' : 'dl')

function buildList(entries, depth, context) {
  const blocks = []
  let index = 0
  while (index < entries.length) {
    const kind = listKind(entries[index].prefix[depth])
    const items = []
    while (index < entries.length && listKind(entries[index].prefix[depth]) === kind) {
      const entry = entries[index]
      if (entry.prefix.length === depth + 1 || !items.length) {
        const own = entry.prefix.length === depth + 1
        items.push({
          kind: entry.prefix[depth] === ';' ? 'term' : 'detail',
          children: own ? parseInline(entry.text, context) : [],
          nested: own ? [] : [entry]
        })
      } else {
        items[items.length - 1].nested.push(entry)
      }
      index++
    }
    const finished = items.map(({ kind: itemKind, children, nested }) => ({
      kind: itemKind,
      children,
      blocks: nested.length ? buildList(nested, depth + 1, context) : []
    }))
    if (kind === 'dl') {
      blocks.push({ type: 'definitions', items: finished })
    } else {
      blocks.push({
        type: 'list',
        ordered: kind === 'ol',
        items: finished.map(({ children, blocks: itemBlocks }) => ({ children, blocks: itemBlocks }))
      })
    }
  }
  return blocks
}

// Figures written inside a paragraph become blocks of their own.
function paragraphBlocks(lines, context) {
  const children = parseInline(lines.join('\n'), context)
  const blocks = []
  let run = []
  const flush = () => {
    const meaningful = run.some(node => node.type !== 'text' || node.value.trim())
    if (meaningful) blocks.push({ type: 'paragraph', children: trimEdges(run) })
    run = []
  }
  for (const node of children) {
    if (node.type === 'figure') {
      flush()
      blocks.push(node)
    } else {
      run.push(node)
    }
  }
  flush()
  return blocks
}

function trimEdges(children) {
  const result = [...children]
  if (result[0]?.type === 'text') result[0] = textNode(result[0].value.replace(/^\s+/, ''))
  const last = result.length - 1
  if (result[last]?.type === 'text') result[last] = textNode(result[last].value.replace(/\s+$/, ''))
  return result.filter(node => node.type !== 'text' || node.value)
}

export function parseBlocks(text, context) {
  const lines = text.split('\n')
  const blocks = []
  let paragraph = []
  const flush = () => {
    if (paragraph.length) blocks.push(...paragraphBlocks(paragraph, context))
    paragraph = []
  }

  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flush()
      index++
      continue
    }

    const heading = /^(={1,6})\s*(.+?)\s*\1\s*$/.exec(trimmed)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2], context) })
      index++
      continue
    }

    const rule = /^-{4,}\s*(.*)$/.exec(trimmed)
    if (rule) {
      flush()
      blocks.push({ type: 'rule' })
      if (rule[1]) paragraph.push(rule[1])
      index++
      continue
    }

    if (/^[*#:;]/.test(line)) {
      flush()
      const listLines = []
      while (index < lines.length && /^[*#:;]/.test(lines[index])) listLines.push(lines[index++])
      blocks.push(...buildList(parseListEntries(listLines), 0, context))
      continue
    }

    if (trimmed.startsWith('{|')) {
      flush()
      const tableLines = []
      let depth = 0
      while (index < lines.length) {
        const current = lines[index].trim()
        if (current.startsWith('{|')) depth++
        if (current.startsWith('|}')) depth--
        tableLines.push(lines[index++])
        if (depth === 0) break
      }
      if (depth !== 0) tableLines.push('|}')
      blocks.push(parseTable(tableLines, context))
      continue
    }

    const slot = SLOT_ONLY.exec(trimmed)
    if (slot) {
      const { kind, content } = context.slots[Number(slot[1])]
      const block = kind === 'pre'
        ? { type: 'pre', text: decodeEntities(content.replace(/^\n/, '')) }
        : kind === 'template'
          ? templateBlock(content, context)
          : kind === 'references'
            ? referencesBlock(context)
            : kind === 'gallery' ? galleryBlock(content, context) : null
      if (block === NOTHING) {
        index++
        continue
      }
      if (block) {
        flush()
        blocks.push(block)
        index++
        continue
      }
    }

    if (line.startsWith(' ')) {
      flush()
      const preLines = []
      while (index < lines.length && lines[index].startsWith(' ') && lines[index].trim()) {
        preLines.push(lines[index++].slice(1))
      }
      blocks.push({ type: 'pre', text: decodeEntities(restoreRaw(preLines.join('\n'), context)) })
      continue
    }

    paragraph.push(line)
    index++
  }

  flush()
  return blocks
}

export function parseWikitext(source) {
  const context = { slots: [], notes: [], referencesPlaced: false, categories: [] }
  const text = protect(String(source ?? ''), context)
  const blocks = parseBlocks(text, context)
  if (context.notes.length && !context.referencesPlaced) blocks.push(referencesBlock(context))
  return context.categories.length ? { blocks, categories: context.categories } : { blocks }
}
