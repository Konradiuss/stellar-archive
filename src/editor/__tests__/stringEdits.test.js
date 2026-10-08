import { describe, expect, it } from 'vitest'
import { loaderText, setLoaderText } from '../stringEdits'

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
})
