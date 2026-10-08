import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildWikiIndex, normalizeWiki, pageKey, toSlug } from '../wikiPages.js'
import { collectMapNotes } from '../mapJournal'

const WORLD_PAGE_TITLE = 'Galaxy'

const doc = name => ({ blocks: [{ type: 'paragraph', children: [{ type: 'text', value: name }] }] })

function sampleMap() {
  const wiki = normalizeWiki({
    home: 'Chronicle',
    groups: [{ id: 'factions', title: 'Factions', groups: [{ id: 'corps', title: 'Corporations' }] }],
    articles: [
      { title: 'Crucible Combine', group: 'corps', file: 'wiki/crucible-combine.md', aliases: ['Combine'] },
      { title: 'Chronicle', text: 'Years' },
      { title: 'Earth', text: 'An article about Earth' }
    ]
  })
  for (const article of wiki.articles) article.loreDoc = doc(article.title)
  return {
    wiki,
    worldLoreDoc: doc('world'),
    stars: [
      { id: 'sol', name: 'Sol', loreDoc: doc('Sol') },
      { id: 'dark', name: 'Dark' },
      { id: 'halcyon', name: 'Halcyon', loreDoc: doc('Halcyon') }
    ],
    systems: {
      sol: { planets: [{ name: 'Earth', loreDoc: doc('Earth'), satellites: [{ name: 'Moon', loreDoc: doc('Moon') }, { name: 'Ring', kind: 'station', loreDoc: doc('Ring') }] }] },
      halcyon: { planets: [{ name: 'Earth', loreDoc: doc('Earth 2') }, { name: 'Wasteland' }] }
    }
  }
}

describe('wiki pages', () => {
  afterEach(() => vi.restoreAllMocks())

  it('names pages as MediaWiki does, whatever the case and the spaces', () => {
    expect(toSlug(' Crucible  Combine ')).toBe('Crucible_Combine')
    expect(pageKey('Crucible_Combine')).toBe(pageKey('crucible combine'))
  })

  it('checks the wiki section of the map', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wiki = normalizeWiki({
      groups: [{ id: 'a', title: 'A' }, { id: 'a' }, { title: 'no id' }],
      articles: [{ title: 'One', group: 'a' }, { title: 'one' }, { text: 'no title' }, { title: 'Two', group: 'none', format: 'html', aliases: ['2', 5] }]
    })
    expect(wiki.groups.map(group => group.id)).toEqual(['a'])
    expect(wiki.articles.map(article => article.title)).toEqual(['One', 'Two'])
    expect(wiki.articles[1]).toMatchObject({ group: null, format: undefined, aliases: ['2'] })
    expect(warn).toHaveBeenCalledTimes(5)
    expect(normalizeWiki(null)).toMatchObject({ home: null, portal: true, groups: [], articles: [] })
    expect(normalizeWiki({ groups: [{ id: 'a' }], worldGroup: 'a' }).worldGroup).toBe('a')
    expect(collectMapNotes(() => normalizeWiki({ groups: [{ id: 'a' }], worldGroup: 'b' }))).toMatchObject({
      result: { worldGroup: null },
      notes: [{ where: 'wiki.worldGroup', message: 'Group "b" is not in "wiki.groups": the world page has no group.' }]
    })
    expect(normalizeWiki({ portal: false, groups: [{ id: 'g', icon: 'gear' }] })).toMatchObject({ portal: false, groups: [{ id: 'g', icon: 'gear' }] })
  })

  it('folds a group deeper than three levels into the one above it', () => {
    const { result: wiki, notes } = collectMapNotes(() => normalizeWiki({
      groups: [{ id: 'a', groups: [{ id: 'b', groups: [{ id: 'c', groups: [{ id: 'd', groups: [{ id: 'e' }] }] }] }] }],
      articles: [{ title: 'Deep', group: 'd' }, { title: 'Deeper', group: 'e' }, { title: 'Third', group: 'c' }]
    }))
    expect(wiki.groups[0].groups[0].groups[0]).toMatchObject({ id: 'c', groups: [] })
    expect(wiki.articles.map(article => article.group)).toEqual(['c', 'c', 'c'])
    expect(notes.map(note => note.message)).toEqual([
      'Group "d" is deeper than 3 levels: its articles go to "c".',
      'Group "e" is deeper than 3 levels: its articles go to "c".'
    ])
    const index = buildWikiIndex({ wiki, stars: [], systems: {} })
    expect(index.pages.find(page => page.title === 'Deep').path).toEqual(['a', 'b', 'c'])
  })

  it('makes pages of the world, the places with lore and the articles', () => {
    const index = buildWikiIndex(sampleMap())
    const titles = index.pages.map(page => `${page.kind}:${page.slug}`)
    expect(titles).toEqual([
      `world:${WORLD_PAGE_TITLE}`,
      'star:Sol',
      'star:Halcyon',
      'planet:Earth',
      'satellite:Moon',
      'satellite:Ring',
      'planet:Earth_(Halcyon)',
      'article:Crucible_Combine',
      'article:Chronicle',
      'article:Earth_(article)'
    ])
    expect(index.find('Dark')).toBeNull()
    expect(index.find('Wasteland')).toBeNull()
  })

  it('knows where each page is and what it is', () => {
    const index = buildWikiIndex(sampleMap())
    expect(index.get('Crucible_Combine')).toMatchObject({ path: ['Factions', 'Corporations'], mapTarget: null })
    expect(index.get('moon')).toMatchObject({ tag: 'moon', path: ['Places', 'Sol', 'Earth'], mapTarget: { starId: 'sol', planetIndex: 0, satelliteIndex: 0 } })
    expect(index.get('Ring').tag).toBe('station')
    expect(index.get('Earth_(Halcyon)').mapTarget).toEqual({ starId: 'halcyon', planetIndex: 0 })
    expect(index.get(WORLD_PAGE_TITLE).mapTarget).toEqual({ starId: null })
  })

  it('finds pages by title, slug and alias, and the page of a link', () => {
    const index = buildWikiIndex(sampleMap())
    expect(index.find('combine').title).toBe('Crucible Combine')
    expect(index.find('crucible_combine').title).toBe('Crucible Combine')
    expect(index.forTarget({ kind: 'article', title: 'Earth' }).slug).toBe('Earth_(article)')
    expect(index.forTarget({ kind: 'planet', starId: 'sol', planetIndex: 0 }).slug).toBe('Earth')
    expect(index.forTarget({ kind: 'satellite', starId: 'sol', planetIndex: 0, satelliteIndex: 1 }).title).toBe('Ring')
    expect(index.forTarget({ kind: 'star', starId: 'sol' }).title).toBe('Sol')
    expect(index.forTarget({ kind: 'world' }).title).toBe(WORLD_PAGE_TITLE)
    expect(index.forTarget({ kind: 'star', starId: 'dark' })).toBeNull()
  })

  it('opens on the main page of the map, or the world', () => {
    expect(buildWikiIndex(sampleMap()).home.title).toBe('Chronicle')
    const map = sampleMap()
    map.wiki.home = 'No such page'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(buildWikiIndex(map).home.title).toBe(WORLD_PAGE_TITLE)
    expect(buildWikiIndex().home).toBeNull()
  })

  it('ties an article to a place of the map, the page of the place first', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const map = sampleMap()
    map.wiki = normalizeWiki({
      articles: [
        { title: 'Wasteland project', place: 'Wasteland' },
        { title: 'Ring station', place: 'ring' },
        { title: 'About Sol', place: 'sol' },
        { title: 'More about Wasteland', place: 'Wasteland' },
        { title: 'Nowhere', place: 'No such place' }
      ]
    })
    const index = buildWikiIndex(map)
    expect(index.find('Wasteland project').mapTarget).toEqual({ starId: 'halcyon', planetIndex: 1, satelliteIndex: null })
    expect(index.find('Ring station').mapTarget).toEqual({ starId: 'sol', planetIndex: 0, satelliteIndex: 1 })
    expect(index.find('About Sol').mapTarget).toEqual({ starId: 'sol', planetIndex: null, satelliteIndex: null })
    expect(index.find('Nowhere').mapTarget).toBeNull()
    expect(warn).toHaveBeenCalledWith('Map file, wiki.articles "Nowhere": Place "No such place" is not on the map.')
    expect(index.forPlace({ kind: 'star', starId: 'sol' }).kind).toBe('star')
    expect(index.forPlace({ kind: 'satellite', starId: 'sol', planetIndex: 0, satelliteIndex: 1 }).title).toBe('Ring')
    expect(index.forPlace({ kind: 'planet', starId: 'halcyon', planetIndex: 1 }).title).toBe('Wasteland project')
    expect(index.forPlace({ kind: 'star', starId: 'dark' })).toBeNull()
    expect(index.forTarget({ kind: 'planet', starId: 'halcyon', planetIndex: 1 })).toBeNull()
  })
})
