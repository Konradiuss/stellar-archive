// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useUIStore } from '../../stores/uiStore'
import ModeBreaker from '../ModeBreaker.vue'
import WikiNavbox from '../WikiNavbox.vue'
import WikiPortal from '../WikiPortal.vue'
import WikiContents from '../WikiContents.vue'
import { collectHeadings } from '../../utils/wikiToc'
import { parseWikitext } from '../../utils/richText/wikitextParser'

function idleStore() {
  const store = useUIStore()
  store.markViewReady('galaxy')
  store.finishOpening()
  return store
}

describe('mode breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const frameOf = wrapper => [...wrapper.find('button').classes()].find(name => name.startsWith('is-'))
  // 'map' | 'wiki' | null
  const stampWith = (wrapper, name) => {
    const stamp = wrapper.find(`.breaker-label.${name}`)
    return stamp.exists() ? (stamp.classes().includes('is-map') ? 'map' : 'wiki') : null
  }
  const litSide = wrapper => stampWith(wrapper, 'is-lit')
  const hintSide = wrapper => stampWith(wrapper, 'is-hint')
  const wait = async ms => {
    vi.advanceTimersByTime(ms)
    await nextTick()
  }

  it('is thrown down to the wiki at once, frame by frame', async () => {
    const store = idleStore()
    const wrapper = mount(ModeBreaker, { props: { tint: 'blue' } })
    const button = wrapper.find('button')
    const sprite = () => wrapper.find('.breaker-sprite').attributes('src')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.classes()).toContain('is-up')
    expect(litSide(wrapper)).toBe('map')

    await button.trigger('click')
    expect(store.transitionTarget).toEqual({ kind: 'wiki' })
    expect(button.attributes('aria-pressed')).toBe('true')
    // aria-disabled, not disabled: a disabled button would drop the keyboard focus to the page.
    expect(button.attributes('aria-disabled')).toBe('true')
    expect(button.attributes('disabled')).toBeUndefined()
    const toggles = vi.spyOn(store, 'toggleMode')
    await button.trigger('click')
    expect(toggles).not.toHaveBeenCalled()
    const seen = [[...button.classes()].find(name => name.startsWith('is-')), sprite()]
    expect(wrapper.find('.breaker-label.is-lit').exists()).toBe(false)
    const frames = [seen[0]]
    const sprites = new Set([seen[1]])
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(50)
      await nextTick()
      frames.push([...button.classes()].find(name => name.startsWith('is-')))
      sprites.add(sprite())
    }
    expect(frames).toEqual(['is-up-half', 'is-middle', 'is-down-half', 'is-down'])
    expect(sprites.size).toBe(4)
    expect(litSide(wrapper)).toBe('wiki')
  })

  it('turns back from the frame it has reached', async () => {
    const store = idleStore()
    const wrapper = mount(ModeBreaker)
    const button = wrapper.find('button')
    await button.trigger('click')
    vi.advanceTimersByTime(50)
    await nextTick()
    expect(button.classes()).toContain('is-middle')
    store.transitionTarget = { kind: 'galaxy' }
    await nextTick()
    expect(button.classes()).toContain('is-up-half')
    vi.advanceTimersByTime(50)
    await nextTick()
    expect(button.classes()).toContain('is-up')
    vi.advanceTimersByTime(500)
    await nextTick()
    expect(button.classes()).toContain('is-up')
  })

  it('cannot be thrown while the screens are switching', async () => {
    const store = useUIStore()
    const toggle = vi.spyOn(store, 'toggleMode')
    const wrapper = mount(ModeBreaker)
    await wrapper.find('button').trigger('click')
    expect(toggle).not.toHaveBeenCalled()
  })

  it('leans towards the other mode under the mouse, and the other stamp blinks', async () => {
    const store = idleStore()
    const wrapper = mount(ModeBreaker)
    const button = wrapper.find('button')
    await button.trigger('pointerenter')
    expect(frameOf(wrapper)).toBe('is-up-half')
    expect(hintSide(wrapper)).toBe('wiki')
    expect(litSide(wrapper)).toBe('map')
    await button.trigger('pointerleave')
    expect(frameOf(wrapper)).toBe('is-up')
    expect(hintSide(wrapper)).toBeNull()
    await button.trigger('pointerenter')
    await button.trigger('click')
    expect(store.transitionTarget).toEqual({ kind: 'wiki' })
    expect(frameOf(wrapper)).toBe('is-middle')
    expect(hintSide(wrapper)).toBeNull()
    await wait(100)
    expect(frameOf(wrapper)).toBe('is-down')
  })

  it('twitches after a pause until it is thrown for the first time', async () => {
    idleStore()
    const wrapper = mount(ModeBreaker)
    await wait(14999)
    expect(frameOf(wrapper)).toBe('is-up')
    const seen = []
    for (let i = 0; i < 12; i++) {
      await wait(i ? 50 : 1)
      seen.push(`${frameOf(wrapper)}:${hintSide(wrapper) ?? '-'}`)
    }
    expect(seen.filter((item, i) => item !== seen[i - 1])).toEqual([
      'is-up-half:wiki', 'is-up:wiki', 'is-up-half:wiki', 'is-up:wiki', 'is-up:-'
    ])
    await wait(15000)
    expect(frameOf(wrapper)).toBe('is-up-half')
  })

  it('waits for a pause: the mouse or the keys start it again', async () => {
    idleStore()
    const wrapper = mount(ModeBreaker)
    await wait(10000)
    window.dispatchEvent(new Event('pointermove'))
    await wait(10000)
    window.dispatchEvent(new Event('keydown'))
    await wait(14000)
    expect(frameOf(wrapper)).toBe('is-up')
    expect(hintSide(wrapper)).toBeNull()
    await wait(1000)
    expect(frameOf(wrapper)).toBe('is-up-half')
  })

  it('stops twitching for good once thrown by hand, and remembers it', async () => {
    const store = idleStore()
    vi.spyOn(store, 'toggleMode').mockReturnValue(true)
    const wrapper = mount(ModeBreaker)
    await wrapper.find('button').trigger('click')
    expect(localStorage.getItem('spacemap:v1:/breaker-used')).toBe('true')
    await wait(40000)
    expect(frameOf(wrapper)).toBe('is-up')
    expect(hintSide(wrapper)).toBeNull()
    wrapper.unmount()
    const again = mount(ModeBreaker)
    await wait(40000)
    expect(frameOf(again)).toBe('is-up')
    expect(hintSide(again)).toBeNull()
  })

  it('does not twitch while the screens switch', async () => {
    const store = idleStore()
    const wrapper = mount(ModeBreaker)
    store.openWiki()
    await nextTick()
    await wait(200)
    expect(frameOf(wrapper)).toBe('is-down')
    await wait(15000)
    expect(frameOf(wrapper)).toBe('is-down')
    expect(hintSide(wrapper)).toBeNull()
  })

  it('only blinks when less motion is asked for', async () => {
    vi.stubGlobal('matchMedia', query => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    idleStore()
    const wrapper = mount(ModeBreaker)
    await wait(15000)
    expect(frameOf(wrapper)).toBe('is-up')
    expect(hintSide(wrapper)).toBe('wiki')
    await wait(1200)
    expect(hintSide(wrapper)).toBeNull()
    await wrapper.find('button').trigger('pointerenter')
    expect(frameOf(wrapper)).toBe('is-up')
    expect(hintSide(wrapper)).toBe('wiki')
  })
})

describe('wiki navbox and contents', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const page = (slug, kind = 'article') => ({ slug, title: slug.replace(/_/g, ' '), kind })
  const pages = [page('Galaxy', 'world'), page('Solar_Concord'), page('Chronicle'), page('Sol', 'star'), page('Earth', 'planet'), page('Moon', 'satellite')]
  const [world, concord, chronicle, sol, earth, moon] = pages
  const leaf = item => ({ title: item.title, page: item, items: [] })
  const group = (id, title, items, groups = [], extra = {}) => {
    const slugs = new Set()
    const collect = list => list.forEach(item => { if (item.page) slugs.add(item.page.slug); collect(item.items) })
    collect(items)
    groups.forEach(inner => inner.slugs.forEach(slug => slugs.add(slug)))
    return { id, title, page: null, color: null, items, groups, slugs, ...extra }
  }
  const navbox = {
    home: world,
    groups: [
      group('group:factions', 'Factions', [leaf(concord)]),
      group('places', 'Places', [], [
        group('faction:concord', 'Solar Concord', [{ title: 'Sol', page: sol, items: [{ title: 'Earth', page: earth, items: [leaf(moon)] }, { title: 'Mars', page: null, items: [] }] }], [], { color: '#00aaff', page: concord })
      ]),
      group('misc', 'Misc', [leaf(chronicle)])
    ]
  }
  const rowTitles = wrapper => wrapper.findAll('.navbox-row .navbox-group .navbox-title').map(title => title.text())

  it('shows the main page and a row for every group, the open page lit', async () => {
    const store = useUIStore()
    const open = vi.spyOn(store, 'openWiki').mockReturnValue(true)
    const wrapper = mount(WikiNavbox, { props: { navbox, pages, currentSlug: 'Earth' } })
    expect(wrapper.find('.navbox-home').text()).toBe('Galaxy')
    expect(rowTitles(wrapper)).toEqual(['Factions', 'Places', 'Solar Concord', 'Misc'])
    const concordRow = wrapper.find('[data-group="faction:concord"] .navbox-list')
    expect(concordRow.text().replace(/\s+/g, ' ')).toBe('Sol (Earth [Moon], Mars)')
    expect(concordRow.findAll('.navbox-word').map(word => word.text().replace(/\s+/g, ' '))).toEqual(['Sol (Earth [Moon],', 'Mars)'])
    expect(concordRow.findAll('.navbox-name').map(name => name.text())).toEqual(['Mars'])
    expect(concordRow.find('.navbox-sign').exists()).toBe(false)
    expect(wrapper.find('[data-group="faction:concord"] .navbox-sign').exists()).toBe(true)
    expect(wrapper.find('.navbox-list .is-current').text()).toBe('Earth')
    expect(wrapper.findAll('.navbox-row.is-inside').map(row => row.attributes('data-group'))).toEqual(['places', 'faction:concord'])
    expect(wrapper.find('[data-group="places"] .navbox-count').text()).toBe('PAGES: 3')
    expect(wrapper.find('.panel-status').text()).toContain('PAGES 6')
    expect(wrapper.text()).toContain('PLACES › SOLAR CONCORD')

    await wrapper.find('[data-group="misc"] .navbox-link').trigger('click')
    expect(open).toHaveBeenCalledWith('Chronicle')
    await wrapper.find('[data-group="faction:concord"] .navbox-title').trigger('click')
    expect(open).toHaveBeenLastCalledWith('Solar_Concord')
  })

  it('folds a group, and opens it again when a page in it is opened', async () => {
    const wrapper = mount(WikiNavbox, { props: { navbox, pages, currentSlug: 'Chronicle' } })
    const toggle = () => wrapper.find('[data-group="places"] .navbox-toggle')
    expect(toggle().text()).toBe('[-]')
    await toggle().trigger('click')
    expect(toggle().text()).toBe('[+]')
    expect(rowTitles(wrapper)).toEqual(['Factions', 'Places', 'Misc'])
    expect(wrapper.find('[data-group="places"] .navbox-count').text()).toBe('PAGES: 3')
    await wrapper.setProps({ currentSlug: 'Moon' })
    await nextTick()
    expect(toggle().text()).toBe('[-]')
    expect(wrapper.find('.navbox-list .is-current').text()).toBe('Moon')
  })

  it('shows the main page as a portal: a box for each group, factions with their systems', async () => {
    const store = useUIStore()
    const open = vi.spyOn(store, 'openWiki').mockReturnValue(true)
    const withIcons = {
      ...navbox,
      groups: navbox.groups.map(group => ({ ...group, icon: group.id === 'places' ? 'planet' : null }))
    }
    const wrapper = mount(WikiPortal, { props: { navbox: withIcons, pages } })
    expect(wrapper.find('.portal-welcome').text()).toBe('Welcome to the archive: 6 pages, of them 2 articles and 3 places on the map.')
    const boxes = wrapper.findAll('.portal-box')
    expect(boxes.map(box => box.find('.portal-title').text())).toEqual(['Factions', 'Places', 'Misc'])
    expect(boxes.map(box => box.find('.portal-count').text())).toEqual(['1', '3', '1'])
    expect(boxes[1].find('.portal-icon').attributes('src')).not.toBe(boxes[0].find('.portal-icon').attributes('src'))
    const faction = boxes[1].find('.portal-row-title')
    expect(faction.text().replace(/\s+/g, ' ')).toBe('Solar Concord · 1 system')
    expect(faction.find('.portal-sign').exists()).toBe(true)
    await faction.find('.portal-link').trigger('click')
    expect(open).toHaveBeenCalledWith('Solar_Concord')
    await boxes[2].find('.portal-links .portal-link').trigger('click')
    expect(open).toHaveBeenLastCalledWith('Chronicle')
  })

  // Was: the main page showed a group's subgroups but not their articles, so third-level articles were nowhere on it.
  it('shows subgroups of subgroups, each a step in, with the branch of a tree', () => {
    const nested = {
      home: world,
      groups: [group('group:ships', 'Ships', [], [group('group:concord', 'Concord', [leaf(concord)], [group('group:freighters', 'Freighters', [leaf(chronicle)])], { icon: 'rocket' })])]
    }
    const portal = mount(WikiPortal, { props: { navbox: nested, pages } })
    const rows = portal.findAll('.portal-row')
    expect(rows.map(row => row.find('.portal-row-title').text())).toEqual(['Concord', 'Freighters'])
    expect(rows.map(row => row.find('.portal-links').text())).toEqual(['Solar Concord', 'Chronicle'])
    expect(rows.map(row => row.find('.portal-branch').exists())).toEqual([true, true])
    expect(rows[1].classes()).toContain('is-sub')
    expect(rows.map(row => row.find('.portal-row-icon').exists())).toEqual([true, false])

    const box = mount(WikiNavbox, { props: { navbox: nested, pages, currentSlug: null } })
    const branches = box.findAll('.navbox-row').map(row => row.find('.navbox-branch').exists())
    expect(branches).toEqual([false, true, true])
    const places = mount(WikiNavbox, { props: { navbox, pages, currentSlug: null } })
    expect(places.find('[data-group="faction:concord"] .navbox-branch').exists()).toBe(false)
  })

  const toc = collectHeadings(parseWikitext('== History ==\n=== Schism ===\n=== Truce ===\n== Fleet =='))
  const rowTexts = wrapper => wrapper.findAll('.contents-list .contents-link')
    .map(link => `${link.find('.contents-number').text()} ${link.find('.contents-text').text()}`)

  it('lists the numbered sections of the article and asks for one', async () => {
    const store = useUIStore()
    const wrapper = mount(WikiContents, { props: { toc } })
    expect(rowTexts(wrapper)).toEqual(['1 History', '1.1 Schism', '1.2 Truce', '2 Fleet'])
    expect(wrapper.findAll('.contents-row')[1].attributes('style')).toContain('--depth: 1')
    await wrapper.findAll('.contents-list .contents-link')[1].trigger('click')
    expect(store.wikiSectionRequest.index).toBe(1)
    await wrapper.find('.contents-top').trigger('click')
    expect(store.wikiSectionRequest.index).toBe(-1)
    expect(wrapper.find('.panel-status').text()).toMatch(/\[CLICK\] TO SECTION\s*SECTIONS 4/)
  })

  it('folds subsections and lights the section being read', async () => {
    const store = useUIStore()
    const wrapper = mount(WikiContents, { props: { toc } })
    const toggles = wrapper.findAll('button.contents-toggle')
    expect(toggles).toHaveLength(1)
    await toggles[0].trigger('click')
    expect(rowTexts(wrapper)).toEqual(['1 History', '2 Fleet'])
    expect(wrapper.find('button.contents-toggle').text()).toBe('[+]')

    store.followSection('Truce', 2)
    await nextTick()
    await nextTick()
    expect(rowTexts(wrapper)).toHaveLength(4)
    expect(wrapper.find('.is-current').text()).toContain('Truce')
    expect(wrapper.find('.is-ancestor').text()).toContain('History')
    expect(wrapper.find('.panel-status').text()).toMatch(/SECTION 1\.2\s*3\/4/)
  })
})
