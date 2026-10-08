// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CASING_FRAMES, CASING_NAMES, COLOR_ROLES, DEFAULT_THEME, THEME_PRESETS, applyTheme, checkTheme, themeCasing, themeColor,
  themeHex, themeMixHex, themeNumber, themeVariables
} from '../index'
import { pickTint } from '../../utils/bezelSprites'

// Read from disk the node way: happy-dom has its own URL.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const notesOf = () => {
  const notes = []
  return { notes, note: (level, where, message) => notes.push(`${level} ${where}: ${message}`) }
}

describe('theme of the map', () => {
  afterEach(() => applyTheme())

  it('starts from a preset, takes the colours of the map over it, and says what is wrong', () => {
    const { notes, note } = notesOf()
    const theme = checkTheme({
      preset: 'amber',
      colors: { accent: '#FE9', ok: '0x00ff00', glow: '#ffffff', error: 'red' },
      casings: ['gunmetal', 'gold'],
      crt: { scanlines: 0, vignette: 5, sweep: false, glow: 'bright', blur: 1 }
    }, note)
    expect(theme.colors).toEqual({ ...THEME_PRESETS.amber, accent: '#ffee99', ok: '#00ff00' })
    expect(Object.values(theme.casings)).toEqual(['gunmetal', 'gunmetal', 'gunmetal', 'gunmetal'])
    expect(theme.crt).toEqual({ scanlines: 0, vignette: 2, sweep: 0, glow: 1 })
    expect(notes).toEqual([
      'warning theme.colors.glow: Is not a colour of the interface (text, dim, line, screen, accent, ok, warn, error): left out.',
      'error theme.colors.error: "red" is not a colour like "#ffcc00": the colour of the preset is used.',
      'warning theme.casings: "gold" is no steel of the casings (blue, grey, warm, gunmetal): left out.',
      'error theme.crt.glow: "bright" is not a strength from 0 (off) to 2: 1 is used.',
      'warning theme.crt.blur: Is not an effect of the screens (scanlines, vignette, sweep, glow): left out.'
    ])
    expect(checkTheme(null, note)).toBe(DEFAULT_THEME)
    expect(checkTheme({ preset: 'pink' }, note).colors).toEqual(THEME_PRESETS.white)
    expect(notes.at(-1)).toBe('warning theme.preset: "pink" is none of white, amber, green: "white" is used.')
    expect(themeHex('#ABC')).toBe('#aabbcc')
  })

  it('has the defaults of src/style.css, so that a map without a theme looks the same', () => {
    const css = readFileSync(join(SRC, 'style.css'), 'utf8')
    const root = Object.fromEntries([...css.matchAll(/(--ui-[a-z-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]))
    const variables = themeVariables(DEFAULT_THEME)
    for (const role of COLOR_ROLES) {
      expect(root[`--ui-${role}`], role).toBe(variables[`--ui-${role}`])
      expect(root[`--ui-${role}-rgb`], role).toBe(variables[`--ui-${role}-rgb`])
    }
    // The CRT effects at their strength 1 are the values of src/styles/crt.css.
    const crt = readFileSync(join(SRC, 'styles', 'crt.css'), 'utf8')
    for (const name of ['--crt-scanline-alpha', '--crt-vignette-alpha', '--crt-scan-alpha']) {
      expect(crt).toContain(`${name}: ${variables[name]};`)
    }
  })

  it('puts the colours on the page and gives them to the canvases', () => {
    const { note } = notesOf()
    applyTheme(checkTheme({ preset: 'green', colors: { text: '#102030' }, casings: ['warm'], crt: { scanlines: 0.5 } }, note))
    const style = document.documentElement.style
    expect(style.getPropertyValue('--ui-text')).toBe('#102030')
    expect(style.getPropertyValue('--ui-text-rgb')).toBe('16 32 48')
    expect(style.getPropertyValue('--crt-scanline-alpha')).toBe('0.08')
    expect(themeColor('text')).toBe('#102030')
    expect(themeNumber('text')).toBe(0x102030)
    for (const seed of CASING_FRAMES) expect(themeCasing(seed)).toBe('warm')
  })

  // Was: `casings` was only a pool, and the name of each frame chose its steel: the author could not.
  it('gives each frame the steel the map names for it, and the one it always had otherwise', () => {
    const { notes, note } = notesOf()
    const before = Object.fromEntries(CASING_FRAMES.map(frame => [frame, pickTint(frame, CASING_NAMES)]))
    expect(DEFAULT_THEME.casings).toEqual(before)
    const theme = checkTheme({ casings: { lore: 'warm', music: 'bronze', wiki: 'blue' } }, note)
    expect(theme.casings).toEqual({ ...before, lore: 'warm' })
    expect(notes).toEqual([
      'warning theme.casings.music: "bronze" is no steel of the casings (blue, grey, warm, gunmetal): its own is used.',
      'warning theme.casings.wiki: Is no frame of the site (map, lore, music, legend): left out.'
    ])
    // A list stays a pool, as it was.
    const pool = ['blue', 'warm']
    expect(checkTheme({ casings: pool }, note).casings).toEqual(Object.fromEntries(CASING_FRAMES.map(frame => [frame, pickTint(frame, pool)])))
    applyTheme(theme)
    expect(themeCasing('lore')).toBe('warm')
    expect(themeCasing('console')).toBe(pickTint('console', CASING_NAMES))
  })

  it('mixes the greys of the default theme as they were', () => {
    expect(themeMixHex('line', 0.6, 'screen')).toBe('#333333')
    expect(themeMixHex('line', 0.8, 'screen')).toBe('#444444')
    expect(themeMixHex('dim', 0.74, 'line')).toBe('#888888')
    expect(themeMixHex('text', 0.5, 'dim')).toBe('#cdcdcd')
    expect(CASING_NAMES.map(name => pickTint(name)).every(name => CASING_NAMES.includes(name))).toBe(true)
  })
})
