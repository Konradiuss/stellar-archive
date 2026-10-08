// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useMapStore } from '../../stores/mapStore'
import { useUIStore } from '../../stores/uiStore'
import RichText from '../RichText.vue'
import WikiSearch from '../WikiSearch.vue'
import WikiSpecial from '../WikiSpecial.vue'
import { buildWikiGraph, servicePage } from '../../utils/wikiService'
import { buildWikiIndex, normalizeWiki } from '../../utils/wikiPages'
import { createPageFinder, resolveLoreDocument } from '../../utils/richText/lore'
import { parseWikitext } from '../../utils/richText/wikitextParser'

function loadWiki() {
  const wiki = normalizeWiki({
    articles: [
      { title: 'Crucible Combine', aliases: ['CC'], text: 'Shipyards of Forge and the [[Beacon Watch]].\n[[Category:Factions]]' },
      { title: 'Solar Concord', text: 'Capital — Earth. Alliance with [[CC]] and the [[Beacon Watch]].' },
      { title: 'Quantum Gates', text: 'Rings.' }
    ]
  })
  const findPage = createPageFinder([], {}, wiki.articles.map(article => ({ names: [article.title, ...article.aliases], target: { kind: 'article', title: article.title } })))
  for (const article of wiki.articles) article.loreDoc = resolveLoreDocument(parseWikitext(article.text), { findPage })
  const mapStore = useMapStore()
  mapStore.wikiIndex = buildWikiIndex({ wiki })
  mapStore.wikiGraph = buildWikiGraph(mapStore.wikiIndex)
  return mapStore
}

const special = slug => mount(WikiSpecial, { props: { page: servicePage(slug) } })

describe('wiki service pages', () => {
  let open

  beforeEach(() => {
    setActivePinia(createPinia())
    loadWiki()
    open = vi.spyOn(useUIStore(), 'openWiki').mockReturnValue(true)
  })

  it('shows the results of a search with the words marked', async () => {
    const wrapper = special('Special:Search/shipyards')
    expect(wrapper.find('.special-note').text()).toContain('The archive has no page “shipyards”. Found: 1.')
    const result = wrapper.find('.search-result')
    expect(result.find('.special-link').text()).toBe('Crucible Combine')
    expect(wrapper.findAll('.search-hit').map(hit => hit.text())).toEqual(['Shipyards'])
    await result.find('.special-link').trigger('click')
    expect(open).toHaveBeenCalledWith('Crucible_Combine')
    expect(special('Special:Search/CC').find('.special-note').text()).toContain('There is a page “Crucible Combine”')
  })

  it('lists all pages by letter, the pages of a category and the categories', () => {
    expect(special('Special:All_pages').findAll('.special-char').map(char => char.text())).toEqual(['[C]', '[Q]', '[S]'])
    const category = special('Category:Factions')
    expect(category.findAll('.special-letter .special-link').map(link => link.text())).toEqual(['Crucible Combine'])
    expect(special('Category:None').text()).toContain('Category “None” has no pages.')
    const categories = special('Special:Categories').findAll('.special-list li')
    expect(categories.map(item => `${item.find('.special-link').text()}:${item.find('.special-tag').text()}`)).toEqual(['Factions:1'])
  })

  it('lists the wanted pages and who links to a page', async () => {
    const wanted = special('Special:Wanted_pages')
    const item = wanted.find('.wanted-item')
    expect(item.findAll('.special-link').map(link => link.text())).toEqual(['Beacon Watch', 'Crucible Combine', 'Solar Concord'])
    expect(item.find('.special-tag').text()).toBe('2 links:')
    await wanted.find('.special-link.is-missing').trigger('click')
    expect(open).toHaveBeenCalledWith('Beacon_Watch')
    const backlinks = special('Special:What_links_here/CC')
    expect(backlinks.find('.special-note').text().replace(/\s+/g, ' ')).toBe('1 page links to “Crucible Combine”.')
    expect(backlinks.findAll('.special-list .special-link').map(link => link.text())).toEqual(['Solar Concord'])
  })

  // Was: the styles of a banner were names in a table of the code, and an author could not see them anywhere.
  it('shows the styles, fonts, motions and frames of a banner, and the colours of boxes', () => {
    const page = special('Special:Banners')
    const values = part => page.findAll(`[data-part="${part}"] .special-sample-name`).map(name => name.text())
    expect(values('style')).toEqual(['style=steel', 'style=sunset', 'style=phosphor', 'style=amber', 'style=ice', 'style=plasma', 'style=gold'])
    expect(values('font')).toEqual(['font=tiny5', 'font=press'])
    expect(values('animation')).toEqual(['animation=none', 'animation=bounce', 'animation=wave', 'animation=float', 'animation=shine', 'animation=flicker'])
    expect(values('frame')).toEqual(['frame=double', 'frame=single', 'frame=none'])
    expect(values('color')).toContain('color=green')
    expect(page.find('.special-note').text()).toContain('{{Banner|title=…|style=…}}')
  })
})

describe('wiki search line', () => {
  let open

  beforeEach(() => {
    setActivePinia(createPinia())
    loadWiki()
    open = vi.spyOn(useUIStore(), 'openWiki').mockReturnValue(true)
  })

  const type = async (wrapper, text) => {
    await wrapper.find('input').setValue(text)
    await nextTick()
  }
  const press = (wrapper, key) => wrapper.find('.wiki-search').trigger('keydown', { key })

  it('suggests pages, other names too, and searches everywhere on the last line', async () => {
    const wrapper = mount(WikiSearch)
    await type(wrapper, 'co')
    expect(wrapper.findAll('.search-suggestion').map(item => item.text())).toEqual([
      'Crucible Combine', 'Solar Concord', 'Search all pages for “co”'
    ])
    await type(wrapper, 'cc')
    const first = wrapper.find('.search-suggestion')
    expect([first.find('.suggestion-title').text(), first.find('.suggestion-note').text()]).toEqual(['Crucible Combine', '← CC'])
    await press(wrapper, 'ArrowDown')
    await press(wrapper, 'ArrowDown')
    await press(wrapper, 'Enter')
    expect(open).toHaveBeenCalledWith('Special:Search/cc')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('goes to the page of the very name, else to the results; Esc puts it away', async () => {
    const wrapper = mount(WikiSearch)
    await type(wrapper, 'quantum gates')
    await press(wrapper, 'Enter')
    expect(open).toHaveBeenLastCalledWith('Quantum_Gates')
    await type(wrapper, 'shipyards')
    await press(wrapper, 'Enter')
    expect(open).toHaveBeenLastCalledWith('Special:Search/shipyards')
    await press(wrapper, 'Escape')
    expect(wrapper.emitted('close')).toHaveLength(3)
  })
})

describe('red links', () => {
  it('open the page nobody wrote in the wiki, and stay text on the map', async () => {
    setActivePinia(createPinia())
    const store = useUIStore()
    const follow = vi.spyOn(store, 'openLoreLink').mockReturnValue(true)
    const doc = parseWikitext('[[Beacon Watch]]')
    doc.blocks[0].children[0].missing = true
    const inWiki = mount(RichText, { props: { doc, wiki: true } })
    await inWiki.find('button.rt-link.is-missing').trigger('click')
    expect(follow).toHaveBeenCalledWith({ kind: 'missing', page: 'Beacon Watch' })
    expect(mount(RichText, { props: { doc } }).find('span.rt-link.is-missing').exists()).toBe(true)
  })
})
