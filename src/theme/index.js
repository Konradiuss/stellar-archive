// Colours become CSS variables on <html> (--ui-text, and --ui-text-rgb for alpha); canvases ask themeColor().

import { shallowRef } from 'vue'
import { STEEL_TINTS, pickTint } from '../utils/bezelSprites'
import { isObject } from '../utils/guards'

export const COLOR_ROLES = ['text', 'dim', 'line', 'screen', 'accent', 'ok', 'warn', 'error']

export const THEME_PRESETS = Object.freeze({
  white: { text: '#ffffff', dim: '#9a9a9a', line: '#555555', screen: '#000000', accent: '#cfe0ff', ok: '#66ff66', warn: '#ffc24a', error: '#ff5555' },
  amber: { text: '#ffc46b', dim: '#b07a2c', line: '#6a4615', screen: '#0c0700', accent: '#ffe2a8', ok: '#ffe08a', warn: '#ff9a3c', error: '#ff5a3c' },
  green: { text: '#7dff8e', dim: '#3fa356', line: '#1f5a2c', screen: '#000a02', accent: '#c8ffd0', ok: '#c8ff7d', warn: '#e6ff5c', error: '#ff6b5c' }
})
export const DEFAULT_PRESET = 'white'

// Strength of each: 1 the default, 0 off, up to 2.
export const CRT_EFFECTS = { scanlines: '--crt-scanline-alpha', vignette: '--crt-vignette-alpha', sweep: '--crt-scan-alpha' }
const CRT_DEFAULTS = { scanlines: 0.16, vignette: 0.35, sweep: 0.05 }
const MAX_EFFECT = 2

export const CASING_NAMES = Object.keys(STEEL_TINTS)
// The seeds of the casings: the main screen (the wiki's too), the lore, the player, the legend with its switch.
export const CASING_FRAMES = ['map', 'lore', 'music', 'legend']

// Each frame a steel of `names`, picked by its name.
const casingsFrom = names => Object.freeze(Object.fromEntries(CASING_FRAMES.map(frame => [frame, pickTint(frame, names)])))
const AUTO_CASINGS = casingsFrom(CASING_NAMES)

export const DEFAULT_THEME = Object.freeze({
  colors: THEME_PRESETS[DEFAULT_PRESET],
  casings: AUTO_CASINGS,
  crt: { scanlines: 1, vignette: 1, sweep: 1, glow: 1 }
})

const state = shallowRef(DEFAULT_THEME)

const HEX = /^#[0-9a-f]{6}$/i

// '#rrggbb', '#rgb' or '0xrrggbb' → '#rrggbb'; null otherwise.
export function themeHex(value) {
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/^0x/i, '#')
  if (/^#[0-9a-f]{3}$/i.test(text)) return `#${[...text.slice(1)].map(char => char + char).join('')}`.toLowerCase()
  return HEX.test(text) ? text.toLowerCase() : null
}

export function checkTheme(raw, note) {
  if (raw == null) return DEFAULT_THEME
  if (!isObject(raw)) {
    note('error', 'theme', 'Must be an object { "preset": …, "colors": { … }, "casings": { … }, "crt": { … } }: the default look is used.')
    return DEFAULT_THEME
  }
  let preset = DEFAULT_PRESET
  if (raw.preset != null) {
    if (Object.hasOwn(THEME_PRESETS, raw.preset)) preset = raw.preset
    else note('warning', 'theme.preset', `${JSON.stringify(raw.preset)} is none of ${Object.keys(THEME_PRESETS).join(', ')}: "${DEFAULT_PRESET}" is used.`)
  }
  const colors = { ...THEME_PRESETS[preset] }
  if (raw.colors != null && !isObject(raw.colors)) note('error', 'theme.colors', 'Must be an object { "text": "#ffffff", … }: the colours of the preset are used.')
  for (const [role, value] of Object.entries(isObject(raw.colors) ? raw.colors : {})) {
    if (!COLOR_ROLES.includes(role)) {
      note('warning', `theme.colors.${role}`, `Is not a colour of the interface (${COLOR_ROLES.join(', ')}): left out.`)
      continue
    }
    const hex = themeHex(value)
    if (hex) colors[role] = hex
    else note('error', `theme.colors.${role}`, `${JSON.stringify(value)} is not a colour like "#ffcc00": the colour of the preset is used.`)
  }

  const casings = checkCasings(raw.casings, note)

  const crt = { ...DEFAULT_THEME.crt }
  if (raw.crt != null && !isObject(raw.crt)) note('error', 'theme.crt', 'Must be an object { "scanlines": 1, "vignette": 1, "sweep": 1, "glow": 1 }: the effects stay as they are.')
  for (const [effect, value] of Object.entries(isObject(raw.crt) ? raw.crt : {})) {
    if (!Object.hasOwn(crt, effect)) {
      note('warning', `theme.crt.${effect}`, `Is not an effect of the screens (${Object.keys(crt).join(', ')}): left out.`)
      continue
    }
    const strength = typeof value === 'boolean' ? Number(value) : value
    if (Number.isFinite(strength) && strength >= 0) crt[effect] = Math.min(MAX_EFFECT, strength)
    else note('error', `theme.crt.${effect}`, `${JSON.stringify(value)} is not a strength from 0 (off) to ${MAX_EFFECT}: 1 is used.`)
  }
  return { colors, casings, crt }
}

const isSteel = name => CASING_NAMES.includes(name)
const noSteel = (name, then) => `${JSON.stringify(name)} is no steel of the casings (${CASING_NAMES.join(', ')}): ${then}.`

// { frame: steel } names each frame's own; a list (or one name) is a pool each frame picks from by its name.
function checkCasings(raw, note) {
  if (raw == null) return AUTO_CASINGS
  if (isObject(raw)) {
    const casings = { ...AUTO_CASINGS }
    for (const [frame, name] of Object.entries(raw)) {
      if (!CASING_FRAMES.includes(frame)) note('warning', `theme.casings.${frame}`, `Is no frame of the site (${CASING_FRAMES.join(', ')}): left out.`)
      else if (isSteel(name)) casings[frame] = name
      else note('warning', `theme.casings.${frame}`, noSteel(name, 'its own is used'))
    }
    return Object.freeze(casings)
  }
  const list = (Array.isArray(raw) ? raw : [raw]).filter(name => {
    if (isSteel(name)) return true
    note('warning', 'theme.casings', noSteel(name, 'left out'))
    return false
  })
  return list.length ? casingsFrom([...new Set(list)]) : AUTO_CASINGS
}

const channels = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(' ')

export function themeVariables(theme) {
  const variables = {}
  for (const role of COLOR_ROLES) {
    variables[`--ui-${role}`] = theme.colors[role]
    variables[`--ui-${role}-rgb`] = channels(theme.colors[role])
  }
  for (const [effect, variable] of Object.entries(CRT_EFFECTS)) {
    variables[variable] = String(+(CRT_DEFAULTS[effect] * theme.crt[effect]).toFixed(3))
  }
  variables['--crt-glow-strength'] = String(theme.crt.glow)
  return variables
}

export function applyTheme(theme = DEFAULT_THEME) {
  state.value = theme
  if (typeof document === 'undefined') return
  for (const [name, value] of Object.entries(themeVariables(theme))) document.documentElement.style.setProperty(name, value)
}

export const themeColor = role => state.value.colors[role] ?? DEFAULT_THEME.colors[role]
// 0xrrggbb, for Pixi.
export const themeNumber = role => parseInt(themeColor(role).slice(1), 16)
/** The steel of the casing of a frame; a seed that is no frame picks one by its name. */
export const themeCasing = seed => state.value.casings[seed] ?? pickTint(seed, CASING_NAMES)
/** What each frame wears with no setting of the map. */
export const autoCasing = frame => AUTO_CASINGS[frame]

const mixChannels = (a, b, share) => [1, 3, 5].map(offset => {
  const x = parseInt(a.slice(offset, offset + 2), 16)
  const y = parseInt(b.slice(offset, offset + 2), 16)
  return Math.round(x * share + y * (1 - share))
})
// `share` of `role` mixed into `into`, as CSS color-mix does.
export const themeMixHex = (role, share, into) => `#${mixChannels(themeColor(role), themeColor(into), share).map(value => value.toString(16).padStart(2, '0')).join('')}`
export const themeMixNumber = (role, share, into) => parseInt(themeMixHex(role, share, into).slice(1), 16)
