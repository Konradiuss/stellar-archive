// The look of the site, `theme`: what equals the default is not written.

import { EditError } from './starEdits'
import { setIn } from './nestedEdits'
import { CASING_FRAMES, CASING_NAMES, COLOR_ROLES, DEFAULT_THEME, THEME_PRESETS, checkTheme, themeHex } from '../theme'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

/** '' gives the default preset back. */
export function setThemePreset(text, preset) {
  if (preset && !Object.hasOwn(THEME_PRESETS, preset)) throw new EditError('editor.unknownPreset', { preset })
  return setIn(text, ['theme'], 'preset', preset || '')
}

/** A colour of a role, in the map's 0x form; '' gives the preset's back. */
export function setThemeColor(text, role, value) {
  if (!COLOR_ROLES.includes(role)) throw new Error(`No colour role ${role}`)
  if (!value) return setIn(text, ['theme', 'colors'], role, '')
  const hex = themeHex(String(value))
  if (!hex) throw new EditError('editor.badThemeColor', { value: String(value) })
  return setIn(text, ['theme', 'colors'], role, value)
}

function checkSteel(steel) {
  if (steel && !CASING_NAMES.includes(steel)) throw new EditError('editor.unknownSteel', { steel: String(steel) })
}

// A list of steels is a pool each frame picks from: it becomes the steel each frame wears now, so that none changes.
function withFrames(text) {
  const raw = read(text).theme?.casings
  if (raw == null || isObject(raw)) return text
  const worn = checkTheme({ casings: raw }, () => {}).casings
  return setIn(text, ['theme'], 'casings', { ...worn })
}

/** frame: one of CASING_FRAMES; '' is the steel the site picks for it. Keys the site does not know stay. */
export function setFrameCasing(text, frame, steel) {
  if (!CASING_FRAMES.includes(frame)) throw new Error(`No frame ${frame}`)
  checkSteel(steel)
  return setIn(withFrames(text), ['theme', 'casings'], frame, steel || '')
}

/** One steel for every frame; '' gives each the one the site picks. */
export function setAllCasings(text, steel) {
  checkSteel(steel)
  return CASING_FRAMES.reduce((next, frame) => setFrameCasing(next, frame, steel), text)
}

/** A strength from 0 (off) to 2; 1, the default, or '' is not written. */
export function setCrt(text, effect, value) {
  if (!Object.hasOwn(DEFAULT_THEME.crt, effect)) throw new Error(`No effect ${effect}`)
  if (value === '' || value === null || value === undefined) return setIn(text, ['theme', 'crt'], effect, '')
  const strength = Math.round(Math.min(2, Math.max(0, Number(value))) * 100) / 100
  return setIn(text, ['theme', 'crt'], effect, strength === DEFAULT_THEME.crt[effect] ? '' : strength)
}
