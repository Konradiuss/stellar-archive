import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkMap, isWebPage, mapColor, parseMapJson } from '../mapCheck'
import { buildMapData } from '../mapData'
import { mapJournal, noteMap, startMapJournal } from '../mapJournal'

const PUBLIC = new URL('../../../public/', import.meta.url)
const referenceMap = () => JSON.parse(readFileSync(new URL('map.json', PUBLIC), 'utf8'))

const errorOf = text => parseMapJson(text).error

describe('the text of the map file', () => {
  // Was: hosts with SPA rewrites answer a missing file with index.html and 200: an article showed HTML source, a missing map.json a JSON error.
  it('knows the page of the site sent in place of a missing file', () => {
    expect(isWebPage('<!DOCTYPE html>\n<html lang="en">')).toBe(true)
    expect(isWebPage('  <html>')).toBe(true)
    expect(isWebPage('{ "stars": [] }')).toBe(false)
    expect(isWebPage('== History ==\n<html> in an article')).toBe(false)
    expect(isWebPage(null)).toBe(false)
    expect(isWebPage('<html>', { contentType: 'text/plain; charset=utf-8' })).toBe(false)
    expect(isWebPage('<html>', { contentType: 'text/html; charset=utf-8' })).toBe(true)
    expect(isWebPage('<html>', { path: 'lore/page.html?v=2' })).toBe(false)
  })

  it('reads a good file, with the byte order mark of Notepad too', () => {
    expect(parseMapJson('{ "stars": [] }')).toEqual({ data: { stars: [] } })
    expect(parseMapJson('\uFEFF{ "stars": [] }')).toEqual({ data: { stars: [] } })
  })

  it('points at an extra comma', () => {
    const error = errorOf('{\n  "stars": [],\n  "name": "Sol",\n}')
    expect(error).toMatchObject({ line: 4, column: 1 })
    expect(error.message).toBe('Extra comma before "}": remove the last comma.')
    expect(error.excerpt).toEqual(['3 |   "name": "Sol",', '4 | }', '  | ^'])
  })

  it('points at the end of the line where a comma is missing', () => {
    const error = errorOf('{\n  "a": 1\n  "b": 2\n}')
    expect(error).toMatchObject({ line: 2, column: 9 })
    expect(error.message).toBe('A comma "," is missing here, before the next name.')
    expect(errorOf('[1, 2 3]')).toMatchObject({ line: 1, column: 6, message: 'A comma "," is missing here, before the next value.' })
  })

  it('explains the usual mistakes of a hand-written file', () => {
    expect(errorOf("{ 'stars': [] }").message).toBe('Names must be in double quotes "…", not single quotes.')
    expect(errorOf('{ "name": \'Sol\' }').message).toBe('Text must be in double quotes "…", not single quotes.')
    expect(errorOf('{ // stars\n "stars": [] }')).toMatchObject({ line: 1, column: 3, message: 'Comments are not allowed in JSON: remove the // or /* */ note.' })
    expect(errorOf('{ "name": "Sol\n}')).toMatchObject({ line: 1, column: 11 })
    expect(errorOf('{ "name": "Sol\n}').message).toMatch(/^This text is not closed/)
    expect(errorOf('{ "stars": [').message).toBe('The file ends too early: a value is expected here: text in "double quotes", a number, true, false, null, { … } or [ … ].')
    expect(errorOf('{ "stars": [1, 2]').message).toBe('The file ends too early: a "}" is missing.')
    expect(errorOf('{ "stars": [1, 2} }').message).toBe('"}" closes what was opened with "[": "]" is expected.')
    expect(errorOf('{ "on": yes }').message).toMatch(/^Unexpected "y": a value is expected here/)
    expect(errorOf('{ "path": "C:\\maps" }').message).toBe('A backslash \\ must be doubled: \\\\.')
    expect(errorOf('').message).toBe('The file is empty.')
    expect(errorOf('{} {}').message).toBe('Extra text after the end of the map: the whole map is one { … }.')
  })

  it('cuts a long line round the error, so that the ^ stays in sight', () => {
    const line = `{ "lore": "${'a'.repeat(200)}", }`
    const error = errorOf(line)
    expect(error.column).toBe(line.length)
    const [shown, pointer] = error.excerpt
    expect(shown.length).toBeLessThan(80)
    expect(shown.startsWith('1 | …')).toBe(true)
    expect(shown[pointer.indexOf('^')]).toBe('}')
  })
})

describe('the sections of the map', () => {
  beforeEach(() => {
    startMapJournal()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  const notes = () => mapJournal().map(({ level, where, message }) => `${level} ${where}: ${message}`)
  const star = (id, x, y, more = {}) => ({ id, name: id.toUpperCase(), sectorX: x, sectorY: y, ...more })

  it('cannot read a file that is not a map at all', () => {
    expect(checkMap([]).fatal).toMatch(/one object/)
    expect(checkMap(null).fatal).toMatch(/one object/)
    expect(checkMap({}).fatal).toBe('"stars" must be a list [ … ] of the stars of the map.')
    expect(checkMap({ stars: {} }).fatal).toMatch(/"stars" must be a list/)
  })

  it('leaves out a star that cannot be placed, and says why', () => {
    const { data } = checkMap({
      stars: [star('sol', 1, 1), null, { name: 'Nameless id', sectorX: 2, sectorY: 2 }, star('sol', 3, 3),
        star('cinder', 1.5, 2), star('rigel', -1, 0), star('deneb', '4', 4), star('altair', 1, 1), star('lone', 5, 5, { name: '' })]
    })
    expect(data.stars.map(item => item.id)).toEqual(['sol', 'lone'])
    expect(notes()).toEqual([
      'error stars[1]: Not a star { … }: left out.',
      'error stars[2] "Nameless id": Has no "id": left out. Give it a short unique id, such as "sol".',
      'error stars[3] "SOL": Another star already has the id "sol": left out.',
      'error stars[4] "CINDER": "sectorX" and "sectorY" must be whole numbers from 0 up: left out.',
      'error stars[5] "RIGEL": "sectorX" and "sectorY" must be whole numbers from 0 up: left out.',
      'error stars[6] "DENEB": "sectorX" and "sectorY" must be whole numbers from 0 up: left out.',
      'error stars[7] "ALTAIR": Sector 1,1 already has the star "SOL": left out.',
      'warning stars[8] "lone": Has no "name": its id "lone" is shown.'
    ])
    expect(data.stars[1].name).toBe('lone')
  })

  it('takes faction colours as "#rrggbb", "0xrrggbb" or a number, grey for anything else', () => {
    const { data } = checkMap({
      stars: [star('sol', 0, 0, { faction: 'concord' }), star('cinder', 1, 0, { faction: 'pirates' })],
      factions: {
        concord: { name: 'Concord', fillColor: '#0088FF', borderColor: 0x00aaff },
        combine: { name: 'Combine', fillColor: 'red' },
        tide: { name: 'Tide', borderColor: '0x22cc44' },
        none: { name: 'None' },
        broken: 'yes'
      },
      planetTextColors: { concord: '#00aaff', combine: 'reddish' }
    })
    expect(data.factions.concord).toMatchObject({ fillColor: '0x0088ff', borderColor: '0x00aaff' })
    expect(data.factions.combine).toMatchObject({ fillColor: '0x9a9a9a', borderColor: '0x9a9a9a' })
    expect(data.factions.tide).toMatchObject({ fillColor: '0x22cc44', borderColor: '0x22cc44' })
    expect(data.factions.none).toMatchObject({ fillColor: '0x9a9a9a', borderColor: '0x9a9a9a' })
    expect(data.factions.broken).toBeUndefined()
    expect(data.planetTextColors).toEqual({ concord: '0x00aaff' })
    expect(notes()).toEqual([
      'error factions.combine.fillColor: "red" is not a colour like "#00aaff": grey is used.',
      'error factions.broken: Not a faction { … }: left out.',
      'error planetTextColors.combine: "reddish" is not a colour like "#00aaff": white is used.',
      'warning factions.none: Has no "fillColor" or "borderColor": grey is used.',
      'warning stars[1] "CINDER": Faction "pirates" is not in "factions": the star belongs to no faction.'
    ])
    expect(mapColor('#ABCDEF')).toBe('0xabcdef')
    expect(mapColor(255)).toBe('0x0000ff')
    expect(mapColor('#abc')).toBeNull()
  })

  it('leaves out a planet without a name and gives an orbit to one without it', () => {
    const { data } = checkMap({
      stars: [star('sol', 0, 0)],
      systems: {
        sol: { planets: [{ name: 'Mercury', orbitRadius: 40 }, { orbitRadius: 60 }, null, { name: 'Venus' }, { name: 'Mars', orbitRadius: 'far' }] },
        nowhere: { planets: [] },
        broken: { planets: {} }
      }
    })
    expect(data.systems.sol.planets).toEqual([
      { name: 'Mercury', orbitRadius: 40 },
      { name: 'Venus', orbitRadius: 70 },
      { name: 'Mars', orbitRadius: 100 }
    ])
    expect(data.systems.broken.planets).toEqual([])
    expect(notes()).toEqual([
      'error systems.sol.planets[1]: Has no "name": left out.',
      'error systems.sol.planets[2]: Not a planet { … }: left out.',
      'error systems.broken.planets: Must be a list [ … ] of planets: left out.',
      'warning systems.sol.planets[3] "Venus": "orbitRadius" must be a number above 0: 70 is used.',
      'warning systems.sol.planets[4] "Mars": "orbitRadius" must be a number above 0: 100 is used.',
      'warning systems.nowhere: No star has the id "nowhere": this system is never shown.',
      'warning systems.broken: No star has the id "broken": this system is never shown.'
    ])
  })

  // Was: a nameless moon or station threw name.toUpperCase() of undefined, and leaving it out moved the addresses of the satellites after it.
  it('names a moon or station without a name, and keeps every satellite in its place', () => {
    const { data } = checkMap({
      stars: [star('sol', 0, 0)],
      systems: { sol: { planets: [{ name: 'Earth', orbitRadius: 40, satellites: [{ name: 'Moon' }, { kind: 'station' }, null, { name: ' ' }, { name: 7 }, { name: 'Ring' }] }] } }
    })
    expect(data.systems.sol.planets[0].satellites).toEqual([
      { name: 'Moon' }, { kind: 'station', name: 'Earth 2' }, null, { name: 'Earth 4' }, { name: 'Earth 5' }, { name: 'Ring' }
    ])
    expect(notes()).toEqual([
      'warning systems.sol.planets[0] "Earth".satellites[1]: Has no "name": "Earth 2" is shown.',
      'warning systems.sol.planets[0] "Earth".satellites[3] " ": Has no "name": "Earth 4" is shown.',
      'warning systems.sol.planets[0] "Earth".satellites[4] "7": Has no "name": "Earth 5" is shown.'
    ])
  })

  // Was: a faction named as a property of every object ("constructor") passed the check, and the wiki navbox threw while the map was built.
  it('takes off a faction the map has not got, a name of Object too, and names every faction', async () => {
    const { data } = checkMap({
      stars: [star('sol', 0, 0, { faction: 'constructor' }), star('cinder', 1, 0, { faction: 'toString' }), star('altair', 2, 0, { faction: 'concord' })],
      factions: { concord: { name: 'Concord', fillColor: '#0088ff' }, combine: { fillColor: '#ff0000' }, odd: { name: 7, fillColor: '#00ff00' } }
    })
    expect(data.stars.map(each => each.faction)).toEqual([null, null, 'concord'])
    expect([data.factions.concord.name, data.factions.combine.name, data.factions.odd.name]).toEqual(['Concord', 'combine', 'odd'])
    expect(notes()).toEqual([
      'warning factions.odd.name: 7 is not a name: the id "odd" is shown.',
      'warning stars[0] "SOL": Faction "constructor" is not in "factions": the star belongs to no faction.',
      'warning stars[1] "CINDER": Faction "toString" is not in "factions": the star belongs to no faction.'
    ])
    const fetchText = async () => { throw new Error('HTTP 404') }
    const built = await buildMapData(data, { baseUrl: 'http://localhost/map.json', fetchText })
    expect(built.stars).toHaveLength(3)
  })

  it('joins stars by their id or their sector, and leaves out a line that misses a star', () => {
    const { data } = checkMap({
      stars: [star('sol', 1, 1), star('cinder', 4, 2)],
      hyperlines: [
        { id: 'a', from: 'sol', to: 'cinder', type: 'trade' },
        { id: 'b', from: { sectorX: 1, sectorY: 1 }, to: { sectorX: 4, sectorY: 2 }, type: 'smuggling' },
        { id: 'c', from: 'sol', to: 'nowhere' },
        { id: 'd', to: 'cinder' },
        { id: 'a', from: 'cinder', to: 'sol' },
        { from: 'cinder', to: 'sol' },
        'line'
      ],
      hyperlineTypes: { courier: 'Courier routes' }
    })
    expect(data.hyperlines.map(line => [line.id, line.from, line.to])).toEqual([
      ['a', { sectorX: 1, sectorY: 1 }, { sectorX: 4, sectorY: 2 }],
      ['b', { sectorX: 1, sectorY: 1 }, { sectorX: 4, sectorY: 2 }],
      ['a-2', { sectorX: 4, sectorY: 2 }, { sectorX: 1, sectorY: 1 }],
      ['line-6', { sectorX: 4, sectorY: 2 }, { sectorX: 1, sectorY: 1 }]
    ])
    expect(notes()).toEqual([
      'error hyperlines[2] "c": "to" must name a star of the map: its id ("sol") or its sector { "sectorX": 2, "sectorY": 2 }. Left out.',
      'error hyperlines[3] "d": "from" must name a star of the map: its id ("sol") or its sector { "sectorX": 2, "sectorY": 2 }. Left out.',
      'error hyperlines[6]: Not a line { … }: left out.',
      'warning hyperlines[1] "b": Type "smuggling" is neither built in (gate, trade, military, supply, industrial) nor in "hyperlineTypes": the default look is used.',
      'warning hyperlines[4] "a": Another line already has the id "a": "a-2" is used.'
    ])
    expect(checkMap({ stars: [], hyperlines: { a: 1 } }).data.hyperlines).toEqual([])
  })

  it('says when a section has the wrong shape', () => {
    const { data } = checkMap({ stars: [], galaxy: 'big', wiki: { articles: {} }, factions: [], systems: 'sol' })
    expect(data.factions).toEqual({})
    expect(data.systems).toEqual({})
    expect(notes()).toEqual([
      'error wiki.articles: Must be a list [ … ]: the articles are left out.',
      'error factions: Must be an object { "id": { … }, … }: the factions are left out.',
      'error systems: Must be an object { "star id": { "planets": [ … ] }, … }: the systems are left out.',
      'warning galaxy: Must be an object { "columns": 16, "rows": 9 }: the default size is used.',
      'warning stars: The map has no stars yet.'
    ])
  })

  it('takes the terminal of the map, its files and its SYNDICATE.EXE, and says what it cannot', async () => {
    const { data } = checkMap({
      stars: [],
      terminal: {
        script: ' orion.txt ',
        files: { 'notes.txt': 'notes/day1.txt', 'MY NOTES.TXT': 'x.txt', 'LOG.TXT': 5, 'LOST.TXT': 'lost.txt' },
        syndicate: 'no'
      }
    })
    expect(data.terminal).toEqual({ script: 'orion.txt', files: [['NOTES.TXT', 'notes/day1.txt'], ['LOST.TXT', 'lost.txt']], syndicate: true })
    const texts = { 'orion.txt': 'ORION OS\nC:\\>scan\nquiet', 'notes/day1.txt': 'Day 1.\r\nDay 2.\r\n' }
    const fetchText = async url => {
      const path = new URL(url).pathname.slice(1)
      if (!(path in texts)) throw new Error('HTTP 404')
      return texts[path]
    }
    const { terminal } = await buildMapData(data, { baseUrl: 'http://localhost/map.json', fetchText })
    expect(terminal.script.map(line => line.text)).toEqual(['ORION OS', 'C:\\>', 'quiet'])
    expect([...terminal.files]).toEqual([['NOTES.TXT', ['Day 1.', 'Day 2.']]])
    expect(terminal.syndicate).toBe(true)
    expect(notes()).toEqual([
      'warning stars: The map has no stars yet.',
      'warning terminal.files.MY NOTES.TXT: A file name of DOS has no spaces and none of \\ / : * ? " < > |: left out.',
      'warning terminal.files.LOG.TXT: Must be the path of a text file, such as "notes.txt": left out.',
      'warning terminal.syndicate: Must be true or false, without quotes: SYNDICATE.EXE stays.',
      'warning file "lost.txt": Cannot be loaded (HTTP 404): LOST.TXT is left out of the terminal.'
    ])

    startMapJournal()
    const missing = await buildMapData(checkMap({ stars: [], terminal: { script: 'gone.txt', syndicate: false } }).data, { baseUrl: 'http://localhost/map.json', fetchText })
    expect(missing.terminal.script[0].text).toBe('EXODUS STATION OS v1.18 - SOLAR CONCORD PORT AUTHORITY')
    expect(missing.terminal.syndicate).toBe(false)
    expect(checkMap({ stars: [], terminal: 'terminal.txt' }).data.terminal).toEqual({ script: null, files: [], syndicate: true })
    expect(checkMap({ stars: [], terminal: { script: 7, files: [] } }).data.terminal).toEqual({ script: null, files: [], syndicate: true })
    expect(notes()).toEqual([
      'warning stars: The map has no stars yet.',
      'warning file "gone.txt": Cannot be loaded (HTTP 404): the built-in script of the terminal is used.',
      'warning terminal: Must be an object { "script": "terminal.txt", "files": { … }, "syndicate": true }: the built-in terminal is used.',
      'warning terminal.script: Must be the path of a text file, such as "terminal.txt": the built-in script is used.',
      'warning terminal.files: Must be an object { "NOTES.TXT": "notes.txt" }: the terminal has no files of the map.'
    ])
  })

  it('finds no problem in the map that comes with the site', async () => {
    const { data, fatal } = checkMap(referenceMap())
    expect(fatal).toBeUndefined()
    const fetchText = async url => readFileSync(new URL(new URL(url).pathname.slice(1), PUBLIC), 'utf8')
    await buildMapData(data, { baseUrl: 'http://localhost/map.json', fetchText })
    expect(notes()).toEqual([])
  })
})

describe('the journal of the map', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps each note once, errors first, and starts anew with each load', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    startMapJournal()
    noteMap('warning', 'a', 'drawn twice')
    noteMap('error', 'b', 'broken')
    noteMap('warning', 'a', 'drawn twice')
    expect(mapJournal()).toEqual([
      { level: 'error', where: 'b', message: 'broken' },
      { level: 'warning', where: 'a', message: 'drawn twice' }
    ])
    expect(console.warn).toHaveBeenCalledTimes(2)
    startMapJournal()
    expect(mapJournal()).toEqual([])
  })
})
