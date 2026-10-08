import { describe, expect, it } from 'vitest'
import { parseWikitext } from '../wikitextParser'
import { measureDocument } from '../measure'
import { leadFirst, simplifyPage } from '../simplify'
import { BOX_COLORS } from '../templates'

const text = value => ({ type: 'text', value })
const LAYOUT = new Set(['banner', 'box', 'links', 'center', 'portal'])

function blockTypes(blocks) {
  return blocks.flatMap(block => [
    block.type,
    ...blockTypes(block.blocks ?? []),
    ...(block.items ?? []).flatMap(item => blockTypes(item.blocks ?? []))
  ])
}

const MAIN = `{{Banner
|title = GALAXY ARCHIVE
|style = sunset
|caption = Welcome: {{NUMBEROFARTICLES}} articles
|text = Everything about the [[Galaxy|galaxy]] is here.
}}
{{Links|[[Galaxy|About the world]]|[[Settlement Chronicle|Chronicle]]|[https://github.com/ Source code]}}

{{Box|New to the archive|color=green|icon=question|
Not sure where to begin?
* [[Settlement Chronicle]] — from the first jump
}}
{{Box|Factions|color=red|icon=flag|link=Category:Factions|
Three powers divide the galaxy.
<gallery mode="tiles" widths=48px>
File:emblem-earth.png|Solar Concord|link=Solar Concord
File:emblem-mars.png|Crucible Combine|link=Crucible Combine
File:emblem-blank.png
</gallery>
}}
{{Center|Words in the center.}}

== Plain section ==
A paragraph as it is.

{{Archive sections}}`

describe('a page made plain for the narrow lore screen', () => {
  const doc = parseWikitext(MAIN)
  const before = JSON.stringify(doc)
  const plain = simplifyPage(doc)
  const [banner, caption, intro, links, newcomer, newcomerText, newcomerList, factions, factionsText, tiles, center, heading, paragraph, ...rest] = plain.blocks

  it('turns the banner into a heading of its logo, the caption and the text', () => {
    expect(banner).toEqual({ type: 'heading', level: 1, children: [text('GALAXY ARCHIVE')] })
    expect(caption).toEqual({ type: 'paragraph', children: [text('Welcome: '), { type: 'magic', name: 'articles' }, text(' articles')] })
    expect(intro.type).toBe('paragraph')
    expect(intro.children[1]).toMatchObject({ type: 'link', page: 'Galaxy' })
  })

  it('puts the links of a row into one paragraph, a dot between them', () => {
    expect(links.type).toBe('paragraph')
    expect(links.children.map(node => node.type)).toEqual(['link', 'text', 'link', 'text', 'link'])
    expect(links.children[1]).toEqual(text(' · '))
    expect(links.children[4]).toMatchObject({ type: 'link', href: 'https://github.com/' })
  })

  it('turns each box into a heading with a mark of its colour, then its text', () => {
    expect(newcomer).toEqual({ type: 'heading', level: 2, marker: BOX_COLORS.green, children: [text('New to the archive')] })
    expect(newcomerText.type).toBe('paragraph')
    expect(newcomerList.type).toBe('list')
    expect(factions).toMatchObject({ type: 'heading', level: 2, marker: BOX_COLORS.red })
    expect(factions.children).toEqual([{ type: 'link', page: 'Category:Factions', children: [text('Factions')] }])
    expect(factionsText.type).toBe('paragraph')
  })

  it('lists the tiles as links to their pages', () => {
    expect(tiles.type).toBe('list')
    expect(tiles.ordered).toBe(false)
    expect(tiles.items.map(item => item.children[0])).toEqual([
      { type: 'link', page: 'Solar Concord', children: [text('Solar Concord')] },
      { type: 'link', page: 'Crucible Combine', children: [text('Crucible Combine')] },
      text('emblem-blank.png')
    ])
  })

  it('opens the centre, keeps any other block and leaves out the sections of the archive', () => {
    expect(center).toEqual({ type: 'paragraph', children: [text('Words in the center.')] })
    expect(heading).toMatchObject({ type: 'heading', level: 2, children: [text('Plain section')] })
    expect(heading.marker).toBeUndefined()
    expect(paragraph).toEqual({ type: 'paragraph', children: [text('A paragraph as it is.')] })
    expect(rest).toEqual([])
    expect(blockTypes(plain.blocks).filter(type => LAYOUT.has(type))).toEqual([])
    expect(blockTypes(plain.blocks)).not.toContain('gallery')
  })

  it('prints as long as its text, and leaves the page itself as it was', () => {
    expect(measureDocument(plain)).toBeGreaterThan(0)
    expect(JSON.stringify(doc)).toBe(before)
    expect(simplifyPage(null)).toBeNull()
    expect(simplifyPage(parseWikitext('{{Banner|logo=File:logo.png}}')).blocks).toEqual([
      { type: 'figure', image: { file: 'logo.png', alt: 'logo.png' }, align: 'center', caption: [] }
    ])
  })
})

// Was: in PLANET-DATA.EXE the card of Earth filled the window, its text below.
describe('lore for a short window', () => {
  const types = doc => doc.blocks.map(block => block.type)

  it('puts the text of the lead before its card and its picture', () => {
    const doc = parseWikitext('{{Planet\n|name = Earth\n}}\n[[File:earth.jpg|thumb|right|Photo]]\nThe home world.\n\nCapital.\n== History ==\nText.')
    expect(types(leadFirst(doc))).toEqual(['paragraph', 'paragraph', 'infobox', 'figure', 'heading', 'paragraph'])
    expect(types(doc)).toEqual(['infobox', 'figure', 'paragraph', 'paragraph', 'heading', 'paragraph'])
  })

  it('leaves alone a lead that starts with its text, or has no text', () => {
    const textFirst = parseWikitext('The home world.\n{{Planet\n|name = Earth\n}}')
    expect(leadFirst(textFirst)).toBe(textFirst)
    const cardOnly = parseWikitext('{{Planet\n|name = Earth\n}}\n== History ==\nText.')
    expect(leadFirst(cardOnly)).toBe(cardOnly)
    expect(leadFirst(null)).toBe(null)
  })
})
