// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LANDSCAPE_QUERY, PHONE_QUERY, TABLET_QUERY, consolePx, useScreenLayout } from '../useScreenLayout'

function screenOf(width, height) {
  const queries = []
  const matches = query => {
    if (query === PHONE_QUERY) return width <= 600 || (height <= 500 && width <= 1000)
    if (query === TABLET_QUERY) return width <= 1024 && height >= width
    if (query === LANDSCAPE_QUERY) return width > height
    return false
  }
  const matchMedia = vi.fn(query => {
    const list = { media: query, matches: matches(query), listeners: [], addEventListener: (_, fn) => list.listeners.push(fn), removeEventListener: () => {} }
    queries.push(list)
    return list
  })
  vi.stubGlobal('matchMedia', matchMedia)
  return {
    resize(nextWidth, nextHeight) {
      width = nextWidth
      height = nextHeight
      for (const list of queries) {
        list.matches = matches(list.media)
        list.listeners.forEach(fn => fn())
      }
    }
  }
}

describe('the layout of the screen', () => {
  afterEach(() => vi.unstubAllGlobals())

  // Was: one layout cut at 768px gave a tablet more text than map and a phone a map of a hundred pixels.
  it('is a phone, a tablet held upright or a computer', () => {
    screenOf(390, 844)
    expect(useScreenLayout().layout.value).toBe('phone')
    screenOf(320, 568)
    expect(useScreenLayout().layout.value).toBe('phone')
    screenOf(844, 390)
    expect(useScreenLayout().layout.value).toBe('phone')
    screenOf(768, 1024)
    expect(useScreenLayout().layout.value).toBe('tablet')
    screenOf(1024, 768)
    expect(useScreenLayout().layout.value).toBe('desktop')
    screenOf(1440, 900)
    expect(useScreenLayout().layout.value).toBe('desktop')
  })

  it('follows the screen as it turns', () => {
    const screen = screenOf(768, 1024)
    const { layout } = useScreenLayout()
    expect(layout.value).toBe('tablet')
    screen.resize(1024, 768)
    expect(layout.value).toBe('desktop')
    screen.resize(390, 844)
    expect(layout.value).toBe('phone')
  })

  // Was: a phone on its side had a strip of 88px out of 390 under its screen.
  it('tells a screen on its side, and follows it as it turns', () => {
    const screen = screenOf(390, 844)
    const { layout, landscape } = useScreenLayout()
    expect(landscape.value).toBe(false)
    screen.resize(844, 390)
    expect(layout.value).toBe('phone')
    expect(landscape.value).toBe(true)
  })

  it('draws the casings with smaller pixels on a phone', () => {
    expect(consolePx('phone')).toBe(1)
    expect(consolePx('tablet')).toBe(2)
    expect(consolePx('desktop')).toBe(2)
  })
})
