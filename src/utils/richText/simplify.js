// Turns the layout templates of a wide wiki page into plain lore blocks for a narrow column, so it
// pages and prints like any lore. A portal vanishes: the archive sections live in the wiki.
// The document given is not mutated.

const text = value => ({ type: 'text', value })

function simplifyBanner(block) {
  const out = []
  if (block.logo) out.push({ type: 'heading', level: 1, children: [text(block.logo.text)] })
  else if (block.image) out.push({ type: 'figure', image: block.image, align: 'center', caption: [] })
  if (block.caption.length) out.push({ type: 'paragraph', children: block.caption })
  return [...out, ...simplifyBlocks(block.blocks)]
}

function simplifyLinks(block) {
  const children = block.items.filter(item => item.length).flatMap((item, index) => (index ? [text(' · '), ...item] : item))
  return children.length ? [{ type: 'paragraph', children }] : []
}

function simplifyBox(block) {
  const heading = block.title.length ? [{ type: 'heading', level: 2, marker: block.color, children: block.title }] : []
  return [...heading, ...simplifyBlocks(block.blocks)]
}

function simplifyTiles(block) {
  const items = block.items.map(item => {
    const caption = item.caption.length ? item.caption : [text(item.image.alt || item.image.file)]
    return { children: item.link ? [{ ...item.link, children: caption }] : caption, blocks: [] }
  })
  return [{ type: 'list', ordered: false, items }]
}

function simplifyBlock(block) {
  switch (block.type) {
    case 'banner':
      return simplifyBanner(block)
    case 'links':
      return simplifyLinks(block)
    case 'box':
      return simplifyBox(block)
    case 'center':
      return simplifyBlocks(block.blocks)
    case 'portal':
      return []
    case 'gallery':
      return block.mode === 'tiles' ? simplifyTiles(block) : [block]
    default:
      return [block]
  }
}

function simplifyBlocks(blocks = []) {
  return blocks.flatMap(simplifyBlock)
}

export function simplifyPage(doc) {
  return doc ? { ...doc, blocks: simplifyBlocks(doc.blocks) } : null
}

// A short window shows the lead's text first and its infoboxes and figures after it:
// floated first, they would fill the whole window.
const ASIDES = new Set(['infobox', 'figure'])

export function leadFirst(doc) {
  if (!doc?.blocks) return doc
  const end = doc.blocks.findIndex(block => block.type === 'heading')
  const lead = end === -1 ? doc.blocks : doc.blocks.slice(0, end)
  const words = lead.filter(block => !ASIDES.has(block.type))
  if (!words.length || !ASIDES.has(lead[0]?.type)) return doc
  const asides = lead.filter(block => ASIDES.has(block.type))
  return { ...doc, blocks: [...words, ...asides, ...doc.blocks.slice(lead.length)] }
}
