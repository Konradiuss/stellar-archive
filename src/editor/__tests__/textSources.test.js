import { describe, expect, it } from 'vitest'
import { moveSourceFile, setSourceFormat, setSourceText, sourceOf, sourceToFile, sourceToMap, suggestSourceFile } from '../textSources'

const MAP = `{
  "stars": [{ "id": "sol", "name": "Sol", "sectorX": 0, "sectorY": 0, "lore": "The sun." }],
  "systems": { "sol": { "planets": [{ "name": "Earth", "loreFile": "lore/earth.wiki" }] } },
  "wiki": { "articles": [{ "title": "Atlas", "text": "Maps." }] }
}
`
const read = text => JSON.parse(text)
const earth = { at: 'body', place: { star: 'sol', planet: 0, satellite: null }, keys: 'lore' }
const sol = { at: 'body', place: { star: 'sol', planet: null }, keys: 'lore' }

// Was: a text could be written only where it already was; nothing moved it into a file, out of one, or set its format.
describe('the texts of the map, in map.json or in a file', () => {
  it('tell where they are and in what format', () => {
    expect(sourceOf(read(MAP), sol)).toEqual({ text: 'The sun.', file: null, format: null })
    expect(sourceOf(read(MAP), earth)).toEqual({ text: null, file: 'lore/earth.wiki', format: null })
    expect(sourceOf(read(MAP), { at: 'article', title: 'atlas', keys: 'article' })).toEqual({ text: 'Maps.', file: null, format: null })
    expect(sourceOf(read(MAP), { at: 'system', star: 'nowhere', keys: 'legend' })).toEqual({ text: null, file: null, format: null })
  })

  it('go into a file that takes the text, and back into map.json, the file going with it', () => {
    const { text, create } = sourceToFile(MAP, sol, 'lore/sol.wiki', 'The sun.')
    expect(read(text).stars[0]).toEqual({ id: 'sol', name: 'Sol', sectorX: 0, sectorY: 0, loreFile: 'lore/sol.wiki' })
    expect(create).toEqual({ path: 'lore/sol.wiki', text: 'The sun.' })
    const back = sourceToMap(text, sol, 'The sun, edited.')
    expect(read(back.text).stars[0].lore).toBe('The sun, edited.')
    expect(read(back.text).stars[0].loreFile).toBeUndefined()
    expect(back.orphans).toEqual(['lore/sol.wiki'])
  })

  it('move to another file with the text of the old one, which goes unless the map names it elsewhere', () => {
    const moved = moveSourceFile(MAP, earth, './lore/terra.wiki', 'Blue.')
    expect(read(moved.text).systems.sol.planets[0].loreFile).toBe('lore/terra.wiki')
    expect(moved.create).toEqual({ path: 'lore/terra.wiki', text: 'Blue.' })
    expect(moved.orphans).toEqual(['lore/earth.wiki'])
    expect(() => moveSourceFile(MAP, earth, 'https://example.org/a.wiki')).toThrow('editor.badFilePath')
    expect(() => moveSourceFile(MAP, earth, '../a.wiki')).toThrow('editor.badFilePath')
  })

  it('set and clear the format and the text, an empty text leaving no key', () => {
    let text = setSourceFormat(MAP, sol, 'markdown')
    expect(read(text).stars[0].loreFormat).toBe('markdown')
    text = setSourceFormat(text, sol, '')
    expect(text).toBe(MAP)
    text = setSourceText(MAP, sol, '  ')
    expect(read(text).stars[0].lore).toBeUndefined()
    text = setSourceText(MAP, { at: 'root', keys: 'world' }, 'All of it.')
    expect(read(text).worldLore).toBe('All of it.')
  })

  it('make the system of a star for its legend', () => {
    const map = MAP.replace('"systems": { "sol": { "planets": [{ "name": "Earth", "loreFile": "lore/earth.wiki" }] } },', '')
      .replace('"sectorY": 0, "lore": "The sun." }]', '"sectorY": 0, "lore": "The sun." }, { "id": "vega", "name": "Vega", "sectorX": 1, "sectorY": 0 }]')
    const text = setSourceText(map, { at: 'system', star: 'vega', keys: 'legend' }, 'Mind the rocks.')
    expect(read(text).systems).toEqual({ vega: { legend: 'Mind the rocks.' } })
    expect(() => setSourceText(map, { at: 'system', star: 'nowhere', keys: 'legend' }, 'x')).toThrow('editor.noStar')
  })

  it('offer a free file named after their owner, in the extension of the format', () => {
    expect(suggestSourceFile(read(MAP), earth, 'wikitext')).toBe('lore/earth-2.wiki')
    expect(suggestSourceFile(read(MAP), sol, 'markdown')).toBe('lore/sol.md')
    expect(suggestSourceFile(read(MAP), sol, 'wikitext', path => path === 'lore/sol.wiki')).toBe('lore/sol-2.wiki')
    expect(suggestSourceFile(read(MAP), { at: 'root', keys: 'legend' }, 'wikitext')).toBe('lore/legend.wiki')
    expect(suggestSourceFile(read(MAP), { at: 'system', star: 'sol', keys: 'legend' }, 'wikitext')).toBe('lore/sol-legend.wiki')
    expect(suggestSourceFile(read(MAP), { at: 'article', title: 'Atlas', keys: 'article' }, 'markdown')).toBe('wiki/atlas.md')
  })
})
