import { appendItem, removeItem, removeKey, setKey, setValue } from './jsonEdit'
import { EditError, idOf } from './starEdits'
import { BUILT_IN_TYPES, resolveHyperlineStyle } from '../utils/hyperlineStyle'
import { collectMapNotes } from '../utils/mapJournal'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
const isEmpty = value => value === '' || value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value))
const stars = map => (Array.isArray(map.stars) ? map.stars : [])
const lines = map => (Array.isArray(map.hyperlines) ? map.hyperlines : [])

export const BUILT_IN_ROUTE_TYPES = Object.keys(BUILT_IN_TYPES)
export const DIRECTIONS = ['both', 'forward']

export function endStar(map, end) {
  if (typeof end === 'string') return stars(map).find(star => star?.id === end) ?? null
  if (isObject(end)) return stars(map).find(star => star?.sectorX === end.sectorX && star?.sectorY === end.sectorY) ?? null
  return null
}

export const routesOf = (map, starId) => lines(map).map((line, index) => ([line?.from, line?.to].some(end => endStar(map, end)?.id === starId) ? index : -1)).filter(index => index >= 0)

// ofType: the look its type alone gives, which the route's own fields fall back to.
export function routeList(map) {
  const types = isObject(map.hyperlineTypes) ? map.hyperlineTypes : {}
  return collectMapNotes(() => lines(map).map((line, index) => {
    const style = resolveHyperlineStyle(line, types)
    const typeStyle = resolveHyperlineStyle({ type: line?.type }, types)
    return {
      index,
      line,
      from: endStar(map, line?.from),
      to: endStar(map, line?.to),
      color: style.color,
      width: style.width,
      opacity: style.opacity,
      ofType: { color: typeStyle.color, width: typeStyle.width, opacity: typeStyle.opacity }
    }
  })).result
}

function checkStar(map, id) {
  if (!stars(map).some(star => star?.id === id)) throw new EditError('editor.noStar', { id })
}

export function addRoute(text, { from, to, type = 'trade' }) {
  const map = read(text)
  checkStar(map, from)
  checkStar(map, to)
  if (from === to) throw new EditError('editor.sameStar')
  const taken = new Set(lines(map).map(line => line?.id))
  let id = idOf(`${type}-${from}-${to}`, 'route')
  for (let n = 2; taken.has(id); n++) id = `${idOf(`${type}-${from}-${to}`, 'route')}-${n}`
  const line = { id, type, from, to }
  const next = Array.isArray(map.hyperlines) ? appendItem(text, ['hyperlines'], line) : setKey(text, [], 'hyperlines', [line])
  return { text: next, index: lines(map).length }
}

function route(map, index) {
  if (!isObject(lines(map)[index])) throw new EditError('editor.noRoute')
  return lines(map)[index]
}

/** field: 'type' | 'description' | 'color' | 'width' | 'opacity' | 'direction' | 'pulse'; empty removes it. */
export function setRouteField(text, index, field, value) {
  route(read(text), index)
  return isEmpty(value) ? removeKey(text, ['hyperlines', index], field) : setKey(text, ['hyperlines', index], field, value)
}

export function setRouteEnd(text, index, end, starId) {
  const map = read(text)
  const line = route(map, index)
  checkStar(map, starId)
  const other = endStar(map, line[end === 'from' ? 'to' : 'from'])
  if (other?.id === starId) throw new EditError('editor.sameStar')
  return setKey(text, ['hyperlines', index], end, starId)
}

export function removeRoute(text, index) {
  route(read(text), index)
  return removeItem(text, ['hyperlines'], index)
}

export function routeTypes(map) {
  const types = isObject(map.hyperlineTypes) ? map.hyperlineTypes : {}
  const ids = [...BUILT_IN_ROUTE_TYPES, ...Object.keys(types).filter(id => !BUILT_IN_ROUTE_TYPES.includes(id))]
  return collectMapNotes(() => ids.map(id => {
    const value = types[id]
    const style = resolveHyperlineStyle({ type: id }, types)
    return {
      id,
      builtIn: BUILT_IN_ROUTE_TYPES.includes(id),
      name: typeof value === 'string' ? value : (isObject(value) && typeof value.name === 'string' ? value.name : null),
      color: style.color,
      width: style.width,
      opacity: style.opacity,
      // Without the map's overrides.
      builtInStyle: (({ color, width, opacity }) => ({ color, width, opacity }))(resolveHyperlineStyle({ type: id }, {}))
    }
  })).result
}

export function addRouteType(text, { name }) {
  const map = read(text)
  const taken = new Set([...BUILT_IN_ROUTE_TYPES, ...Object.keys(isObject(map.hyperlineTypes) ? map.hyperlineTypes : {})])
  let id = idOf(name, 'type')
  for (let n = 2; taken.has(id); n++) id = `${idOf(name, 'type')}-${n}`
  const type = { name: String(name ?? '').trim() || id, color: '#aaaaaa', width: 2 }
  const next = isObject(map.hyperlineTypes) ? setKey(text, ['hyperlineTypes'], id, type) : setKey(text, [], 'hyperlineTypes', { [id]: type })
  return { text: next, id }
}

// A type written as a bare name string becomes an object only when it gets more than a name.
export function setRouteTypeField(text, id, field, value) {
  const map = read(text)
  const types = isObject(map.hyperlineTypes) ? map.hyperlineTypes : null
  const current = types?.[id]
  if (!BUILT_IN_ROUTE_TYPES.includes(id) && current === undefined) throw new EditError('editor.noRouteType', { id })
  if (typeof current === 'string') {
    if (field === 'name') return isEmpty(value) ? setValue(text, ['hyperlineTypes', id], {}) : setValue(text, ['hyperlineTypes', id], value)
    return isEmpty(value) ? text : setValue(text, ['hyperlineTypes', id], { name: current, [field]: value })
  }
  if (isObject(current)) return isEmpty(value) ? removeKey(text, ['hyperlineTypes', id], field) : setKey(text, ['hyperlineTypes', id], field, value)
  if (isEmpty(value)) return text
  return types ? setKey(text, ['hyperlineTypes'], id, { [field]: value }) : setKey(text, [], 'hyperlineTypes', { [id]: { [field]: value } })
}

export function removeRouteType(text, id) {
  const map = read(text)
  const types = isObject(map.hyperlineTypes) ? map.hyperlineTypes : {}
  if (!(id in types)) {
    if (BUILT_IN_ROUTE_TYPES.includes(id)) return text
    throw new EditError('editor.noRouteType', { id })
  }
  let next = text
  if (!BUILT_IN_ROUTE_TYPES.includes(id)) {
    lines(map).forEach((line, index) => {
      if (line?.type === id) next = removeKey(next, ['hyperlines', index], 'type')
    })
  }
  return removeKey(next, ['hyperlineTypes'], id)
}
