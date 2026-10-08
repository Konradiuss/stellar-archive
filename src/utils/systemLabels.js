// A planet is { sprite, centerX, label, labelContainer, leader, … } as SystemView builds it.

import * as PIXI from 'pixi.js'
import { formatSector } from '../config/mapGeometry'
import { themeNumber } from '../theme'
import { t } from '../i18n'
import { PIXEL_FONT } from './fontLoader'

// HUD leader line: 45° from the disc edge to a knee, then a horizontal shelf to the text.
const LEADER_START = 6 // px from the planet centre on each axis, just past the disc
const LEADER_RISE = 10
const LEADER_RUN = 6
const LEADER_GAP = 3
const LABEL_MARGIN = 6

// screen: { width, height } of the canvas.
export function placePlanetLabel(planet, screen) {
  if (!planet.label || !planet.labelContainer || !screen) return

  const dx = planet.sprite.x - planet.centerX
  const preferredSide = dx >= 0 ? 1 : -1
  const labelHalfWidth = planet.labelWidth / 2
  const labelHalfHeight = planet.label.height / 2
  const labelY = Math.round(Math.max(
    LABEL_MARGIN + labelHalfHeight,
    Math.min(screen.height - LABEL_MARGIN - labelHalfHeight, planet.sprite.y - LEADER_RISE)
  ) - planet.sprite.y)
  const startY = labelY < 0 ? -LEADER_START : LEADER_START
  const kneeOffset = LEADER_START + Math.abs(labelY - startY)
  const labelOffset = kneeOffset + LEADER_RUN + LEADER_GAP + labelHalfWidth
  const fitsOnSide = side => {
    const labelX = planet.sprite.x + side * labelOffset
    return (
      labelX - labelHalfWidth >= LABEL_MARGIN &&
      labelX + labelHalfWidth <= screen.width - LABEL_MARGIN
    )
  }
  const side = fitsOnSide(preferredSide) ? preferredSide : -preferredSide

  if (planet.labelSide !== null && planet.labelSide !== side) {
    planet.labelTypingElapsed = 0
    planet.labelTypedCharacters = 0
    planet.label.text = '_'
  }
  planet.labelSide = side

  planet.label.x = side * labelOffset
  planet.label.y = labelY
  drawPlanetLeader(planet, side, startY, kneeOffset, labelY)
}

function drawPlanetLeader(planet, side, startY, kneeOffset, labelY) {
  const key = `${side}:${labelY}:${planet.isSelected}`
  if (planet.leaderKey === key) return
  planet.leaderKey = key
  planet.leader
    .clear()
    .moveTo(side * LEADER_START, startY)
    .lineTo(side * kneeOffset, labelY)
    .lineTo(side * (kneeOffset + LEADER_RUN), labelY)
    .stroke({
      width: 1,
      color: planet.isSelected ? themeNumber('text') : planet.labelColor,
      alpha: planet.isSelected ? 1 : 0.75,
      pixelLine: true
    })
}

export function typePlanetLabel(planet, deltaMs) {
  if (planet.labelTypedCharacters === null) return

  const characterDelay = 45
  planet.labelTypingElapsed += deltaMs
  const visibleCharacters = Math.min(
    planet.labelText.length,
    Math.floor(planet.labelTypingElapsed / characterDelay)
  )

  if (visibleCharacters === planet.labelTypedCharacters) return

  planet.labelTypedCharacters = visibleCharacters
  if (visibleCharacters >= planet.labelText.length) {
    planet.label.text = planet.labelText
    planet.labelTypedCharacters = null
    return
  }

  planet.label.text = planet.labelText.slice(0, visibleCharacters) + '_'
}

export function pixelTextStyle(fontSize, fill) {
  return {
    fontFamily: PIXEL_FONT,
    fontSize,
    fill,
    stroke: { color: themeNumber('screen'), width: 4, join: 'miter' },
    dropShadow: { color: themeNumber('screen'), alpha: 1, blur: 0, distance: 2, angle: Math.PI / 2 }
  }
}

export function createStarCaption(star, planetCount) {
  const caption = new PIXI.Container()
  const title = new PIXI.Text({ text: String(star.name).toUpperCase(), style: pixelTextStyle(12, themeNumber('text')) })
  title.anchor.set(0.5, 0)

  const hasSector = Number.isFinite(star.sectorX) && Number.isFinite(star.sectorY)
  const count = planetCount ? t('galaxy.planets', { count: planetCount }) : t('galaxy.noPlanets')
  const subtitle = new PIXI.Text({
    text: hasSector ? t('galaxy.sector', { sector: formatSector(star.sectorX, star.sectorY), planets: count }) : count,
    style: pixelTextStyle(8, themeNumber('dim'))
  })
  subtitle.anchor.set(0.5, 0)
  subtitle.y = Math.round(title.height + 2)

  const padding = 8
  const arm = 6
  const halfWidth = Math.round(Math.max(title.width, subtitle.width) / 2 + padding)
  const top = -padding
  const bottom = Math.round(subtitle.y + subtitle.height + padding - 2)
  const corners = new PIXI.Graphics()
  for (const x of [-halfWidth, halfWidth - 2]) {
    for (const y of [top, bottom - 2]) {
      const armX = x < 0 ? x : x - arm + 2
      const armY = y < 0 ? y : y - arm + 2
      corners.rect(armX, y, arm, 2).rect(x, armY, 2, arm)
    }
  }
  corners.fill({ color: themeNumber('text'), alpha: 0.85 })

  caption.addChild(corners, title, subtitle)
  return caption
}
