import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_GALAXY_SECTORS, formatSector, normalizeGalaxyConfig } from '../mapGeometry.js'

describe('formatSector', () => {
  it('writes a sector as the screens write it', () => {
    expect(formatSector(2, 5)).toBe('02:05')
    expect(formatSector(19, 11)).toBe('19:11')
  })
})

describe('normalizeGalaxyConfig', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is 16x9 sectors of 100px without a galaxy section', () => {
    expect(normalizeGalaxyConfig()).toEqual({ columns: 16, rows: 9, sectorSize: 100, width: 1600, height: 900 })
    expect(normalizeGalaxyConfig({ columns: 'wide', rows: null })).toMatchObject({ columns: 16, rows: 9 })
  })

  it('takes the size from the map and keeps it within limits', () => {
    expect(normalizeGalaxyConfig({ columns: 24, rows: 14 })).toMatchObject({ columns: 24, rows: 14, width: 2400, height: 1400 })
    expect(normalizeGalaxyConfig({ columns: 0, rows: 7.6 })).toMatchObject({ columns: 1, rows: 8 })
    expect(normalizeGalaxyConfig({ columns: 1e6, rows: 3 }).columns).toBe(MAX_GALAXY_SECTORS)
  })

  it('grows to fit a star outside the given size and warns about it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stars = [{ id: 'far', name: 'Far', sectorX: 19, sectorY: 2 }, { id: 'sol', sectorX: 1, sectorY: 1 }]
    expect(normalizeGalaxyConfig({ columns: 10, rows: 5 }, stars)).toMatchObject({ columns: 20, rows: 5 })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('Far')
  })
})
