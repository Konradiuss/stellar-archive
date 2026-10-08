// A camera is { x, y, scale }: the world point at the screen centre and the zoom.
// It may look one sector past the map edge, never farther.

import { SECTOR_SIZE } from '../config/mapGeometry'

export const CAMERA_MARGIN = SECTOR_SIZE
// Closest zoom: about this many sectors across the screen width.
export const SECTORS_ACROSS_AT_MAX_ZOOM = 4
// How far past the edge a drag may stretch, in screen pixels.
export const RUBBER_BAND_LIMIT = 40

/** galaxy: { width, height } in world pixels; screen: { width, height } in screen pixels. */
export function cameraLimits(galaxy, screen) {
  const minScale = Math.min(
    screen.width / (galaxy.width + CAMERA_MARGIN * 2),
    screen.height / (galaxy.height + CAMERA_MARGIN * 2)
  )
  const maxScale = Math.max(minScale, screen.width / (SECTORS_ACROSS_AT_MAX_ZOOM * SECTOR_SIZE))
  return { minScale, maxScale }
}

export function clampScale(scale, limits) {
  return Math.min(limits.maxScale, Math.max(limits.minScale, scale))
}

// When the view is wider than the map with its margin, the map stays centred.
export function centerRange(size, screenSize, scale) {
  const half = screenSize / 2 / scale
  const low = -CAMERA_MARGIN + half
  const high = size + CAMERA_MARGIN - half
  return low <= high ? [low, high] : [size / 2, size / 2]
}

export function clampCamera(camera, galaxy, screen, limits = cameraLimits(galaxy, screen)) {
  const scale = clampScale(camera.scale, limits)
  const [minX, maxX] = centerRange(galaxy.width, screen.width, scale)
  const [minY, maxY] = centerRange(galaxy.height, screen.height, scale)
  return {
    x: Math.min(maxX, Math.max(minX, camera.x)),
    y: Math.min(maxY, Math.max(minY, camera.y)),
    scale
  }
}

export function fitCamera(galaxy, screen) {
  return { x: galaxy.width / 2, y: galaxy.height / 2, scale: cameraLimits(galaxy, screen).minScale }
}

export function worldToScreen(camera, screen, point) {
  return {
    x: (point.x - camera.x) * camera.scale + screen.width / 2,
    y: (point.y - camera.y) * camera.scale + screen.height / 2
  }
}

export function screenToWorld(camera, screen, point) {
  return {
    x: (point.x - screen.width / 2) / camera.scale + camera.x,
    y: (point.y - screen.height / 2) / camera.scale + camera.y
  }
}

export function cameraKeeping(world, anchor, scale, screen) {
  return {
    x: world.x - (anchor.x - screen.width / 2) / scale,
    y: world.y - (anchor.y - screen.height / 2) / scale,
    scale
  }
}

export function zoomAt(camera, factor, anchor, galaxy, screen, limits = cameraLimits(galaxy, screen)) {
  const world = screenToWorld(camera, screen, anchor)
  const scale = clampScale(camera.scale * factor, limits)
  return clampCamera(cameraKeeping(world, anchor, scale, screen), galaxy, screen, limits)
}

export function panBy(camera, dx, dy) {
  return { ...camera, x: camera.x - dx / camera.scale, y: camera.y - dy / camera.scale }
}

export function rubberBand(overshoot, limit = RUBBER_BAND_LIMIT) {
  if (!overshoot) return 0
  const stretched = limit * (1 - 1 / (Math.abs(overshoot) / limit + 1))
  return Math.sign(overshoot) * stretched
}

/** Past the bounds a drag stretches with resistance (screen pixels). */
export function stretchCamera(camera, galaxy, screen, limits = cameraLimits(galaxy, screen)) {
  const clamped = clampCamera(camera, galaxy, screen, limits)
  const overX = (camera.x - clamped.x) * clamped.scale
  const overY = (camera.y - clamped.y) * clamped.scale
  return {
    x: clamped.x + rubberBand(overX) / clamped.scale,
    y: clamped.y + rubberBand(overY) / clamped.scale,
    scale: clamped.scale
  }
}

// 1.0 shows the whole map.
export function relativeZoom(camera, limits) {
  return camera.scale / limits.minScale
}
