import { BUILT_IN_TYPES, parseColor } from './hyperlineStyle'
import { noteMap } from './mapJournal'
import { breakerWordProblem, DEFAULT_WORDS } from './breakerSprites'
import { checkLanguage, checkStrings } from '../i18n'
import { checkTheme } from '../theme'
import { checkTerminal } from './terminal'
import { isObject } from './guards'

export const MAP_FILE = 'map.json'

const EXCERPT_WIDTH = 60

const quoted = char => (char === undefined ? 'the end of the file' : `"${char}"`)

// Own scanner: browser JSON messages differ, and some give no position at all.
function locateJsonError(text) {
  let i = 0
  let lastEnd = 0 // just after the last complete value: a missing comma goes here
  const fail = (at, message) => { throw { at, message } }
  const NEEDS_VALUE = 'a value is expected here: text in "double quotes", a number, true, false, null, { … } or [ … ]'

  function space() {
    while (i < text.length) {
      const char = text[i]
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') i++
      else if (char === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) fail(i, 'Comments are not allowed in JSON: remove the // or /* */ note.')
      else break
    }
  }

  function string() {
    const start = i++
    while (i < text.length) {
      const char = text[i]
      if (char === '"') { i++; return }
      if (char === '\n' || char === '\r') fail(start, 'This text is not closed: a " is missing at its end (a line break inside a text is written \\n).')
      if (char === '\\') {
        if (!'"\\/bfnrtu'.includes(text[i + 1] ?? '')) fail(i, 'A backslash \\ must be doubled: \\\\.')
        i += 2
        continue
      }
      i++
    }
    fail(start, 'This text is not closed: a " is missing at its end.')
  }

  function value() {
    space()
    const char = text[i]
    if (char === undefined) fail(i, `The file ends too early: ${NEEDS_VALUE}.`)
    if (char === '{') return container('}')
    if (char === '[') return container(']')
    if (char === '"') return string()
    if (char === "'") fail(i, 'Text must be in double quotes "…", not single quotes.')
    const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
    number.lastIndex = i
    if ((char === '-' || (char >= '0' && char <= '9')) && number.exec(text)) { i = number.lastIndex; return }
    for (const word of ['true', 'false', 'null']) if (text.startsWith(word, i)) { i += word.length; return }
    fail(i, `Unexpected ${quoted(char)}: ${NEEDS_VALUE}.`)
  }

  function container(close) {
    const isObject = close === '}'
    i++
    space()
    if (text[i] === close) { i++; return }
    for (;;) {
      space()
      if (isObject) {
        if (text[i] === "'") fail(i, 'Names must be in double quotes "…", not single quotes.')
        if (text[i] !== '"') fail(i, `A name in double quotes is expected here, found ${quoted(text[i])}.`)
        string()
        space()
        if (text[i] !== ':') fail(i, 'A colon ":" is missing after the name.')
        i++
      }
      value()
      lastEnd = i
      space()
      if (text[i] === ',') {
        i++
        space()
        if (text[i] === close) fail(i, `Extra comma before "${close}": remove the last comma.`)
        continue
      }
      if (text[i] === close) { i++; return }
      if (text[i] === undefined) fail(i, `The file ends too early: a "${close}" is missing.`)
      if (text[i] === (isObject ? ']' : '}')) fail(i, `"${text[i]}" closes what was opened with "${isObject ? '{' : '['}": "${close}" is expected.`)
      fail(lastEnd, `A comma "," is missing here, before the next ${isObject ? 'name' : 'value'}.`)
    }
  }

  try {
    space()
    if (i >= text.length) return { at: 0, message: 'The file is empty.' }
    value()
    space()
    if (i < text.length) fail(i, 'Extra text after the end of the map: the whole map is one { … }.')
    return null
  } catch (error) {
    if (typeof error?.at !== 'number') throw error
    return error
  }
}

/**
 * Some hosts answer a missing file with index.html and 200 (Cloudflare Pages, a Netlify rewrite).
 * `contentType` and `path` keep an author's file that is HTML on purpose.
 */
export function isWebPage(text, { contentType = null, path = '' } = {}) {
  if (/\.html?$/i.test(String(path).split(/[?#]/)[0])) return false
  if (contentType && !/\btext\/html\b/i.test(contentType)) return false
  return /^\s*<(?:!doctype\s+html|html)[\s>]/i.test(String(text ?? ''))
}

/** → { data } or { error: { message, line, column, excerpt } }; `excerpt` is ready for a monospace screen. */
export function parseMapJson(text) {
  // Notepad saves with a byte order mark, which JSON does not allow.
  const source = String(text ?? '').replace(/^\uFEFF/, '')
  try {
    return { data: JSON.parse(source) }
  } catch (parseError) {
    const found = locateJsonError(source) ?? { at: 0, message: String(parseError?.message ?? parseError) }
    const before = source.slice(0, found.at).split(/\r\n|\r|\n/)
    const line = before.length
    const column = before[before.length - 1].length + 1
    const lines = source.split(/\r\n|\r|\n/)
    const width = String(line).length
    // A long line is cut round the column, so that the ^ stays on the screen.
    const from = column > EXCERPT_WIDTH - 10 ? column - 1 - (EXCERPT_WIDTH - 20) : 0
    const cut = text => {
      const part = text.replace(/\t/g, ' ').slice(from, from + EXCERPT_WIDTH)
      return `${from ? '…' : ''}${part}${text.length > from + EXCERPT_WIDTH ? '…' : ''}`
    }
    const excerpt = []
    for (let number = Math.max(1, line - 1); number <= line; number++) {
      excerpt.push(`${String(number).padStart(width)} | ${cut(lines[number - 1] ?? '')}`)
    }
    excerpt.push(`${' '.repeat(width)} | ${' '.repeat(column - 1 - from + (from ? 1 : 0))}^`)
    return { error: { message: found.message, line, column, excerpt } }
  }
}

const isSector = value => Number.isInteger(value) && value >= 0
const nameOf = item => (isObject(item) && (item.name || item.id) ? ` "${item.name || item.id}"` : '')
const hasName = item => typeof item.name === 'string' && item.name.trim() !== ''
const GREY = '0x9a9a9a'
// A planet without its orbit goes this far beyond the one before it.
const ORBIT_STEP = 30

/** '#00aaff', '0x00aaff' or 0x00aaff → '0x00aaff'; null when it is not a colour. */
export function mapColor(value) {
  const color = parseColor(value)
  return color === null ? null : `0x${color.toString(16).padStart(6, '0')}`
}

function checkFactions(raw, note) {
  if (raw == null) return {}
  if (!isObject(raw)) {
    note('error', 'factions', 'Must be an object { "id": { … }, … }: the factions are left out.')
    return {}
  }
  const factions = {}
  for (const [id, faction] of Object.entries(raw)) {
    const where = `factions.${id}`
    if (!isObject(faction)) {
      note('error', where, 'Not a faction { … }: left out.')
      continue
    }
    const fixed = { ...faction }
    // The legend, the wiki and the borders write the name as a text.
    if (faction.name !== undefined && (typeof faction.name !== 'string' || !faction.name.trim())) {
      note('warning', `${where}.name`, `${JSON.stringify(faction.name)} is not a name: the id "${id}" is shown.`)
      fixed.name = id
    }
    if (fixed.name === undefined) fixed.name = id
    for (const field of ['fillColor', 'borderColor']) {
      if (faction[field] === undefined) continue
      fixed[field] = mapColor(faction[field])
      if (!fixed[field]) note('error', `${where}.${field}`, `${JSON.stringify(faction[field])} is not a colour like "#00aaff": grey is used.`)
    }
    if (faction.fillColor === undefined && faction.borderColor === undefined) {
      note('warning', where, 'Has no "fillColor" or "borderColor": grey is used.')
    }
    fixed.fillColor = fixed.fillColor || fixed.borderColor || GREY
    fixed.borderColor = fixed.borderColor || fixed.fillColor
    factions[id] = fixed
  }
  return factions
}

function checkTextColors(raw, note) {
  if (raw == null) return undefined
  if (!isObject(raw)) {
    note('error', 'planetTextColors', 'Must be an object { "faction id": "#rrggbb", … }: left out.')
    return undefined
  }
  const colors = {}
  for (const [id, value] of Object.entries(raw)) {
    const color = mapColor(value)
    if (color) colors[id] = color
    else note('error', `planetTextColors.${id}`, `${JSON.stringify(value)} is not a colour like "#00aaff": white is used.`)
  }
  return colors
}

function checkStars(raw, factions, note) {
  const stars = []
  const ids = new Set()
  const sectors = new Map()
  raw.forEach((star, index) => {
    const where = `stars[${index}]${nameOf(star)}`
    if (!isObject(star)) return note('error', where, 'Not a star { … }: left out.')
    if (typeof star.id !== 'string' || !star.id.trim()) {
      return note('error', where, 'Has no "id": left out. Give it a short unique id, such as "sol".')
    }
    if (ids.has(star.id)) return note('error', where, `Another star already has the id "${star.id}": left out.`)
    if (!isSector(star.sectorX) || !isSector(star.sectorY)) {
      return note('error', where, '"sectorX" and "sectorY" must be whole numbers from 0 up: left out.')
    }
    const sector = `${star.sectorX},${star.sectorY}`
    if (sectors.has(sector)) return note('error', where, `Sector ${sector} already has the star "${sectors.get(sector)}": left out.`)
    let fixed = star
    // Own keys only: a faction "constructor" is not one of Object's.
    if (star.faction != null && !Object.hasOwn(factions, star.faction)) {
      note('warning', where, `Faction "${star.faction}" is not in "factions": the star belongs to no faction.`)
      fixed = { ...star, faction: null }
    }
    if (typeof star.name !== 'string' || !star.name.trim()) {
      fixed = { ...fixed, name: star.id }
      note('warning', where, `Has no "name": its id "${star.id}" is shown.`)
    }
    ids.add(star.id)
    sectors.set(sector, fixed.name)
    stars.push(fixed)
  })
  if (!stars.length) note('warning', 'stars', 'The map has no stars yet.')
  return stars
}

function checkPlanets(planets, where, note) {
  if (planets == null) return planets
  if (!Array.isArray(planets)) {
    note('error', `${where}.planets`, 'Must be a list [ … ] of planets: left out.')
    return []
  }
  const checked = []
  let lastOrbit = 0
  planets.forEach((planet, index) => {
    const at = `${where}.planets[${index}]${nameOf(planet)}`
    if (!isObject(planet)) return note('error', at, 'Not a planet { … }: left out.')
    if (typeof planet.name !== 'string' || !planet.name.trim()) return note('error', at, 'Has no "name": left out.')
    let fixed = planet
    if (!(Number.isFinite(planet.orbitRadius) && planet.orbitRadius > 0)) {
      fixed = { ...planet, orbitRadius: lastOrbit + ORBIT_STEP }
      note('warning', at, `"orbitRadius" must be a number above 0: ${fixed.orbitRadius} is used.`)
    }
    lastOrbit = Math.max(lastOrbit, fixed.orbitRadius)
    // Named after its planet rather than left out: the addresses (#/system/sol/3/2) and the editor
    // count satellites by their index. Other non-satellite entries stay for getSatellites to skip.
    if (Array.isArray(planet.satellites) && planet.satellites.some(satellite => isObject(satellite) && !hasName(satellite))) {
      const satellites = planet.satellites.map((satellite, number) => {
        if (!isObject(satellite) || hasName(satellite)) return satellite
        const name = `${planet.name.trim()} ${number + 1}`
        note('warning', `${at}.satellites[${number}]${nameOf(satellite)}`, `Has no "name": "${name}" is shown.`)
        return { ...satellite, name }
      })
      fixed = { ...fixed, satellites }
    }
    checked.push(fixed)
  })
  return checked
}

function checkSystems(raw, starIds, note) {
  if (raw == null) return {}
  if (!isObject(raw)) {
    note('error', 'systems', 'Must be an object { "star id": { "planets": [ … ] }, … }: the systems are left out.')
    return {}
  }
  const systems = {}
  for (const [id, system] of Object.entries(raw)) {
    const where = `systems.${id}`
    if (!isObject(system)) {
      note('error', where, 'Not a system { … }: left out.')
      continue
    }
    if (!starIds.has(id)) note('warning', where, `No star has the id "${id}": this system is never shown.`)
    const planets = checkPlanets(system.planets, where, note)
    systems[id] = planets === system.planets ? system : { ...system, planets }
  }
  return systems
}

function checkHyperlines(raw, stars, types, note) {
  if (raw == null) return []
  if (!Array.isArray(raw)) {
    note('error', 'hyperlines', 'Must be a list [ … ] of lines: the lines are left out.')
    return []
  }
  const byId = new Map(stars.map(star => [star.id, star]))
  const bySector = new Map(stars.map(star => [`${star.sectorX},${star.sectorY}`, star]))
  const known = new Set([...Object.keys(BUILT_IN_TYPES), ...Object.keys(types)])
  // An end of a line: a star by its id ("sol") or by its sector.
  const end = value => {
    const star = typeof value === 'string' ? byId.get(value) : isObject(value) ? bySector.get(`${value.sectorX},${value.sectorY}`) : null
    return star ? { sectorX: star.sectorX, sectorY: star.sectorY } : null
  }
  const lines = []
  const ids = new Set()
  raw.forEach((line, index) => {
    const where = `hyperlines[${index}]${isObject(line) && line.id ? ` "${line.id}"` : ''}`
    if (!isObject(line)) return note('error', where, 'Not a line { … }: left out.')
    const from = end(line.from)
    const to = end(line.to)
    for (const [field, point] of [['from', from], ['to', to]]) {
      if (!point) return note('error', where, `"${field}" must name a star of the map: its id ("sol") or its sector { "sectorX": 2, "sectorY": 2 }. Left out.`)
    }
    if (line.type != null && !known.has(line.type)) {
      note('warning', where, `Type "${line.type}" is neither built in (${Object.keys(BUILT_IN_TYPES).join(', ')}) nor in "hyperlineTypes": the default look is used.`)
    }
    // Lines are found by id: required and unique.
    let id = typeof line.id === 'string' && line.id ? line.id : `line-${index + 1}`
    if (ids.has(id)) {
      const taken = id
      for (let n = 2; ids.has(id); n++) id = `${taken}-${n}`
      note('warning', where, `Another line already has the id "${taken}": "${id}" is used.`)
    }
    ids.add(id)
    lines.push({ ...line, id, from, to })
  })
  return lines
}

/** → { data, strings, language, theme }, or { fatal } (a sentence) when it cannot be a map at all. */
export function checkMap(raw) {
  if (!isObject(raw)) return { fatal: 'The map file must be one object { … } holding the sections of the map.' }
  if (!Array.isArray(raw.stars)) return { fatal: '"stars" must be a list [ … ] of the stars of the map.' }
  const note = noteMap
  if (raw.galaxy != null && !isObject(raw.galaxy)) note('warning', 'galaxy', 'Must be an object { "columns": 16, "rows": 9 }: the default size is used.')
  if (raw.wiki != null && !isObject(raw.wiki)) note('error', 'wiki', 'Must be an object { "home": …, "groups": [ … ], "articles": [ … ] }: the articles are left out.')
  for (const field of ['groups', 'articles']) {
    if (isObject(raw.wiki) && raw.wiki[field] != null && !Array.isArray(raw.wiki[field])) {
      note('error', `wiki.${field}`, `Must be a list [ … ]: the ${field} are left out.`)
    }
  }
  const factions = checkFactions(raw.factions, note)
  const stars = checkStars(raw.stars, factions, note)
  const hyperlineTypes = isObject(raw.hyperlineTypes) ? raw.hyperlineTypes : {}
  const data = {
    ...raw,
    factions,
    stars,
    systems: checkSystems(raw.systems, new Set(stars.map(star => star.id)), note),
    hyperlines: checkHyperlines(raw.hyperlines, stars, hyperlineTypes, note),
    terminal: checkTerminal(raw.terminal, note)
  }
  const textColors = checkTextColors(raw.planetTextColors, note)
  if (textColors) data.planetTextColors = textColors
  const language = checkLanguage(isObject(raw.site) ? raw.site.language : null, note)
  const strings = checkStrings(raw.strings, note)
  checkBreakerWords(strings, language, note)
  const theme = checkTheme(raw.theme, note)
  return { data, strings, language, theme }
}

// The mode switch draws its words in its own pixel letters.
function checkBreakerWords(strings, language, note) {
  for (const key of Object.keys(DEFAULT_WORDS)) {
    const word = strings.get(`breaker.${key}`)
    if (typeof word !== 'string') continue
    const problem = breakerWordProblem(key, word.toLocaleUpperCase(language))
    if (problem) note('warning', `strings.breaker.${key}`, `${JSON.stringify(word)} ${problem}: the English word is shown.`)
  }
}
