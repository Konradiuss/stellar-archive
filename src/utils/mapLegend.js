import { resolveHyperlineStyle, typeDisplayName } from './hyperlineStyle'
import { getSatellites } from './satellites'
import { BUILT_IN_TYPES } from './hyperlineStyle'
import { t } from '../i18n'
import { cssColor } from './color'

export { cssColor }

const sameSector = (point, star) => point?.sectorX === star.sectorX && point?.sectorY === star.sectorY

function factionRow(id, faction, count) {
  return {
    kind: 'faction',
    id,
    name: faction?.name || id,
    border: cssColor(faction?.borderColor) ?? cssColor(faction?.fillColor) ?? '#ffffff',
    fill: cssColor(faction?.fillColor) ?? cssColor(faction?.borderColor) ?? '#ffffff',
    count
  }
}

function lineRow(hyperline, name, types) {
  const style = resolveHyperlineStyle(hyperline, types)
  return {
    kind: 'line',
    name,
    color: cssColor(style.color) ?? '#ffffff',
    width: Math.max(1, Math.min(4, style.width))
  }
}

export function hyperlineTypeName(type, types) {
  return typeDisplayName(types, type) || (Object.hasOwn(BUILT_IN_TYPES, type) ? t(`hyperlineTypes.${type}`) : type)
}

function galaxySections({ stars = [], factions = {}, hyperlines = [], hyperlineTypes = null, legendDoc = null }) {
  const counts = new Map()
  stars.forEach(star => counts.set(star.faction ?? null, (counts.get(star.faction ?? null) ?? 0) + 1))
  const factionRows = Object.entries(factions).map(([id, faction]) => factionRow(id, faction, counts.get(id) ?? 0))
  const unknown = stars.filter(star => !star.faction || !factions[star.faction]).length
  if (unknown) factionRows.push({ kind: 'faction', id: null, name: t('legend.noFaction'), border: '#9a9a9a', fill: '#9a9a9a', count: unknown })

  const types = new Map()
  hyperlines.forEach(hyperline => {
    const type = hyperline.type || 'other'
    if (!types.has(type)) types.set(type, lineRow(hyperline, hyperlineTypeName(type, hyperlineTypes), hyperlineTypes))
  })

  const sections = [
    { id: 'factions', title: t('legend.factions'), rows: factionRows },
    { id: 'lines', title: t('legend.hyperlines'), rows: [...types.values()] },
    {
      id: 'signs',
      title: t('legend.signs'),
      rows: [
        { kind: 'star', name: t('legend.star') },
        { kind: 'hidden-name', name: t('legend.hiddenName') },
        { kind: 'uncharted', name: t('legend.uncharted') }
      ]
    }
  ]
  if (legendDoc) sections.push({ id: 'note', title: t('legend.note'), doc: legendDoc })
  return sections.filter(section => section.doc || section.rows.length)
}

function systemSections({ stars = [], factions = {}, hyperlines = [], hyperlineTypes = null, systems = {} }, starId) {
  const star = stars.find(item => item.id === starId)
  if (!star) return []
  const system = systems[starId] ?? {}
  const planets = system.planets?.length ?? 0
  const bodies = (system.planets ?? []).flatMap(planet => getSatellites(planet))
  const satellites = bodies.filter(body => body.kind === 'moon').length
  const stations = bodies.filter(body => body.kind === 'station').length

  const about = [{ kind: 'star', name: star.name }]
  if (star.faction) about.push(factionRow(star.faction, factions[star.faction], null))
  about.push({ kind: 'count', id: 'planets', name: t('legend.planets'), count: planets })
  if (satellites) about.push({ kind: 'count', id: 'satellites', name: t('legend.moons'), count: satellites })
  if (stations) about.push({ kind: 'count', id: 'stations', name: t('legend.stations'), count: stations })

  const links = hyperlines
    .filter(hyperline => sameSector(hyperline.from, star) || sameSector(hyperline.to, star))
    .map(hyperline => {
      const other = sameSector(hyperline.from, star) ? hyperline.to : hyperline.from
      const target = stars.find(item => sameSector(other, item))
      return { ...lineRow(hyperline, hyperlineTypeName(hyperline.type || 'other', hyperlineTypes), hyperlineTypes), target: target?.name ?? '??' }
    })

  const sections = [
    { id: 'system', title: t('legend.system'), rows: about },
    { id: 'links', title: t('legend.links'), rows: links },
    {
      id: 'signs',
      title: t('legend.signs'),
      rows: [
        { kind: 'orbit', name: t('legend.planetOrbit') },
        { kind: 'planet', name: t('legend.planet') },
        ...(satellites ? [{ kind: 'satellite', name: t('legend.moonOrbit') }] : []),
        ...(stations ? [{ kind: 'station', name: t('legend.station') }] : []),
        { kind: 'target', name: t('legend.selectedPlanet') }
      ]
    }
  ]
  if (system.legendDoc) sections.push({ id: 'note', title: t('legend.note'), doc: system.legendDoc })
  return sections.filter(section => section.doc || section.rows.length)
}

/**
 * [{ id, title, rows }] or a note { id, title, doc }.
 * map: { stars, factions, hyperlines, hyperlineTypes, systems, legendDoc };
 * view: 'galaxy' or 'system' (with starId).
 */
export function buildLegend(map, { view = 'galaxy', starId = null } = {}) {
  return view === 'system' && starId ? systemSections(map, starId) : galaxySections(map)
}
