// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SystemTaskbar from '../SystemTaskbar.vue'

const TABS = [
  { id: 'system', label: 'SYSTEM', title: 'SYSTEM-VIEW.EXE' },
  { id: 'data', label: 'DATA', title: 'PLANET-DATA.EXE' },
  { id: 'visual', label: 'VISUAL', title: 'PLANET-VISUAL.EXE' }
]

// Was: on a phone the taskbar held two long .EXE names on two rows and hints of keys a phone has not, cut at the edge.
describe('the taskbar of a phone', () => {
  it('is a tab for each window, the shown one marked, with no hints of keys', async () => {
    const wrapper = mount(SystemTaskbar, {
      props: { tabs: TABS, current: 'data', windows: [{ id: 'system', title: 'SYSTEM-VIEW.EXE' }], hints: ['ESC:MAP'], hoverHint: 'Select' }
    })
    const tabs = wrapper.findAll('.taskbar-tab')
    expect(tabs.map(tab => tab.text())).toEqual(['[ SYSTEM ]', '[ DATA ]', '[ VISUAL ]'])
    expect(tabs[1].classes()).toContain('is-current')
    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(wrapper.find('.taskbar-hint').exists()).toBe(false)
    expect(wrapper.find('.taskbar-label').exists()).toBe(false)
    await tabs[2].trigger('click')
    expect(wrapper.emitted('restore')).toEqual([['visual']])
  })

  it('stays the bar of minimized windows and hints without tabs', () => {
    const wrapper = mount(SystemTaskbar, { props: { windows: [{ id: 'data', title: 'PLANET-DATA.EXE' }], hints: ['ESC:MAP'] } })
    expect(wrapper.find('.taskbar-tab').exists()).toBe(false)
    expect(wrapper.find('.taskbar-item').text()).toBe('[ PLANET-DATA.EXE ]')
    expect(wrapper.find('.taskbar-hint').text()).toBe('ESC:MAP')
  })
})
