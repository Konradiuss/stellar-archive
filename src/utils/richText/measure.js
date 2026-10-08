// Typewriter steps per part of a document. RichText.vue spends its `limit` with the same costs,
// so both agree where printing stops.

export const IMAGE_COST = 12
export const RULE_COST = 4
export const BREAK_COST = 1

export const refLabel = number => `[${number}]`

export function measureInline(children = []) {
  let total = 0
  for (const node of children) {
    if (node.type === 'text') total += node.value.length
    else if (node.type === 'break') total += BREAK_COST
    else if (node.type === 'image') total += IMAGE_COST
    else if (node.type === 'ref') total += refLabel(node.number).length
    else if (node.type === 'figure') total += IMAGE_COST + measureInline(node.caption)
    else total += measureInline(node.children)
  }
  return total
}

export function measureBlocks(blocks = []) {
  let total = 0
  for (const block of blocks) total += measureBlock(block)
  return total
}

function measureBlock(block) {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'hatnote':
      return measureInline(block.children)
    case 'notice':
      return block.title.length + measureBlocks(block.blocks)
    case 'references':
      return block.notes.reduce((sum, note) => sum + refLabel(note.number).length + measureInline(note.children), 0)
    case 'gallery':
      return block.items.reduce((sum, item) => sum + IMAGE_COST + measureInline(item.caption), 0)
    case 'banner':
      return (block.image ? IMAGE_COST : block.logo?.text.length ?? 0) + measureInline(block.caption) + measureBlocks(block.blocks)
    case 'box':
      return measureInline(block.title) + measureBlocks(block.blocks)
    case 'center':
      return measureBlocks(block.blocks)
    case 'links':
      return block.items.reduce((sum, item) => sum + measureInline(item), 0)
    case 'rule':
      return RULE_COST
    case 'pre':
      return block.text.length
    case 'figure':
      return IMAGE_COST + measureInline(block.caption)
    case 'quote':
      return measureBlocks(block.blocks)
    case 'list':
    case 'definitions':
      return block.items.reduce((sum, item) => sum + measureInline(item.children) + measureBlocks(item.blocks), 0)
    case 'table':
      return measureInline(block.caption ?? []) + block.rows.reduce((sum, row) => (
        sum + row.cells.reduce((cellSum, cell) => cellSum + measureBlocks(cell.blocks), 0)
      ), 0)
    case 'infobox':
      return block.name.length + block.params.reduce((sum, param) => (
        sum + (param.key?.length ?? 0) + measureInline(param.children)
      ), 0)
    default:
      return 0
  }
}

export function measureDocument(doc) {
  return doc ? measureBlocks(doc.blocks) : 0
}
