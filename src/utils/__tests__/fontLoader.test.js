import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPixelFont } from '../fontLoader.js'

describe('loadPixelFont', () => {
  afterEach(() => { delete globalThis.document })

  // Pixi measures text with the font it has: the Latin part must load before labels are drawn, or they fall back to a serif font.
  it('loads the Latin part of the pixel font', async () => {
    const load = vi.fn(() => Promise.resolve([]))
    globalThis.document = { fonts: { load } }
    await loadPixelFont()
    const [font, text] = load.mock.calls[0]
    expect(font).toContain('Press Start 2P')
    expect(text).toMatch(/[A-Za-z]/)
  })
})
