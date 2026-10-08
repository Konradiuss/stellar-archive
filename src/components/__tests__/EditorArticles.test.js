// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useEditorStore } from '../../stores/editorStore'
import EditorArticles from '../EditorArticles.vue'
import EditorTextArea from '../EditorTextArea.vue'

const MAP = JSON.stringify({
  stars: [],
  wiki: { articles: [{ title: 'Alpha', text: 'alpha' }, { title: 'Beta', text: 'beta' }] }
}, null, 2)

const textOf = (editor, title) => JSON.parse(editor.mapText).wiki.articles.find(article => article.title === title).text

describe('the articles of the editor', () => {
  let editor

  beforeEach(async () => {
    localStorage.clear()
    vi.stubGlobal('fetch', async url => (new URL(url).pathname === '/map.json' ? new Response(MAP) : new Response('', { status: 404 })))
    setActivePinia(createPinia())
    editor = useEditorStore()
    await editor.load()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  // Was: typing into Alpha and opening Beta within half a second left Alpha's text in the box, and the next key wrote it into Beta.
  it('writes what was typed into its own article when another is opened', async () => {
    vi.useFakeTimers()
    editor.selectedArticle = 'Alpha'
    const wrapper = mount(EditorArticles, { global: { stubs: { EditorPreview: true } } })
    await nextTick()
    const box = () => wrapper.findAllComponents(EditorTextArea).at(-1)
    box().vm.$emit('update:modelValue', 'alpha, typed')

    editor.selectedArticle = 'Beta'
    await nextTick()
    expect(box().props('modelValue')).toBe('beta')
    expect(textOf(editor, 'Alpha')).toBe('alpha, typed')
    expect(textOf(editor, 'Beta')).toBe('beta')

    vi.runAllTimers()
    expect(textOf(editor, 'Beta')).toBe('beta')
    wrapper.unmount()
  })

  // Was: the text typed in the last half second before the tab or the page closed was lost.
  it('writes what was typed when it closes', async () => {
    editor.selectedArticle = 'Alpha'
    const wrapper = mount(EditorArticles, { global: { stubs: { EditorPreview: true } } })
    await nextTick()
    wrapper.findAllComponents(EditorTextArea).at(-1).vm.$emit('update:modelValue', 'alpha, last keys')
    wrapper.unmount()
    expect(textOf(editor, 'Alpha')).toBe('alpha, last keys')
  })
})
