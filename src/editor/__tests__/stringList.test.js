import { describe, expect, it } from 'vitest'
import { TEXT_SECTIONS, foreignStrings, pluralForms, rowMatches, stringProblems, stringRows } from '../stringList'
import { setPluralForm } from '../stringEdits'

const MAP = '{\n  "stars": []\n}\n'
const read = text => JSON.parse(text)

// Was: only the lines of the loader had a form; every other text of the site was written in map.json by hand.
describe('the texts of the interface in the tab Texts', () => {
  it('are every text by section, the loader on its own cards, the editor last', () => {
    expect(TEXT_SECTIONS[0]).toBe('tab')
    expect(TEXT_SECTIONS.at(-1)).toBe('editor')
    expect(TEXT_SECTIONS).not.toContain('loader')
    const rows = stringRows({ strings: { galaxy: { planets: { one: '{count} ПЛАНЕТА' } }, 'windows.minimize': 'СВЕРНУТЬ' } })
    expect(rows.some(row => row.section === 'loader')).toBe(false)
    expect(rows.find(row => row.key === 'galaxy.planets')).toMatchObject({ plural: true, value: { one: '{count} ПЛАНЕТА' } })
    // A dotted key the author wrote is found where it is.
    expect(rows.find(row => row.key === 'windows.minimize').value).toBe('СВЕРНУТЬ')
    expect(rows.find(row => row.key === 'windows.minimizeTitle').value).toBeUndefined()
  })

  it('have the plural forms of the language of the site, and any the map writes besides', () => {
    expect(pluralForms('ru')).toEqual(['one', 'few', 'many', 'other'])
    expect(pluralForms('en')).toEqual(['one', 'other'])
    expect(pluralForms('en', { one: 'a', few: 'b' })).toEqual(['one', 'few', 'other'])
    expect(pluralForms('not a language')).toEqual(['one', 'other'])
  })

  it('say what the site would say of a text: no text, a lost placeholder, a word the switch cannot draw', () => {
    expect(stringProblems('galaxy.planets', 3, 'en')).toEqual([{ key: 'galaxy.planets', problem: 'type' }])
    expect(stringProblems('galaxy.planets', { one: 'ПЛАНЕТА' }, 'ru')).toEqual([{ key: 'galaxy.planets', problem: 'placeholders', form: 'one', names: '{count}' }])
    // Form by form: the others having {count} does not give it to "one".
    expect(stringProblems('galaxy.planets', { one: 'ПЛАНЕТА', few: '{count} ПЛАНЕТЫ' }, 'ru')).toEqual([{ key: 'galaxy.planets', problem: 'placeholders', form: 'one', names: '{count}' }])
    expect(stringProblems('galaxy.planets', '{count} ПЛАНЕТ', 'ru')).toEqual([])
    expect(stringProblems('breaker.map', 'カード', 'ja')).toEqual([{ key: 'breaker.map', problem: 'breaker' }])
    expect(stringProblems('breaker.map', 'КАРТА', 'ru')).toEqual([])
    expect(stringProblems('galaxy.planets', undefined, 'en')).toEqual([])
  })

  it('find a text by its key, its English or the words of the map, and tell the keys that are none', () => {
    const [row] = stringRows({ strings: { tab: { loading: 'ЗАГРУЗКА' } } })
    expect(rowMatches(row, 'TAB.LOAD')).toBe(true)
    expect(rowMatches(row, 'loading...')).toBe(true)
    expect(rowMatches(row, 'загрузка')).toBe(true)
    expect(rowMatches(row, 'nowhere')).toBe(false)
    expect(foreignStrings({ strings: { tab: { loading: 'x', lodaing: 'y' }, 'nothing.here': 'z' } })).toEqual(['tab.lodaing', 'nothing.here'])
  })
})

describe('a plural form written in the map', () => {
  it('makes the text with that form alone, turns a plain text into its general form, and goes with the last form', () => {
    let text = setPluralForm(MAP, 'galaxy.planets', 'few', '{count} ПЛАНЕТЫ')
    expect(read(text).strings).toEqual({ galaxy: { planets: { few: '{count} ПЛАНЕТЫ' } } })
    text = setPluralForm(text, 'galaxy.planets', 'one', '{count} ПЛАНЕТА')
    expect(read(text).strings.galaxy.planets).toEqual({ few: '{count} ПЛАНЕТЫ', one: '{count} ПЛАНЕТА' })
    text = setPluralForm(text, 'galaxy.planets', 'few', '')
    text = setPluralForm(text, 'galaxy.planets', 'one', '')
    expect(text).toBe(MAP)

    const plain = '{ "strings": { "galaxy.planets": "{count} ПЛАНЕТ" } }'
    expect(read(setPluralForm(plain, 'galaxy.planets', 'one', '{count} ПЛАНЕТА')).strings).toEqual({ 'galaxy.planets': { other: '{count} ПЛАНЕТ', one: '{count} ПЛАНЕТА' } })
    expect(read(setPluralForm(plain, 'galaxy.planets', 'other', '{count} МИРОВ')).strings).toEqual({ 'galaxy.planets': '{count} МИРОВ' })
    expect(setPluralForm(plain, 'galaxy.planets', 'one', '')).toBe(plain)
  })
})
