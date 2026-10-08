// An edit that cannot be done throws an EditError whose key is an i18n text key.

import { appendItem, parseSpans, removeItem, removeKey, renameKey, setKey, setValue } from './jsonEdit'
import { MAX_GALAXY_SECTORS } from '../config/mapGeometry'
import { lostFiles } from './siteFiles'
import { isObject } from '../utils/guards'

export class EditError extends Error {
  constructor(key, params = {}) {
    super(key)
    this.key = key
    this.params = params
  }
}

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
const stars = map => (Array.isArray(map.stars) ? map.stars : [])
const lines = map => (Array.isArray(map.hyperlines) ? map.hyperlines : [])

const FACTION_COLORS = ['0x00aaff', '0xff6644', '0x44ee66', '0xffcc33', '0xcc66ff', '0x33dddd', '0xff66aa', '0xaaaaaa']

export function idOf(name, fallback = 'star') {
  const id = String(name ?? '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return id || fallback
}

export const uniqueId = (wanted, taken) => {
  let id = wanted
  for (let n = 2; taken.has(id); n++) id = `${wanted}-${n}`
  return id
}

const starIndex = (map, id) => {
  const index = stars(map).findIndex(star => star?.id === id)
  if (index < 0) throw new EditError('editor.noStar', { id })
  return index
}

export const starAt = (map, x, y) => stars(map).find(star => star?.sectorX === x && star?.sectorY === y) ?? null

// A route end names a star by its id or by { sectorX, sectorY }.
const touches = (end, star) => end === star.id || (isObject(end) && end.sectorX === star.sectorX && end.sectorY === star.sectorY)

export function starLinks(map, id) {
  const star = stars(map)[starIndex(map, id)]
  return {
    system: isObject(map.systems) && isObject(map.systems[id]),
    lines: lines(map).map((line, index) => (touches(line?.from, star) || touches(line?.to, star) ? index : -1)).filter(index => index >= 0)
  }
}

function checkSector(map, x, y) {
  const { columns, rows } = isObject(map.galaxy) ? map.galaxy : {}
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || (columns && x >= columns) || (rows && y >= rows)) {
    throw new EditError('editor.badSector')
  }
  const there = starAt(map, x, y)
  if (there) throw new EditError('editor.sectorTaken', { name: there.name ?? there.id })
}

export function addStar(text, { name, sectorX, sectorY, faction = null }) {
  const map = read(text)
  checkSector(map, sectorX, sectorY)
  const id = uniqueId(idOf(name), new Set(stars(map).map(star => star?.id)))
  const star = { id, name: String(name ?? '').trim() || id, sectorX, sectorY, ...(faction ? { faction } : {}) }
  const next = Array.isArray(map.stars) ? appendItem(text, ['stars'], star) : setKey(text, [], 'stars', [star])
  return { text: next, id }
}

/** Not for `id`: use renameStarId. */
export function setStarField(text, id, field, value) {
  const index = starIndex(read(text), id)
  if (value === '' || value === null || value === undefined) return removeKey(text, ['stars', index], field)
  return setKey(text, ['stars', index], field, value)
}

export function renameStarId(text, id, newId) {
  const map = read(text)
  const index = starIndex(map, id)
  const wanted = String(newId ?? '').trim()
  if (!wanted) throw new EditError('editor.emptyId')
  if (wanted === id) return text
  if (stars(map).some(star => star?.id === wanted)) throw new EditError('editor.idTaken', { id: wanted })
  let next = setValue(text, ['stars', index, 'id'], wanted)
  if (isObject(map.systems) && id in map.systems) next = renameKey(next, ['systems'], id, wanted)
  lines(map).forEach((line, at) => {
    for (const end of ['from', 'to']) if (line?.[end] === id) next = setValue(next, ['hyperlines', at, end], wanted)
  })
  return next
}

export function moveStar(text, id, sectorX, sectorY) {
  const map = read(text)
  const index = starIndex(map, id)
  const star = stars(map)[index]
  if (star.sectorX === sectorX && star.sectorY === sectorY) return text
  checkSector(map, sectorX, sectorY)
  let next = setKey(text, ['stars', index], 'sectorX', sectorX)
  next = setKey(next, ['stars', index], 'sectorY', sectorY)
  lines(map).forEach((line, at) => {
    for (const end of ['from', 'to']) {
      if (isObject(line?.[end]) && touches(line[end], star)) {
        next = setKey(next, ['hyperlines', at, end], 'sectorX', sectorX)
        next = setKey(next, ['hyperlines', at, end], 'sectorY', sectorY)
      }
    }
  })
  return next
}

export function removeStar(text, id, { withSystem = true, withLines = true } = {}) {
  const map = read(text)
  const links = starLinks(map, id)
  let next = text
  // From the last, so the earlier indices stay valid.
  if (withLines) for (const at of [...links.lines].reverse()) next = removeItem(next, ['hyperlines'], at)
  if (withSystem && links.system) next = removeKey(next, ['systems'], id)
  next = removeItem(next, ['stars'], starIndex(map, id))
  return { text: next, orphans: lostFiles(text, next) }
}

export function addFaction(text, { name }) {
  const map = read(text)
  const factions = isObject(map.factions) ? map.factions : null
  const id = uniqueId(idOf(name, 'faction'), new Set(Object.keys(factions ?? {})))
  const color = FACTION_COLORS[Object.keys(factions ?? {}).length % FACTION_COLORS.length]
  const faction = { name: String(name ?? '').trim() || id, fillColor: color, fillOpacity: 0.12, borderColor: color, borderWidth: 2 }
  const next = factions ? setKey(text, ['factions'], id, faction) : setKey(text, [], 'factions', { [id]: faction })
  return { text: next, id }
}

export function setFactionField(text, id, field, value) {
  const map = read(text)
  if (!isObject(map.factions) || !isObject(map.factions[id])) throw new EditError('editor.noFaction', { id })
  if (value === '' || value === null || value === undefined) return removeKey(text, ['factions', id], field)
  return setKey(text, ['factions', id], field, value)
}

export function removeFaction(text, id) {
  const map = read(text)
  if (!isObject(map.factions) || !(id in map.factions)) throw new EditError('editor.noFaction', { id })
  let next = text
  stars(map).forEach((star, index) => {
    if (star?.faction === id) next = removeKey(next, ['stars', index], 'faction')
  })
  return removeKey(next, ['factions'], id)
}

export function setGalaxySize(text, columns, rows) {
  const map = read(text)
  if (![columns, rows].every(value => Number.isInteger(value) && value > 0 && value <= MAX_GALAXY_SECTORS)) throw new EditError('editor.badSize', { max: MAX_GALAXY_SECTORS })
  const outside = stars(map).find(star => star?.sectorX >= columns || star?.sectorY >= rows)
  if (outside) throw new EditError('editor.starOutside', { name: outside.name ?? outside.id })
  if (!isObject(map.galaxy)) return setKey(text, [], 'galaxy', { columns, rows })
  return setKey(setKey(text, ['galaxy'], 'columns', columns), ['galaxy'], 'rows', rows)
}

export function formsCanEdit(text) {
  try {
    return isObject(read(text)) && parseSpans(text).type === 'object'
  } catch {
    return false
  }
}
