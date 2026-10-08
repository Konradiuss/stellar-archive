import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { STRING_KEYS, checkLanguage, checkStrings, compareText, language, setStrings, t } from '../index'
import { DEFAULT_STRINGS } from '../strings'

const SRC = new URL('../../', import.meta.url)

function sources(dir = SRC.pathname.replace(/^\/([A-Za-z]:)/, '$1')) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path)
    return /\.(js|vue)$/.test(name) ? [readFileSync(path, 'utf8')] : []
  })
}

describe('texts of the interface', () => {
  afterEach(() => setStrings())

  it('fills in placeholders and picks the form of a number by the language', () => {
    expect(t('legend.statusGalaxy', { factions: 3, lines: 5 })).toBe('FACTIONS 3 · LINES 5')
    expect(t('system.moonCount', { count: 1 })).toBe('1 MOON')
    expect(t('system.moonCount', { count: 4 })).toBe('4 MOONS')
    expect(t('no.such.key')).toBe('no.such.key')

    setStrings(new Map([['system.moonCount', { one: '{count} СПУТНИК', few: '{count} СПУТНИКА', many: '{count} СПУТНИКОВ' }]]), 'ru')
    expect(language()).toBe('ru')
    expect([1, 3, 5, 21, 22, 25].map(count => t('system.moonCount', { count }))).toEqual([
      '1 СПУТНИК', '3 СПУТНИКА', '5 СПУТНИКОВ', '21 СПУТНИК', '22 СПУТНИКА', '25 СПУТНИКОВ'
    ])
    expect(t('legend.factions')).toBe('FACTIONS')
  })

  it('sorts as the language of the map does', () => {
    setStrings(new Map(), 'sv')
    expect(['ö', 'z', 'a'].sort(compareText)).toEqual(['a', 'z', 'ö'])
    setStrings(new Map(), 'de')
    expect(['ö', 'z', 'a'].sort(compareText)).toEqual(['a', 'ö', 'z'])
  })

  // Was: a loader in the author's own words ("WAKING THE CREW") was warned of for every number it left out.
  it('lets the lines of the loader leave out their numbers and names', () => {
    const notes = []
    const note = (level, where, message) => notes.push(`${level} ${where}: ${message}`)
    const checked = checkStrings({
      loader: { checkingMap: 'WAKING THE CREW', openingSystem: 'COURSE SET', mapSyntax: '{file}: BROKEN' }
    }, note)
    expect(checked.get('loader.checkingMap')).toBe('WAKING THE CREW')
    expect(checked.get('loader.openingSystem')).toBe('COURSE SET')
    expect(notes).toEqual(['warning strings.loader.mapSyntax: Leaves out {line}, {column}: that part is not shown.'])
  })

  it('checks the strings of the map: typos, wrong values, lost placeholders', () => {
    const notes = []
    const note = (level, where, message) => notes.push(`${level} ${where}: ${message}`)
    const checked = checkStrings({
      wiki: { search: '[ ПОИСК ]', serach: '[ ПОИСК ]', linksHere: '[ ССЫЛКИ ]' },
      'legend.factions': 'ФРАКЦИИ',
      system: { moonCount: 'спутники: {count}', jump: 5 }
    }, note)
    expect(Object.fromEntries(checked)).toEqual({
      'wiki.search': '[ ПОИСК ]',
      'wiki.linksHere': '[ ССЫЛКИ ]',
      'legend.factions': 'ФРАКЦИИ',
      'system.moonCount': { other: 'спутники: {count}' }
    })
    expect(notes).toEqual([
      'warning strings.wiki.serach: Is not a text of the interface: left out. The list of texts is docs/strings.en.json.',
      'warning strings.wiki.linksHere: Leaves out {count}: that part is not shown.',
      'error strings.system.jump: Must be a text in "double quotes": the English text is used.'
    ])
    expect(checkStrings('ru', note).size).toBe(0)
    expect(notes.at(-1)).toMatch(/^error strings: Must be an object/)

    expect(checkLanguage('RU', note)).toBe('ru')
    expect(checkLanguage(null, note)).toBe('en')
    expect(checkLanguage('русский', note)).toBe('en')
    expect(notes.at(-1)).toMatch(/^warning site.language: "русский" is not a language tag/)
  })

  it('has every text the code asks for, and asks for every text it has', () => {
    const code = sources().join('\n')
    const asked = new Set([...code.matchAll(/\bt\(\s*'([a-zA-Z]+\.[a-zA-Z.]+)'/g)].map(match => match[1]))
    // Loader steps and errors are logged by key.
    for (const match of code.matchAll(/'(loader\.[a-zA-Z]+)'/g)) asked.add(match[1])
    for (const key of asked) expect(STRING_KEYS, key).toContain(key)

    // Groups asked for by a variable part: t(`params.${type}`), t(`editor.motions.${motion}`).
    const groups = [...new Set([...code.matchAll(/\bt\(\s*`([a-zA-Z]+(?:\.[a-zA-Z]+)*)\.\$\{/g)].map(match => match[1]))]
    // Asked for by name from a table: KIND_CATEGORIES, HATNOTE_WORDS, NOTICE_KINDS, the windows' files.
    const named = new Set([...code.matchAll(/'([a-zA-Z]+\.[a-zA-Z]+)'/g)].map(match => match[1]))
    const unused = STRING_KEYS.filter(key => !asked.has(key) && !named.has(key) && !groups.some(group => key.startsWith(`${group}.`)) && !key.startsWith('breaker.'))
    expect(unused).toEqual([])
  })

  it('has no key twice in a group: the second would silently take the place of the first', () => {
    const source = readFileSync(new URL('../strings.js', import.meta.url), 'utf8')
    const twice = []
    let keys = null
    for (const line of source.split('\n')) {
      if (/^ {2}\w+: \{/.test(line)) keys = new Set()
      const key = /^ {4}(\w+):/.exec(line)?.[1]
      if (!key || !keys) continue
      if (keys.has(key)) twice.push(key)
      keys.add(key)
    }
    expect(twice).toEqual([])
  })

  it('is the same list as docs/strings.en.json, the template for map authors', () => {
    const file = JSON.parse(readFileSync(new URL('../../../docs/strings.en.json', import.meta.url), 'utf8'))
    // After a change of src/i18n/strings.js: `npm run strings`.
    expect(file).toEqual(DEFAULT_STRINGS)
  })
})
