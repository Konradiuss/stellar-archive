// In the order RichText draws them: the n-th entry is the n-th `.rt-heading` of the article.
import { inlineToText } from './richText/inline'

// A heading of nothing drawn (a lone '#', '== [[Category:X]] ==') is not a section.
const LEAF_NODES = new Set(['text', 'break', 'image', 'magic', 'ref', 'figure'])
const drawsInline = nodes => (nodes ?? []).some(node => LEAF_NODES.has(node.type) || drawsInline(node.children))

function walk(blocks, headings) {
  for (const block of blocks ?? []) {
    switch (block.type) {
      case 'heading':
        if (drawsInline(block.children)) headings.push({ level: block.level, text: inlineToText(block.children).trim() })
        break
      // Blocks RichText draws with headings inside (a box of the main page).
      case 'quote':
      case 'notice':
      case 'banner':
      case 'box':
      case 'center':
        walk(block.blocks, headings)
        break
      case 'list':
      case 'definitions':
        for (const item of block.items) walk(item.blocks, headings)
        break
      case 'table':
        for (const row of block.rows) for (const cell of row.cells) walk(cell.blocks, headings)
        break
    }
  }
}

const anchorOf = text => text.trim().replace(/\s+/g, '_')
// Anchors and names match whatever their case and '_' or spaces.
const sectionKey = name => String(name ?? '').trim().replace(/[_\s]+/g, ' ').toLowerCase()

/**
 * [{ level, text, anchor, number, depth, parent }]: number '1.1', depth 0 for the biggest headings,
 * parent the index of the enclosing section or null. A repeated anchor gets '_2', like MediaWiki.
 */
export function collectHeadings(doc) {
  const headings = []
  walk(doc?.blocks, headings)

  const seen = new Map()
  // Every anchor given: "A", "A", "A 2" make A, A_2 and A_2_2, never a second A_2.
  const used = new Set()
  // Open sections, from the outermost: { level, index, count of children }.
  const stack = []
  let topCount = 0
  return headings.map((heading, index) => {
    while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop()
    const parentEntry = stack[stack.length - 1] ?? null
    const position = parentEntry ? ++parentEntry.children : ++topCount
    const number = parentEntry ? `${parentEntry.number}.${position}` : String(position)
    stack.push({ level: heading.level, index, number, children: 0 })

    const base = anchorOf(heading.text) || `Section_${index + 1}`
    let repeat = seen.get(sectionKey(base)) ?? 0
    let anchor
    do {
      repeat++
      anchor = repeat > 1 ? `${base}_${repeat}` : base
    } while (used.has(sectionKey(anchor)))
    seen.set(sectionKey(base), repeat)
    used.add(sectionKey(anchor))

    return { ...heading, anchor, number, depth: stack.length - 1, parent: parentEntry?.index ?? null }
  })
}

export function findSection(headings, name) {
  const key = sectionKey(name)
  if (!key) return -1
  const byAnchor = headings.findIndex(heading => sectionKey(heading.anchor) === key)
  return byAnchor >= 0 ? byAnchor : headings.findIndex(heading => sectionKey(heading.text) === key)
}
