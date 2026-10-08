// Edits that change only the touched span of the hand-formatted map JSON: rewriting it
// all would lose the author's layout and turn a small edit into a whole-file commit.
// A path is a list of keys and indices: ['systems', 'sol', 'planets', 1].

const WHITESPACE = new Set([' ', '\t', '\n', '\r'])

export function parseSpans(text) {
  let at = text.charCodeAt(0) === 0xfeff ? 1 : 0

  const fail = what => {
    throw new SyntaxError(`${what} at position ${at}`)
  }
  const skip = () => {
    while (at < text.length && WHITESPACE.has(text[at])) at++
  }
  const expect = char => {
    if (text[at] !== char) fail(`Expected "${char}"`)
    at++
  }

  function string() {
    const start = at
    expect('"')
    while (at < text.length && text[at] !== '"') at += text[at] === '\\' ? 2 : 1
    expect('"')
    return { type: 'string', start, end: at, value: JSON.parse(text.slice(start, at)) }
  }

  function value() {
    skip()
    const start = at
    const char = text[at]
    if (char === '{') {
      at++
      const members = []
      skip()
      if (text[at] === '}') {
        at++
        return { type: 'object', start, end: at, members }
      }
      for (;;) {
        skip()
        const key = string()
        skip()
        expect(':')
        const node = value()
        members.push({ key: key.value, keyStart: key.start, keyEnd: key.end, node })
        skip()
        if (text[at] === ',') {
          at++
          continue
        }
        expect('}')
        return { type: 'object', start, end: at, members }
      }
    }
    if (char === '[') {
      at++
      const items = []
      skip()
      if (text[at] === ']') {
        at++
        return { type: 'array', start, end: at, items }
      }
      for (;;) {
        items.push(value())
        skip()
        if (text[at] === ',') {
          at++
          continue
        }
        expect(']')
        return { type: 'array', start, end: at, items }
      }
    }
    if (char === '"') return string()
    const literal = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(at, at + 40))
    if (!literal) fail('Unexpected character')
    at += literal[0].length
    return { type: 'literal', start, end: at, value: JSON.parse(literal[0]) }
  }

  const root = value()
  skip()
  if (at < text.length) fail('Unexpected text after the end')
  return root
}

export function nodeAt(root, path) {
  let node = root
  let member = null
  for (const step of path) {
    if (typeof step === 'number') {
      if (node?.type !== 'array' || !node.items[step]) return null
      member = null
      node = node.items[step]
    } else {
      member = node?.type === 'object' ? node.members.find(each => each.key === step) : null
      if (!member) return null
      node = member.node
    }
  }
  return Object.assign(node, { member })
}

const lineStart = (text, index) => text.lastIndexOf('\n', index - 1) + 1
const indentOf = (text, index) => /^[ \t]*/.exec(text.slice(lineStart(text, index)))[0]
const isInline = (text, node) => !text.slice(node.start, node.end).includes('\n')

function indentUnit(text) {
  const match = /\n([ \t]+)\S/.exec(text)
  return match ? match[1] : '  '
}

export function inlineJson(value) {
  if (Array.isArray(value)) return value.length ? `[${value.map(inlineJson).join(', ')}]` : '[]'
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, inner]) => inner !== undefined)
    return entries.length ? `{ ${entries.map(([key, inner]) => `${JSON.stringify(key)}: ${inlineJson(inner)}`).join(', ')} }` : '{}'
  }
  return JSON.stringify(value)
}

const ladderJson = (value, indent, unit) => JSON.stringify(value, null, unit).split('\n').join(`\n${indent}`)

const format = (text, value, { inline, indent }) => (inline || value === null || typeof value !== 'object' ? inlineJson(value) : ladderJson(value, indent, indentUnit(text)))

const splice = (text, start, end, insert) => `${text.slice(0, start)}${insert}${text.slice(end)}`

function find(text, path) {
  const node = nodeAt(parseSpans(text), path)
  if (!node) throw new Error(`Nothing at ${JSON.stringify(path)}`)
  return node
}

export function setValue(text, path, value) {
  const node = find(text, path)
  return splice(text, node.start, node.end, format(text, value, { inline: isInline(text, node), indent: indentOf(text, node.start) }))
}

function insertLast(text, container, entries, write) {
  if (entries.length) {
    const first = entries[0]
    const last = entries.at(-1)
    const firstStart = first.keyStart ?? first.start
    const onLines = text.slice(container.start, firstStart).includes('\n')
    const indent = onLines ? indentOf(text, firstStart) : ''
    const lastEnd = (last.node ?? last).end
    const inline = !onLines || isInline(text, last.node ?? last)
    return splice(text, lastEnd, lastEnd, `,${onLines ? `\n${indent}` : ' '}${write({ inline, indent })}`)
  }
  const outer = indentOf(text, container.start)
  const indent = outer + indentUnit(text)
  return splice(text, container.start + 1, container.end - 1, `\n${indent}${write({ inline: false, indent })}\n${outer}`)
}

export function setKey(text, path, key, value) {
  const node = find(text, path)
  if (node.type !== 'object') throw new Error(`Not an object at ${JSON.stringify(path)}`)
  if (node.members.some(member => member.key === key)) return setValue(text, [...path, key], value)
  return insertLast(text, node, node.members, style => `${JSON.stringify(key)}: ${format(text, value, style)}`)
}

export function appendItem(text, path, value) {
  const node = find(text, path)
  if (node.type !== 'array') throw new Error(`Not a list at ${JSON.stringify(path)}`)
  return insertLast(text, node, node.items, style => format(text, value, style))
}

function removeEntry(text, container, entries, index) {
  const startOf = entry => entry.keyStart ?? entry.start
  const endOf = entry => (entry.node ?? entry).end
  if (entries.length === 1) return splice(text, container.start + 1, container.end - 1, '')
  if (index > 0) return splice(text, endOf(entries[index - 1]), endOf(entries[index]), '')
  return splice(text, startOf(entries[0]), startOf(entries[1]), '')
}

export function removeKey(text, path, key) {
  const node = find(text, path)
  const index = node.type === 'object' ? node.members.findIndex(member => member.key === key) : -1
  return index < 0 ? text : removeEntry(text, node, node.members, index)
}

export function removeItem(text, path, index) {
  const node = find(text, path)
  if (node.type !== 'array' || !node.items[index]) throw new Error(`No item ${index} at ${JSON.stringify(path)}`)
  return removeEntry(text, node, node.items, index)
}

export function swapItems(text, path, a, b) {
  const node = find(text, path)
  if (node.type !== 'array' || !node.items[a] || !node.items[b]) throw new Error(`No items ${a} and ${b} at ${JSON.stringify(path)}`)
  if (a === b) return text
  const [first, second] = a < b ? [node.items[a], node.items[b]] : [node.items[b], node.items[a]]
  const piece = item => text.slice(item.start, item.end)
  return `${text.slice(0, first.start)}${piece(second)}${text.slice(first.end, second.start)}${piece(first)}${text.slice(second.end)}`
}

export function renameKey(text, path, key, newKey) {
  const node = find(text, path)
  const member = node.type === 'object' && node.members.find(each => each.key === key)
  if (!member) throw new Error(`No key ${JSON.stringify(key)} at ${JSON.stringify(path)}`)
  return splice(text, member.keyStart, member.keyEnd, JSON.stringify(newKey))
}

/** { start, end } of the deepest part a map-check path names ('stars[5] "Vesper"', 'systems.sol.planets[1]'), or null. */
export function locate(text, where) {
  let root
  try {
    root = parseSpans(text)
  } catch {
    return null
  }
  let rest = String(where)
  let node = root
  let found = null
  for (;;) {
    if (node.type === 'array') {
      const match = /^\[(\d+)\]/.exec(rest)
      const item = match && node.items[Number(match[1])]
      if (!item) break
      found = { start: item.start, end: item.end }
      node = item
      rest = rest.slice(match[0].length)
    } else if (node.type === 'object') {
      // Longest matching key first: keys may contain dots and spaces.
      const member = node.members
        .filter(each => rest.startsWith(each.key) && ['.', '[', ' ', undefined].includes(rest[each.key.length]))
        .sort((a, b) => b.key.length - a.key.length)[0]
      if (!member) break
      found = { start: member.keyStart, end: member.node.end }
      node = member.node
      rest = rest.slice(member.key.length)
    } else {
      break
    }
    if (rest.startsWith('.')) rest = rest.slice(1)
    else if (!rest.startsWith('[')) break
  }
  return found
}
