// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useEditorStore } from '../editorStore'
import { draftKey, gitBlobSha, loadDraft, loadPublished, publishedKey, savePublished } from '../../editor/draft'
import { binaryRef, readRef, toDataUrl } from '../../editor/binaryFiles'
import { getBlob, putBlob, useBackend } from '../../editor/blobStore'
import { memoryBackend } from '../../editor/__tests__/blobBackend'
import { moveBody } from '../../editor/systemEdits'
import { removeTrack } from '../../editor/musicEdits'
import EditorLore from '../../components/EditorLore.vue'

const MAP = JSON.stringify({ stars: [{ id: 'sol', name: 'Sol', sectorX: 0, sectorY: 0, loreFile: 'lore/sol.wiki' }] })

// The host: { path: text, a number for an HTTP status, or { html } for a web page }.
function serve(files) {
  vi.stubGlobal('fetch', async url => {
    const file = files[new URL(url).pathname.slice(1)]
    if (typeof file === 'number') return new Response('', { status: file })
    if (file?.html) return new Response(file.html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    if (file instanceof Uint8Array) return new Response(file, { headers: { 'content-type': 'audio/wav' } })
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

  describe('with recordings', () => {
    const SOUND_MAP = JSON.stringify({ stars: [], sounds: { click: 'sounds/click.wav' } })
    const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4])
    const OTHER = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9])
    let backend
    beforeEach(() => {
      backend = memoryBackend()
      useBackend(backend)
    })
    afterEach(() => useBackend(null))
    const stored = () => loadDraft(draftKey()).files['sounds/click.wav']
    const bytes = async blob => [...new Uint8Array(await blob.arrayBuffer())]

    // Was: the bytes went into localStorage as a data URL; a few recordings filled it and the draft was not kept.
    it('keeps the bytes in the blob store and a short reference in the draft', async () => {
      const editor = await openEditor({ 'map.json': SOUND_MAP, 'sounds/click.wav': WAV })
      expect(readRef(editor.originals['sounds/click.wav'])).toEqual({ sha: await gitBlobSha(WAV), size: WAV.length })
      expect(await editor.setBinary('sounds/click.wav', OTHER)).toBeNull()
      expect(stored()).toBe(binaryRef(await gitBlobSha(OTHER), OTHER.length))
      expect(editor.draft.bases['sounds/click.wav']).toBe(await gitBlobSha(WAV))
      expect([...await editor.bytesOf('sounds/click.wav')]).toEqual([...OTHER])
      const { blob } = await editor.downloadable()
      expect(await bytes(blob)).toEqual([...OTHER])
      // The host's own bytes again: no change left.
      await editor.setBinary('sounds/click.wav', WAV)
      expect(editor.changedFiles).toEqual([])
    })

    it('moves a recording of an older draft out of localStorage, once', async () => {
      localStorage.setItem(draftKey(), JSON.stringify({ files: { 'sounds/click.wav': toDataUrl(OTHER, 'sounds/click.wav') }, bases: { 'sounds/click.wav': null } }))
      const editor = await openEditor({ 'map.json': SOUND_MAP })
      const sha = await gitBlobSha(OTHER)
      expect(stored()).toBe(binaryRef(sha, OTHER.length))
      expect(await bytes(await getBlob(sha))).toEqual([...OTHER])
      expect([...await editor.bytesOf('sounds/click.wav')]).toEqual([...OTHER])
    })

    it('keeps the recording in the draft itself when the browser has no IndexedDB', async () => {
      useBackend(null)
      const editor = await openEditor({ 'map.json': SOUND_MAP })
      expect(await editor.setBinary('sounds/click.wav', OTHER)).toBeNull()
      expect(stored()).toBe(toDataUrl(OTHER, 'sounds/click.wav'))
      expect([...await editor.bytesOf('sounds/click.wav')]).toEqual([...OTHER])
    })

    // Was: without IndexedDB a track of megabytes went into localStorage, which could not keep it, and the whole draft was lost.
    it('refuses a big file when the browser has no IndexedDB', async () => {
      useBackend(null)
      const editor = await openEditor({ 'map.json': SOUND_MAP })
      const big = new Uint8Array(3 * 1024 * 1024)
      expect(await editor.setBinary('music/long.wav', big)).toEqual({ key: 'editor.noFileStore', params: { file: 'music/long.wav', size: '3 MB', max: '2 MB' } })
      expect(editor.changedFiles).toEqual([])
    })

    // Was: the editor would have downloaded every track of the playlist when it opened, and again to delete one.
    it('neither reads the tracks of the playlist when it opens nor to delete one', async () => {
      const map = JSON.stringify({ stars: [], music: { tracks: [{ file: 'music/a.wav' }, { file: 'music/b.wav' }] } })
      const editor = await openEditor({ 'map.json': map, 'music/a.wav': WAV, 'music/b.wav': OTHER })
      const asked = vi.mocked(fetch)
      const read = []
      vi.stubGlobal('fetch', async (url, options) => {
        read.push(new URL(url).pathname)
        return asked(url, options)
      })
      expect(editor.files.map(file => file.path)).toEqual(['map.json'])
      editor.editMap(text => removeTrack(text, 1))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(read.filter(path => path.startsWith('/music/'))).toEqual([])
      expect(editor.isDeleted('music/b.wav')).toBe(true)
      // Nothing to compare: publishing deletes it if GitHub has it.
      expect(Object.hasOwn(editor.draft.bases, 'music/b.wav')).toBe(false)
      editor.revert('music/b.wav')
      expect(editor.isChanged('music/b.wav')).toBe(false)
    })

    it('refuses a recording the browser has no room for, saying how much there is', async () => {
      vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 1000, usage: 996 }) } })
      const editor = await openEditor({ 'map.json': SOUND_MAP })
      expect(await editor.setBinary('sounds/click.wav', OTHER)).toEqual({ key: 'editor.noRoom', params: { file: 'sounds/click.wav', size: '1 KB', free: '1 KB' } })
      expect(editor.changedFiles).toEqual([])
    })

    it('says which recordings of the draft the browser lost, and neither downloads nor publishes without them', async () => {
      const lost = binaryRef('f'.repeat(40), 3)
      localStorage.setItem(draftKey(), JSON.stringify({ files: { 'sounds/click.wav': lost }, bases: { 'sounds/click.wav': null } }))
      const editor = await openEditor({ 'map.json': SOUND_MAP })
      expect(editor.lostFiles).toEqual(['sounds/click.wav'])
      await editor.download()
      expect(editor.formError).toEqual({ key: 'editor.binaryLost', params: { files: 'sounds/click.wav' } })
      editor.token = 'secret'
      editor.publishSettings.repo = 'owner/site'
      await editor.publish({ message: 'test' })
      expect(editor.publishResult).toEqual({ status: 'failed', key: 'editor.binaryLost', params: { files: 'sounds/click.wav' } })
      // Uploaded again: found.
      await editor.setBinary('sounds/click.wav', OTHER)
      expect(editor.lostFiles).toEqual([])
    })

    it('finds a recording another tab put in the store', async () => {
      const sha = await gitBlobSha(OTHER)
      await putBlob(sha, new Blob([OTHER]))
      useBackend(backend)
      localStorage.setItem(draftKey(), JSON.stringify({ files: { 'sounds/click.wav': binaryRef(sha, OTHER.length) }, bases: {} }))
      const editor = await openEditor({ 'map.json': SOUND_MAP })
      expect(editor.lostFiles).toEqual([])
      expect([...await editor.bytesOf('sounds/click.wav')]).toEqual([...OTHER])
    })
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
