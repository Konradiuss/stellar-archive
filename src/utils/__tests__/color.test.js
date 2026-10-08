import { describe, expect, it } from 'vitest'
import { colorStyle, cssColor, hexToRgb } from '../color'
import { cssColor as editorCssColor } from '../../editor/colors'
import { cssColor as legendCssColor } from '../mapLegend'

describe('the colours of the map', () => {
  // Was: the legend and the editor each had a cssColor of their own and took a number past 0xffffff differently.
  it('read the same in the legend, the editor and the rest of the site', () => {
    expect(editorCssColor).toBe(cssColor)
    expect(legendCssColor).toBe(cssColor)
  })

  it('take "#rrggbb", "0xrrggbb" and numbers, and refuse anything else', () => {
    expect(cssColor('0x00AAFF')).toBe('#00aaff')
    expect(cssColor('#123456')).toBe('#123456')
    expect(cssColor(0xff00)).toBe('#00ff00')
    for (const value of ['red', '#abc', 0x1000000, -1, 1.5, null, {}]) expect(cssColor(value), String(value)).toBeNull()
  })

  it('turn a number into channels and channels into CSS', () => {
    expect(hexToRgb(0x102030)).toEqual({ r: 16, g: 32, b: 48 })
    expect(colorStyle({ r: 1, g: 2, b: 3 })).toBe('rgb(1, 2, 3)')
  })
})
