// Cells lie symmetrically around the centre and are tested at their middle:
// a grid anchored at the canvas corner shifted round shapes by a cell.

/** start: canvas coordinate of the cell; offset: from the centre to the cell middle. */
export function centeredCells(center, extent, pixelSize, limit = Infinity) {
  const origin = Math.round(center)
  const count = Math.ceil(extent / pixelSize)
  const cells = []
  for (let index = -count; index < count; index++) {
    const start = origin + index * pixelSize
    if (start + pixelSize <= 0 || start >= limit) continue
    cells.push({ start, offset: (index + 0.5) * pixelSize })
  }
  return cells
}
