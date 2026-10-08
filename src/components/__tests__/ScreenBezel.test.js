import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('ScreenBezel status light', () => {
  // Was: the amber light blinked by going see-through, casing and all, and every screen blinked in step.
  it('blinks the light out, not through, at the pace of its screen', () => {
    const source = readFileSync('src/components/ScreenBezel.vue', 'utf8')
    const keyframes = /@keyframes led-blink \{[\s\S]*?\n\}/.exec(source)[0]
    expect(keyframes).not.toMatch(/opacity/)
    expect(keyframes).toMatch(/var\(--led-dim-color\)/)
    expect(source).toMatch(/animation: led-blink var\(--led-period[^;]*var\(--led-phase/)
    expect(source).toMatch(/\.\.\.pace/)
  })
})
