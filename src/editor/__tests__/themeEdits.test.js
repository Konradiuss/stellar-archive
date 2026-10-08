import { describe, expect, it } from 'vitest'
import { setAllCasings, setCrt, setFrameCasing, setThemeColor, setThemePreset } from '../themeEdits'
import { CASING_FRAMES, checkTheme } from '../../theme'

const MAP = '{\n  "stars": []\n}\n'
const read = text => JSON.parse(text)

// Was: the theme was set in map.json by hand only.
describe('the look of the site in the editor', () => {
  it('sets a ready theme and a colour of a role, and takes them back to the default, the empty objects too', () => {
    let text = setThemePreset(MAP, 'amber')
    text = setThemeColor(text, 'accent', '#ffffff')
    expect(read(text).theme).toEqual({ preset: 'amber', colors: { accent: '#ffffff' } })
    text = setThemeColor(text, 'accent', '')
    expect(read(text).theme).toEqual({ preset: 'amber' })
    expect(setThemePreset(text, '')).toBe(MAP)
    expect(() => setThemePreset(MAP, 'purple')).toThrow('editor.unknownPreset')
    expect(() => setThemeColor(MAP, 'text', 'red')).toThrow('editor.badThemeColor')
    expect(read(setThemeColor(MAP, 'text', '0xffcc00')).theme.colors.text).toBe('0xffcc00')
  })

  it('writes a strength of an effect only when it is not 1, and keeps it within 0 and 2', () => {
    let text = setCrt(MAP, 'vignette', 0.5)
    expect(read(text).theme).toEqual({ crt: { vignette: 0.5 } })
    text = setCrt(text, 'sweep', 0)
    expect(read(text).theme.crt).toEqual({ vignette: 0.5, sweep: 0 })
    expect(read(setCrt(text, 'glow', 5)).theme.crt.glow).toBe(2)
    expect(setCrt(setCrt(text, 'sweep', 1), 'vignette', '')).toBe(MAP)
  })

  it('gives a frame its steel and takes it back, the empty objects too', () => {
    let text = setFrameCasing(MAP, 'lore', 'warm')
    expect(read(text).theme).toEqual({ casings: { lore: 'warm' } })
    text = setFrameCasing(text, 'music', 'blue')
    expect(read(text).theme.casings).toEqual({ lore: 'warm', music: 'blue' })
    expect(setFrameCasing(setFrameCasing(text, 'music', ''), 'lore', '')).toBe(MAP)
    expect(() => setFrameCasing(MAP, 'lore', 'bronze')).toThrow('editor.unknownSteel')
  })

  it('paints every frame one steel, and gives each its own back', () => {
    const text = setAllCasings(MAP, 'gunmetal')
    expect(read(text).theme.casings).toEqual(Object.fromEntries(CASING_FRAMES.map(frame => [frame, 'gunmetal'])))
    expect(setAllCasings(text, '')).toBe(MAP)
  })

  it('turns a list of steels into the steel each frame wears, so that none changes, and keeps keys it does not know', () => {
    const pool = JSON.stringify({ theme: { casings: ['blue', 'warm'] } }, null, 2)
    const worn = checkTheme({ casings: ['blue', 'warm'] }, () => {}).casings
    const text = setFrameCasing(pool, 'map', 'grey')
    expect(read(text).theme.casings).toEqual({ ...worn, map: 'grey' })
    const own = JSON.stringify({ theme: { casings: { wiki: 'gold', lore: 'warm' } } }, null, 2)
    expect(read(setAllCasings(own, '')).theme.casings).toEqual({ wiki: 'gold' })
  })
})
