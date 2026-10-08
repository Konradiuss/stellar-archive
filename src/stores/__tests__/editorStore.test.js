// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useEditorStore } from '../editorStore'
import { draftKey, gitBlobSha, loadDraft, loadPublished, publishedKey, savePublished } from '../../editor/draft'
import { moveBody } from '../../editor/systemEdits'
import EditorLore from '../../components/EditorLore.vue'

const MAP = JSON.stringify({ stars: [{ id: 'sol', name: 'Sol', sectorX: 0, sectorY: 0, loreFile: 'lore/sol.wiki' }] })

// The host: { path: text, a number for an HTTP status, or { html } for a web page }.
function serve(files) {
  vi.stubGlobal('fetch', async url => {
    const file = files[new URL(url).pathname.slice(1)]
    if (typeof file === 'number') return new Response('', { status: file })
    if (file?.html) return new Response(file.html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    return file === undefined ? new Response('', { status: 404 }) : new Response(file)
  })
}

async function openEditor(files) {
  serve(files)
  setActivePinia(createPinia())
  const editor = useEditorStore()
  await editor.load()
  return editor
}

describe('the editor', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // Was: wiki problems (a group too deep, a group nobody has) were reported on the site only; the editor said "No problems found".
  it('lists the problems of the wiki with those of the map', async () => {
    const map = JSON.parse(MAP)
    map.wiki = { groups: [{ id: 'a', groups: [{ id: 'b', groups: [{ id: 'c', groups: [{ id: 'd' }] }] }] }], worldGroup: 'nowhere' }
    const editor = await openEditor({ 'map.json': JSON.stringify(map), 'lore/sol.wiki': 'Sol' })
    expect(editor.problems.map(problem => `${problem.where}: ${problem.message}`)).toEqual([
      'wiki.groups: Group "d" is deeper than 3 levels: its articles go to "c".',
      'wiki.worldGroup: Group "nowhere" is not in "wiki.groups": the world page has no group.'
    ])
  })

  // Was: response.text() dropped the BOM of a Notepad file, so its hash never matched git's and every publish reported a conflict.
  it('keeps the byte order mark of a file, so that its hash is git\'s', async () => {
    const lore = '﻿== Sol =='
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': lore })
    expect(editor.originals['lore/sol.wiki']).toBe(lore)
    editor.setText('lore/sol.wiki', `${lore}\nmore`)
    expect(editor.draft.bases['lore/sol.wiki']).toBe(await gitBlobSha(lore))
  })

  // Was: a 500 or a lost connection was taken for "no such file": the editor offered to create it, and publishing overwrote the real one.
  it('says a file could not be read instead of offering to create it', async () => {
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': 500 })
    expect(editor.readFailure('lore/sol.wiki')).toBe('HTTP 500')
    expect(editor.isReading('lore/sol.wiki')).toBe(false)
    expect(editor.originals['lore/sol.wiki']).toBeUndefined()
  })

  // Was: files were read after the editor said "ready": one shown empty while loading was overwritten by the first key pressed in it.
  it('is ready only once the files the map names are read', async () => {
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': 'Sol' })
    expect(editor.status).toBe('ready')
    expect(editor.isReading('lore/sol.wiki')).toBe(false)
    expect(editor.textOf('lore/sol.wiki')).toBe('Sol')
  })

  // Was: some hosts answer a missing file with index.html, and the editor showed the site's page as the text of the article.
  it('takes the page of the site for a missing file', async () => {
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': { html: '<!doctype html><html></html>' } })
    expect(editor.originals['lore/sol.wiki']).toBeNull()
  })

  // Was: two editor tabs each saved their whole draft, and the last to save threw away what the other had changed.
  it('keeps the changes another tab made to other files', async () => {
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': 'Sol', 'wiki/a.wiki': 'A' })
    editor.setText('lore/sol.wiki', 'Sol, edited here')

    const other = loadDraft()
    other.files['wiki/a.wiki'] = 'A, edited there'
    other.bases['wiki/a.wiki'] = null
    localStorage.setItem(draftKey(), JSON.stringify(other))
    window.dispatchEvent(new StorageEvent('storage', { key: draftKey() }))
    expect(editor.draft.files['wiki/a.wiki']).toBe('A, edited there')
    expect(editor.otherTabFiles).toEqual([])

    editor.setText('lore/sol.wiki', 'Sol, edited again')
    expect(loadDraft().files).toEqual({ 'lore/sol.wiki': 'Sol, edited again', 'wiki/a.wiki': 'A, edited there' })

    const clash = loadDraft()
    clash.files['lore/sol.wiki'] = 'Sol, edited there'
    localStorage.setItem(draftKey(), JSON.stringify(clash))
    window.dispatchEvent(new StorageEvent('storage', { key: draftKey() }))
    expect(editor.textOf('lore/sol.wiki')).toBe('Sol, edited there')
    expect(editor.otherTabFiles).toEqual(['lore/sol.wiki'])
  })

  // Was: text waiting for the typing to stop was written after another edit: lore of a moved planet landed on the one now in its place.
  it('writes the text still waiting before any other edit of the map', async () => {
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': 'Sol' })
    const order = []
    const release = editor.holdSave(() => order.push('waiting text'))
    editor.editMap(text => {
      order.push('edit')
      return text
    })
    expect(order).toEqual(['waiting text', 'edit'])
    release()
  })

  // Was: GitHub Pages serves old files for minutes after a commit, and an editor opened meanwhile reported a conflict with the author's own commit.
  it('starts from what was just published while the host is behind', async () => {
    const before = await gitBlobSha('Sol')
    savePublished({ 'lore/sol.wiki': { before, sha: await gitBlobSha('Sol, published'), text: 'Sol, published', at: Date.now() } }, publishedKey())
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': 'Sol' })
    expect(editor.originals['lore/sol.wiki']).toBe('Sol, published')
  })

  // Was: publish records were saved again with a new time on each publish, so old ones never expired and filled the draft storage.
  it('lets each record of a publishing expire on its own', () => {
    const now = Date.now()
    savePublished({ old: { before: null, sha: 'a', text: 'a', at: now - 31 * 60 * 1000 }, fresh: { before: null, sha: 'b', text: 'b', at: now } }, publishedKey(), now)
    expect(Object.keys(loadPublished(publishedKey(), now))).toEqual(['fresh'])
  })

  // Was: after another tab published a file in this tab's draft, it showed its old text and the next publish reported a conflict.
  it('takes what another tab published as the text the host has', async () => {
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': 'Sol' })
    const record = { before: await gitBlobSha('Sol'), sha: await gitBlobSha('Sol, published there'), text: 'Sol, published there', at: Date.now() }
    savePublished({ 'lore/sol.wiki': record }, publishedKey())
    window.dispatchEvent(new StorageEvent('storage', { key: publishedKey() }))
    expect(editor.textOf('lore/sol.wiki')).toBe('Sol, published there')
    editor.setText('lore/sol.wiki', 'Sol, edited after')
    expect(editor.draft.bases['lore/sol.wiki']).toBe(record.sha)
  })

  // Was: an article whose file is written "./wiki/a.wiki" showed "Reading…" forever: the editor reads it as "wiki/a.wiki".
  it('shows reading only while a file is on its way', async () => {
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': 'Sol' })
    expect(editor.isReading('./lore/sol.wiki')).toBe(false)
    expect(editor.isReading('nowhere.wiki')).toBe(false)
  })

  // Was: one lost answer locked the file until the whole editor was reloaded.
  it('reads again a file that could not be read', async () => {
    const files = { 'map.json': MAP, 'lore/sol.wiki': 500 }
    const editor = await openEditor(files)
    expect(editor.readFailure('lore/sol.wiki')).toBe('HTTP 500')
    files['lore/sol.wiki'] = 'Sol'
    editor.retryRead('lore/sol.wiki')
    await vi.waitFor(() => expect(editor.textOf('lore/sol.wiki')).toBe('Sol'))
    expect(editor.readFailure('lore/sol.wiki')).toBeNull()
  })

  // Was: lore typed into a planet then "move down" within half a second was written after the move, onto the planet now in its place.
  it('writes waiting lore where it was typed before a planet moves', async () => {
    const map = JSON.stringify({
      stars: [{ id: 'sol', name: 'Sol', sectorX: 0, sectorY: 0 }],
      systems: { sol: { planets: [{ name: 'Mercury', orbitRadius: 40 }, { name: 'Venus', orbitRadius: 70 }] } }
    }, null, 2)
    const editor = await openEditor({ 'map.json': map })
    const place = { star: 'sol', planet: 0, satellite: null }
    const wrapper = mount(EditorLore, { props: { place, body: JSON.parse(map).systems.sol.planets[0] }, global: { stubs: { EditorPreview: true } } })
    await wrapper.find('textarea').setValue('Hot and small.')
    editor.editMap(text => moveBody(text, place, 1))
    const planets = JSON.parse(editor.mapText).systems.sol.planets
    expect(planets.map(planet => [planet.name, planet.lore])).toEqual([['Venus', undefined], ['Mercury', 'Hot and small.']])
    wrapper.unmount()
  })

  // Was: unticking "Remember" left the token in the browser until the next publish.
  it('forgets the token as soon as "Remember" is unticked', async () => {
    // A token kept by an older version, under the key all sites shared.
    localStorage.setItem('spacemap:github-token', 'secret')
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': 'Sol' })
    expect(editor.token).toBe('secret')
    expect(editor.rememberToken).toBe(true)
    editor.rememberToken = false
    await nextTick()
    expect(localStorage.getItem('spacemap:github-token')).toBeNull()
    expect(localStorage.getItem('spacemap:github-token:/')).toBeNull()
    expect(sessionStorage.getItem('spacemap:github-token:/')).toBe('secret')
  })

  // Was: without "Remember" the token was asked after every reload; with it, it sat in localStorage, readable by every GitHub Pages site of the owner.
  it('keeps the token for this tab only, unless "Remember" is ticked', async () => {
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': 'Sol' })
    editor.setText('lore/sol.wiki', 'Sol, edited')
    editor.publishSettings.repo = 'owner/site'
    editor.token = ' tab-token '
    expect(editor.rememberToken).toBe(false)
    await editor.publish({ message: 'test' })
    expect(sessionStorage.getItem('spacemap:github-token:/')).toBe('tab-token')
    expect(localStorage.getItem('spacemap:github-token:/')).toBeNull()

    const reloaded = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': 'Sol' })
    expect(reloaded.token).toBe('tab-token')
    expect(reloaded.rememberToken).toBe(false)

    reloaded.rememberToken = true
    reloaded.setText('lore/sol.wiki', 'Sol, edited again')
    await reloaded.publish({ message: 'test' })
    expect(localStorage.getItem('spacemap:github-token:/')).toBe('tab-token')
    expect(sessionStorage.getItem('spacemap:github-token:/')).toBeNull()
  })

  // Was: a failure that was not GitHub's (a stored setting of the wrong kind) was thrown out of publish(), and the dialog showed nothing.
  it('shows any failure of publishing', async () => {
    const editor = await openEditor({ 'map.json': MAP, 'lore/sol.wiki': 'Sol' })
    editor.setText('lore/sol.wiki', 'Sol, edited')
    editor.publishSettings.repo = null
    await editor.publish({ message: 'test' })
    expect(editor.publishResult).toMatchObject({ status: 'failed', key: 'editor.publishCrashed' })
    expect(editor.publishing).toBe(false)
  })
})
