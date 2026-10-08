import { describe, expect, it } from 'vitest'
import { parseWikitext } from '../richText/wikitextParser'
import { collectHeadings, findSection } from '../wikiToc'

const sections = source => collectHeadings(parseWikitext(source))

describe('wiki contents', () => {
  it('numbers the sections from the biggest heading of the article', () => {
    const toc = sections([
      '== History ==', '=== Schism ===', '=== Truce ===', '== Structure ==', '== Fleet ==', '=== First ==='
    ].join('\n'))
    expect(toc.map(({ number, text, depth, parent }) => [number, text, depth, parent])).toEqual([
      ['1', 'History', 0, null],
      ['1.1', 'Schism', 1, 0],
      ['1.2', 'Truce', 1, 0],
      ['2', 'Structure', 0, null],
      ['3', 'Fleet', 0, null],
      ['3.1', 'First', 1, 4]
    ])
  })

  it('counts on when a level is skipped or the article starts deeper', () => {
    const toc = sections('=== Intro ===\n== Chapter ==\n==== Detail ====\n=== Part ===')
    expect(toc.map(({ number, depth }) => [number, depth])).toEqual([['1', 0], ['2', 0], ['2.1', 1], ['2.2', 1]])
  })

  it('gives every section an anchor, a repeated one with a number', () => {
    const toc = sections('== See also ==\n== Fleet ==\n=== Fleet ===\n== fleet ==')
    expect(toc.map(heading => heading.anchor)).toEqual(['See_also', 'Fleet', 'Fleet_2', 'fleet_3'])
  })

  // Was: "A", "A" and "A 2" all got the anchor A_2, and #A_2 opened the wrong section.
  it('never gives two sections one anchor', () => {
    const anchors = sections('== A ==\n== A ==\n== A 2 ==').map(heading => heading.anchor)
    expect(anchors).toEqual(['A', 'A_2', 'A_2_2'])
    expect(new Set(anchors).size).toBe(3)
  })

  it('finds a section by its anchor or its text, whatever the case and spaces', () => {
    const toc = sections('== See also ==\n== Fleet ==\n=== Fleet ===')
    expect(findSection(toc, 'See_also')).toBe(0)
    expect(findSection(toc, 'see  ALSO')).toBe(0)
    expect(findSection(toc, 'Fleet_2')).toBe(2)
    expect(findSection(toc, 'Fleet')).toBe(1)
    expect(findSection(toc, 'None')).toBe(-1)
    expect(findSection(toc, '')).toBe(-1)
  })

  it('has no sections for an empty page', () => {
    expect(collectHeadings(null)).toEqual([])
  })
})
