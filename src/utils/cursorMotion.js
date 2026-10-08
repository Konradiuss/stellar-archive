// Raw mouse positions judder (they arrive at their own rate, not once a frame);
// a short easing hides that without lagging behind the hand.

// Time constant, ms: the follow covers ~63% of the way in this time.
export const FOLLOW_MS = 30

// px: no endless creep by fractions of a pixel.
const ARRIVED_PX = 0.01

/** Frame-rate independent: one long frame equals two short ones. tauMs 0 jumps at once. */
export function followStep(current, target, dtMs, tauMs = FOLLOW_MS) {
  if (tauMs <= 0 || Math.abs(target - current) < ARRIVED_PX) return target
  const next = current + (target - current) * (1 - Math.exp(-Math.max(0, dtMs) / tauMs))
  return Math.abs(target - next) < ARRIVED_PX ? target : next
}

/** Snapped to device pixels: whole CSS pixels made the cursor stick, then jump, at 125-150% scale. */
export function toDevicePixel(value, dpr = 1) {
  const ratio = dpr > 0 ? dpr : 1
  return Math.round(value * ratio) / ratio
}
