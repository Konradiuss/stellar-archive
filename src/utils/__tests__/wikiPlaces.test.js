import { describe, expect, it } from 'vitest'
import { decorateWikiPages } from '../wikiPlaces.js'
import { buildWikiIndex, normalizeWiki } from '../wikiPages.js'
import { parseWikitext } from '../richText/wikitextParser.js'

const doc = source => parseWikitext(source)

function sampleMap({ earthLore = 'Home world.', concord = '== History ==\nYears.\n== See also ==\n* [[Chronicle]]\n<references />' } = {}) {
  const wiki = normalizeWiki({
    articles: [
      { title: 'Solar Concord', aliases: ['Concord'], text: concord },
      { title: 'Chronicle', text: 'Years' }
    ]
  })
  for (const article of wiki.articles) article.loreDoc = doc(article.text)
  const stars = [
    { id: 'sol', name: 'Sol', faction: 'concord', sectorX: 2, sectorY: 3, loreDoc: doc('Cradle.') },
    { id: 'cinder', name: 'Cinder', faction: 'combine', sectorX: 3, sectorY: 3, loreDoc: doc('Cinder.') },
    { id: 'asterion', name: 'Asterion', faction: 'concord', sectorX: 9, sectorY: 9 },
    { id: 'lost', name: 'Lost', sectorX: 0, sectorY: 0, loreDoc: doc('Nobody.') }
  ]
  const systems = {
    sol: {
      planets: [
        { name: 'Mars', orbitRadius: 120 },
        { name: 'Earth', orbitRadius: 80, loreDoc: doc(earthLore), satellites: [{ name: 'Moon', loreDoc: doc('Moon.') }, { name: 'Ring', kind: 'station', type: 'ring', loreDoc: doc('Ring.') }] }
      ]
    }
  }
  const factions = { concord: { name: 'Solar Concord' }, combine: { name: 'Crucible Combine' } }
  const hyperlines = [{ from: { sectorX: 2, sectorY: 3 }, to: { sectorX: 3, sectorY: 3 }, type: 'gate' }]
  const index = buildWikiIndex({ wiki, worldLoreDoc: doc('world'), stars, systems })
  return { index, map: { stars, systems, factions, hyperlines, hyperlineTypes: {} } }
}

// A card as text: 'Key: value' rows; links in [brackets].
const inlineText = nodes => nodes.map(node => (
  node.type === 'text' ? node.value : node.type === 'link' ? `[${inlineText(node.children)}]` : inlineText(node.children ?? [])
)).join('')
const cardRows = card => card.params.map(param => `${param.key}: ${inlineText(param.children)}`)

describe('wiki places', () => {
  it('gives a star a card from the map, its lore after it', () => {
    const { index, map } = sampleMap()
    const loreDoc = index.get('Sol').doc
    decorateWikiPages(index, map)
    const [card, ...rest] = index.get('Sol').doc.blocks
    expect(card).toMatchObject({ type: 'infobox', name: 'Sol', auto: true })
    expect(cardRows(card)).toEqual([
      'Type: star system',
      'Faction: [Solar Concord]',
      'Sector: 2,3',
      'Planets: [Earth] and [Mars]',
      'Hyperlines: [Cinder] (Quantum Gates)'
    ])
    expect(rest).toEqual(loreDoc.blocks)
    expect(loreDoc.blocks[0].type).toBe('paragraph')
    expect(card.params[1].children[0].action).toEqual({ kind: 'article', title: 'Solar Concord' })
    expect(card.params[3].children[2].action).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 0 })
    expect(cardRows(index.get('Lost').doc.blocks[0])).toEqual(['Type: star system', 'Faction: No faction', 'Sector: 0,0'])
    expect(cardRows(index.get('Cinder').doc.blocks[0])[1]).toBe('Faction: Crucible Combine')
  })

  it('gives planets and satellites their system, orbit and neighbours', () => {
    const { index, map } = sampleMap()
    decorateWikiPages(index, map)
    expect(cardRows(index.get('Earth').doc.blocks[0])).toEqual([
      'Type: planet', 'System: [Sol]', 'Faction: [Solar Concord]', 'Orbit: I of II', 'Moons: [Moon]', 'Stations: [Ring]'
    ])
    expect(cardRows(index.get('Ring').doc.blocks[0])).toEqual([
      'Type: station · ring', 'Planet: [Earth]', 'System: [Sol]', 'Faction: [Solar Concord]'
    ])
    expect(cardRows(index.get('Moon').doc.blocks[0])[0]).toBe('Type: moon')
  })

  it('adds to the card of the author only what it does not say, under any of its names', () => {
    const { index, map } = sampleMap({ earthLore: '{{Planet\n|name=Earth\n|class=Cradle\n|faction=[[Concord]]\n}}\nHome world.' })
    decorateWikiPages(index, map)
    const blocks = index.get('Earth').doc.blocks
    expect(blocks.filter(block => block.type === 'infobox')).toHaveLength(1)
    expect(cardRows(blocks[0])).toEqual([
      'name: Earth', 'class: Cradle', 'faction: [Concord]', 'System: [Sol]', 'Orbit: I of II', 'Moons: [Moon]', 'Stations: [Ring]'
    ])
  })

  it('lists the systems of a faction in its article, before the closing sections', () => {
    const { index, map } = sampleMap()
    decorateWikiPages(index, map)
    const blocks = index.get('Solar_Concord').doc.blocks
    const outline = blocks.map(block => (block.type === 'heading' ? `== ${inlineText(block.children)}` : block.type))
    expect(outline).toEqual(['== History', 'paragraph', '== Systems', 'paragraph', 'list', '== See also', 'list', 'references'])
    expect(inlineText(blocks[3].children)).toBe('The faction holds 2 systems on the map.')
    expect(blocks[4].items.map(item => inlineText(item.children))).toEqual(['[Asterion]', '[Sol] — [Mars] and [Earth]'])
    expect(index.get('Chronicle').doc.blocks).toHaveLength(1)
  })

  it('keeps the systems section the author wrote, and puts it last without closing sections', () => {
    let { index, map } = sampleMap({ concord: '== Systems ==\nOurs.' })
    decorateWikiPages(index, map)
    expect(index.get('Solar_Concord').doc.blocks).toHaveLength(2)
    ;({ index, map } = sampleMap({ concord: 'Briefly.' }))
    decorateWikiPages(index, map)
    expect(index.get('Solar_Concord').doc.blocks.map(block => block.type)).toEqual(['paragraph', 'heading', 'paragraph', 'list'])
  })
})
