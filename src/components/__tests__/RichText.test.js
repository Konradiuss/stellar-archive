// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RichText from '../RichText.vue'
import PixelImage from '../PixelImage.vue'
import { useUIStore } from '../../stores/uiStore'
import { parseWikitext } from '../../utils/richText/wikitextParser'
import { parseMarkdown } from '../../utils/richText/markdownParser'
import { collectHeadings } from '../../utils/wikiToc'

const render = (doc, props = {}) => mount(RichText, {
  props: { doc, ...props },
  global: { stubs: { PixelImage: { props: ['src', 'alt'], template: '<span class="pixel-image-stub" :data-src="src" />' } } }
})

describe('RichText', () => {
  let warn

  beforeEach(() => {
    setActivePinia(createPinia())
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders headings, bold text, lists and tables', () => {
    const wrapper = render(parseWikitext("== Overview ==\n'''Earth''' — the capital.\n* shipyards\n{|\n! A !! B\n|-\n| 1 || 2\n|}"))
    expect(wrapper.find('h2').text()).toBe('Overview')
    expect(wrapper.find('strong').text()).toBe('Earth')
    expect(wrapper.find('ul li').text()).toBe('shipyards')
    expect(wrapper.findAll('th').map(cell => cell.text())).toEqual(['A', 'B'])
    expect(wrapper.findAll('td').map(cell => cell.text())).toEqual(['1', '2'])
  })

  // Was: a heading in a box (or an empty one) shifted the n-th .rt-heading, sending later clicks and #Section to the wrong heading.
  it('draws the very headings the contents panel lists, in boxes too', () => {
    const wiki = parseWikitext('== Top ==\n{{Box|title=News|text=\n== Inside ==\nText\n}}\n== [[Category:X]] ==\n== Last ==')
    const markdown = parseMarkdown('# Top\n\n#\n\n## Last')
    for (const doc of [wiki, markdown]) {
      const drawn = render(doc).findAll('.rt-heading').map(heading => heading.text())
      expect(collectHeadings(doc).map(heading => heading.text)).toEqual(drawn)
    }
    expect(collectHeadings(wiki).map(heading => heading.text)).toEqual(['Top', 'Inside', 'Last'])
  })

  // Was: "50% shield" or "100%.png" made decodeURIComponent throw once the picture failed to load, and the article stopped rendering.
  it('names a picture that failed to load even with a bare % in it', () => {
    const wrapper = mount(PixelImage, { props: { src: 'img/100%.png', alt: '50% shield' } })
    expect(wrapper.vm.fileName).toBe('100%.png')
    expect(mount(PixelImage, { props: { alt: '50% shield' } }).vm.fileName).toBe('50% shield')
  })

  // Lore comes from map files: markup must never become live HTML.
  it('shows HTML it does not support as plain text', () => {
    const wrapper = render(parseMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1))'))
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
  })

  it('prints only up to the typewriter limit, with the cursor there', () => {
    const wrapper = render(parseWikitext("'''Hello''' world"), { limit: 3, cursor: true })
    expect(wrapper.text()).toBe('Hel_')
    expect(wrapper.find('strong .rt-cursor').exists()).toBe(true)
  })

  it('opens external links in a new tab without access to the page', () => {
    const wrapper = render(parseWikitext('[https://example.com site]'))
    const link = wrapper.find('a')
    expect(link.attributes()).toMatchObject({ href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer' })
    expect(link.attributes('data-hint')).toMatch(/external site/)
  })

  it('moves to a planet from an internal link', async () => {
    const doc = parseWikitext('[[Mars]]')
    doc.blocks[0].children[0].action = { kind: 'planet', starId: 'sol', planetIndex: 3 }
    const uiStore = useUIStore()
    uiStore.openLoreLink = vi.fn()

    const wrapper = render(doc)
    expect(wrapper.find('.rt-link.is-internal').attributes('data-hint')).toBe('Go to: Mars')
    await wrapper.find('.rt-link.is-internal').trigger('click')
    expect(uiStore.openLoreLink).toHaveBeenCalledWith({ kind: 'planet', starId: 'sol', planetIndex: 3 })
  })

  it('draws notes over a section, notice boxes and galleries', () => {
    const wrapper = render(parseWikitext("{{Main|Solar Concord#Schism}}\n{{Warning|Do not '''jump'''.}}\n{{Stub}}\n<gallery>\nearth.jpg|Earth\nconsole.png\n</gallery>"))
    expect(wrapper.find('.rt-hatnote').text()).toBe('Main article: Solar Concord § Schism')
    const notices = wrapper.findAll('.rt-notice')
    expect(notices.map(notice => notice.classes().find(name => name.startsWith('is-')))).toEqual(['is-warning', 'is-stub'])
    expect(notices[0].find('.rt-notice-title').text()).toBe('[!] WARNING')
    expect(notices[0].find('strong').text()).toBe('jump')
    expect(notices[1].text()).toContain('[~] STUB')
    const items = wrapper.findAll('.rt-gallery-item')
    expect(items).toHaveLength(2)
    expect(items[0].find('figcaption').text()).toBe('Earth')
    expect(items[1].find('figcaption').exists()).toBe(false)
  })

  it('marks footnotes in the text with their note as the hint and lists the notes', () => {
    const wrapper = render(parseWikitext('Year<ref name="y">As counted on Earth.</ref>, fleet<ref>Second.</ref>, year<ref name="y"/>'))
    const marks = wrapper.findAll('.rt-ref .rt-ref-link')
    expect(marks.map(mark => mark.text())).toEqual(['[1]', '[2]', '[1]'])
    expect(marks[0].attributes('title')).toBe('Note 1: As counted on Earth.')
    expect(marks[0].element.tagName).toBe('SPAN')
    const notes = wrapper.findAll('.rt-references .rt-note')
    expect(notes.map(note => note.text())).toEqual(['[1]As counted on Earth.', '[2]Second.'])
  })

  it('jumps from a footnote mark to its note and back in the wiki', async () => {
    const wrapper = render(parseWikitext('Year<ref>As counted on Earth.</ref>.'), { wiki: true })
    const scrolled = []
    Element.prototype.scrollIntoView = function () { scrolled.push(this) }
    await wrapper.find('button.rt-ref-link').trigger('click')
    const note = wrapper.find('.rt-note')
    expect(scrolled.at(-1)).toBe(note.element)
    expect(note.classes()).toContain('is-target')
    await wrapper.find('button.rt-note-back').trigger('click')
    expect(scrolled.at(-1)).toBe(wrapper.find('.rt-ref-link').element)
    delete Element.prototype.scrollIntoView
  })

  it('prints footnotes and notices with the typewriter too', () => {
    const doc = parseWikitext('Ab<ref>Cde</ref>\n{{Warning|E}}')
    // 'Ab' + '[1]' + '[!] WARNING'.slice(0, 2)
    expect(render(doc, { limit: 7 }).text()).toBe('Ab[1][!')
  })

  // Was: the side panel passed '' before any lore arrived.
  it('accepts an empty document without warnings', () => {
    const wrapper = render(null)
    expect(wrapper.text()).toBe('')
    expect(warn).not.toHaveBeenCalled()
  })

  describe('the layout of a page', () => {
    it('puts boxes in a row into one grid, each with its colour, sign and title', () => {
      const doc = parseWikitext('{{Box|Newcomers|color=green|icon=question|Text}}\n{{Box|Factions|More}}\nParagraph\n{{Box|One|Alone}}')
      const wrapper = render(doc)
      const grids = wrapper.findAll('.rt-boxes')
      expect(grids).toHaveLength(2)
      expect(grids[0].findAll('.rt-box')).toHaveLength(2)
      expect(grids[1].findAll('.rt-box')).toHaveLength(1)
      const first = grids[0].find('.rt-box')
      expect(first.attributes('style')).toContain('--box-color: #2f8f46')
      expect(first.find('.rt-box-name').text()).toBe('Newcomers')
      expect(first.find('.rt-box-icon').attributes('src')).toMatch(/^data:image\/svg\+xml,/)
      expect(first.find('.rt-box-body').text()).toBe('Text')
      expect(wrapper.find('.rich-text > .rt-p').text()).toBe('Paragraph')
    })

    it('counts the magic words by what the map holds now', async () => {
      const { useMapStore } = await import('../../stores/mapStore')
      const mapStore = useMapStore()
      mapStore.wikiIndex = { pages: [{ kind: 'article' }, { kind: 'article' }, { kind: 'star' }, { kind: 'planet' }, { kind: 'world' }] }
      mapStore.stars = [{ id: 'sol' }, { id: 'cinder' }, { id: 'pelagos' }]
      mapStore.siteConfig = { title: 'Map' }
      const wrapper = render(parseWikitext('{{NUMBEROFPAGES}}/{{NUMBEROFARTICLES}}/{{NUMBEROFPLACES}}/{{NUMBEROFSYSTEMS}} — {{SITENAME}}'))
      expect(wrapper.text()).toBe('5/2/2/3 — Map')
    })

    it('shows the banner, its plate and text; without a canvas the logo is its text in Tiny5', async () => {
      const doc = parseWikitext('{{Banner|title=ARCHIVE|style=sunset|caption=Welcome|text=Line}}\n{{Links|[[A]]|[[B]]}}')
      const wrapper = render(doc)
      await new Promise(resolve => setTimeout(resolve, 0))
      const banner = wrapper.find('.rt-banner')
      expect(banner.find('.pixel-logo-text').text()).toBe('ARCHIVE')
      expect(banner.find('.rt-banner-caption').text()).toBe('Welcome')
      expect(banner.find('.rt-banner-text').text()).toBe('Line')
      expect(wrapper.find('.rt-links').text()).toBe('A · B')
    })

    it('shows the picture of the author instead of the logo, and tiles that lead to pages', () => {
      const doc = parseWikitext('{{Banner|logo=File:logo.png}}\n<gallery mode="tiles" widths=48px>\nFile:a.png|Command|link=Command\n</gallery>')
      const wrapper = render(doc)
      expect(wrapper.find('.rt-banner .pixel-image-stub').exists()).toBe(true)
      expect(wrapper.find('.pixel-logo, .pixel-logo-text').exists()).toBe(false)
      const tile = wrapper.find('.rt-tiles .rt-tile')
      expect(wrapper.find('.rt-tiles').attributes('style')).toContain('--tile-width: 48px')
      expect(tile.find('.rt-link .pixel-image-stub').exists()).toBe(true)
      expect(tile.find('.rt-link .rt-tile-caption').text()).toBe('Command')
    })

    it('draws the sections of the archive only in the wiki', () => {
      const doc = parseWikitext('{{Archive sections}}')
      expect(render(doc).find('.wiki-portal').exists()).toBe(false)
      expect(render(doc, { wiki: true }).find('.wiki-portal').exists()).toBe(true)
      expect(render(doc, { wiki: true }).find('.portal-welcome').exists()).toBe(false)
    })

    it('marks a heading with the colour of the box it was made of', () => {
      const wrapper = render({
        blocks: [
          { type: 'heading', level: 2, marker: '#2f8f46', children: [{ type: 'text', value: 'Newcomers' }] },
          { type: 'heading', level: 2, children: [{ type: 'text', value: 'Overview' }] }
        ]
      })
      const [marked, plain] = wrapper.findAll('h2')
      expect(marked.text()).toBe('Newcomers')
      expect(marked.find('.rt-heading-mark').attributes('style')).toContain('background: #2f8f46')
      expect(plain.find('.rt-heading-mark').exists()).toBe(false)
    })
  })
})
