// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useUIStore } from '../../stores/uiStore'
import { parseWikitext } from '../../utils/richText/wikitextParser'
import WikiSheet from '../WikiSheet.vue'

// Was: on a phone the contents and the navigation of the wiki had no place.
describe('the window of the contents and the navigation on a phone', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useUIStore()
    vi.spyOn(store, 'wikiPage', 'get').mockReturnValue({ slug: 'Mars', doc: parseWikitext('== History ==\n=== Schism ===\n== Fleet ==') })
  })

  it('lists the sections of the article and goes when one is chosen', async () => {
    const scroll = vi.spyOn(store, 'scrollWikiTo').mockImplementation(() => {})
    const wrapper = mount(WikiSheet, { props: { kind: 'contents' } })
    expect(wrapper.find('.wiki-sheet-file').text()).toBe('CONTENTS.TXT')
    const links = wrapper.findAll('.contents-list .contents-link')
    expect(links.map(link => link.find('.contents-text').text())).toEqual(['History', 'Schism', 'Fleet'])
    await links[2].trigger('click')
    expect(scroll).toHaveBeenCalledWith(2)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes by its button, and stays open while a section folds', async () => {
    const wrapper = mount(WikiSheet, { props: { kind: 'contents' } })
    await wrapper.find('.contents-toggle').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
    await wrapper.find('.wiki-sheet-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('shows the navigation box of the wiki', () => {
    const wrapper = mount(WikiSheet, { props: { kind: 'navbox' } })
    expect(wrapper.find('.wiki-sheet-file').text()).toBe('NAVBOX.DAT')
    expect(wrapper.find('.wiki-navbox').exists()).toBe(true)
  })
})
