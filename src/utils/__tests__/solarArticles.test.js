import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { parseWikitext } from '../richText/wikitextParser'
import { parseMarkdown } from '../richText/markdownParser'
import { inlineToText } from '../richText/inline'
import { forEachInline } from '../richText/walk'
import { collectHeadings } from '../wikiToc'

const solarUrl = new URL('../../../public/lore/solar/', import.meta.url)
const articles = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Moon', 'Phobos', 'Deimos', 'Io', 'Europa', 'Titan', 'Triton']
const wikipediaTitle = name => name === 'Mercury' ? 'Mercury_(planet)' : ['Phobos', 'Deimos', 'Io', 'Europa', 'Titan', 'Triton'].includes(name) ? `${name}_(moon)` : name
const imagesUrl = new URL('../../../public/lore/images/', import.meta.url)

function imageDimensions(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  if (bytes.readUInt16BE(0) !== 0xffd8) throw new Error('Not a PNG or JPEG image')
  for (let offset = 2; offset < bytes.length;) {
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG marker')
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    const length = bytes.readUInt16BE(offset)
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return { format: 'jpg', width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) }
    }
    offset += length
  }
  throw new Error('JPEG dimensions not found')
}

describe('complete scientific articles in the release atlas', () => {
  it.each(articles)('%s has 2,000–3,000 words of prose, a table, nested sections and attributed references', name => {
    const source = readFileSync(new URL(`${name.toLowerCase()}.wiki`, solarUrl), 'utf8')
    const doc = parseWikitext(source)
    const body = parseWikitext(source.split(/^== Sources ==$/m)[0])
    // Count narrative paragraphs only: captions, table cells, headings, notes and attribution do not pad the total.
    const prose = body.blocks.filter(block => block.type === 'paragraph').map(block => inlineToText(block.children)).join(' ')
    const words = prose.match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/gi) ?? []
    expect(words.length, `${name}: ${words.length} words`).toBeGreaterThanOrEqual(2000)
    expect(words.length, `${name}: ${words.length} words`).toBeLessThanOrEqual(3000)
    const headings = collectHeadings(body)
    expect(headings.filter(heading => heading.level === 2).length).toBeGreaterThanOrEqual(8)
    expect(headings.some(heading => heading.level === 3)).toBe(true)
    expect(body.blocks.some(block => block.type === 'table')).toBe(true)
    expect(doc.blocks.find(block => block.type === 'references')?.notes.length).toBeGreaterThan(0)
    const links = []
    forEachInline(doc.blocks, node => { if (node.href) links.push(node.href) })
    expect(links).toContain(`https://en.wikipedia.org/wiki/${wikipediaTitle(name)}`)
    expect(links).toContain(`https://en.wikipedia.org/w/index.php?title=${wikipediaTitle(name)}&action=history`)
    expect(links).toContain('https://creativecommons.org/licenses/by-sa/4.0/')
    expect(source).toContain('Wikipedia contributors')
    expect(source).toContain('Changes include')
  })

  it.each(articles)('%s has three local illustrations with accessible descriptions and separate image credits', name => {
    const source = readFileSync(new URL(`${name.toLowerCase()}.wiki`, solarUrl), 'utf8')
    const doc = parseWikitext(source)
    const figures = doc.blocks.filter(block => block.type === 'figure')
    expect(figures).toHaveLength(3)
    expect(figures[0]).toMatchObject({ align: 'right', image: { width: 220 } })
    expect(figures.slice(1).every(figure => figure.align === 'center' && figure.image.width === 480)).toBe(true)
    expect(new Set(figures.map(figure => figure.image.file)).size).toBe(3)
    for (const figure of figures) {
      const file = figure.image.file
      expect(file).toMatch(/^(?:solar\/[a-z-]+\.(?:jpg|png)|earth\.jpg)$/)
      expect(figure.image.alt.length).toBeGreaterThan(15)
      expect(inlineToText(figure.caption)).toContain('Credit:')
      const dimensions = imageDimensions(readFileSync(new URL(file, imagesUrl)))
      expect(file.endsWith(`.${dimensions.format}`)).toBe(true)
      expect(Math.max(dimensions.width, dimensions.height)).toBeLessThanOrEqual(1280)
      expect(Math.min(dimensions.width, dimensions.height)).toBeGreaterThan(96)
      const links = []
      forEachInline([figure], node => { if (node.href) links.push(node) })
      const original = links.find(link => inlineToText(link.children) === 'Source')
      const license = links.find(link => /^(Public domain|CC0 1\.0|CC BY(?:-SA)? \d\.\d)$/.test(inlineToText(link.children)))
      expect(original?.href).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
      expect(license?.href).toMatch(/^https:\/\/(?:creativecommons\.org\/|commons\.wikimedia\.org\/wiki\/File:.*#Licensing$)/)
    }
  })

  it('keeps every explicit external source URL intact across the published Wikitext and Markdown files', () => {
    for (const folder of [solarUrl, new URL('../../../public/wiki/', import.meta.url)]) {
      for (const file of readdirSync(folder).filter(file => /\.(wiki|md)$/.test(file))) {
        const source = readFileSync(new URL(file, folder), 'utf8')
        const doc = file.endsWith('.wiki') ? parseWikitext(source) : parseMarkdown(source)
        const actual = []
        forEachInline(doc.blocks, node => { if (node.href) actual.push(node.href) })
        if (file.endsWith('.wiki')) for (const match of source.matchAll(/\[(https?:\/\/[^\s\]]+)(?:\s[^\]]*)?\]/g)) {
          expect(actual, `${file}: ${match[1]}`).toContain(match[1])
        }
        for (const href of actual) expect(() => new URL(href), `${file}: ${href}`).not.toThrow()
      }
    }
  })

  // Was: an unbalanced heading rendered as "= Lists".
  it('balances the equals signs of every Wikitext heading', () => {
    for (const folder of [solarUrl, new URL('../../../public/wiki/', import.meta.url)]) {
      for (const file of readdirSync(folder).filter(file => file.endsWith('.wiki'))) {
        const lines = readFileSync(new URL(file, folder), 'utf8').split(/\r?\n/)
        for (const line of lines.filter(line => /^=.*=\s*$/.test(line))) {
          const [, open, close] = /^(=+).*?(=+)\s*$/.exec(line)
          expect(close.length, `${file}: ${line}`).toBe(open.length)
        }
      }
    }
  })
})
