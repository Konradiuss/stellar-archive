// In the order the screens log them; a map may override any line ("strings": { "loader" }).

export const LOADER_GROUPS = Object.freeze([
  { id: 'boot', keys: ['loadingCatalog', 'checkingMap', 'loadingArchives', 'buildingTerritories', 'initRenderer', 'drawingMap', 'routingHyperlines', 'ignitingStars'] },
  { id: 'system', keys: ['openingSystem', 'calculatingOrbits', 'renderingPlanets'] },
  { id: 'galaxy', keys: ['openingGalaxy', 'resumingMap'] },
  { id: 'wiki', keys: ['openingArticle', 'openingWiki', 'mountingWiki'] }
])

export const LOADER_LINE_KEYS = Object.freeze(LOADER_GROUPS.flatMap(group => group.keys.map(key => `loader.${key}`)))

/** Longest line a phone shows whole: 11px font there (CrtScreen.vue), with "> " and " OK" around it. */
export const LOADER_LONG_LINE = 40

export const LOADER_LABEL_WIDTH = 28

export function padLoaderLabel(label) {
  return label.length >= LOADER_LABEL_WIDTH
    ? label
    : `${label} ${'.'.repeat(LOADER_LABEL_WIDTH - label.length - 1)}`
}
