import { GALAXY_STAR_CORE_SIZE } from './starRenderer'

export const STAR_SNAP_RADIUS = 25
export const STAR_VISUAL_RADIUS = 30
export const STAR_CLICK_MOVE_TOLERANCE = 6
export const STAR_TARGET_MIN_SIZE = 24
export const STAR_TARGET_PADDING = 14

function resolveViewportScale(star) {
  const scale = Number(star?.viewportScale)
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

export function getStarTargetSize(star) {
  return Math.max(
    STAR_TARGET_MIN_SIZE,
    Math.round(GALAXY_STAR_CORE_SIZE * resolveViewportScale(star) + STAR_TARGET_PADDING)
  )
}

export function getStarInteractionRadius(
  star,
  minimumRadius = STAR_SNAP_RADIUS,
  visualRadius = STAR_VISUAL_RADIUS
) {
  return Math.max(minimumRadius, visualRadius * resolveViewportScale(star))
}

export function findStarAtPoint(stars, x, y) {
  let closestStar = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const star of stars || []) {
    const dx = star.screenX - x
    const dy = star.screenY - y
    const distance = Math.hypot(dx, dy)
    if (distance <= getStarInteractionRadius(star) && distance < closestDistance) {
      closestStar = star
      closestDistance = distance
    }
  }

  return closestStar
}

export function pointerMovedPastTolerance(start, event, tolerance = STAR_CLICK_MOVE_TOLERANCE) {
  if (!start || !event) return false
  return Math.hypot(event.clientX - start.x, event.clientY - start.y) > tolerance
}
