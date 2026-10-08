// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlanetList from '../PlanetList.vue'
import SystemTaskbar from '../SystemTaskbar.vue'

const planets = count => Array.from({ length: count }, (_, index) => ({ name: `Planet ${index + 1}` }))
const keys = wrapper => wrapper.findAll('.planet-list-key').map(key => key.text())
const names = wrapper => wrapper.findAll('.planet-list-name').map(name => name.text())

describe('PlanetList', () => {
  it('shows four planets on one page without page navigation', () => {
    const wrapper = mount(PlanetList, { props: { planets: planets(4) } })
    expect(keys(wrapper)).toEqual(['[1]', '[2]', '[3]', '[4]'])
    expect(wrapper.find('.planet-list-pages').exists()).toBe(false)
  })

  // Was: planets from the 10th on had the key [-] and no way to pick them.
  it('splits twelve planets into pages with keys 1-9 on each', async () => {
    const wrapper = mount(PlanetList, { props: { planets: planets(12), page: 0 } })
    expect(keys(wrapper)).toHaveLength(9)
    expect(keys(wrapper)[8]).toBe('[9]')
    expect(wrapper.text()).not.toContain('[-]')
    expect(wrapper.find('.planet-list-page-label').text()).toBe('PG 1/2')

    await wrapper.setProps({ page: 1 })
    expect(keys(wrapper)).toEqual(['[1]', '[2]', '[3]'])
    expect(names(wrapper)).toEqual(['PLANET 10', 'PLANET 11', 'PLANET 12'])

    await wrapper.findAll('.planet-list-item')[2].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[11]])
  })

  it('turns pages with its buttons and disables them at the ends', async () => {
    const wrapper = mount(PlanetList, { props: { planets: planets(12), page: 0 } })
    const [previous, next] = wrapper.findAll('.planet-list-page-btn')
    expect(previous.attributes('disabled')).toBeDefined()
    await next.trigger('click')
    expect(wrapper.emitted('page')).toEqual([[1]])
  })

  it('marks the planet that was open before returning to the list', () => {
    const wrapper = mount(PlanetList, { props: { planets: planets(4), lastViewedIndex: 2 } })
    const marked = wrapper.findAll('.planet-list-item.is-last-viewed')
    expect(marked).toHaveLength(1)
    expect(marked[0].find('.planet-list-mark').text()).toBe('*')
    expect(marked[0].find('.planet-list-name').text()).toBe('PLANET 3')
  })

  it('reports hover in both directions with global indexes', async () => {
    const wrapper = mount(PlanetList, { props: { planets: planets(12), page: 1, hoveredIndex: 10 } })
    const rows = wrapper.findAll('.planet-list-item')
    expect(rows[1].classes()).toContain('is-hovered')
    expect(rows[1].classes().filter(name => name !== 'planet-list-item' && name !== 'is-hovered')).toEqual([])
    await rows[0].trigger('mouseenter')
    await rows[0].trigger('mouseleave')
    expect(wrapper.emitted('hover')).toEqual([[9], [null]])
  })

  it('hangs satellites under their planet, without keys', async () => {
    const list = planets(4)
    list[2].satellites = [{ name: 'Moon' }, { name: 'Warden' }]
    const wrapper = mount(PlanetList, { props: { planets: list, hoveredSatellite: { planetIndex: 2, satelliteIndex: 1 } } })
    expect(keys(wrapper)).toEqual(['[1]', '[2]', '[3]', '[4]'])
    expect(names(wrapper)).toEqual(['PLANET 1', 'PLANET 2', 'PLANET 3', 'MOON', 'WARDEN', 'PLANET 4'])
    const rows = wrapper.findAll('.satellite-list-item')
    expect(rows[1].classes()).toContain('is-hovered')
    await rows[0].trigger('click')
    await rows[0].trigger('mouseenter')
    expect(wrapper.emitted('select-satellite')).toEqual([[2, 0]])
    expect(wrapper.emitted('hover-satellite')).toEqual([[2, 0]])
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('folds more than three bodies into one row that opens on a click', async () => {
    const list = planets(3)
    list[0].satellites = [
      ...Array.from({ length: 5 }, (_, index) => ({ name: `Moon ${index + 1}` })),
      ...Array.from({ length: 5 }, (_, index) => ({ name: `Station ${index + 1}`, kind: 'station' }))
    ]
    list[1].satellites = Array.from({ length: 4 }, (_, index) => ({ name: `Minor ${index + 1}` }))
    list[2].satellites = [{ name: 'Single' }]
    const wrapper = mount(PlanetList, { props: { planets: list } })
    const toggles = () => wrapper.findAll('.satellite-list-toggle')
    expect(toggles().map(row => row.find('.planet-list-name').text())).toEqual(['5 MOONS AND 5 STATIONS', '4 MOONS'])
    expect(wrapper.findAll('.satellite-list-item:not(.satellite-list-toggle)')).toHaveLength(1)
    await toggles()[0].trigger('click')
    expect(toggles()[0].attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.satellite-list-item:not(.satellite-list-toggle)')).toHaveLength(11)
    expect(wrapper.emitted('select-satellite')).toBeUndefined()
    await toggles()[0].trigger('click')
    expect(wrapper.findAll('.satellite-list-item:not(.satellite-list-toggle)')).toHaveLength(1)
  })

  it('opens the tree of the planet seen last', () => {
    const list = planets(2)
    list[1].satellites = Array.from({ length: 6 }, (_, index) => ({ name: `Station ${index + 1}`, kind: 'station' }))
    const wrapper = mount(PlanetList, { props: { planets: list, lastViewedIndex: 1 } })
    expect(wrapper.find('.satellite-list-toggle .planet-list-name').text()).toBe('6 STATIONS')
    expect(wrapper.findAll('.satellite-list-item:not(.satellite-list-toggle)')).toHaveLength(6)
  })

  it('marks stations apart from moons', () => {
    const list = planets(2)
    list[0].satellites = [{ name: 'Moon' }, { name: 'Ring', kind: 'station', type: 'ring' }]
    const wrapper = mount(PlanetList, { props: { planets: list } })
    const kinds = wrapper.findAll('.satellite-list-item .planet-list-orbit').map(label => label.text())
    expect(kinds).toEqual(['MOON', 'STATION'])
  })
})

describe('SystemTaskbar', () => {
  it('lists the keys that work now', () => {
    const wrapper = mount(SystemTaskbar, { props: { hints: ['ESC:MAP', '1-3:PLANET'] } })
    expect(wrapper.find('.taskbar-hint').text()).toBe('ESC:MAP  1-3:PLANET')
  })

  it('shows what the element under the mouse does instead of the keys', () => {
    const wrapper = mount(SystemTaskbar, { props: { hints: ['ESC:MAP'], hoverHint: 'Minimize the window' } })
    expect(wrapper.find('.taskbar-hint').text()).toBe('> MINIMIZE THE WINDOW')
    expect(wrapper.text()).not.toContain('ESC:MAP')
  })

  it('restores a minimized window from its button', async () => {
    const wrapper = mount(SystemTaskbar, { props: { windows: [{ id: 'data', title: 'PLANET-DATA.EXE' }] } })
    await wrapper.find('.taskbar-item').trigger('click')
    expect(wrapper.emitted('restore')).toEqual([['data']])
  })
})
