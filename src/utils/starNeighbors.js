// Neighbours: the stars in the sector at the other end of every hyperline touching the star's sector.

const sectorKey = point => `${point?.sectorX},${point?.sectorY}`

export function findNeighborStars(stars, hyperlines, starId) {
  const star = (stars || []).find(item => item.id === starId)
  if (!star) return []

  const starsBySector = new Map()
  for (const item of stars) {
    const key = sectorKey(item)
    if (!starsBySector.has(key)) starsBySector.set(key, [])
    starsBySector.get(key).push(item)
  }

  const own = sectorKey(star)
  const neighbors = new Map()
  for (const hyperline of hyperlines || []) {
    const from = sectorKey(hyperline.from)
    const to = sectorKey(hyperline.to)
    if (from !== own && to !== own) continue
    const other = from === own ? to : from
    for (const neighbor of starsBySector.get(other) || []) {
      if (neighbor.id === starId || neighbors.has(neighbor.id)) continue
      neighbors.set(neighbor.id, { star: neighbor, hyperline })
    }
  }

  return [...neighbors.values()].sort((a, b) => String(a.star.name).localeCompare(String(b.star.name)))
}
