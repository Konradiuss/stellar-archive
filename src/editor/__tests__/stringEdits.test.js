import { describe, expect, it } from 'vitest'
import { loaderText, setLoaderText, setString, stringPath, stringValue } from '../stringEdits'

const MAP = `{
  "site": { "title": "Atlas" },
  "stars": []
}
`

describe('the texts of the loader in the map file', () => {
  it('are written into "strings": { "loader" }, which is made when missing', () => {
    const text = setLoaderText(MAP, 'checkingMap', '  WAKING THE CREW ')
    const map = JSON.parse(text)
    expect(map.strings).toEqual({ loader: { checkingMap: 'WAKING THE CREW' } })
    expect(loaderText(map, 'checkingMap')).toBe('WAKING THE CREW')
    expect(text.startsWith('{\n  "site": { "title": "Atlas" },\n  "stars": []')).toBe(true)

    const again = setLoaderText(text, 'title', 'SHIP-OS')
    expect(JSON.parse(again).strings.loader).toEqual({ checkingMap: 'WAKING THE CREW', title: 'SHIP-OS' })
  })

  it('leave the map when emptied, and an empty "loader" and "strings" go too', () => {
    const one = setLoaderText(MAP, 'checkingMap', 'WAKING THE CREW')
    expect(setLoaderText(one, 'checkingMap', '   ')).toBe(MAP)
    const both = setLoaderText(MAP.replace('"stars": []', '"stars": [],\n  "strings": { "wiki": { "search": "FIND" } }'), 'title', 'SHIP-OS')
    const cleared = JSON.parse(setLoaderText(both, 'title', ''))
    expect(cleared.strings).toEqual({ wiki: { search: 'FIND' } })
    expect(setLoaderText(MAP, 'title', '')).toBe(MAP)
  })

  it('read a text with forms by number by the form for most numbers', () => {
    expect(loaderText({ strings: { loader: { checkingMap: { one: 'A', other: 'B' } } } }, 'checkingMap')).toBe('B')
    expect(loaderText({ strings: 'broken' }, 'checkingMap')).toBe('')
  })

  // Was: a text with forms by number became one plain text, and the other forms were lost.
  it('keep the forms by number of a text: only the general one changes', () => {
    const forms = '{ "strings": { "loader": { "checkingMap": { "one": "ONE MAP", "other": "MAPS" } } } }'
    expect(JSON.parse(setLoaderText(forms, 'checkingMap', 'CHARTS')).strings.loader.checkingMap).toEqual({ one: 'ONE MAP', other: 'CHARTS' })
    expect(JSON.parse(setLoaderText(forms, 'checkingMap', '')).strings.loader.checkingMap).toEqual({ one: 'ONE MAP' })
    const last = '{ "strings": { "loader": { "checkingMap": { "other": "MAPS" } } } }'
    expect(JSON.parse(setLoaderText(last, 'checkingMap', ''))).toEqual({})
  })

  // Was: a dotted key was not read, so the field looked empty, and writing added the same text a second time.
  it('read and write a text where the map has it, dotted keys too', () => {
    const dotted = '{ "strings": { "loader.title": "SHIP-OS", "wiki": { "search": "FIND" } } }'
    expect(stringPath(JSON.parse(dotted), 'loader.title')).toEqual(['strings', 'loader.title'])
    expect(loaderText(JSON.parse(dotted), 'title')).toBe('SHIP-OS')
    expect(JSON.parse(setLoaderText(dotted, 'title', 'HULL-OS')).strings).toEqual({ 'loader.title': 'HULL-OS', wiki: { search: 'FIND' } })
    expect(JSON.parse(setLoaderText(dotted, 'title', '')).strings).toEqual({ wiki: { search: 'FIND' } })
    expect(stringValue(JSON.parse(dotted), 'wiki.search')).toBe('FIND')
    expect(JSON.parse(setString(dotted, 'wiki.menu.text', 'TEXT')).strings.wiki).toEqual({ search: 'FIND', menu: { text: 'TEXT' } })
  })
})
