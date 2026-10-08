import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSystemSettings } from '../systemSettings'
import { useReadingText } from '../../composables/useReadingText'

describe('the options of the window menus', () => {
  beforeEach(() => {
    // A storage of its own, so nothing is left from another test.
    const data = new Map()
    vi.stubGlobal('localStorage', {
      getItem: key => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => data.set(key, String(value))
    })
    setActivePinia(createPinia())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('has one speed of the orbits, 0 for stopped, and no pause or zoom besides', () => {
    const settings = useSystemSettings()
    expect(settings.system).toEqual({ speed: 1, labels: true, orbits: true, grid: true })
    expect(settings.visual).toEqual({ rotate: true, layout: 'orbits', params: true, grid: true })
    settings.set('system', 'speed', 0)
    settings.set('system', 'labels', false)
    expect(settings.system.speed).toBe(0)
    settings.reset('system')
    expect(settings.system).toEqual({ speed: 1, labels: true, orbits: true, grid: true })
  })

  it('keeps one text size; the reset of PLANET-DATA or of the wiki gives it back', () => {
    const settings = useSystemSettings()
    const reading = useReadingText()
    expect(reading.style.value).toEqual({ '--reading-size': '16px', '--reading-line': '24px' })

    reading.sizeItem.value.onChange(20)
    expect(settings.text.size).toBe(20)
    expect(useReadingText().style.value).toEqual({ '--reading-size': '20px', '--reading-line': '30px' })

    settings.set('data', 'typing', false)
    settings.reset('data')
    expect(settings.data.typing).toBe(true)
    expect(settings.text.size).toBe(16)

    settings.set('text', 'size', 24)
    settings.reset('visual')
    expect(settings.text.size).toBe(24)
    settings.reset('text')
    expect(settings.text.size).toBe(16)
  })

  it('resets every window and the text size at once', () => {
    const settings = useSystemSettings()
    settings.set('system', 'speed', 2)
    settings.set('data', 'typing', false)
    settings.set('visual', 'layout', 'grid')
    settings.set('text', 'size', 24)
    settings.resetAll()
    expect(settings.system).toEqual({ speed: 1, labels: true, orbits: true, grid: true })
    expect(settings.data).toEqual({ typing: true })
    expect(settings.visual).toEqual({ rotate: true, layout: 'orbits', params: true, grid: true })
    expect(settings.text).toEqual({ size: 16 })
  })

  it('takes a size off the list as the smallest one', () => {
    const settings = useSystemSettings()
    const reading = useReadingText()
    settings.set('text', 'size', 8)
    expect(reading.size.value).toBe(16)
    expect(reading.sizeItem.value.value).toBe(16)
    expect(reading.sizeItem.value.options.map(option => option.value)).toEqual([16, 20, 24])
  })
})
