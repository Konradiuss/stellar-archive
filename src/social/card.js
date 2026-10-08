import { getSectorCenter } from '../config/mapGeometry'
import { CARD_HEIGHT, CARD_WIDTH } from './preview'

const FRAME = 16
const INNER = 30
const TEXT_LEFT = 64
// Press Start 2P is monospaced: a glyph is as wide as the font size.
const SUBTITLE_SIZE = 16
const SUBTITLE_LINE = 28
const SUBTITLE_LINES = 3
const SUBTITLE_WIDTH = 760
// Tiny5 is proportional: most of its glyphs are 6 pixels of 8 wide.
const TITLE_SIZES = [72, 56, 40]
const TITLE_ADVANCE = 0.75
const TITLE_WIDTH = 1060
const TITLE_LINES = 2
const STAR_SIZE = 8
const SHADE_CELL = 48
const SHADE_STEPS = [0.94, 0.88, 0.8, 0.68, 0.52, 0.34, 0.18, 0]
const SHADE_REACH_X = 0.95
const SHADE_REACH_Y = 1.1

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
const xml = value => String(value ?? '').replace(/[&<>"']/g, char => ESCAPES[char])

// '0x00aaff', '#0af' or a number → '#rrggbb'; `fallback` otherwise.
export function cssColor(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return `#${(value >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`
  const text = String(value ?? '').trim().replace(/^0x/i, '#')
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(text)) return `#${[...text.slice(1)].map(char => char + char).join('')}`.toLowerCase()
  return fallback
}

export function wrap(text, perLine, lines) {
  const all = []
  let line = ''
  for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    const piece = word.length > perLine ? `${word.slice(0, perLine - 1)}…` : word
    const next = line ? `${line} ${piece}` : piece
    if (next.length <= perLine) {
      line = next
    } else {
      all.push(line)
      line = piece
    }
  }
  if (line) all.push(line)
  if (all.length <= lines) return all
  const kept = all.slice(0, lines)
  kept[lines - 1] = `${kept[lines - 1].slice(0, perLine - 1).replace(/[\s,.;:—…-]+$/, '')}…`
  return kept
}

function titleLines(title) {
  for (const size of TITLE_SIZES) {
    const perLine = Math.floor(TITLE_WIDTH / (size * TITLE_ADVANCE))
    const lines = wrap(title, perLine, TITLE_LINES)
    if (!lines.some(line => line.endsWith('…'))) return { size, lines }
  }
  const size = TITLE_SIZES[TITLE_SIZES.length - 1]
  return { size, lines: wrap(title, Math.floor(TITLE_WIDTH / (size * TITLE_ADVANCE)), TITLE_LINES) }
}

const point = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`
const ring = points => `M${points.map(point).join('L')}Z`

// map: the built map (galaxy, territories, routedHyperlines, stars, factions); highlight: a star id.
export function cardSvg({ map, colors, title, subtitle = '', eyebrow = '', highlight = null }) {
  const screen = cssColor(colors?.screen, '#000000')
  const text = cssColor(colors?.text, '#ffffff')
  const dim = cssColor(colors?.dim, '#9a9a9a')
  const line = cssColor(colors?.line, '#555555')
  const accent = cssColor(colors?.accent, '#cfe0ff')

  const box = { x: INNER, y: INNER, width: CARD_WIDTH - INNER * 2, height: CARD_HEIGHT - INNER * 2 }
  const galaxy = map?.galaxy ?? { width: 1600, height: 900, columns: 16, rows: 9, sectorSize: 100 }
  const scale = Math.min(box.width / galaxy.width, box.height / galaxy.height)
  const offsetX = box.x + box.width - galaxy.width * scale
  const offsetY = box.y
  const at = (x, y) => [offsetX + x * scale, offsetY + y * scale]
  const sectorAt = (sectorX, sectorY) => {
    const center = getSectorCenter(sectorX, sectorY)
    return at(center.x, center.y)
  }

  const grid = []
  for (let column = 0; column <= galaxy.columns; column++) {
    const [x] = at(column * galaxy.sectorSize, 0)
    grid.push(`M${x.toFixed(1)} ${offsetY.toFixed(1)}V${(offsetY + galaxy.height * scale).toFixed(1)}`)
  }
  for (let row = 0; row <= galaxy.rows; row++) {
    const [, y] = at(0, row * galaxy.sectorSize)
    grid.push(`M${offsetX.toFixed(1)} ${y.toFixed(1)}H${(offsetX + galaxy.width * scale).toFixed(1)}`)
  }

  const territories = (map?.territories ?? []).map(territory => {
    const d = [territory.outer, ...(territory.holes ?? [])].map(loop => ring(loop.map(([x, y]) => at(x, y)))).join('')
    const fill = cssColor(territory.color, line)
    const stroke = cssColor(territory.borderColor, fill)
    const opacity = Math.min(0.35, Math.max(0.12, (territory.fillOpacity ?? 0.15) * 1.8))
    return `<path d="${d}" fill="${fill}" fill-opacity="${opacity.toFixed(2)}" fill-rule="evenodd" stroke="${stroke}" stroke-opacity="0.85" stroke-width="2" />`
  })

  const routes = (map?.routedHyperlines ?? []).filter(route => route.path?.length > 1).map(({ hyperline, path }) => {
    const points = path.map(node => point(sectorAt(node.x, node.y))).join(' ')
    const color = cssColor(hyperline.color, text)
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-opacity="${(hyperline.opacity ?? 0.7).toFixed(2)}" stroke-width="${Math.max(1.5, (hyperline.width ?? 2) * scale * 1.2).toFixed(1)}" stroke-linejoin="round" />`
  })

  const factions = map?.factions ?? {}
  const stars = (map?.stars ?? []).filter(star => Number.isFinite(star.sectorX) && Number.isFinite(star.sectorY)).map(star => {
    const [x, y] = sectorAt(star.sectorX, star.sectorY)
    const color = cssColor(star.starVisualization?.color1, cssColor(factions[star.faction]?.borderColor, text))
    return `<rect x="${(x - STAR_SIZE / 2).toFixed(0)}" y="${(y - STAR_SIZE / 2).toFixed(0)}" width="${STAR_SIZE}" height="${STAR_SIZE}" fill="${color}" />`
  })

  const marked = (map?.stars ?? []).find(star => star.id === highlight)
  let sights = ''
  if (marked && Number.isFinite(marked.sectorX)) {
    const [x, y] = sectorAt(marked.sectorX, marked.sectorY)
    const reach = 26
    const arm = 12
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => {
      const cx = x + sx * reach
      const cy = y + sy * reach
      return `M${(cx - sx * arm).toFixed(1)} ${cy.toFixed(1)}H${cx.toFixed(1)}V${(cy - sy * arm).toFixed(1)}`
    }).join('')
    sights = `<g class="sights"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="4 4" /><path d="${corners}" fill="none" stroke="${accent}" stroke-width="4" /></g>`
  }

  // In cells and steps, not a smooth gradient: thousands of colours made a card 180 KB, not 60.
  const shade = []
  for (let top = box.y; top < box.y + box.height; top += SHADE_CELL) {
    let run = null
    const flush = () => {
      if (run) shade.push(`<rect x="${run.x}" y="${top}" width="${run.width}" height="${Math.min(SHADE_CELL, box.y + box.height - top)}" fill-opacity="${run.opacity}" />`)
      run = null
    }
    for (let left = box.x; left < box.x + box.width; left += SHADE_CELL) {
      // 0 in the bottom left corner, 1 at the far edge of the shade.
      const along = ((left - box.x) / box.width) / SHADE_REACH_X + (1 - (top + SHADE_CELL - box.y) / box.height) / SHADE_REACH_Y
      const level = Math.min(SHADE_STEPS.length - 1, Math.floor(along * SHADE_STEPS.length))
      const opacity = SHADE_STEPS[level]
      const width = Math.min(SHADE_CELL, box.x + box.width - left)
      if (run && run.opacity === opacity) run.width += width
      else {
        flush()
        if (opacity > 0) run = { x: left, width, opacity }
      }
    }
    flush()
  }

  const subtitleLines = wrap(subtitle, Math.floor(SUBTITLE_WIDTH / SUBTITLE_SIZE), SUBTITLE_LINES)
  const { size: titleSize, lines: titleText } = titleLines(title)
  let baseline = CARD_HEIGHT - INNER - 34
  const texts = []
  for (const textLine of [...subtitleLines].reverse()) {
    texts.push(`<text x="${TEXT_LEFT}" y="${baseline}" font-family="Press Start 2P" font-size="${SUBTITLE_SIZE}" fill="${text}" fill-opacity="0.85">${xml(textLine)}</text>`)
    baseline -= SUBTITLE_LINE
  }
  baseline -= subtitleLines.length ? 18 : 0
  for (const textLine of [...titleText].reverse()) {
    texts.push(`<text x="${TEXT_LEFT - 4}" y="${baseline}" font-family="Tiny5" font-size="${titleSize}" fill="${text}">${xml(textLine)}</text>`)
    baseline -= Math.round(titleSize * 1.05)
  }
  if (eyebrow) texts.push(`<text x="${TEXT_LEFT}" y="${baseline + 6}" font-family="Press Start 2P" font-size="16" fill="${dim}">${xml(eyebrow.toUpperCase())}</text>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <clipPath id="screen"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" /></clipPath>
  </defs>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${screen}" />
  <g clip-path="url(#screen)">
    <path d="${grid.join('')}" stroke="${line}" stroke-opacity="0.35" stroke-width="1" />
    ${territories.join('\n    ')}
    ${routes.join('\n    ')}
    <g shape-rendering="crispEdges">${stars.join('')}</g>
    ${sights}
    <g fill="${screen}">${shade.join('')}</g>
  </g>
  <rect x="${FRAME}" y="${FRAME}" width="${CARD_WIDTH - FRAME * 2}" height="${CARD_HEIGHT - FRAME * 2}" fill="none" stroke="${line}" stroke-width="4" />
  <rect x="${INNER - 4}" y="${INNER - 4}" width="${CARD_WIDTH - (INNER - 4) * 2}" height="${CARD_HEIGHT - (INNER - 4) * 2}" fill="none" stroke="${text}" stroke-opacity="0.6" stroke-width="2" />
  ${texts.join('\n  ')}
</svg>
`
}
