function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

export function createViewportClipPath(bounds, viewportWidth, viewportHeight) {
  if (!bounds) return 'none'

  const width = Math.max(0, finiteOr(viewportWidth, 0))
  const height = Math.max(0, finiteOr(viewportHeight, 0))
  const top = Math.max(0, finiteOr(bounds.top, 0))
  const right = Math.max(0, width - finiteOr(bounds.right, width))
  const bottom = Math.max(0, height - finiteOr(bounds.bottom, height))
  const left = Math.max(0, finiteOr(bounds.left, 0))

  return `inset(${top}px ${right}px ${bottom}px ${left}px)`
}
