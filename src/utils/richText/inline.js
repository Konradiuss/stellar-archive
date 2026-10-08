// Tokens of buildInline: { text } | { node } | { open, attrs } | { close } | { skip }.

import { safeColor } from './sanitize'

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»',
  copy: '©', reg: '®', deg: '°', times: '×', middot: '·', bull: '•',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', plusmn: '±', minus: '−'
}

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X'
        ? parseInt(name.slice(2), 16)
        : parseInt(name.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    // Own keys only: "&constructor;" is not an entity.
    const key = name.toLowerCase()
    return Object.hasOwn(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : match
  })
}

export const textNode = value => ({ type: 'text', value })

// The safe subset of inline HTML allowed in lore: tag → node type.
const FORMAT_TAGS = {
  b: 'strong', strong: 'strong',
  i: 'em', em: 'em', cite: 'em', var: 'em',
  u: 'underline', ins: 'underline',
  s: 'strike', strike: 'strike', del: 'strike',
  code: 'code', tt: 'code', kbd: 'code', samp: 'code',
  sub: 'sub', sup: 'sup', small: 'small', big: 'big'
}
// Layout wrappers of wiki pages: their content stays, the tag goes.
const IGNORED_TAGS = new Set(['center', 'div', 'p', 'abbr', 'mark'])

function styleColor(attributes) {
  const style = /style\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1] ?? ''
  const fromStyle = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style)?.[1]
  const fromAttribute = /color\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1]
  return safeColor(fromStyle ?? fromAttribute)
}

/** { token, length }, or null for an unsupported tag (it stays literal text). */
export function matchHtmlTag(source, index) {
  const match = /^<(\/?)([a-z][a-z0-9]*)\b([^<>]*?)(\/?)>/i.exec(source.slice(index, index + 400))
  if (!match) return null
  const [whole, closing, rawName, attributes] = match
  const name = rawName.toLowerCase()
  const length = whole.length

  if (name === 'br' || name === 'hr') return { token: { node: { type: 'break' } }, length }
  if (IGNORED_TAGS.has(name)) return { token: { skip: true }, length }
  if (Object.hasOwn(FORMAT_TAGS, name)) {
    return { token: closing ? { close: FORMAT_TAGS[name] } : { open: FORMAT_TAGS[name] }, length }
  }
  if (name === 'span' || name === 'font') {
    if (closing) return { token: { close: 'color' }, length }
    const color = styleColor(attributes)
    // A span without a colour still has to pair with its </span>.
    return { token: { open: 'color', attrs: { color } }, length }
  }
  return null
}

export function findClosing(source, start, open, close) {
  let depth = 0
  for (let index = start; index < source.length; index++) {
    if (source.startsWith(open, index)) {
      depth++
      index += open.length - 1
    } else if (source.startsWith(close, index)) {
      depth--
      if (depth === 0) return index
      index += close.length - 1
    }
  }
  return -1
}

// Splits on `separator` outside of nested [[…]] and {{…}}.
export function splitTopLevel(source, separator = '|') {
  const parts = []
  let depth = 0
  let current = ''
  for (let index = 0; index < source.length; index++) {
    const pair = source.slice(index, index + 2)
    if (pair === '[[' || pair === '{{') {
      depth++
      current += pair
      index++
    } else if ((pair === ']]' || pair === '}}') && depth > 0) {
      depth--
      current += pair
      index++
    } else if (depth === 0 && source[index] === separator) {
      parts.push(current)
      current = ''
    } else {
      current += source[index]
    }
  }
  parts.push(current)
  return parts
}

function mergeText(children) {
  const merged = []
  for (const child of children) {
    const last = merged[merged.length - 1]
    if (child.type === 'text' && last?.type === 'text') last.value += child.value
    else if (child.type !== 'text' || child.value) merged.push(child)
  }
  return merged
}

// A stray close is dropped; a close that crosses other open formats closes and reopens them,
// so overlapping markup ('''bold ''both''' italic'') keeps its meaning.
export function buildInline(tokens) {
  const root = { children: [] }
  const stack = [root]
  const top = () => stack[stack.length - 1]

  for (const token of tokens) {
    if (token.skip) continue
    if (token.text !== undefined) {
      top().children.push(textNode(token.text))
    } else if (token.node) {
      top().children.push(token.node)
    } else if (token.open) {
      const node = { type: token.open, ...token.attrs, children: [] }
      top().children.push(node)
      stack.push(node)
    } else if (token.close) {
      const depth = stack.findLastIndex((node, index) => index > 0 && node.type === token.close)
      if (depth < 0) continue
      const reopened = stack.splice(depth).slice(1)
      for (const node of reopened) {
        const copy = { ...node, children: [] }
        top().children.push(copy)
        stack.push(copy)
      }
    }
  }

  return cleanTree(root.children)
}

function cleanTree(children) {
  const cleaned = []
  for (const child of children) {
    if (child.children) {
      child.children = cleanTree(child.children)
      if (!child.children.length) continue
      // A colour that failed the safety check is just its content.
      if (child.type === 'color' && !child.color) {
        cleaned.push(...child.children)
        continue
      }
    }
    cleaned.push(child)
  }
  return mergeText(cleaned)
}

export function inlineToText(children = []) {
  return children.map(child => (
    child.type === 'text' ? child.value : child.type === 'break' ? ' ' : inlineToText(child.children)
  )).join('')
}

// Sentence punctuation and unmatched enclosing parentheses are outside a bare URL.
export function matchBareUrl(source, index) {
  const match = /^(?:https?:\/\/|mailto:)[^\s<>[\]"'{}|]+/i.exec(source.slice(index, index + 2000))
  if (!match) return null
  let url = match[0].replace(/[.,;:!?]+$/, '')
  const opens = (url.match(/\(/g) ?? []).length
  let closes = (url.match(/\)/g) ?? []).length
  while (url.endsWith(')') && closes > opens) {
    url = url.slice(0, -1).replace(/[.,;:!?]+$/, '')
    closes--
  }
  return url.length > 8 ? url : null
}
