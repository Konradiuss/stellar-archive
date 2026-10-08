import { describe, expect, it, vi } from 'vitest'
import { normalizeLoreConfig, parseLore, resolveLoreDocument } from '../lore'
import { mapJournal, mapProblems, startMapJournal } from '../../mapJournal'

const SITE = 'https://owner.github.io/wiki/map.json'

function notesOf(markdown, { baseUrl = SITE, loreConfig = {} } = {}) {
  startMapJournal()
  const doc = resolveLoreDocument(parseLore(markdown, 'markdown'), { config: normalizeLoreConfig(loreConfig), baseUrl })
  return { doc, notes: mapJournal() }
}

// Was: the Special:Map check said nothing of pictures the site cannot show (http on https) or that tell another site who reads the wiki.
describe('pictures of the lore in the map check', () => {
  it('warns of an http picture: the site asks for it over https', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { notes } = notesOf('![Earth](http://img.example/earth.png)')
    vi.restoreAllMocks()
    expect(notes[0]).toMatchObject({ level: 'warning', where: 'picture "http://img.example/earth.png"' })
    expect(notes[0].message).toMatch(/https/)
  })

  it('notes once per site the pictures of another site, out of the console and out of the problems', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { notes } = notesOf('![a](https://img.example/a.png) ![b](https://img.example/b.png) ![c](https://cdn.other.example/c.png)')
    expect(warn).not.toHaveBeenCalled()
    vi.restoreAllMocks()
    expect(notes.map(note => [note.level, note.where])).toEqual([
      ['info', 'pictures from img.example'],
      ['info', 'pictures from cdn.other.example']
    ])
    expect(mapProblems(notes)).toEqual([])
  })

  it('notes the pictures of the wiki that [[File:…]] reads them from', () => {
    startMapJournal()
    const doc = resolveLoreDocument(parseLore('[[File:Earth.png]]', 'wikitext'), { config: normalizeLoreConfig({ wikiUrl: 'https://wiki.example/wiki' }), baseUrl: SITE })
    expect(JSON.stringify(doc)).toContain('https://wiki.example/wiki/Special:FilePath/Earth.png')
    expect(mapJournal().map(note => note.where)).toEqual(['pictures from wiki.example'])
  })

  it('says nothing of pictures of the site itself, or next to the map', () => {
    const { doc, notes } = notesOf('![a](lore/images/a.png) ![b](https://owner.github.io/other/b.png) ![c](./c.png)')
    expect(JSON.stringify(doc)).toContain('https://owner.github.io/wiki/lore/images/a.png')
    expect(notes).toEqual([])
  })

  it('says nothing of the pictures of a local server, http as the server itself', () => {
    const { doc, notes } = notesOf('![a](lore/images/a.png)', { baseUrl: 'http://localhost:5173/map.json' })
    expect(JSON.stringify(doc)).toContain('http://localhost:5173/lore/images/a.png')
    expect(notes).toEqual([])
  })

  it('cannot tell another site from the map read from disk (the build)', () => {
    const { notes } = notesOf('![a](https://img.example/a.png)', { baseUrl: 'file:///site/public/map.json' })
    expect(notes).toEqual([])
  })

  it('puts the notes after the errors and the warnings', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { notes } = notesOf('![a](https://img.example/a.png) ![b](http://owner.github.io/b.png)')
    vi.restoreAllMocks()
    expect(notes.map(note => note.level)).toEqual(['warning', 'info'])
  })
})
