import { describe, expect, it } from 'vitest'
import { buildNavbox, navboxWords } from '../wikiNavbox.js'
import { buildWikiIndex, normalizeWiki } from '../wikiPages.js'

const doc = name => ({ blocks: [{ type: 'paragraph', children: [{ type: 'text', value: name }] }] })

function sampleMap({ home = null, worldGroup = undefined } = {}) {
  const wiki = normalizeWiki({
    home,
    worldGroup,
    groups: [
      { id: 'factions', title: 'Factions', groups: [{ id: 'corps', title: 'Corporations' }, { id: 'empty', title: 'Empty' }] },
      { id: 'tech', title: 'Technology' }
    ],
    articles: [
      { title: 'Solar Concord', group: 'factions', text: 'Concord' },
      { title: 'Crucible Combine', group: 'corps', text: 'Combine' },
      { title: 'Chronicle', text: 'Years' },
      { title: 'Gates', group: 'tech', text: 'Gates' }
    ]
  })
  for (const article of wiki.articles) article.loreDoc = doc(article.title)
  const stars = [
    { id: 'sol', name: 'Sol', faction: 'concord', loreDoc: doc('Sol') },
    { id: 'asterion', name: 'Asterion', faction: 'concord', loreDoc: doc('Asterion') },
    { id: 'dark', name: 'Dark', faction: 'concord' },
    { id: 'empty', name: 'Empty', faction: 'concord' },
    { id: 'red', name: 'Red', faction: 'combine', loreDoc: doc('Red') },
    { id: 'lost', name: 'Lost', faction: 'nobody', loreDoc: doc('Lost') }
  ]
  const systems = {
    sol: {
      planets: [
        { name: 'Mercury' },
        { name: 'Earth', loreDoc: doc('Earth'), satellites: [{ name: 'Moon', loreDoc: doc('Moon') }, { name: 'Dust' }, { name: 'Ring', kind: 'station', loreDoc: doc('Ring') }] },
        { name: 'Mars', satellites: [{ name: 'Phobos', loreDoc: doc('Phobos') }] }
      ]
    },
    dark: { planets: [{ name: 'Shade', loreDoc: doc('Shade') }] }
  }
  const factions = {
    concord: { name: 'Solar Concord', borderColor: '0x00aaff' },
    combine: { name: 'Crucible Combine', fillColor: '#ff4444' },
    tide: { name: 'Free Tide' }
  }
  const index = buildWikiIndex({ wiki, worldLoreDoc: doc('world'), stars, systems })
  return { index, wiki, stars, systems, factions }
}

const titles = list => list.map(item => item.title)
const findGroup = (navbox, id) => {
  const walk = groups => groups.flatMap(group => [group, ...walk(group.groups)])
  return walk(navbox.groups).find(group => group.id === id)
}

describe('wiki navbox', () => {
  // Was: the world page could only be the main page or in the group of pages without one.
  it('puts the world page in the group the map gives it', () => {
    const { index, ...rest } = sampleMap({ home: 'Chronicle', worldGroup: 'corps' })
    expect(index.find('Galaxy')).toMatchObject({ kind: 'world', group: 'corps', path: ['Factions', 'Corporations'] })
    const navbox = buildNavbox({ index, ...rest })
    expect(titles(findGroup(navbox, 'group:corps').items)).toEqual(['Galaxy', 'Crucible Combine'])
    expect(findGroup(navbox, 'misc')).toBeUndefined()
  })

  it('puts the groups of the map first, then the places, then the rest', () => {
    const navbox = buildNavbox(sampleMap())
    expect(navbox.home.title).toBe('Galaxy')
    expect(titles(navbox.groups)).toEqual(['Factions', 'Technology', 'Places', 'Other pages', 'Service pages'])
    expect(titles(findGroup(navbox, 'service').items)).toEqual(['All pages', 'Categories', 'Wanted pages'])
    const factions = navbox.groups[0]
    expect(titles(factions.items)).toEqual(['Solar Concord'])
    expect(titles(factions.groups)).toEqual(['Corporations'])
    expect(titles(factions.groups[0].items)).toEqual(['Crucible Combine'])
    expect([...factions.slugs]).toEqual(['Solar_Concord', 'Crucible_Combine'])
    expect(titles(findGroup(navbox, 'misc').items)).toEqual(['Chronicle'])
  })

  it('lists the places by faction: stars by name, then their planets and satellites', () => {
    const navbox = buildNavbox(sampleMap())
    const places = findGroup(navbox, 'places')
    expect(titles(places.groups)).toEqual(['Solar Concord', 'Crucible Combine', 'No faction'])
    const concord = places.groups[0]
    expect(concord.page.slug).toBe('Solar_Concord')
    expect(concord.color).toBe('#00aaff')
    expect(places.groups[1].color).toBe('#ff4444')
    expect(places.groups[2]).toMatchObject({ page: null, color: '#9a9a9a' })
    expect(titles(concord.items)).toEqual(['Asterion', 'Dark', 'Sol'])
    const [, dark, sol] = concord.items
    expect(dark.page).toBeNull()
    expect(titles(dark.items)).toEqual(['Shade'])
    expect(titles(sol.items)).toEqual(['Earth', 'Mars'])
    expect(titles(sol.items[0].items)).toEqual(['Moon', 'Ring'])
    expect(sol.items[1]).toMatchObject({ page: null, items: [{ title: 'Phobos' }] })
    expect(titles(places.groups[2].items)).toEqual(['Lost'])
  })

  it('shows every page once outside the places, the world in the rest when it is not the main page', () => {
    const map = sampleMap({ home: 'Chronicle' })
    const navbox = buildNavbox(map)
    expect(navbox.home.title).toBe('Chronicle')
    expect(titles(findGroup(navbox, 'misc').items)).toEqual(['Galaxy'])
    const written = navbox.groups.filter(group => group.id !== 'service')
    const everywhere = new Set([navbox.home.slug, ...written.flatMap(group => [...group.slugs])])
    expect([...everywhere].sort()).toEqual(map.index.pages.map(page => page.slug).sort())
  })

  it('is empty without a wiki', () => {
    expect(buildNavbox()).toEqual({ home: null, groups: [] })
  })

  it('writes the items of a row as one run of text, broken only after a dot or a comma', () => {
    const concord = findGroup(buildNavbox(sampleMap()), 'faction:concord')
    const words = navboxWords(concord.items)
    expect(words.map(word => word.map(token => token.text).join(''))).toEqual([
      'Asterion\u00a0·', 'Dark\u00a0(Shade)\u00a0·', 'Sol\u00a0(Earth\u00a0[Moon,', 'Ring],', 'Mars\u00a0[Phobos])'
    ])
    expect(words.flat().filter(token => 'page' in token).map(token => `${token.text}:${token.depth}:${token.page ? 'page' : '-'}`))
      .toEqual(['Asterion:0:page', 'Dark:0:-', 'Shade:1:page', 'Sol:0:page', 'Earth:1:page', 'Moon:2:page', 'Ring:2:page', 'Mars:1:-', 'Phobos:2:page'])
    expect(navboxWords([])).toEqual([])
  })
})
