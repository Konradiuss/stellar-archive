import { clamp } from './math'

// The star is drawn over the canvas: the caption stays at least this far below its centre.
export const STAR_CAPTION_CLEARANCE = 80
export const STAR_CAPTION_GAP = 30

export function starCaptionY(centerY, outermostOrbitPx = 0) {
  return centerY + Math.max(outermostOrbitPx, STAR_CAPTION_CLEARANCE) + STAR_CAPTION_GAP
}

// px, at full size (StarVisualization, scale 1).
export const STAR_CORE_RADIUS = 50
export const MIN_STAR_SCALE = 0.3
// Steps, so the star is not redrawn at every pixel of a resize.
const STAR_SCALE_STEP = 0.05

// The star shrinks with the orbits so the innermost planet (`clearance`: its disc and a gap)
// stays clear of its core.
export function starScaleFor(innermostOrbitPx, clearance = 0) {
  if (!(innermostOrbitPx > 0)) return 1
  const scale = Math.floor((innermostOrbitPx - clearance) / STAR_CORE_RADIUS / STAR_SCALE_STEP) * STAR_SCALE_STEP
  return clamp(Math.round(scale * 100) / 100, MIN_STAR_SCALE, 1)
}

/**
 * Orbit radius → px, the outermost orbit at `outerPx`. Linear while the innermost orbit clears the
 * smallest star; otherwise the orbits are spread between that edge and `outerPx`, in their order.
 */
export function orbitScaler(orbits, outerPx, clearance = 0) {
  const radii = orbits.filter(radius => radius > 0)
  if (!radii.length) return () => 0
  const inner = Math.min(...radii)
  const outer = Math.max(...radii)
  const scale = outerPx / outer
  const edge = STAR_CORE_RADIUS * MIN_STAR_SCALE + clearance
  if (inner * scale >= edge || inner === outer || outerPx <= edge) return radius => radius * scale
  const spread = (outerPx - edge) / (outer - inner)
  return radius => edge + (radius - inner) * spread
}

// Caption height with its corners, from its top.
export const STAR_CAPTION_HEIGHT = 40
// Field around the orbits, at most; a small canvas gives a tenth of its size.
const ORBIT_FIELD = 50
const CORNER_INSET = 12

/**
 * The caption stands under the orbits; on a canvas too short for that (a phone on its side) it goes
 * to the bottom left corner (`caption`: the point it is placed by) and the orbits take the whole height.
 */
export function orbitArea(width, height, captionWidth = 0) {
  const side = Math.min(ORBIT_FIELD, width * 0.1)
  const top = Math.min(ORBIT_FIELD, height * 0.1)
  const under = STAR_CAPTION_GAP + STAR_CAPTION_HEIGHT

  const below = Math.max(0, Math.min(width - 2 * side, height - 2 * top - under))
  const reach = Math.max(below / 2, STAR_CAPTION_CLEARANCE)
  const group = below / 2 + reach + under
  const belowLayout = {
    centerX: width / 2,
    centerY: Math.max(top + below / 2, (height - group) / 2 + below / 2),
    size: below,
    caption: null
  }

  const corner = Math.max(0, Math.min(width - 2 * side - captionWidth, height - 2 * top))
  if (width <= height || corner <= below * 1.25) return belowLayout
  const captionRight = CORNER_INSET + captionWidth
  return {
    centerX: Math.max(width / 2, captionRight + side + corner / 2),
    centerY: height / 2,
    size: corner,
    caption: { x: CORNER_INSET + captionWidth / 2, y: height - CORNER_INSET - STAR_CAPTION_HEIGHT }
  }
}
