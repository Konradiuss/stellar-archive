import { warnMap } from '../utils/mapJournal'

export const SECTOR_SIZE = 100
// Size of a map without a `galaxy` section.
export const MAP_COLUMNS = 16
export const MAP_ROWS = 9
export const WORLD_WIDTH = MAP_COLUMNS * SECTOR_SIZE
export const WORLD_HEIGHT = MAP_ROWS * SECTOR_SIZE
export const TERRITORY_GRID_STEP = 5
export const MAX_GALAXY_SECTORS = 100

export function getSectorCenter(sectorX, sectorY) {
  return {
    x: sectorX * SECTOR_SIZE + SECTOR_SIZE / 2,
    y: sectorY * SECTOR_SIZE + SECTOR_SIZE / 2
  }
}

// A sector as the screens write it: 2, 5 → "02:05".
export function formatSector(x, y) {
  const twoDigits = value => String(value).padStart(2, '0')
  return `${twoDigits(x)}:${twoDigits(y)}`
}

export function createGalaxyGeometry(columns = MAP_COLUMNS, rows = MAP_ROWS) {
  return {
    columns,
    rows,
    sectorSize: SECTOR_SIZE,
    width: columns * SECTOR_SIZE,
    height: rows * SECTOR_SIZE
  }
}

export const DEFAULT_GALAXY = Object.freeze(createGalaxyGeometry())

function sectorCount(value, fallback) {
  if (value === null || value === '' || typeof value === 'boolean') return fallback
  const count = Number(value)
  if (!Number.isFinite(count)) return fallback
  return Math.min(MAX_GALAXY_SECTORS, Math.max(1, Math.round(count)))
}

// A star outside the given size widens the map: a typo in the size never loses a star.
export function normalizeGalaxyConfig(raw = {}, stars = []) {
  let columns = sectorCount(raw?.columns, MAP_COLUMNS)
  let rows = sectorCount(raw?.rows, MAP_ROWS)

  for (const star of stars) {
    const x = Number(star?.sectorX)
    const y = Number(star?.sectorY)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (x < columns && y < rows) continue
    warnMap(`stars "${star.name ?? star.id}"`, `Sector ${x},${y} is outside the galaxy of ${columns}x${rows} sectors ("galaxy"): the map grows to fit it.`)
    columns = Math.min(MAX_GALAXY_SECTORS, Math.max(columns, x + 1))
    rows = Math.min(MAX_GALAXY_SECTORS, Math.max(rows, y + 1))
  }

  return createGalaxyGeometry(columns, rows)
}
