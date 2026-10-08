// Markdown (CommonMark basics + GFM tables, strikethrough, autolinks, footnotes, alerts) → the same
// document as the wikitext parser. Wiki templates ({{Main|…}}, {{Stub}}) work on a line of their own.

import {
  buildInline,
  decodeEntities,
  inlineToText,
  matchBareUrl,
  matchHtmlTag,
  splitTopLevel,
  textNode
} from './inline'
import { safeHref } from './sanitize'
import { isReferenceList, magicWord, sharedTemplateBlock, templateKey } from './templates'

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w-]*)\s*$/
const HEADING = /^\s{0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^\s{0,3}>\s?/
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(\s+|$)(.*)$/
const TABLE_DIVIDER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|~<>"']/
const TEMPLATE_LINE = /^\s{0,3}\{\{([\s\S]+)\}\}\s*$/
// GitHub alert ("> [!WARNING]"): a notice box.
const ALERT = /^\s*\[!(note|tip|important|warning|caution|stub)\]\s*$/i
const ALERT_KINDS = { note: 'notice', tip: 'notice', important: 'notice', warning: 'warning', caution: 'warning', stub: 'stub' }
const FOOTNOTE_DEFINITION = /^\s{0,3}\[\^([^\]\s]+)\]:\s?(.*)$/
const FOOTNOTE_REF = /^\[\^([^\]\s]+)\]/
const CATEGORY = /^\[\[\s*category\s*:\s*([^\]|]+?)\s*(?:\|[^\]]*)?\]\]/i

// Parse state: { definitions: label → text, notes (numbered by first reference), placed, categories }.
let footnotes = null

function footnoteRef(label) {
  const key = label.toLowerCase()
  if (!footnotes?.definitions.has(key)) return null
  let note = footnotes.notes.find(item => item.name === key)
  if (!note) {
    note = { number: footnotes.notes.length + 1, name: key, children: [] }
    footnotes.notes.push(note)
    note.children = parseMarkdownInline(footnotes.definitions.get(key))
  }
  return { type: 'ref', number: note.number }
}

function closingParen(source, start) {
  let depth = 0
  for (let index = start; index < source.length; index++) {
    if (source[index] === '\\') index++
    else if (source[index] === '(') depth++
    else if (source[index] === ')') {
      if (depth === 0) return index
      depth--
    }
  }
  return -1
}

function decodeTarget(text) {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

// 'Article#Section' ('_' reads as a space in the page name) or '#Section' of this page.
function pageLink(url, children) {
  const hash = url.indexOf('#')
  const page = decodeTarget(hash < 0 ? url : url.slice(0, hash)).replace(/_/g, ' ').trim()
  const section = hash < 0 ? '' : decodeTarget(url.slice(hash + 1)).trim()
  if (!page && !section) return null
  const node = { type: 'link', page, children }
  if (section) node.section = section
  return node
}

// ![alt](src "title") or [label](href "title") at `index`.
function matchLinkLike(source, index) {
  const isImage = source[index] === '!'
  const labelStart = index + (isImage ? 2 : 1)
  let depth = 0
  let labelEnd = -1
  for (let cursor = labelStart; cursor < source.length; cursor++) {
    if (source[cursor] === '\\') cursor++
    else if (source[cursor] === '[') depth++
    else if (source[cursor] === ']') {
      if (depth === 0) {
        labelEnd = cursor
        break
      }
      depth--
    }
  }
  if (labelEnd < 0 || source[labelEnd + 1] !== '(') return null
  const destinationEnd = closingParen(source, labelEnd + 2)
  if (destinationEnd < 0) return null

  const inside = source.slice(labelEnd + 2, destinationEnd).trim()
  const destination = /^(<[^>]*>|\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?$/.exec(inside)
  if (!destination) return null
  return {
    isImage,
    label: source.slice(labelStart, labelEnd),
    url: destination[1].replace(/^<|>$/g, ''),
    title: destination[2] ?? destination[3] ?? destination[4] ?? '',
    end: destinationEnd + 1
  }
}

const isSpace = char => char === undefined || /\s/.test(char)
const isPunctuation = char => char !== undefined && /[\p{P}\p{S}]/u.test(char)

// Emphasis delimiters are paired after tokenizing, as in CommonMark (simplified).
function delimiterToken(source, index, char, length) {
  const before = source[index - 1]
  const after = source[index + length]
  const leftFlanking = !isSpace(after) && (!isPunctuation(after) || isSpace(before) || isPunctuation(before))
  const rightFlanking = !isSpace(before) && (!isPunctuation(before) || isSpace(after) || isPunctuation(after))
  // Underscores inside words (snake_case) are not emphasis.
  const intraword = char === '_' && /[\p{L}\p{N}]/u.test(before ?? '') && /[\p{L}\p{N}]/u.test(after ?? '')
  return {
    delimiter: char,
    length,
    canOpen: leftFlanking && !intraword,
    canClose: rightFlanking && !intraword
  }
}

function pairDelimiters(tokens) {
  const openers = []
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (!token.delimiter) continue
    if (token.canClose) {
      const openerIndex = openers.findLastIndex(opener => (
        opener.token.delimiter === token.delimiter && opener.token.length === token.length
      ))
      if (openerIndex >= 0) {
        const { token: opener } = openers[openerIndex]
        const type = token.delimiter === '~' ? 'strike' : token.length === 2 ? 'strong' : token.length === 3 ? 'strongEm' : 'em'
        opener.pair = { open: type }
        token.pair = { close: type }
        openers.length = openerIndex
        continue
      }
    }
    if (token.canOpen) openers.push({ token, index })
  }

  return tokens.flatMap(token => {
    if (!token.delimiter) return [token]
    if (!token.pair) return [{ text: token.delimiter.repeat(token.length) }]
    if (token.pair.open === 'strongEm') return [{ open: 'strong' }, { open: 'em' }]
    if (token.pair.close === 'strongEm') return [{ close: 'em' }, { close: 'strong' }]
    return [token.pair]
  })
}

function inlineTokens(source) {
  const tokens = []
  let buffer = ''
  const flush = () => {
    if (buffer) tokens.push({ text: decodeEntities(buffer) })
    buffer = ''
  }

  let index = 0
  while (index < source.length) {
    const char = source[index]

    if (char === '\\' && source[index + 1] === '\n') {
      flush()
      tokens.push({ node: { type: 'break' } })
      index += 2
      continue
    }
    if (char === '\\' && ESCAPABLE.test(source[index + 1] ?? '')) {
      buffer += source[index + 1]
      index += 2
      continue
    }
    if (char === '\n') {
      flush()
      // Two trailing spaces make a hard line break; otherwise a soft one.
      const hard = /  +$/.test(tokens[tokens.length - 1]?.text ?? '')
      if (hard) tokens[tokens.length - 1].text = tokens[tokens.length - 1].text.replace(/ +$/, '')
      tokens.push(hard ? { node: { type: 'break' } } : { text: ' ' })
      index++
      continue
    }

    // A magic word ({{NUMBEROFARTICLES}}): counted when the page is shown.
    if (char === '{' && source[index + 1] === '{') {
      const end = source.indexOf('}}', index + 2)
      const magic = end > 0 ? magicWord(source.slice(index + 2, end)) : null
      if (magic) {
        flush()
        tokens.push({ node: { type: 'magic', name: magic } })
        index = end + 2
        continue
      }
    }

    if (char === '`') {
      let run = 0
      while (source[index + run] === '`') run++
      const fence = '`'.repeat(run)
      const end = source.indexOf(fence, index + run)
      if (end > 0) {
        flush()
        const code = source.slice(index + run, end).replace(/\n/g, ' ')
        const trimmed = /^ .* $/.test(code) && code.trim() ? code.slice(1, -1) : code
        tokens.push({ node: { type: 'code', children: [textNode(trimmed)] } })
        index = end + run
        continue
      }
      buffer += fence
      index += run
      continue
    }

    if (char === '[' && source[index + 1] === '[' && footnotes) {
      const match = CATEGORY.exec(source.slice(index, index + 200))
      if (match) {
        const name = match[1].replace(/_/g, ' ')
        if (!footnotes.categories.includes(name)) footnotes.categories.push(name)
        index += match[0].length
        continue
      }
    }

    if (char === '[' && source[index + 1] === '^') {
      const match = FOOTNOTE_REF.exec(source.slice(index, index + 200))
      const node = match ? footnoteRef(match[1]) : null
      if (node) {
        flush()
        tokens.push({ node })
        index += match[0].length
        continue
      }
    }

    if (char === '[' || (char === '!' && source[index + 1] === '[')) {
      const link = matchLinkLike(source, index)
      if (link) {
        flush()
        if (link.isImage) {
          const alt = inlineToText(parseMarkdownInline(link.label))
          tokens.push({ node: { type: 'image', image: { url: link.url, alt: alt || link.title, title: link.title } } })
        } else {
          const children = parseMarkdownInline(link.label)
          const href = safeHref(link.url)
          // A relative target names a page ([Mars](Mars), [x](Page#Section)) or a section here
          // ([x](#Fleet)); any other scheme is no link.
          const node = href
            ? { type: 'link', href, children }
            : /^[a-z][a-z0-9+.-]*:/i.test(link.url)
              ? null
              : pageLink(link.url, children)
          if (node) tokens.push({ node })
          else tokens.push(...children.map(child => ({ node: child })))
        }
        index = link.end
        continue
      }
    }

    if (char === '<') {
      const autolink = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(source.slice(index, index + 2000))
      if (autolink) {
        flush()
        tokens.push({ node: { type: 'link', href: autolink[1], children: [textNode(autolink[1])] } })
        index += autolink[0].length
        continue
      }
      const tag = matchHtmlTag(source, index)
      if (tag) {
        flush()
        tokens.push(tag.token)
        index += tag.length
        continue
      }
    }

    if ((char === 'h' || char === 'm') && !/[\p{L}\p{N}]/u.test(source[index - 1] ?? '')) {
      const url = matchBareUrl(source, index)
      if (url) {
        flush()
        tokens.push({ node: { type: 'link', href: url, children: [textNode(url)] } })
        index += url.length
        continue
      }
    }

    if (char === '*' || char === '_' || (char === '~' && source[index + 1] === '~')) {
      let run = 0
      while (source[index + run] === char) run++
      if (char !== '~' || run === 2) {
        flush()
        tokens.push(delimiterToken(source, index, char, Math.min(run, 3)))
        if (run > 3) buffer += char.repeat(run - 3)
        index += run
        continue
      }
    }

    buffer += char
    index++
  }

  flush()
  return pairDelimiters(tokens)
}

export function parseMarkdownInline(source) {
  return buildInline(inlineTokens(source))
}

function splitRow(line) {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1)
  const cells = []
  let current = ''
  let inCode = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '\\' && text[index + 1] === '|') {
      current += '|'
      index++
    } else if (char === '`') {
      inCode = !inCode
      current += char
    } else if (char === '|' && !inCode) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

function parseTable(header, divider, rows) {
  const aligns = splitRow(divider).map(cell => (
    cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : null
  ))
  const toCells = (cells, isHeader) => aligns.map((align, index) => ({
    header: isHeader,
    colspan: 1,
    align,
    blocks: cells[index] ? [{ type: 'paragraph', children: parseMarkdownInline(cells[index]) }] : []
  }))
  return {
    type: 'table',
    caption: null,
    rows: [
      { cells: toCells(splitRow(header), true) },
      ...rows.map(row => ({ cells: toCells(splitRow(row), false) }))
    ]
  }
}

const indentOf = line => {
  let width = 0
  for (const char of line) {
    if (char === ' ') width++
    else if (char === '\t') width += 4 - (width % 4)
    else break
  }
  return width
}

const stripIndent = (line, amount) => {
  let removed = 0
  let index = 0
  while (index < line.length && removed < amount && (line[index] === ' ' || line[index] === '\t')) {
    removed += line[index] === '\t' ? 4 - (removed % 4) : 1
    index++
  }
  return line.slice(index)
}

function startsBlock(line) {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || LIST_ITEM.test(line)
}

function parseList(lines, start) {
  const first = LIST_ITEM.exec(lines[start])
  const ordered = /\d/.test(first[2])
  const baseIndent = first[1].length
  const items = []
  let index = start
  let current = null

  while (index < lines.length) {
    const line = lines[index]
    const item = LIST_ITEM.exec(line)
    const isSibling = item && item[1].length <= baseIndent + 1 && /\d/.test(item[2]) === ordered && !RULE.test(line)

    if (isSibling) {
      const contentIndent = item[1].length + item[2].length + Math.min(item[3].length || 1, 4)
      current = { contentIndent, lines: [item[4]] }
      items.push(current)
      index++
      continue
    }
    if (!line.trim()) {
      // A blank line ends the list unless an indented continuation follows.
      const next = lines[index + 1]
      if (next !== undefined && next.trim() && indentOf(next) >= current.contentIndent) {
        current.lines.push('')
        index++
        continue
      }
      break
    }
    if (indentOf(line) >= current.contentIndent || (item && item[1].length > baseIndent)) {
      current.lines.push(stripIndent(line, current.contentIndent))
      index++
      continue
    }
    // Lazy continuation of the item's paragraph.
    if (!startsBlock(line) && current.lines[current.lines.length - 1]?.trim()) {
      current.lines.push(line.trim())
      index++
      continue
    }
    break
  }

  const startNumber = ordered ? parseInt(first[2], 10) : null
  return {
    end: index,
    block: {
      type: 'list',
      ordered,
      ...(ordered && startNumber !== 1 ? { start: startNumber } : {}),
      items: items.map(({ lines: itemLines }) => {
        const blocks = parseMarkdownBlocks(itemLines)
        // The first paragraph is the item's own text, the rest nest below it.
        const children = blocks[0]?.type === 'paragraph' ? blocks.shift().children : []
        return { children, blocks }
      })
    }
  }
}

// {{Name|a|key=b}} alone on a line → a note, a notice box or the footnotes; null (stays text) otherwise.
function templateLine(line) {
  const match = TEMPLATE_LINE.exec(line)
  if (!match) return null
  const [name, ...parts] = splitTopLevel(match[1], '|')
  if (isReferenceList(templateKey(name))) return referencesBlock()
  const params = parts.map(part => {
    const named = /^\s*([^=[\]{}]+?)\s*=([\s\S]*)$/.exec(part)
    return named ? { key: named[1], value: named[2] } : { key: null, value: part }
  })
  return sharedTemplateBlock(name, params, text => parseMarkdownBlocks(text.split('\n')))
}

function referencesBlock() {
  if (!footnotes) return null
  footnotes.placed = true
  return { type: 'references', notes: footnotes.notes }
}

const imageCaption = image => (image.title ? parseMarkdownInline(image.title) : [])

function parseMarkdownBlocks(lines) {
  const blocks = []
  let paragraph = []
  const flush = () => {
    if (!paragraph.length) return
    const children = parseMarkdownInline(paragraph.join('\n').trim())
    paragraph = []
    // A line of categories only leaves nothing to show.
    if (!children.some(child => child.type !== 'text' || child.value.trim())) return
    const images = children.filter(child => child.type === 'image')
    const onlyImages = children.every(child => child.type === 'image' || (child.type === 'text' && !child.value.trim()))
    // An image alone is a figure with its title as caption; images only make a gallery.
    if (children.length === 1 && images.length === 1) {
      const { image } = images[0]
      blocks.push({ type: 'figure', image, align: 'center', caption: imageCaption(image) })
    } else if (images.length > 1 && onlyImages) {
      blocks.push({ type: 'gallery', items: images.map(({ image }) => ({ image, caption: imageCaption(image) })) })
    } else {
      blocks.push({ type: 'paragraph', children })
    }
  }

  let index = 0
  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      flush()
      index++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      flush()
      const code = []
      index++
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) code.push(lines[index++])
      index++
      blocks.push({ type: 'pre', text: code.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', level: heading[1].length, children: parseMarkdownInline(heading[2] ?? '') })
      index++
      continue
    }

    if (RULE.test(line)) {
      // "text\n---" would be a setext heading in CommonMark; treated as a rule here.
      flush()
      blocks.push({ type: 'rule' })
      index++
      continue
    }

    if (QUOTE.test(line)) {
      flush()
      const quoted = []
      while (index < lines.length && (QUOTE.test(lines[index]) || (lines[index].trim() && quoted.length && !startsBlock(lines[index])))) {
        quoted.push(lines[index].replace(QUOTE, ''))
        index++
      }
      const alert = ALERT.exec(quoted[0])
      if (alert) {
        const kind = ALERT_KINDS[alert[1].toLowerCase()]
        const notice = sharedTemplateBlock(kind, [{ key: null, value: quoted.slice(1).join('\n') }], text => parseMarkdownBlocks(text.split('\n')))
        blocks.push(notice)
      } else {
        blocks.push({ type: 'quote', blocks: parseMarkdownBlocks(quoted) })
      }
      continue
    }

    const template = templateLine(line)
    if (template) {
      flush()
      blocks.push(template)
      index++
      continue
    }

    if (LIST_ITEM.test(line) && !(paragraph.length && /^\s*\d/.test(line) && !/^\s*1[.)]/.test(line))) {
      flush()
      const { end, block } = parseList(lines, index)
      blocks.push(block)
      index = end
      continue
    }

    if (line.includes('|') && TABLE_DIVIDER.test(lines[index + 1] ?? '') && lines[index + 1].includes('-')) {
      const header = splitRow(line)
      if (header.length === splitRow(lines[index + 1]).length) {
        flush()
        const divider = lines[index + 1]
        const rows = []
        index += 2
        while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(lines[index++])
        blocks.push(parseTable(line, divider, rows))
        continue
      }
    }

    // Four spaces of indentation: code, but not in the middle of a paragraph.
    if (!paragraph.length && indentOf(line) >= 4) {
      const code = []
      while (index < lines.length && (indentOf(lines[index]) >= 4 || !lines[index].trim())) {
        code.push(stripIndent(lines[index], 4))
        index++
      }
      while (code.length && !code[code.length - 1].trim()) code.pop()
      blocks.push({ type: 'pre', text: code.join('\n') })
      continue
    }

    paragraph.push(line)
    index++
  }

  flush()
  return blocks
}

// Footnote definitions ('[^1]: text' + indented lines) are taken out of the text; code blocks keep theirs.
function takeFootnotes(lines) {
  const definitions = new Map()
  const rest = []
  let fence = null
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const opening = FENCE.exec(line)
    if (fence ? line.trim().startsWith(fence) : opening) {
      fence = fence ? null : opening[1]
      rest.push(line)
      continue
    }
    const definition = fence ? null : FOOTNOTE_DEFINITION.exec(line)
    if (!definition) {
      rest.push(line)
      continue
    }
    const text = [definition[2]]
    while (index + 1 < lines.length && /^(?: {4}|\t)\S/.test(lines[index + 1])) text.push(lines[++index].trim())
    const key = definition[1].toLowerCase()
    if (!definitions.has(key)) definitions.set(key, text.join('\n').trim())
  }
  return { definitions, rest }
}

export function parseMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?(?:-->|$)/g, '').split('\n')
  const { definitions, rest } = takeFootnotes(lines)
  const outer = footnotes
  footnotes = { definitions, notes: [], placed: false, categories: [] }
  try {
    const blocks = parseMarkdownBlocks(rest)
    // Without {{References}} the notes close the article.
    if (footnotes.notes.length && !footnotes.placed) blocks.push(referencesBlock())
    return footnotes.categories.length ? { blocks, categories: footnotes.categories } : { blocks }
  } finally {
    footnotes = outer
  }
}
