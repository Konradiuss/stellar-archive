import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { BUILT_IN_TYPES, applyHyperlineStyles, parseColor, resolveHyperlineStyle, typeDisplayName } from '../hyperlineStyle.js'

const mapData = JSON.parse(
  readFileSync(new URL('../../../test-world/map.json', import.meta.url), 'utf8')
)

describe('hyperline style', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads colours written in three ways', () => {
    expect(parseColor('0x00ffff')).toBe(0x00ffff)
    expect(parseColor('#FF6600')).toBe(0xff6600)
    expect(parseColor(0x4444ff)).toBe(0x4444ff)
    expect(parseColor('blue')).toBeNull()
    expect(parseColor(-1)).toBeNull()
  })

  it('takes a field from the line, then its type, then the built-in type, then the default', () => {
    const types = { trade: { color: '0xffaa00', width: 3, pulse: { speed: 10 } } }
    expect(resolveHyperlineStyle({ id: 'a', type: 'trade', color: '#112233' }, types)).toEqual({
      color: 0x112233,
      width: 3,
      opacity: 0.7,
      direction: 'both',
      pulse: { ...BUILT_IN_TYPES.trade.pulse, speed: 10 }
    })
    expect(resolveHyperlineStyle({ id: 'b', type: 'unknown' }, types)).toMatchObject({ color: 0xffffff, width: 2, pulse: { speed: 70 } })
  })

  it('switches pulses off by type or by line, and back on by line', () => {
    const types = { trade: { pulse: false } }
    expect(resolveHyperlineStyle({ type: 'trade' }, types).pulse).toBeNull()
    expect(resolveHyperlineStyle({ type: 'gate', pulse: false }, types).pulse).toBeNull()
    expect(resolveHyperlineStyle({ type: 'trade', pulse: { interval: 3 } }, types).pulse).toMatchObject({ interval: 3 })
  })

  it('reports a wrong value with the id of the line and uses the type instead', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const style = resolveHyperlineStyle({ id: 'broken', type: 'trade', color: 'blue', direction: 'sideways' }, { trade: { color: '0xffaa00' } })
    expect(style).toMatchObject({ color: 0xffaa00, direction: 'both' })
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0][0]).toContain('"broken"')
  })

  it('still accepts a type given by its name only', () => {
    const types = { trade: 'Trade routes' }
    expect(typeDisplayName(types, 'trade')).toBe('Trade routes')
    expect(typeDisplayName({ trade: { name: 'Caravans' } }, 'trade')).toBe('Caravans')
    expect(typeDisplayName(types, 'gate')).toBeNull()
    expect(resolveHyperlineStyle({ type: 'trade', color: '0x010203' }, types).color).toBe(0x010203)
  })

  it('draws the sample map lines exactly as before the types took their style', () => {
    const before = {
      'gate-sol-asterion': [0x00ffff, 3, 0.7],
      'gate-sol-cinder': [0x00ffff, 3, 0.7],
      'trade-asterion-nacre': [0xffaa00, 2, 0.6],
      'military-asterion-cinder': [0x4444ff, 2, 0.65],
      'industrial-cinder-vesper': [0xff6600, 2, 0.65],
      'supply-vesper-pelagos': [0xaa00aa, 2, 0.55],
      'trade-nacre-pelagos': [0xffaa00, 2, 0.6],
      'gate-nacre-halcyon': [0xff00ff, 3, 0.7],
      'supply-pelagos-silent-reach': [0xaa00aa, 2, 0.55]
    }
    // A colour of its own on one line, over the colour of its type.
    const hyperlines = mapData.hyperlines.map(line => line.id === 'gate-nacre-halcyon' ? { ...line, color: '0xff00ff' } : line)
    const lines = applyHyperlineStyles(hyperlines, mapData.hyperlineTypes)
    expect(lines).toHaveLength(9)
    for (const line of lines) {
      expect([line.color, line.width, line.opacity], line.id).toEqual(before[line.id])
      expect(line.pulse, line.id).not.toBeNull()
    }
    expect(lines.find(line => line.id === 'supply-pelagos-silent-reach').direction).toBe('forward')
    expect(lines.filter(line => line.direction === 'both')).toHaveLength(8)
  })
})
