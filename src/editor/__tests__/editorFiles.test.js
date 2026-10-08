// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { textFiles, isSitePath } from '../siteFiles'
import { crc32, zipFiles } from '../zip'
import { draftFetch, draftKey, gitBlobSha, isPreview, loadDraft, previewDraft, saveDraft, setPreview, sitePath } from '../draft'
import { mapJournal, startMapJournal, noteMap } from '../../utils/mapJournal'

const MAP = JSON.parse(readFileSync('test-world/map.json', 'utf8'))

describe('the files of a site', () => {
  it('lists the map and every text file it names, each once', () => {
    const files = textFiles(MAP)
    expect(files[0]).toEqual({ path: 'map.json', kind: 'map' })
    const paths = files.map(file => file.path)
    for (const article of MAP.wiki.articles.filter(each => each.file)) expect(paths).toContain(article.file)
    expect(paths).toContain('lore/solar/earth.wiki')
    expect(paths).toContain('lore/solar/moon.wiki')
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.slice(1)).toEqual([...paths.slice(1)].sort())
  })

  it('takes the terminal, and nothing outside the site', () => {
    const files = textFiles({
      stars: [{ id: 'a', sectorX: 0, sectorY: 0, loreFile: './lore/a.wiki' }, { id: 'b', sectorX: 1, sectorY: 0, loreFile: 'https://x.org/b.wiki' }],
      terminal: { script: 'terminal.txt', files: { 'LOG.TXT': '../secret.txt', 'NOTE.TXT': 'notes/note.txt' } }
    })
    expect(files).toEqual([
      { path: 'map.json', kind: 'map' },
      { path: 'lore/a.wiki', kind: 'text' },
      { path: 'notes/note.txt', kind: 'terminal' },
      { path: 'terminal.txt', kind: 'terminal' }
    ])
    expect(textFiles('not a map')).toEqual([{ path: 'map.json', kind: 'map' }])
    expect(['a.txt', 'wiki/a.md'].every(isSitePath)).toBe(true)
    expect(['/a.txt', '../a.txt', 'a/../../b', 'http://x/a', ' ', null].some(isSitePath)).toBe(false)
  })

  it('checks quietly, and leaves the journal of the site as it was', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    startMapJournal()
    noteMap('warning', 'site', 'Kept.')
    const warn = vi.spyOn(console, 'warn')
    warn.mockClear()
    textFiles({ stars: [{ sectorX: 0, sectorY: 0 }], factions: [] })
    expect(warn).not.toHaveBeenCalled()
    expect(mapJournal()).toEqual([{ level: 'warning', where: 'site', message: 'Kept.' }])
    vi.restoreAllMocks()
  })
})

// Reads a stored ZIP back as [{ path, text }].
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  const files = []
  let at = 0
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true)
    const nameLength = view.getUint16(at + 26, true)
    const name = decoder.decode(bytes.slice(at + 30, at + 30 + nameLength))
    const data = bytes.slice(at + 30 + nameLength, at + 30 + nameLength + size)
    expect(crc32(data)).toBe(view.getUint32(at + 14, true))
    files.push({ path: name, text: decoder.decode(data) })
    at += 30 + nameLength + size
  }
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  expect(view.getUint16(end + 10, true)).toBe(files.length)
  expect(view.getUint32(end + 16, true)).toBe(at)
  return files
}

describe('a ZIP of the edited files', () => {
  it('counts CRC-32 as everyone does', () => {
    const bytes = text => new TextEncoder().encode(text)
    expect(crc32(bytes(''))).toBe(0)
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
    expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })

  it('stores the files with their folders and UTF-8 names', () => {
    const files = [{ path: 'map.json', text: '{}\n' }, { path: 'wiki/Земля.wiki', text: "'''Земля''' — дом." }]
    expect(unzip(zipFiles(files, new Date(2026, 9, 4, 12, 30, 10)))).toEqual(files)
  })
})

describe('the draft in the browser', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('is kept per site, only while it has files', () => {
    expect(draftKey('/spacemap/index.html')).toBe('spacemap:draft:/spacemap/')
    expect(draftKey('/other/')).toBe('spacemap:draft:/other/')
    const key = draftKey('/a/')
    expect(loadDraft(key)).toEqual({ files: {}, bases: {} })
    expect(saveDraft({ files: { 'map.json': '{}' }, bases: { 'map.json': 'abc' } }, key)).toBe(true)
    expect(loadDraft(key)).toEqual({ files: { 'map.json': '{}' }, bases: { 'map.json': 'abc' } })
    expect(loadDraft(draftKey('/b/'))).toEqual({ files: {}, bases: {} })
    saveDraft({ files: {}, bases: {} }, key)
    expect(localStorage.getItem(key)).toBeNull()
    localStorage.setItem(key, '{ broken')
    expect(loadDraft(key)).toEqual({ files: {}, bases: {} })
  })

  it('hashes a file as git does', async () => {
    // `git hash-object` of an empty file and of "hello\n".
    expect(await gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
    expect(await gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })

  it('shows the site with its files while previewing', async () => {
    const key = draftKey('/site/')
    saveDraft({ files: { 'map.json': '{"stars":[]}', 'wiki/a.wiki': 'new' }, bases: {} }, key)
    expect(previewDraft(key)).toBeNull()
    setPreview(true)
    expect(isPreview()).toBe(true)
    const draft = previewDraft(key)
    expect(draft.files['wiki/a.wiki']).toBe('new')
    const mapUrl = 'https://x.github.io/site/map.json'
    expect(sitePath('https://x.github.io/site/wiki/a.wiki?v=1', mapUrl)).toBe('wiki/a.wiki')
    expect(sitePath('https://x.github.io/site/wiki/%D0%97.wiki', mapUrl)).toBe('wiki/З.wiki')
    expect(sitePath('https://x.github.io/other/a.wiki', mapUrl)).toBeNull()
    const network = vi.fn(async url => `site:${url}`)
    const fetchText = draftFetch(network, draft, mapUrl)
    expect(await fetchText('https://x.github.io/site/wiki/a.wiki')).toBe('new')
    expect(await fetchText('https://x.github.io/site/wiki/b.wiki')).toBe('site:https://x.github.io/site/wiki/b.wiki')
    const deleting = draftFetch(network, { files: { 'wiki/old.wiki': null }, bases: {} }, mapUrl)
    await expect(deleting('https://x.github.io/site/wiki/old.wiki')).rejects.toThrow('HTTP 404')
    setPreview(false)
    expect(previewDraft(key)).toBeNull()
  })

  // Was: a "%" that is no escape ("100%zz.png") made sitePath throw a URIError, and the file failed to load with a draft shown.
  it('takes a path with a stray "%" as it is written', async () => {
    const mapUrl = 'https://x.github.io/site/map.json'
    expect(sitePath('https://x.github.io/site/lore/100%zz.png', mapUrl)).toBe('lore/100%zz.png')
    const network = vi.fn(async url => `site:${url}`)
    const fetchText = draftFetch(network, { files: { 'lore/100%zz.png': 'drawn' }, bases: {} }, mapUrl)
    expect(await fetchText('https://x.github.io/site/lore/100%zz.png')).toBe('drawn')
    expect(sitePath('https://', mapUrl)).toBeNull()
  })
})
