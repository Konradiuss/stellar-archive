import { describe, expect, it } from 'vitest'
import { createGalaxyGeometry } from '../../config/mapGeometry.js'
import {
  CAMERA_MARGIN,
  RUBBER_BAND_LIMIT,
  cameraLimits,
  clampCamera,
  fitCamera,
  rubberBand,
  screenToWorld,
  stretchCamera,
  worldToScreen,
  zoomAt
} from '../galaxyCamera.js'

const screen = { width: 1218, height: 648 }
const galaxies = {
  'default 16x9': createGalaxyGeometry(16, 9),
  'big 24x14': createGalaxyGeometry(24, 14),
  'small 4x3': createGalaxyGeometry(4, 3)
}

function visibleRect(camera) {
  const topLeft = screenToWorld(camera, screen, { x: 0, y: 0 })
  const bottomRight = screenToWorld(camera, screen, { x: screen.width, y: screen.height })
  return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y }
}

describe.each(Object.entries(galaxies))('galaxy camera on a %s map', (_, galaxy) => {
  const limits = cameraLimits(galaxy, screen)

  it('zooms out to the whole map and one sector around it, no farther', () => {
    const view = visibleRect(clampCamera({ x: 0, y: 0, scale: 0.0001 }, galaxy, screen))
    expect(view.left).toBeLessThanOrEqual(0)
    expect(view.right).toBeGreaterThanOrEqual(galaxy.width)
    expect(view.top).toBeLessThanOrEqual(0)
    expect(view.bottom).toBeGreaterThanOrEqual(galaxy.height)
    const marginX = (view.right - view.left - galaxy.width) / 2
    const marginY = (view.bottom - view.top - galaxy.height) / 2
    expect(Math.min(marginX, marginY)).toBeCloseTo(CAMERA_MARGIN, 6)
  })

  it('zooms in to about four sectors across the screen', () => {
    const view = visibleRect(clampCamera({ x: 500, y: 300, scale: 100 }, galaxy, screen))
    expect(view.right - view.left).toBeCloseTo(Math.min(400, galaxy.width + 2 * CAMERA_MARGIN), 0)
  })

  // Was: at some zoom levels parts of the map could not be reached.
  it('reaches every edge of the map at every zoom', () => {
    for (let step = 0; step <= 10; step++) {
      const scale = limits.minScale * (limits.maxScale / limits.minScale) ** (step / 10)
      const corners = [[-1e6, -1e6], [1e6, -1e6], [-1e6, 1e6], [1e6, 1e6]]
      for (const [x, y] of corners) {
        const view = visibleRect(clampCamera({ x, y, scale }, galaxy, screen))
        if (x < 0) expect(view.left).toBeLessThanOrEqual(0)
        else expect(view.right).toBeGreaterThanOrEqual(galaxy.width)
        if (y < 0) expect(view.top).toBeLessThanOrEqual(0)
        else expect(view.bottom).toBeGreaterThanOrEqual(galaxy.height)
        expect(view.left).toBeGreaterThanOrEqual(Math.min(-CAMERA_MARGIN, (galaxy.width - (view.right - view.left)) / 2) - 1e-6)
        expect(view.top).toBeGreaterThanOrEqual(Math.min(-CAMERA_MARGIN, (galaxy.height - (view.bottom - view.top)) / 2) - 1e-6)
      }
    }
  })

  it('keeps the point under the cursor while zooming in', () => {
    const camera = { x: galaxy.width / 2, y: galaxy.height / 2, scale: limits.maxScale / 1.3 }
    const cursor = { x: screen.width * 0.5 + 40, y: screen.height * 0.5 - 30 }
    const before = screenToWorld(camera, screen, cursor)
    const zoomed = zoomAt(camera, 1.3, cursor, galaxy, screen)
    const after = worldToScreen(zoomed, screen, before)
    expect(zoomed.scale).toBeGreaterThan(camera.scale)
    expect(after.x).toBeCloseTo(cursor.x, 6)
    expect(after.y).toBeCloseTo(cursor.y, 6)
  })
})

describe('galaxy camera', () => {
  it('centres a map that is narrower than the screen on an axis', () => {
    const galaxy = galaxies['small 4x3']
    const camera = clampCamera({ x: -500, y: 900, scale: cameraLimits(galaxy, screen).minScale }, galaxy, screen)
    expect(camera.x).toBe(galaxy.width / 2)
    expect(camera.y).toBe(galaxy.height / 2)
  })

  it('stretches a drag past the edge with resistance, not further than the limit', () => {
    expect(rubberBand(0)).toBe(0)
    expect(rubberBand(10)).toBeLessThan(10)
    expect(rubberBand(1e6)).toBeLessThan(RUBBER_BAND_LIMIT)
    expect(rubberBand(-1e6)).toBeGreaterThan(-RUBBER_BAND_LIMIT)
    const galaxy = galaxies['default 16x9']
    const limits = cameraLimits(galaxy, screen)
    const inside = clampCamera({ x: 0, y: 0, scale: limits.maxScale }, galaxy, screen)
    const stretched = stretchCamera({ ...inside, x: inside.x - 5000 }, galaxy, screen)
    expect((inside.x - stretched.x) * inside.scale).toBeGreaterThan(0)
    expect((inside.x - stretched.x) * inside.scale).toBeLessThan(RUBBER_BAND_LIMIT)
  })

  it('opens on the whole map', () => {
    const galaxy = galaxies['big 24x14']
    const view = visibleRect(fitCamera(galaxy, screen))
    expect(view.left).toBeLessThan(0)
    expect(view.right).toBeGreaterThan(galaxy.width)
  })
})
