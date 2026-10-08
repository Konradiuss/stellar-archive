import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LORE_CONFIG,
  createPageFinder,
  detectLoreFormat,
  normalizeLoreConfig,
  prepareLore
} from '../lore'

const BASE = 'http://localhost/maps/map.json'

function sampleMap(extra = {}) {
  return {
    worldLore: 'Galaxy',
    legend: 'Blue - Concord',
    stars: [{ id: 'sol', name: 'Sol', lore: "[[Earth]] and '''[[Mars]]'''" }, { id: 'silent-reach', name: 'Silent Reach' }],
    systems: {
      sol: { planets: [{ name: 'Earth', lore: 'plain' }, { name: 'Mars' }] },
      'silent-reach': { planets: [{ name: 'Earth' }] }
    },
    ...extra
  }
}

describe('lore config and formats', () => {
  it('fills defaults and ignores invalid values', () => {
    expect(normalizeLoreConfig(undefined)).toEqual(DEFAULT_LORE_CONFIG)
    expect(normalizeLoreConfig({ format: 'markdown', images: 'img', wikiUrl: 'https://wiki.example/' })).toEqual({
      format: 'markdown',
      images: 'img/',
      wikiUrl: 'https://wiki.example/'
    })
    expect(normalizeLoreConfig({ format: 'bbcode', wikiUrl: 'javascript:x' })).toEqual(DEFAULT_LORE_CONFIG)
  })

  // Was: "https://wiki.example.com/wiki" made links to ".../wikiMars": the page name was glued to the last word of the address.
  it('ends the address of the wiki with "/", unless it ends with "title="', () => {
    expect(normalizeLoreConfig({ wikiUrl: 'https://wiki.example/wiki' }).wikiUrl).toBe('https://wiki.example/wiki/')
    expect(normalizeLoreConfig({ wikiUrl: 'https://wiki.example/w/index.php?title=' }).wikiUrl).toBe('https://wiki.example/w/index.php?title=')
  })

  it('takes the entry format, then the file extension, then the map default', () => {
    const markdownMap = { ...DEFAULT_LORE_CONFIG, format: 'markdown' }
    expect(detectLoreFormat({ loreFormat: 'wikitext', loreFile: 'a.md' })).toBe('wikitext')
    expect(detectLoreFormat({ loreFile: 'a.md' })).toBe('markdown')
    expect(detectLoreFormat({ loreFile: 'a.wiki' }, markdownMap)).toBe('wikitext')
    expect(detectLoreFormat({}, markdownMap)).toBe('markdown')
    expect(detectLoreFormat({})).toBe('wikitext')
  })
})

describe('createPageFinder', () => {
  const findPage = createPageFinder(sampleMap().stars, sampleMap().systems)

  it('prefers a planet of the current system, then a star, then any planet', () => {
    expect(findPage('Earth', 'silent-reach')).toEqual({ kind: 'planet', starId: 'silent-reach', planetIndex: 0 })
    expect(findPage('earth', 'sol')).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 0 })
    expect(findPage('Mars', 'silent-reach')).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 1 })
    expect(findPage('Silent_Reach')).toEqual({ kind: 'star', starId: 'silent-reach' })
    expect(findPage('sol')).toEqual({ kind: 'star', starId: 'sol' })
    expect(findPage('Neptune')).toBeNull()
  })

  it('finds satellites, after the planets of the current system', () => {
    const systems = {
      sol: { planets: [{ name: 'Earth', satellites: [{ name: 'Moon' }, { name: 'Mars' }] }, { name: 'Mars' }] }
    }
    const find = createPageFinder(sampleMap().stars, systems)
    expect(find('Moon', 'sol')).toEqual({ kind: 'satellite', starId: 'sol', planetIndex: 0, satelliteIndex: 0 })
    expect(find('moon', 'silent-reach')).toEqual({ kind: 'satellite', starId: 'sol', planetIndex: 0, satelliteIndex: 0 })
    expect(find('Mars', 'sol')).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 1 })
  })

  it('finds stations as satellites of their planet', () => {
    const systems = { sol: { planets: [{ name: 'Earth', satellites: [{ name: 'Moon' }, { name: 'Ring', kind: 'station', type: 'ring' }] }] } }
    const find = createPageFinder(sampleMap().stars, systems)
    expect(find('Ring', 'sol')).toEqual({ kind: 'satellite', starId: 'sol', planetIndex: 0, satelliteIndex: 1 })
  })
})

describe('wiki articles', () => {
  it('gives articles their lore and leads links to them after the places', async () => {
    const data = sampleMap({
      wiki: {
        articles: [
          { title: 'Crucible Combine', aliases: ['Combine'], text: 'Mines on [[Mars]]' },
          { title: 'Earth', text: 'Article' },
          { title: 'Gates', file: 'wiki/gates.wiki' }
        ]
      }
    })
    data.stars[0].lore = '[[Crucible Combine]], [[combine|they]], [[Earth]], [[Galaxy]] and [[No such page]]'
    const fetchText = vi.fn(async () => "== Structure ==\n'''Gates'''")
    await prepareLore(data, { baseUrl: BASE, fetchText })

    const [combine, earth, gates] = data.wiki.articles
    expect(combine.loreDoc.blocks[0].children[1].action).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 1 })
    expect(earth.loreDoc).not.toBeNull()
    expect(gates.loreDoc.blocks[0].type).toBe('heading')
    expect(fetchText).toHaveBeenCalledWith('http://localhost/maps/wiki/gates.wiki')

    const links = data.stars[0].loreDoc.blocks[0].children.filter(node => node.type === 'link')
    expect(links.map(link => link.action ?? (link.missing ? 'missing' : null))).toEqual([
      { kind: 'article', title: 'Crucible Combine' },
      { kind: 'article', title: 'Crucible Combine', via: 'combine' },
      { kind: 'planet', starId: 'sol', planetIndex: 0 },
      { kind: 'world' },
      'missing'
    ])
  })

  it('leads links to sections of pages and of the page they are on', async () => {
    const data = sampleMap({ wiki: { articles: [{ title: 'Crucible Combine', text: '[[#Economy]]' }] } })
    data.stars[0].lore = '[[Crucible Combine#History|history]], [[Mars#Climate]] and [[No such page#X]]'
    await prepareLore(data, { baseUrl: BASE, fetchText: vi.fn() })

    const links = data.stars[0].loreDoc.blocks[0].children.filter(node => node.type === 'link')
    expect(links.map(link => link.action ?? (link.missing ? 'missing' : null))).toEqual([
      { kind: 'article', title: 'Crucible Combine', section: 'History' },
      { kind: 'planet', starId: 'sol', planetIndex: 1, section: 'Climate' },
      'missing'
    ])
    expect(data.wiki.articles[0].loreDoc.blocks[0].children[0].action).toEqual({ kind: 'section', section: 'Economy' })
  })
})

describe('templates, footnotes and galleries', () => {
  it('leads their links and images like the rest of the text', async () => {
    const data = sampleMap({
      wiki: {
        articles: [{
          title: 'Chronicle',
          text: '{{Main|Mars}}\n{{Warning|A storm on [[Earth]].}}\nText<ref>See [[Sol]].</ref>\n<gallery>\nFile:earth.jpg|[[Earth]]\n</gallery>'
        }]
      }
    })
    await prepareLore(data, { baseUrl: BASE, fetchText: vi.fn() })
    const [hatnote, notice, , gallery, references] = data.wiki.articles[0].loreDoc.blocks
    expect(hatnote.children[1].action).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 1 })
    expect(notice.blocks[0].children[1].action).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 0 })
    expect(references.notes[0].children[1].action).toEqual({ kind: 'star', starId: 'sol' })
    expect(gallery.items[0].image.src).toBe('http://localhost/maps/lore/images/earth.jpg')
    expect(gallery.items[0].caption[0].action).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 0 })
  })
})

describe('satellite lore', () => {
  it('gives satellites their lore document and links to them', async () => {
    const data = sampleMap()
    data.systems.sol.planets[0].satellites = [{ name: 'Moon', lore: 'Moon of [[Earth]]' }]
    data.systems.sol.planets[0].lore = 'Nearby [[Moon]]'
    await prepareLore(data, { baseUrl: BASE, fetchText: vi.fn() })
    const moon = data.systems.sol.planets[0].satellites[0]
    expect(moon.loreDoc.blocks[0].children[1].action).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 0 })
    expect(data.systems.sol.planets[0].loreDoc.blocks[0].children[1].action)
      .toEqual({ kind: 'satellite', starId: 'sol', planetIndex: 0, satelliteIndex: 0 })
  })
})

describe('prepareLore', () => {
  it('parses every lore text and resolves links against the map', async () => {
    const data = sampleMap()
    await prepareLore(data, { baseUrl: BASE, fetchText: vi.fn() })

    expect(data.worldLoreDoc.blocks[0].children[0].value).toBe('Galaxy')
    expect(data.legendDoc.blocks).toHaveLength(1)
    const [earthLink, , marsBold] = data.stars[0].loreDoc.blocks[0].children
    expect(earthLink.action).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 0 })
    expect(marsBold.children[0].action).toEqual({ kind: 'planet', starId: 'sol', planetIndex: 1 })
    expect(data.systems.sol.planets[0].loreDoc.blocks).toHaveLength(1)
    expect(data.systems.sol.planets[1].loreDoc).toBeNull()
    expect(data.stars[1].loreDoc).toBeNull()
  })

  it('loads lore files relative to the map and falls back when one fails', async () => {
    const data = sampleMap()
    data.systems.sol.planets[0].loreFile = 'lore/earth.md'
    data.systems.sol.planets[1].loreFile = 'lore/missing.wiki'
    data.stars[1].loreFile = 'lore/missing.wiki'
    data.stars[1].lore = 'fallback'
    const fetchText = vi.fn(async url => {
      if (url.endsWith('earth.md')) return '# Earth\n![pic](pic.png)'
      throw new Error('404')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await prepareLore(data, { baseUrl: BASE, fetchText })
    warn.mockRestore()

    expect(fetchText).toHaveBeenCalledWith('http://localhost/maps/lore/earth.md')
    expect(fetchText).toHaveBeenCalledTimes(2)
    const earth = data.systems.sol.planets[0].loreDoc.blocks
    expect(earth[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(earth[1].image.src).toBe('http://localhost/maps/pic.png')
    expect(data.stars[1].loreDoc.blocks[0].children[0].value).toBe('fallback')
    expect(data.systems.sol.planets[1].loreDoc.blocks[0].children[0].value).toBe('[ ARCHIVE CORRUPTED: lore/missing.wiki ]')
  })

  it('finds [[File:…]] images in the image folder or on the wiki', async () => {
    const local = sampleMap({ worldLore: '[[File:Space station.png|thumb]] [[No such page]]' })
    await prepareLore(local, { baseUrl: BASE, fetchText: vi.fn() })
    const [figure] = local.worldLoreDoc.blocks
    expect(figure.image.src).toBe('http://localhost/maps/lore/images/Space_station.png')
    expect(local.worldLoreDoc.blocks[1].children[0].missing).toBe(true)

    const wiki = sampleMap({
      worldLore: '[[File:Space station.png|thumb]] [[No such page]]',
      loreConfig: { wikiUrl: 'https://wiki.example/' }
    })
    await prepareLore(wiki, { baseUrl: BASE, fetchText: vi.fn() })
    expect(wiki.worldLoreDoc.blocks[0].image.src).toBe('https://wiki.example/Special:FilePath/Space_station.png')
    expect(wiki.worldLoreDoc.blocks[1].children[0].href).toBe('https://wiki.example/No_such_page')
  })

  it('refuses unsafe image sources', async () => {
    const data = sampleMap({ worldLore: '![x](javascript:alert(1))', worldLoreFormat: 'markdown' })
    await prepareLore(data, { baseUrl: BASE, fetchText: vi.fn() })
    expect(data.worldLoreDoc.blocks[0].image.src).toBeNull()
  })

  // Was: new URL('https://') threw out of prepareLore: one bad picture left the whole map on "catalog unavailable".
  it('leaves out a picture whose address no browser can read, and loads the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const data = sampleMap({ worldLore: '![x](https://)\n\n![y](https://host:99999/a.png)', worldLoreFormat: 'markdown' })
    await prepareLore(data, { baseUrl: BASE, fetchText: vi.fn() })
    warn.mockRestore()
    const images = data.worldLoreDoc.blocks.map(block => block.image ?? block.children?.[0]?.image)
    expect(images.map(image => image.src)).toEqual([null, null])
    expect(data.systems.sol.planets[0].loreDoc.blocks).toHaveLength(1)
  })
})
