import { describe, expect, it } from 'vitest'
import { buildWikiGraph, randomPage, searchSlug, searchWiki, servicePage, serviceLinks, suggestPages } from '../wikiService.js'
import { buildWikiIndex, normalizeWiki } from '../wikiPages.js'
import { docText } from '../richText/walk.js'
import { parseWikitext } from '../richText/wikitextParser.js'
import { parseMarkdown } from '../richText/markdownParser.js'
import { resolveLoreDocument, createPageFinder } from '../richText/lore.js'

function sampleWiki() {
  const wiki = normalizeWiki({
    articles: [
      { title: 'Forge Yards', aliases: ['FY'], categories: ['Factions'], text: "Capital — [[Forge]]. Roomy '''shipyards''' of Forge.\n[[Category:Corporations]]" },
      { title: 'Solar Concord', text: 'Schism with the [[Forge Yards|Yards]] and [[FY]]. [[Reliquary]] and [[reliquary]].\n[[Category:Factions]]' },
      { title: 'Chronicle', format: 'markdown', text: 'Years of [Forge](Forge), [the Reliquary](Reliquary) and [[Category:History]]' }
    ]
  })
  const stars = [{ id: 'cinder', name: 'Cinder' }]
  const systems = { cinder: { planets: [{ name: 'Forge', loreDoc: parseWikitext('Foundry planet, [[Solar Concord]].') }] } }
  const findPage = createPageFinder(stars, systems, wiki.articles.map(article => ({ names: [article.title, ...article.aliases], target: { kind: 'article', title: article.title } })))
  for (const article of wiki.articles) {
    article.loreDoc = resolveLoreDocument(article.format === 'markdown' ? parseMarkdown(article.text) : parseWikitext(article.text), { findPage })
  }
  resolveLoreDocument(systems.cinder.planets[0].loreDoc, { findPage, contextStarId: 'cinder' })
  return buildWikiIndex({ wiki, worldLoreDoc: parseWikitext('World.'), stars, systems })
}

describe('wiki service pages', () => {
  it('knows the service pages by their names', () => {
    expect(servicePage('Special:All_pages')).toMatchObject({ kind: 'special', slug: 'Special:All_pages', title: 'All pages', special: { kind: 'allpages', param: '' } })
    expect(servicePage('special:AllPages').slug).toBe('Special:All_pages')
    expect(servicePage('Special:Search/quantum_gates')).toMatchObject({
      slug: 'Special:Search/quantum_gates', title: 'Search: quantum gates', command: 'FIND "quantum gates" *.TXT', special: { kind: 'search', param: 'quantum gates' }
    })
    expect(servicePage('Special:WhatLinksHere/Earth')).toMatchObject({ slug: 'Special:What_links_here/Earth', title: 'What links here: Earth' })
    expect(servicePage('Category:Factions')).toMatchObject({ slug: 'Category:Factions', title: 'Category:Factions', special: { kind: 'category', param: 'Factions' } })
    expect(servicePage('Category:').slug).toBe('Special:Categories')
    expect(servicePage('Special:Categories/extra').slug).toBe('Special:Categories')
    expect(servicePage('Special:No_such_page')).toBeNull()
    // The site is in English: Russian namespace names are not recognized.
    expect(servicePage('Служебная:Поиск')).toBeNull()
    expect(servicePage('Категория:Фракции')).toBeNull()
    expect(servicePage('Mars')).toBeNull()
    expect(serviceLinks().map(page => page.title)).toEqual(['All pages', 'Categories', 'Wanted pages'])
    expect(searchSlug(' mars gates ')).toBe('Special:Search/mars_gates')
  })
})

describe('wiki graph', () => {
  it('knows who links to a page, once for each page, by any of its names', () => {
    const index = sampleWiki()
    const graph = buildWikiGraph(index)
    const titles = pages => pages.map(page => page.title)
    expect(titles(graph.linksTo(index.get('Forge_Yards')))).toEqual(['Solar Concord'])
    expect(titles(graph.linksTo(index.get('Forge')))).toEqual(['Chronicle', 'Forge Yards'])
    expect(titles(graph.linksTo(index.get('Solar_Concord')))).toEqual(['Forge'])
    expect(graph.linksTo(index.get('Chronicle'))).toEqual([])
  })

  it('sees the links in the boxes, the banner, the row of links and the tiles of a page', () => {
    const wiki = normalizeWiki({
      articles: [
        { title: 'Main', text: '{{Banner|ARCHIVE|text=About the [[Chronicle|chronicle]]}}\n{{Links|[[Mars]]}}\n{{Box|Factions|link=Crucible Combine|\n<gallery mode="tiles">\nFile:e.png|Concord|link=Solar Concord\n</gallery>\n}}' },
        { title: 'Chronicle', text: 'Years.' },
        { title: 'Crucible Combine', text: 'Combine.' },
        { title: 'Solar Concord', text: 'Concord.' }
      ]
    })
    const stars = [{ id: 'sol', name: 'Sol' }]
    const systems = { sol: { planets: [{ name: 'Mars', loreDoc: parseWikitext('Red planet.') }] } }
    const findPage = createPageFinder(stars, systems, wiki.articles.map(article => ({ names: [article.title], target: { kind: 'article', title: article.title } })))
    for (const article of wiki.articles) article.loreDoc = resolveLoreDocument(parseWikitext(article.text), { findPage, baseUrl: 'http://localhost/' })
    const index = buildWikiIndex({ wiki, stars, systems })
    const graph = buildWikiGraph(index)
    const titles = pages => pages.map(page => page.title)
    for (const slug of ['Chronicle', 'Mars', 'Crucible_Combine', 'Solar_Concord']) {
      expect(titles(graph.linksTo(index.get(slug))), slug).toEqual(['Main'])
    }
  })

  it('lists the links to pages nobody wrote, the most wanted first', () => {
    const graph = buildWikiGraph(sampleWiki())
    expect(graph.wanted.map(item => [item.name, item.slug, item.from.map(page => page.title)])).toEqual([
      ['Reliquary', 'Reliquary', ['Chronicle', 'Solar Concord']]
    ])
    expect(graph.wantedFrom('reliquary').map(page => page.title)).toEqual(['Chronicle', 'Solar Concord'])
    expect(graph.wantedFrom('None')).toEqual([])
  })

  it('gathers categories from the map file, the text and what a place is', () => {
    const index = sampleWiki()
    const graph = buildWikiGraph(index)
    expect(graph.categories.map(category => `${category.name}:${category.pages.length}`)).toEqual(['Corporations:1', 'Factions:2', 'History:1', 'Planets:1'])
    expect(graph.categoriesOf(index.get('Forge_Yards')).map(category => category.name)).toEqual(['Factions', 'Corporations'])
    expect(graph.category('factions').pages.map(page => page.title)).toEqual(['Forge Yards', 'Solar Concord'])
    expect(graph.category('Planets').slug).toBe('Category:Planets')
    expect(graph.category('none')).toBeNull()
    expect(buildWikiGraph(null).categories).toEqual([])
  })
})

describe('wiki search', () => {
  it('reads the plain text of a document, its parts apart', () => {
    expect(docText(parseWikitext("== Fleet ==\n* '''First''' fleet\n* Second\n{| \n| cell || other\n|}"))).toBe('Fleet\nFirst fleet\nSecond\ncell\nother')
  })

  it('finds pages by name first, then by text, whatever the case', () => {
    const index = sampleWiki()
    const result = searchWiki(index, 'forge')
    expect(result.exact.title).toBe('Forge')
    expect(result.titles.map(page => page.title)).toEqual(['Forge', 'Forge Yards'])
    expect(result.text.map(item => `${item.page.title}:${item.count}`)).toEqual(['Chronicle:1'])
    expect(result.text[0].snippet).toEqual([{ text: 'Years of ', hit: false }, { text: 'Forge', hit: true }, { text: ', the Reliquary and', hit: false }])
    expect(searchWiki(index, 'roomy shipyards').text.map(item => item.page.title)).toEqual(['Forge Yards'])
    expect(searchWiki(index, 'ROOMY Shipyards').text).toEqual(searchWiki(index, 'roomy shipyards').text)
    expect(searchWiki(index, 'schism planet').text).toEqual([])
    expect(searchWiki(index, '  ')).toEqual({ exact: null, titles: [], text: [] })
  })

  it('suggests pages that begin with the text, then the ones that contain it', () => {
    const index = sampleWiki()
    expect(suggestPages(index, 'fy').map(item => [item.page.title, item.alias])).toEqual([['Forge Yards', 'FY']])
    expect(suggestPages(index, 'for').map(item => item.page.title)).toEqual(['Forge', 'Forge Yards'])
    expect(suggestPages(index, 'a', 2)).toHaveLength(2)
    expect(suggestPages(index, '')).toEqual([])
  })

  it('jumps to a random page other than the open one', () => {
    const index = sampleWiki()
    const current = index.get('Forge')
    const pool = index.pages.filter(page => page !== current)
    expect(randomPage(index, current, () => 0)).toBe(pool[0])
    expect(randomPage(index, current, () => 0.999)).toBe(pool[pool.length - 1])
  })
})
