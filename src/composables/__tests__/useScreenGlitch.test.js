// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useScreenGlitch } from '../useScreenGlitch'

function screen(options) {
  let glitch = null
  const wrapper = mount(defineComponent({
    setup() {
      glitch = useScreenGlitch(options)
      return () => h('div')
    }
  }))
  return { wrapper, style: () => glitch.style.value }
}

function glitchMoments(read, ms) {
  const moments = []
  for (let at = 0; at < ms; at += 10) {
    vi.advanceTimersByTime(10)
    const style = read()
    if (style.transform || style.filter) moments.push(at)
  }
  return moments
}

describe('the glitches of a hacked screen', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('jumps or flashes for a moment, then calms down, again and again', () => {
    const { wrapper, style } = screen({ pause: [300, 300], length: [100, 100] })
    expect(style().transform ?? style().filter).toBeUndefined()
    vi.advanceTimersByTime(300)
    expect(style().transform ?? style().filter).toBeDefined()
    vi.advanceTimersByTime(100)
    expect(style().transform ?? style().filter).toBeUndefined()
    expect(style()['--blink-duration']).toMatch(/^\d\.\d\ds$/)
    vi.advanceTimersByTime(300)
    expect(style().transform ?? style().filter).toBeDefined()
    wrapper.unmount()
  })

  it('draws its own moments: two screens start glitching apart', () => {
    // Each screen draws its blink pace (two draws), then its first calm: short for the first screen, long for the second.
    const draws = [0.5, 0.5, 0.1, 0.5, 0.5, 0.9]
    vi.spyOn(Math, 'random').mockImplementation(() => draws.shift() ?? 0.5)
    const screens = [screen(), screen()]
    const starts = [null, null]
    for (let at = 10; at <= 3000; at += 10) {
      vi.advanceTimersByTime(10)
      screens.forEach((one, index) => {
        const style = one.style()
        if (starts[index] === null && (style.transform || style.filter)) starts[index] = at
      })
    }
    expect(starts[0]).toBeLessThan(600)
    expect(starts[1]).toBeGreaterThan(1500)
  })

  it('blinks at its own pace', () => {
    const [a, b] = [screen().style(), screen().style()]
    expect(a['--blink-duration'] + a['--blink-delay']).not.toBe(b['--blink-duration'] + b['--blink-delay'])
  })

  it('keeps still when the system asks for less motion', () => {
    vi.stubGlobal('matchMedia', query => ({ matches: query.includes('reduce') }))
    const { style } = screen()
    expect(glitchMoments(style, 5000)).toEqual([])
    vi.unstubAllGlobals()
  })
})
