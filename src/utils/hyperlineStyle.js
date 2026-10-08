// Precedence: the line's own fields, its type in the map's `hyperlineTypes`, the built-in type, the default.

import { warnMap } from './mapJournal'

const DEFAULT_STYLE = { color: 0xffffff, width: 2, opacity: 0.7, direction: 'both' }
const DIRECTIONS = ['both', 'forward']

// speed: world px per second; a new pulse every `interval` s from each end; tail `length` px.
const DEFAULT_PULSE = { speed: 70, interval: 1.6, length: 12 }
export const BUILT_IN_TYPES = {
  gate: { pulse: { speed: 170, interval: 2.6, length: 18 } },
  trade: { pulse: { speed: 45, interval: 1.7, length: 10 } },
  military: { pulse: { speed: 120, interval: 1.5, length: 14 } },
  supply: { pulse: { speed: 65, interval: 1.6, length: 10 } },
  industrial: { pulse: { speed: 40, interval: 2, length: 10 } }
}

/** '0x00ffff', '#00ffff' or 0x00ffff -> 0x00ffff; null when it is not a colour. */
export function parseColor(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 0xffffff ? value : null
  if (typeof value !== 'string') return null
  const hex = value.trim().replace(/^(0x|#)/i, '')
  return /^[0-9a-f]{6}$/i.test(hex) ? parseInt(hex, 16) : null
}

// `hyperlineTypes` values: a name only ('Trade routes') or a style object.
function typeStyle(types, type) {
  const value = types?.[type]
  return value && typeof value === 'object' ? value : {}
}

export function typeDisplayName(types, type) {
  const value = types?.[type]
  if (typeof value === 'string') return value || null
  return typeof value?.name === 'string' && value.name ? value.name : null
}

function pick(layers, read) {
  for (const layer of layers) {
    const value = read(layer)
    if (value !== undefined) return value
  }
  return undefined
}

/** `pulse` is { speed, interval, length } or null (`pulse: false`). Wrong values are reported and replaced. */
export function resolveHyperlineStyle(line, types = {}) {
  const type = line?.type
  const layers = [line ?? {}, typeStyle(types, type), BUILT_IN_TYPES[type] ?? {}]
  const warn = (field, value) => warnMap(`hyperline "${line?.id ?? '?'}"`, `"${field}" ${JSON.stringify(value)} is not valid: the default is used.`)

  const valid = (field, check) => pick(layers, layer => {
    if (layer[field] === undefined) return undefined
    if (check(layer[field])) return layer[field]
    warn(field, layer[field])
    return undefined
  })

  const colorValue = valid('color', value => parseColor(value) !== null)
  const width = valid('width', value => typeof value === 'number' && value > 0 && value <= 12)
  const opacity = valid('opacity', value => typeof value === 'number' && value >= 0 && value <= 1)
  const direction = valid('direction', value => DIRECTIONS.includes(value))

  let pulse = { ...DEFAULT_PULSE }
  for (const layer of [...layers].reverse()) {
    if (layer.pulse === false) pulse = null
    else if (layer.pulse && typeof layer.pulse === 'object') {
      pulse = { ...(pulse ?? DEFAULT_PULSE) }
      for (const key of Object.keys(DEFAULT_PULSE)) {
        const value = layer.pulse[key]
        if (value === undefined) continue
        if (typeof value === 'number' && value > 0) pulse[key] = value
        else warn(`pulse.${key}`, value)
      }
    } else if (layer.pulse !== undefined) {
      warn('pulse', layer.pulse)
    }
  }

  return {
    color: colorValue !== undefined ? parseColor(colorValue) : DEFAULT_STYLE.color,
    width: width ?? DEFAULT_STYLE.width,
    opacity: opacity ?? DEFAULT_STYLE.opacity,
    direction: direction ?? DEFAULT_STYLE.direction,
    pulse
  }
}

export function applyHyperlineStyles(lines, types = {}) {
  return (lines ?? []).map(line => ({ ...line, ...resolveHyperlineStyle(line, types) }))
}
