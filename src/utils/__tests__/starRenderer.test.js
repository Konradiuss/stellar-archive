import { describe, expect, it } from 'vitest'
import {
  createStarCircleMask,
  createStarVisualizationConfig,
  getStarRenderProfile,
  normalizeStarConfig,
  parseStarColor,
  renderStarFrame
} from '../starRenderer'

const sourceConfig = {
  size: 60,
  color1: '0xffdd00',
  color2: '0xffaa00',
  color3: '0xff8800'
}

describe('starRenderer', () => {
  it('normalizes numeric and string colors and derives a stable seed', () => {
    expect(parseStarColor('0xaaccff')).toEqual({ r: 170, g: 204, b: 255 })
    expect(parseStarColor(0xff4400)).toEqual({ r: 255, g: 68, b: 0 })

    const first = createStarVisualizationConfig({
      id: 'cinder',
      starVisualization: sourceConfig
    })
    const second = createStarVisualizationConfig({
      id: 'cinder',
      starVisualization: sourceConfig
    })

    expect(first.seed).toBe(second.seed)
    expect(first.surfaceColors).toHaveLength(4)
  })

  it('builds a circle mask symmetric on both axes', () => {
    const size = 60
    const mask = createStarCircleMask(size)

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const value = mask[y * size + x]
        expect(value).toBe(mask[y * size + (size - 1 - x)])
        expect(value).toBe(mask[(size - 1 - y) * size + x])
      }
    }
  })

  it('renders deterministic finite RGBA data with both visible layers', () => {
    const config = normalizeStarConfig(sourceConfig, 'sol')
    const profile = getStarRenderProfile()
    const first = renderStarFrame({ config, profile, time: 6 })
    const second = renderStarFrame({ config, profile, time: 6 })

    expect(first.data).toEqual(second.data)
    expect(first.layerPixelCounts.surface).toBeGreaterThan(0)
    expect(first.layerPixelCounts.blobs).toBeGreaterThan(0)
    for (const value of first.data) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(255)
    }
  })

  it('keeps a transparent safety border around the composite', () => {
    const config = normalizeStarConfig(sourceConfig, 'sol')
    const profile = getStarRenderProfile()
    const frame = renderStarFrame({ config, profile, time: 6 })
    const { width, height, data } = frame

    const alphaAt = (x, y) => data[(y * width + x) * 4 + 3]
    for (let x = 0; x < width; x++) {
      expect(alphaAt(x, 0)).toBe(0)
      expect(alphaAt(x, height - 1)).toBe(0)
    }
    for (let y = 0; y < height; y++) {
      expect(alphaAt(0, y)).toBe(0)
      expect(alphaAt(width - 1, y)).toBe(0)
    }
  })

  it('gives every star its own surface pattern', () => {
    const profile = getStarRenderProfile()
    const sol = normalizeStarConfig({ ...sourceConfig, rotation: 0, spinSpeed: 1 }, 'sol')
    const cinder = normalizeStarConfig({ ...sourceConfig, rotation: 0, spinSpeed: 1 }, 'cinder')
    const solFrame = renderStarFrame({ config: sol, profile, time: 6, layers: ['surface'] })
    const cinderFrame = renderStarFrame({ config: cinder, profile, time: 6, layers: ['surface'] })

    expect(sol.seed).not.toBe(cinder.seed)
    expect(solFrame.data).not.toEqual(cinderFrame.data)
  })

  it('derives a stable rotation and spin speed from the seed', () => {
    const first = normalizeStarConfig(sourceConfig, 'sol')
    const again = normalizeStarConfig(sourceConfig, 'sol')
    const other = normalizeStarConfig(sourceConfig, 'cinder')

    expect(again.rotation).toBe(first.rotation)
    expect(again.spinSpeed).toBe(first.spinSpeed)
    expect(other.rotation).not.toBe(first.rotation)
    expect(other.spinSpeed).not.toBe(first.spinSpeed)

    for (const config of [first, other]) {
      expect(config.rotation).toBeGreaterThanOrEqual(0)
      expect(config.rotation).toBeLessThan(Math.PI * 2)
      expect(config.spinSpeed).toBeGreaterThanOrEqual(0.6)
      expect(config.spinSpeed).toBeLessThanOrEqual(1.5)
    }
  })

  it('applies rotation in degrees and spin speed from the map data', () => {
    const config = normalizeStarConfig({ ...sourceConfig, rotation: 90, spinSpeed: 2 }, 'sol')

    expect(config.rotation).toBeCloseTo(Math.PI / 2)
    expect(config.spinSpeed).toBe(2)
  })

  it('animates the surface with the configured spin speed', () => {
    const profile = getStarRenderProfile()
    const slow = normalizeStarConfig({ ...sourceConfig, spinSpeed: 1 }, 'sol')
    const fast = normalizeStarConfig({ ...sourceConfig, spinSpeed: 2 }, 'sol')
    const render = (config, time) => renderStarFrame({ config, profile, time, layers: ['surface'] }).data

    expect(render(fast, 0)).toEqual(render(slow, 0))
    expect(render(fast, 6)).not.toEqual(render(slow, 6))
    expect(render(fast, 6)).toEqual(render(slow, 12))
  })

  it('uses the restrained galaxy profile without removing outer plasma', () => {
    const config = normalizeStarConfig(sourceConfig, 'sol')
    const profile = getStarRenderProfile({
      scale: 0.3,
      lowPerformance: true
    })
    const frame = renderStarFrame({ config, profile, time: 6 })

    expect(profile.coreDisplaySize).toBe(30)
    expect(profile.targetFps).toBe(12)
    expect(profile.blobFps).toBeLessThanOrEqual(profile.targetFps)
    expect(frame.corePixels).toBe(20)
    expect(frame.width).toBe(40)
    expect(frame.layerPixelCounts.blobs).toBeGreaterThan(0)
  })
})
