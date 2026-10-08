function walkInline(nodes, visit) {
  for (const node of nodes ?? []) {
    visit(node)
    if (node.type === 'figure') walkInline(node.caption, visit)
    if (node.link) walkInline([node.link], visit)
    walkInline(node.children, visit)
  }
}

/** visit(node) for every inline node, depth first; endRun() after each run (a paragraph, list item, table cell). */
export function forEachInline(blocks, visit, endRun = () => {}) {
  const run = nodes => {
    walkInline(nodes, visit)
    endRun()
  }
  for (const block of blocks ?? []) {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
      case 'hatnote':
        run(block.children)
        break
      case 'figure':
        run(block.caption)
        break
      case 'quote':
      case 'notice':
        forEachInline(block.blocks, visit, endRun)
        break
      case 'list':
      case 'definitions':
        for (const item of block.items) {
          run(item.children)
          forEachInline(item.blocks, visit, endRun)
        }
        break
      case 'table':
        run(block.caption)
        for (const row of block.rows) for (const cell of row.cells) forEachInline(cell.blocks, visit, endRun)
        break
      case 'infobox':
        for (const param of block.params) run(param.children)
        break
      case 'references':
        for (const note of block.notes) run(note.children)
        break
      case 'gallery':
        for (const item of block.items) run(item.link ? [...item.caption, item.link] : item.caption)
        break
      case 'banner':
        run(block.caption)
        forEachInline(block.blocks, visit, endRun)
        break
      case 'box':
        run(block.title)
        forEachInline(block.blocks, visit, endRun)
        break
      case 'center':
        forEachInline(block.blocks, visit, endRun)
        break
      case 'links':
        for (const item of block.items) run(item)
        break
    }
  }
}

export function docText(doc) {
  const runs = []
  let current = ''
  forEachInline(doc?.blocks, node => {
    if (node.type === 'text') current += node.value
  }, () => {
    if (current.trim()) runs.push(current.trim())
    current = ''
  })
  for (const block of doc?.blocks ?? []) if (block.type === 'pre') runs.push(block.text)
  return runs.join('\n').replace(/[ \t]+/g, ' ')
}
