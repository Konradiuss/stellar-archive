<template>
  <div
    ref="containerRef"
    class="galaxy-view"
    @pointerdown.capture="handleGalaxyPointerDown"
    @pointermove.capture="handleGalaxyPointerMove"
    @pointerup.capture="handleGalaxyPointerUp"
    @pointercancel.capture="handleGalaxyPointerCancel"
    @pointerleave="handleGalaxyPointerLeave"
  >
    <div
      v-for="star in galaxyStars"
      :key="star.id"
      class="galaxy-star-container"
      :data-star-id="star.id"
      :data-label="star.label"
      :data-label-open="star.labelOpen ? 'true' : null"
      :data-label-typed="star.labelTyped"
      :style="{
        left: star.screenX + 'px',
        top: star.screenY + 'px',
        transform: `translate(-50%, -50%) scale(${star.viewportScale || 1})`
      }"
    >
      <StarVisualization :starConfig="star.config" :scale="0.3" :lowPerformance="true" />
    </div>

    <GalaxyZoomHud
      v-if="isReady"
      :zoom="camera.hud.zoom"
      :can-zoom-in="camera.hud.canZoomIn"
      :can-zoom-out="camera.hud.canZoomOut"
      @zoom-in="camera.zoomBy(KEY_ZOOM_FACTOR)"
      @zoom-out="camera.zoomBy(1 / KEY_ZOOM_FACTOR)"
    />
  </div>
</template>

<script setup>
import { ref, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, watch } from 'vue'
import * as PIXI from 'pixi.js'
import { useMapStore } from '../stores/mapStore'
import { useUIStore } from '../stores/uiStore'
import { SECTOR_SIZE, getSectorCenter as sectorCenter } from '../config/mapGeometry'
import { getSegmentKey as getRouteSegmentKey } from '../utils/hyperlineRouter'
import {
  UNCHARTED_FOG_COLORS,
  seedFromText,
  unchartedFog,
  unchartedGridSegments,
  unchartedRings,
  unchartedSectorLabels
} from '../utils/unchartedSpace'
import { findStarAtPoint, getStarTargetSize, pointerMovedPastTolerance } from '../utils/starInteraction'
import { createStarVisualizationConfig } from '../utils/starRenderer'
import { createFuzzFilter, setFuzzTime } from '../utils/fuzzFilter'
import { LABEL_GAP_FROM_CENTER, polylineSegments, resolveLabelSpace, stepTyping, typedLabel } from '../utils/starLabels'
import { fillFuzzLevels } from '../utils/fuzzCycle'
import { measurePath, pointAt, pulsePositions } from '../utils/hyperlinePulses'
import { nextFrame } from '../utils/nextFrame'
import { PIXEL_FONT, loadPixelFont } from '../utils/fontLoader'
import { rebuildOnContextRestore } from '../utils/webglContext'
import { playSound } from '../sound'
import { prefersReducedMotion } from '../utils/reducedMotion'
import { isTypingTarget } from '../utils/keyboard'
import { readStoredValue, writeStoredValue } from '../composables/usePersistentState'
import { KEY_ZOOM_FACTOR, useGalaxyCamera } from '../composables/useGalaxyCamera'
import StarVisualization from './StarVisualization.vue'
import GalaxyZoomHud from './GalaxyZoomHud.vue'
import { themeMixNumber, themeNumber } from '../theme'

// The name lets App's <KeepAlive include> keep this view alive while a system is open.
defineOptions({ name: 'GalaxyView' })

const CAMERA_STORAGE_KEY = 'galaxy-camera'
// The fog of uncharted space never gets bigger than about this many texels.
const MAX_FOG_TEXELS = 1_200_000
// Ripple of uncharted space: band height in world pixels, the wave's
// sideways reach in screen pixels, its speed and the phase step between bands.
const RIPPLE_BAND = SECTOR_SIZE / 2
const RIPPLE_AMPLITUDE = 2
const RIPPLE_SPEED = 2.2
const RIPPLE_STEP = 0.55
// Rows of screen pixels jitter as in vue-bits FuzzyText (its default intensity
// and range, about ±3 px), rerolled FUZZ_FPS times a second; each sector cell
// flares on its own (utils/fuzzCycle.js).
const FUZZ_INTENSITY = 0.18
const FUZZ_RANGE = 30
const FUZZ_FPS = 30
// Pulses on hyperlines: tail squares behind the head, and how far from each
// end a pulse fades in and out (it leaves from under the star).
const PULSE_TAIL = 4
const PULSE_EDGE_FADE = 14

const containerRef = ref(null)
const mapStore = useMapStore()
const uiStore = useUIStore()

let app = null
let world = null
let backgroundStars = []
let hyperlineGlows = []
// { graphics, path, color, head, width, direction, pulse, phase }
let hyperlinePulses = []
let rippleBands = []
let fuzzFilter = null
// One texel per sector, redrawn FUZZ_FPS times a second.
let fuzzMap = null // { canvas, context, image, texture, columns, rows, origin, seed, frame }
// By star id: { text, marker, hidden, lines, total, typed, target }. A hidden
// name (no room) shows "..." and is typed in while the pointer is on its star.
let labelViews = new Map()
let hoveredStarId = null
let sectorNumbers = null
let fogTexture = null
const galaxyStars = ref([])
let pointerGesture = null
let lastPointer = null // in container coordinates

let resizeObserver = null
let isBuilt = false
let isUnmounted = false
// app.init() has finished: only then can the app be destroyed.
let appReady = false
let builtRings = 0
let rebuildTimer = null
const isReady = ref(false)

function screenSize() {
  return {
    width: containerRef.value?.clientWidth || app?.screen.width || 1,
    height: containerRef.value?.clientHeight || app?.screen.height || 1
  }
}

const camera = useGalaxyCamera({
  getGalaxy: () => mapStore.galaxy,
  getScreen: screenSize,
  onSettle: settled => writeStoredValue(CAMERA_STORAGE_KEY, settled)
})

onMounted(async () => {
  try {
    await buildGalaxy()
  } catch (error) {
    console.error('Failed to build the galaxy map:', error)
    uiStore.failLoading('loader.rendererFailure')
  }
})

onUnmounted(() => {
  isUnmounted = true
  clearTimeout(rebuildTimer)
  resizeObserver?.disconnect()
  containerRef.value?.removeEventListener('wheel', handleWheel)
  listenToKeys(false)
  // Pixi 8 cannot destroy an Application whose init() has not finished:
  // initPixi destroys it then.
  if (app && appReady) destroyApp()
})

function destroyApp() {
  // Keep Pixi's global resources: they are shared with SYSTEM-VIEW.EXE.
  app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true, texture: true })
  fuzzFilter?.destroy()
  fuzzFilter = null
}

onActivated(async () => {
  if (!isBuilt) return
  uiStore.logLoadingStep('loader.openingGalaxy')
  uiStore.logLoadingStep('loader.resumingMap')
  listenToKeys(true)
  refreshViewportSize()
  app.start()
  await waitForPaint()
  uiStore.markViewReady('galaxy')
})

onDeactivated(() => {
  pointerGesture = null
  lastPointer = null
  setHoveredStar(null)
  listenToKeys(false)
  uiStore.clearCursorTarget()
  uiStore.setCursorMode(null)
  if (isBuilt) app.stop()
})

watch(() => mapStore.stars, () => {
  if (isBuilt) renderGalaxy()
}, { deep: true })

watch(() => mapStore.territories, () => {
  if (isBuilt) renderGalaxy()
}, { deep: true })

async function buildGalaxy() {
  const pixiReady = initPixi()
  await mapStore.whenLoaded()
  if (isUnmounted) return

  uiStore.logLoadingStep('loader.initRenderer')
  await Promise.all([pixiReady, loadPixelFont()])
  if (isUnmounted) return

  await renderGalaxy(async (key, params) => {
    if (key) uiStore.logLoadingStep(key, params)
    await nextFrame()
  })
  if (isUnmounted) return

  restoreCamera()
  isBuilt = true
  isReady.value = true
  listenToKeys(true)
  await waitForPaint()
  if (!isUnmounted) uiStore.markViewReady('galaxy')
}

// Lets Vue mount the star canvases and the browser paint their first frame.
async function waitForPaint() {
  await nextTick()
  await nextFrame()
  await nextFrame()
}

function refreshViewportSize() {
  if (!app || !world || !containerRef.value?.isConnected) return
  const { width, height } = screenSize()
  if (width <= 1 || height <= 1) return
  app.resize()
  camera.refresh()
  applyCamera()
  if (isBuilt && neededRings() > builtRings) {
    clearTimeout(rebuildTimer)
    rebuildTimer = setTimeout(() => { if (!isUnmounted) renderGalaxy() }, 250)
  }
}

async function initPixi() {
  app = new PIXI.Application()

  await app.init({
    background: themeNumber('screen'),
    resizeTo: containerRef.value,
    antialias: true,
    resolution: 1,
    roundPixels: false
  })
  appReady = true
  // Unmounted while Pixi was starting: there is no container any more.
  if (isUnmounted) {
    destroyApp()
    return
  }

  containerRef.value.appendChild(app.canvas)
  // The labels do not survive a lost WebGL context (utils/webglContext.js).
  rebuildOnContextRestore(app.canvas, () => { if (isBuilt && !isUnmounted) renderGalaxy() })

  world = new PIXI.Container()
  app.stage.addChild(world)

  app.ticker.add(ticker => {
    if (camera.tick(ticker.deltaMS)) applyCamera()
    animateBackgroundStars()
    animateHyperlines()
    animateUnchartedRipple()
    animateStarNames(ticker.deltaMS)
  })

  containerRef.value.addEventListener('wheel', handleWheel, { passive: false })
  resizeObserver = new ResizeObserver(() => refreshViewportSize())
  resizeObserver.observe(containerRef.value)
}

// Whole screen pixels for the map offset: pixel art does not shimmer.
function applyCamera() {
  if (!world) return
  const { x, y, scale } = camera.camera
  const { width, height } = screenSize()
  world.scale.set(scale)
  world.position.set(Math.round(width / 2 - x * scale), Math.round(height / 2 - y * scale))
  updateStarPositions()
}

function worldToScreenPoint(point) {
  return { x: world.x + point.x * world.scale.x, y: world.y + point.y * world.scale.y }
}

function restoreCamera() {
  camera.restore(readStoredValue(CAMERA_STORAGE_KEY, null))
  applyCamera()
}

function handleWheel(event) {
  if (!isBuilt || uiStore.transitionPhase !== 'idle') return
  const position = getPointerPosition(event)
  if (position) camera.wheel(event, position)
}

function handleKeyDown(event) {
  // A key a control has used (the volume of the player) is not for the map.
  if (event.defaultPrevented) return
  if (uiStore.currentView !== 'galaxy' || uiStore.transitionPhase !== 'idle' || isTypingTarget(event.target)) return
  if (camera.keyDown(event)) event.preventDefault()
}

function handleKeyUp(event) {
  camera.keyUp(event)
}

function handleWindowBlur() {
  camera.releaseKeys()
}

let listeningToKeys = false
function listenToKeys(listen) {
  if (listen === listeningToKeys) return
  listeningToKeys = listen
  const method = listen ? 'addEventListener' : 'removeEventListener'
  window[method]('keydown', handleKeyDown)
  window[method]('keyup', handleKeyUp)
  window[method]('blur', handleWindowBlur)
  if (!listen) camera.releaseKeys()
}

function getPointerPosition(event) {
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return null
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }
}

// Presses on the zoom buttons belong to the buttons, not to the map.
const onHud = event => Boolean(event.target?.closest?.('.galaxy-zoom-hud'))

function handleGalaxyPointerDown(event) {
  if (onHud(event)) return
  const position = getPointerPosition(event)
  if (position && isBuilt) {
    camera.pointerDown(event, position)
    containerRef.value?.setPointerCapture?.(event.pointerId)
  }
  if (event.button !== 0) return
  pointerGesture = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    moved: false
  }
}

function handleGalaxyPointerMove(event) {
  const position = getPointerPosition(event)
  lastPointer = position
  if (pointerGesture?.pointerId === event.pointerId && !pointerGesture.moved) {
    pointerGesture.moved = pointerMovedPastTolerance(pointerGesture, event)
  }
  if (pointerGesture?.moved && camera.isDragging()) uiStore.setCursorMode('drag')

  if (position) {
    camera.pointerMove(event, position)
    if (!camera.isDragging()) checkMagneticSnap(position.x, position.y)
    else setHoveredStar(null)
  }
}

function endMapDrag() {
  if (uiStore.cursorMode !== 'drag') return
  uiStore.setCursorMode(null)
  if (lastPointer) checkMagneticSnap(lastPointer.x, lastPointer.y)
}

function handleGalaxyPointerUp(event) {
  camera.pointerUp(event)
  endMapDrag()
  if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) return

  const gesture = pointerGesture
  pointerGesture = null
  if (gesture.moved || pointerMovedPastTolerance(gesture, event)) return

  const position = getPointerPosition(event)
  const star = position ? findStarAtPoint(galaxyStars.value, position.x, position.y) : null
  if (star) uiStore.selectStar(star.id)
}

function handleGalaxyPointerCancel(event) {
  camera.pointerCancel(event)
  endMapDrag()
  if (pointerGesture?.pointerId === event.pointerId) pointerGesture = null
}

function handleGalaxyPointerLeave(event) {
  lastPointer = null
  setHoveredStar(null)
  uiStore.clearCursorTarget()
  uiStore.setCursorMode(null)
  if (pointerGesture?.pointerId === event.pointerId) pointerGesture.moved = true
}

// The marching squares already made the ring smooth, so it is drawn point to point.
function drawContourPath(graphics, points) {
  if (!points || points.length < 3) return false
  graphics.beginPath()
  graphics.moveTo(points[0][0], points[0][1])
  for (let index = 1; index < points.length; index++) {
    graphics.lineTo(points[index][0], points[index][1])
  }
  graphics.closePath()
  return true
}

function createPixelText(text, style) {
  return new PIXI.Text({
    text,
    style: {
      fontFamily: PIXEL_FONT,
      stroke: { color: themeNumber('screen'), width: 4, join: 'miter' },
      dropShadow: { color: themeNumber('screen'), alpha: 1, blur: 0, distance: 2, angle: Math.PI / 2 },
      ...style
    },
    resolution: 3,
    textureStyle: { scaleMode: 'nearest' }
  })
}

function createStarLabel(star, label) {
  const nameText = createPixelText(label.lines.join('\n'), {
    fontSize: label.fontSize,
    lineHeight: label.lineHeight,
    fill: mapStore.planetTextColors[star.faction] || themeNumber('text'),
    align: 'center'
  })
  nameText.anchor.set(0.5, 0)
  nameText.position.set(Math.round((label.rect.left + label.rect.right) / 2), Math.round(label.rect.top + 2))
  return nameText
}

// With `onStage` the map is drawn stage by stage, awaiting `onStage(key)` (its
// loader text) before each one; without it, it is redrawn synchronously.
async function renderGalaxy(onStage = null) {
  if (!world) return

  // A rebuild destroys the old objects, not only takes them off. Textures are kept:
  // the fog and the fuzz map destroy their own below and in drawUnchartedSpace.
  world.removeChildren().forEach(child => child.destroy({ children: true }))
  backgroundStars = []
  hyperlineGlows = []
  hyperlinePulses = []
  rippleBands = []
  fuzzFilter?.destroy()
  fuzzFilter = null
  fuzzMap?.texture.destroy(true)
  fuzzMap = null
  labelViews = new Map()
  hoveredStarId = null
  galaxyStars.value = []
  camera.refresh()

  if (onStage) await onStage('loader.drawingMap')
  const rings = drawUnchartedSpace()
  createBackgroundStars(rings)

  // The sector grid goes before the territories, so the borders lie over it.
  if (onStage) await onStage(null)
  drawSectorGrid()

  // All fills first, then the borders and hyperlines in the shared line layer,
  // which breaks under the star names.
  if (onStage) await onStage(null)
  mapStore.territories.forEach(territory => {
    const fillGraphics = new PIXI.Graphics()
    const color = typeof territory.color === 'string'
      ? Number(territory.color)
      : territory.color
    if (drawContourPath(fillGraphics, territory.outer)) {
      fillGraphics.fill({ color, alpha: territory.fillOpacity ?? 0.2 })
      territory.holes?.forEach(hole => {
        if (drawContourPath(fillGraphics, hole)) fillGraphics.cut()
      })
    }
    world.addChild(fillGraphics)
  })

  const lineLayer = new PIXI.Container()
  world.addChild(lineLayer)

  mapStore.territories.forEach(territory => {
    const borderGraphics = new PIXI.Graphics()
    const borderColor = typeof territory.borderColor === 'string'
      ? Number(territory.borderColor)
      : territory.borderColor
    const visibleBorderWidth = Math.max(2.5, territory.borderWidth ?? 2)
    const strokeStyle = { width: visibleBorderWidth, color: borderColor, alpha: 0.9 }
    const glowStyle = { width: visibleBorderWidth + 6, color: borderColor, alpha: 0.16 }
    const rings = [territory.outer, ...(territory.holes ?? [])]

    const glowGraphics = new PIXI.Graphics()
    rings.forEach(ring => {
      if (drawContourPath(glowGraphics, ring)) glowGraphics.stroke(glowStyle)
    })
    lineLayer.addChild(glowGraphics)

    rings.forEach(ring => {
      if (drawContourPath(borderGraphics, ring)) borderGraphics.stroke(strokeStyle)
    })
    lineLayer.addChild(borderGraphics)
  })

  // Hyperlines after the territories, to lie over them.
  if (onStage) await onStage('loader.routingHyperlines', { count: mapStore.routedHyperlines.filter(line => line.path).length })
  const hyperlinePaths = drawRoutedHyperlines(lineLayer)
  const visualizedStars = []

  // Star names are in Pixi; the stars themselves are Vue components over the canvas.
  if (onStage) await onStage(null)
  const lineSegments = [
    ...mapStore.territories.flatMap(territory => [territory.outer, ...(territory.holes ?? [])].flatMap(ring => polylineSegments(ring, true)).map(segment => ({ ...segment, faction: territory.faction }))),
    ...hyperlinePaths.flatMap(({ points, ends }) => polylineSegments(points).map(segment => ({ ...segment, ends })))
  ]
  const labelSpace = resolveLabelSpace(mapStore.starLabels, mapStore.stars, lineSegments)
  drawSectorNumbers(labelSpace)

  mapStore.stars.forEach(star => {
    const centerPos = sectorCenter(star.sectorX, star.sectorY)
    const label = labelSpace.get(star.id)
    if (label) {
      const view = { text: createStarLabel(star, label), marker: null, hidden: label.hidden, lines: label.lines }
      world.addChild(view.text)
      if (label.hidden) {
        view.total = [...label.lines.join('')].length
        view.typed = 0
        view.target = 0
        view.shownCount = -1 // characters the text shows now (-1: the full name)
        view.text.visible = false
        view.marker = createHiddenNameMarker(star, label)
        world.addChild(view.marker)
      }
      labelViews.set(star.id, view)
    }

    if (star.starVisualization) {
      const screenPos = worldToScreenPoint(centerPos)
      visualizedStars.push({
        id: star.id,
        sectorX: star.sectorX,
        sectorY: star.sectorY,
        screenX: screenPos.x,
        screenY: screenPos.y,
        viewportScale: world.scale.x,
        config: getStarVisualizationConfig(star),
        label: label?.hidden ? 'hidden' : 'shown',
        labelOpen: false,
        labelTyped: label?.hidden ? 'none' : null
      })
    }
  })

  if (onStage) await onStage('loader.ignitingStars')
  galaxyStars.value = visualizedStars
}

function getStarVisualizationConfig(star) {
  return createStarVisualizationConfig(star)
}

function updateStarPositions() {
  if (!world) return

  const currentScale = world.scale.x

  galaxyStars.value.forEach((star) => {
    const worldPos = sectorCenter(star.sectorX, star.sectorY)

    const screenPos = worldToScreenPoint(worldPos)

    star.screenX = screenPos.x
    star.screenY = screenPos.y
    star.viewportScale = currentScale
  })

  // Zooming or dragging moves stars under a resting pointer: re-aim the cursor.
  if (lastPointer) checkMagneticSnap(lastPointer.x, lastPointer.y)
}

// rings: how many sectors of uncharted space surround the map.
function createBackgroundStars(rings) {
  const galaxy = mapStore.galaxy
  const padding = Math.max(500, rings * SECTOR_SIZE)
  const worldWidth = galaxy.width
  const worldHeight = galaxy.height
  const area = (worldWidth + padding * 2) * (worldHeight + padding * 2)
  const starCount = Math.min(3000, Math.round(area * 0.0002))

  for (let i = 0; i < starCount; i++) {
    const star = new PIXI.Graphics()
    const x = (Math.random() * (worldWidth + padding * 2)) - padding
    const y = (Math.random() * (worldHeight + padding * 2)) - padding
    const size = Math.random() > 0.7 ? 2 : 1

    star.rect(x, y, size, size)
    star.fill({ color: 0xffffff })

    world.addChild(star)

    backgroundStars.push({
      graphics: star,
      baseAlpha: 0.3 + Math.random() * 0.5,
      twinkleSpeed: 0.01 + Math.random() * 0.02,
      twinklePhase: Math.random() * Math.PI * 2
    })

    star.alpha = backgroundStars[backgroundStars.length - 1].baseAlpha
  }
}

function animateBackgroundStars() {
  backgroundStars.forEach(star => {
    star.twinklePhase += star.twinkleSpeed
    const twinkle = Math.sin(star.twinklePhase) * 0.3
    star.graphics.alpha = Math.max(0.1, Math.min(1, star.baseAlpha + twinkle))
  })
}

function laneOffsetForSegment(segment, hyperlineId, segmentUsage) {
  const usage = segmentUsage.get(segment.key) || []
  if (usage.length <= 1) return { x: 0, y: 0 }

  const minGap = 3
  const totalWidth = usage.reduce((sum, item) => sum + item.glowWidth, 0) +
    minGap * (usage.length - 1)
  let cursor = -totalWidth / 2
  let lanePosition = 0

  for (const item of usage) {
    const center = cursor + item.glowWidth / 2
    if (item.id === hyperlineId) {
      lanePosition = center
      break
    }
    cursor += item.glowWidth + minGap
  }

  let canonicalFrom = segment.from
  let canonicalTo = segment.to
  if (canonicalFrom.x > canonicalTo.x ||
    (canonicalFrom.x === canonicalTo.x && canonicalFrom.y > canonicalTo.y)) {
    canonicalFrom = segment.to
    canonicalTo = segment.from
  }

  const fromCenter = sectorCenter(canonicalFrom.x, canonicalFrom.y)
  const toCenter = sectorCenter(canonicalTo.x, canonicalTo.y)
  const dx = toCenter.x - fromCenter.x
  const dy = toCenter.y - fromCenter.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return { x: 0, y: 0 }

  return {
    x: -dy / length * lanePosition,
    y: dx / length * lanePosition
  }
}

function buildDisplayPath(path, segments, hyperlineId, segmentUsage) {
  if (!path || path.length < 2) return []

  const offsets = segments.map(segment => (
    laneOffsetForSegment(segment, hyperlineId, segmentUsage)
  ))
  const points = [sectorCenter(path[0].x, path[0].y)]
  const firstStart = sectorCenter(segments[0].from.x, segments[0].from.y)
  const firstEnd = sectorCenter(segments[0].to.x, segments[0].to.y)
  points.push({
    x: firstStart.x + (firstEnd.x - firstStart.x) * 0.3 + offsets[0].x * 0.3,
    y: firstStart.y + (firstEnd.y - firstStart.y) * 0.3 + offsets[0].y * 0.3
  })

  for (let index = 1; index < path.length - 1; index++) {
    const center = sectorCenter(path[index].x, path[index].y)
    const previousOffset = offsets[index - 1]
    const nextOffset = offsets[index]
    points.push({
      x: center.x + (previousOffset.x + nextOffset.x) / 2,
      y: center.y + (previousOffset.y + nextOffset.y) / 2
    })
  }

  const lastSegment = segments[segments.length - 1]
  const lastOffset = offsets[offsets.length - 1]
  const lastStart = sectorCenter(lastSegment.from.x, lastSegment.from.y)
  const lastEnd = sectorCenter(lastSegment.to.x, lastSegment.to.y)
  points.push({
    x: lastStart.x + (lastEnd.x - lastStart.x) * 0.7 + lastOffset.x * 0.3,
    y: lastStart.y + (lastEnd.y - lastStart.y) * 0.7 + lastOffset.y * 0.3
  })
  points.push(sectorCenter(path[path.length - 1].x, path[path.length - 1].y))
  return points
}

function drawRoutedHyperlines(layer) {
  // Routed once on load, so the star names were laid out around them.
  const routedLines = mapStore.routedHyperlines
  const segmentUsage = new Map()
  const linePaths = []
  const displayPaths = []

  routedLines.forEach(({ hyperline, path }) => {
    if (!path) {
      console.warn(`Unable to route hyperline: ${hyperline.id}`)
      return
    }

    const segments = []
    for (let index = 0; index < path.length - 1; index++) {
      const from = path[index]
      const to = path[index + 1]
      const key = getRouteSegmentKey(from, to)
      const segment = { from, to, key }
      segments.push(segment)
      if (!segmentUsage.has(key)) segmentUsage.set(key, [])
      segmentUsage.get(key).push({
        id: hyperline.id,
        glowWidth: (hyperline.width ?? 2) + 4
      })
    }
    linePaths.push({ hyperline, path, segments })
  })

  segmentUsage.forEach(usage => usage.sort((a, b) => a.id.localeCompare(b.id)))
  // Pulses go over all the lines, so a crossing line does not hide them.
  const pulseLayer = new PIXI.Container()
  const pulsesOn = !prefersReducedMotion()
  if (containerRef.value) containerRef.value.dataset.pulses = pulsesOn ? 'on' : 'off'

  linePaths.forEach(({ hyperline, path, segments }) => {
    const pathPoints = buildDisplayPath(path, segments, hyperline.id, segmentUsage)
    if (pathPoints.length < 2) return
    // ends: the sectors the line joins; the names of those stars ignore it.
    displayPaths.push({ points: pathPoints, ends: [path[0], path.at(-1)].map(point => `${point.x},${point.y}`) })
    const color = hyperline.color
    const lineContainer = new PIXI.Container()
    const { container: pixelLineContainer, glow } = drawContinuousLine(
      pathPoints,
      hyperline.width ?? 2,
      color
    )

    pixelLineContainer.alpha = hyperline.opacity ?? 0.7
    lineContainer.addChild(pixelLineContainer)
    if (glow) {
      hyperlineGlows.push({
        glow,
        baseAlpha: 0.3,
        flickerSpeed: 0.03 + Math.random() * 0.04,
        flickerPhase: Math.random() * Math.PI * 2
      })
    }
    layer.addChild(lineContainer)

    if (pulsesOn && hyperline.pulse) {
      const graphics = new PIXI.Graphics()
      pulseLayer.addChild(graphics)
      hyperlinePulses.push({
        graphics,
        path: measurePath(pathPoints),
        color,
        head: mixColor(color, 0xffffff, 0.7),
        tail: mixColor(color, 0xffffff, 0.3),
        width: hyperline.width,
        direction: hyperline.direction,
        pulse: hyperline.pulse,
        phase: seedFromText(hyperline.id) / 2 ** 32
      })
    }
  })
  layer.addChild(pulseLayer)
  return displayPaths
}

function mixColor(from, to, share) {
  const channel = shift => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff
    return Math.round(a + (b - a) * share) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

function animatePulses() {
  if (!hyperlinePulses.length) return
  const time = performance.now() / 1000
  hyperlinePulses.forEach(line => {
    const { graphics, path, pulse } = line
    graphics.clear()
    const pulses = pulsePositions(time, { total: path.total, ...pulse, direction: line.direction, phase: line.phase })
    const spacing = pulse.length / PULSE_TAIL
    for (const { distance, forward } of pulses) {
      // Tail first, the head last so it stays on top.
      for (let step = PULSE_TAIL; step >= 0; step--) {
        const at = forward ? distance - step * spacing : distance + step * spacing
        if (at < 0 || at > path.total) continue
        const fade = Math.min(1, Math.min(at, path.total - at) / PULSE_EDGE_FADE)
        if (fade <= 0) continue
        const point = pointAt(path, at)
        const square = (size, color, alpha) => graphics
          .rect(Math.round(point.x - size / 2), Math.round(point.y - size / 2), size, size)
          .fill({ color, alpha })
        if (step === 0) {
          square(line.width + 6, line.color, 0.3 * fade)
          square(line.width + 2, line.head, fade)
        } else {
          square(line.width + 1, line.tail, 0.85 * (1 - step / (PULSE_TAIL + 1)) * fade)
        }
      }
    }
  })
}

function drawContinuousLine(points, width, color) {
  const container = new PIXI.Container()

  if (points.length < 2) return { container, glow: null }

  const glow = new PIXI.Graphics()
  glow.moveTo(Math.floor(points[0].x), Math.floor(points[0].y))
  for (let i = 1; i < points.length; i++) {
    glow.lineTo(Math.floor(points[i].x), Math.floor(points[i].y))
  }
  glow.stroke({
    width: width + 4,
    color: color,
    alpha: 0.3
  })
  container.addChild(glow)

  const line = new PIXI.Graphics()
  line.moveTo(Math.floor(points[0].x), Math.floor(points[0].y))
  for (let i = 1; i < points.length; i++) {
    line.lineTo(Math.floor(points[i].x), Math.floor(points[i].y))
  }
  line.stroke({
    width: width,
    color: color
  })
  container.addChild(line)

  return { container, glow }
}

function animateHyperlines() {
  animatePulses()
  hyperlineGlows.forEach(glowData => {
    glowData.flickerPhase += glowData.flickerSpeed
    const flicker = Math.sin(glowData.flickerPhase) * 0.15
    glowData.glow.alpha = Math.max(0.1, Math.min(0.5, glowData.baseAlpha + flicker))
  })
}

// mouseX/mouseY are relative to the map container; the cursor layer works
// in page coordinates, so the target is shifted by the container offset
// (the console casing around the screen).
function checkMagneticSnap(mouseX, mouseY) {
  if (uiStore.cursorMode === 'drag') {
    setHoveredStar(null)
    uiStore.clearCursorTarget()
    return
  }
  const closestStar = findStarAtPoint(galaxyStars.value, mouseX, mouseY)
  const rect = closestStar ? containerRef.value?.getBoundingClientRect() : null
  setHoveredStar(closestStar?.id ?? null)

  if (closestStar && rect) {
    uiStore.setCursorTarget(
      rect.left + closestStar.screenX,
      rect.top + closestStar.screenY,
      getStarTargetSize(closestStar)
    )
  } else {
    uiStore.clearCursorTarget()
  }
}

function drawSectorGrid() {
  const sectorSize = SECTOR_SIZE
  const gridWidth = mapStore.galaxy.width
  const gridHeight = mapStore.galaxy.height
  const gridColor = themeMixNumber('line', 0.8, 'screen')
  const gridAlpha = 0.8

  const grid = new PIXI.Graphics()

  for (let x = 0; x <= gridWidth; x += sectorSize) {
    grid.moveTo(x, 0)
    grid.lineTo(x, gridHeight)
  }

  for (let y = 0; y <= gridHeight; y += sectorSize) {
    grid.moveTo(0, y)
    grid.lineTo(gridWidth, y)
  }

  grid.stroke({ width: 2, color: gridColor, alpha: gridAlpha })
  world.addChild(grid)

  // Under the territories; filled in after the star names are laid out.
  sectorNumbers = new PIXI.Container()
  world.addChild(sectorNumbers)
}

function drawSectorNumbers(labelSpace) {
  const sectorSize = SECTOR_SIZE
  const gridWidth = mapStore.galaxy.width
  const gridHeight = mapStore.galaxy.height
  const namesAbove = new Set(mapStore.stars
    .filter(star => {
      const label = labelSpace.get(star.id)
      return label && !label.hidden && label.side === 'above'
    })
    .map(star => `${star.sectorX},${star.sectorY}`))
  for (let x = 0; x < gridWidth; x += sectorSize) {
    for (let y = 0; y < gridHeight; y += sectorSize) {
      const sectorX = Math.floor(x / sectorSize)
      const sectorY = Math.floor(y / sectorSize)
      const label = new PIXI.Text({
        text: `${sectorX},${sectorY}`,
        style: {
          fontFamily: PIXEL_FONT,
          fontSize: 6,
          fill: themeMixNumber('dim', 0.25, 'line')
        }
      })
      label.x = x + 5
      label.y = namesAbove.has(`${sectorX},${sectorY}`) ? y + sectorSize - 11 : y + 5
      label.resolution = 2
      sectorNumbers.addChild(label)
    }
  }
}

function createHiddenNameMarker(star, label) {
  const center = sectorCenter(star.sectorX, star.sectorY)
  const marker = createPixelText('...', {
    fontSize: 8,
    fill: mapStore.planetTextColors[star.faction] || themeNumber('text')
  })
  const above = label.side === 'above'
  marker.anchor.set(0.5, above ? 1 : 0)
  marker.position.set(center.x, above ? center.y - LABEL_GAP_FROM_CENTER : center.y + LABEL_GAP_FROM_CENTER)
  return marker
}

function setHoveredStar(starId) {
  if (starId === hoveredStarId) return
  const toggle = (id, open) => {
    const view = labelViews.get(id)
    if (!view?.hidden) return
    view.target = open ? view.total : 0
    const entry = galaxyStars.value.find(star => star.id === id)
    if (entry) entry.labelOpen = open
  }
  toggle(hoveredStarId, false)
  hoveredStarId = starId
  if (starId) playSound('starLock')
  toggle(starId, true)
}

function animateStarNames(dtMs) {
  labelViews.forEach((view, id) => {
    if (!view.hidden || view.typed === view.target) return
    view.typed = prefersReducedMotion() ? view.target : stepTyping(view.typed, view.target, dtMs)
    const count = Math.floor(view.typed)
    if (count !== view.shownCount) {
      view.shownCount = count
      view.text.text = typedLabel(view.lines, count)
    }
    const empty = view.typed === 0
    view.text.visible = !empty
    view.marker.visible = empty
    const typed = empty ? 'none' : view.typed === view.total ? 'full' : 'partial'
    const entry = galaxyStars.value.find(star => star.id === id)
    if (entry && entry.labelTyped !== typed) entry.labelTyped = typed
  })
}
function neededRings() {
  const screen = screenSize()
  return unchartedRings(mapStore.galaxy, screen.width, screen.height, camera.limits().minScale)
}

// Returns how many sectors around the map it covers.
function drawUnchartedSpace() {
  const galaxy = mapStore.galaxy
  // A little extra, so a slightly different window needs no rebuild.
  const rings = neededRings() + 1
  builtRings = rings
  const seed = seedFromText(mapStore.stars.map(star => star.id).join(','))
  const margin = rings * SECTOR_SIZE

  const baseTexels = (galaxy.width + margin * 2) * (galaxy.height + margin * 2) / 100
  const texel = 10 * Math.max(1, Math.ceil(Math.sqrt(baseTexels / MAX_FOG_TEXELS)))
  const fog = unchartedFog(galaxy, { rings, texel, seed })
  const canvas = document.createElement('canvas')
  canvas.width = fog.width
  canvas.height = fog.height
  const context = canvas.getContext('2d')
  const image = context.createImageData(fog.width, fog.height)
  const colors = UNCHARTED_FOG_COLORS.map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)))
  fog.levels.forEach((level, index) => {
    if (!level) return
    const [red, green, blue] = colors[level - 1]
    image.data.set([red, green, blue, 255], index * 4)
  })
  context.putImageData(image, 0, 0)
  fogTexture?.destroy(true)
  fogTexture = PIXI.Texture.from(canvas)
  fogTexture.source.scaleMode = 'nearest'
  const fogSprite = new PIXI.Sprite(fogTexture)
  fogSprite.position.set(fog.originX, fog.originY)
  fogSprite.scale.set(fog.texel)
  world.addChild(fogSprite)

  const gridLayer = new PIXI.Container()
  world.addChild(gridLayer)
  if (!prefersReducedMotion() && app.renderer.type === PIXI.RendererType.WEBGL) {
    fuzzMap = createFuzzMap(galaxy, rings, seed)
    fuzzFilter = createFuzzFilter({ intensity: FUZZ_INTENSITY, range: FUZZ_RANGE, fps: FUZZ_FPS, map: fuzzMap.sprite })
    gridLayer.filters = [fuzzFilter]
  }
  // Tells tests and debugging whether the jitter runs.
  if (containerRef.value) containerRef.value.dataset.fuzz = fuzzFilter ? 'on' : 'off'
  const bands = new Map()
  const bandOf = y => {
    const index = Math.floor(y / RIPPLE_BAND)
    if (!bands.has(index)) bands.set(index, { index, segments: new Map(), labels: [] })
    return bands.get(index)
  }
  unchartedGridSegments(galaxy, { rings, seed }).forEach(segment => {
    const band = bandOf((segment.y1 + segment.y2) / 2)
    if (!band.segments.has(segment.alpha)) band.segments.set(segment.alpha, [])
    band.segments.get(segment.alpha).push(segment)
  })
  unchartedSectorLabels(galaxy, { seed }).forEach(({ x, y }) => bandOf(y + 5).labels.push({ x, y }))

  bands.forEach(band => {
    const container = new PIXI.Container()
    const lines = new PIXI.Graphics()
    band.segments.forEach((segments, alpha) => {
      lines.beginPath()
      segments.forEach(segment => lines.moveTo(segment.x1, segment.y1).lineTo(segment.x2, segment.y2))
      lines.stroke({ width: 2, color: themeMixNumber('line', 0.8, 'screen'), alpha })
    })
    container.addChild(lines)
    band.labels.forEach(({ x, y }) => {
      const label = new PIXI.Text({
        text: '??,??',
        style: { fontFamily: PIXEL_FONT, fontSize: 6, fill: 0x3c4a5c }
      })
      label.position.set(x + 5, y + 5)
      label.resolution = 2
      container.addChild(label)
    })
    gridLayer.addChild(container)
    rippleBands.push({ container, index: band.index })
  })

  return rings
}

function createFuzzMap(galaxy, rings, seed) {
  const columns = galaxy.columns + rings * 2
  const rows = galaxy.rows + rings * 2
  const canvas = document.createElement('canvas')
  canvas.width = columns
  canvas.height = rows
  const context = canvas.getContext('2d')
  const texture = PIXI.Texture.from(canvas)
  texture.source.scaleMode = 'nearest'
  const sprite = new PIXI.Sprite(texture)
  sprite.position.set(-rings * SECTOR_SIZE, -rings * SECTOR_SIZE)
  sprite.scale.set(SECTOR_SIZE)
  world.addChild(sprite)
  const map = { canvas, context, image: context.createImageData(columns, rows), texture, sprite, columns, rows, origin: -rings, seed, frame: -1 }
  updateFuzzMap(map, performance.now() / 1000)
  return map
}

function updateFuzzMap(map, seconds) {
  const frame = Math.floor(seconds * FUZZ_FPS)
  if (frame === map.frame) return
  map.frame = frame
  fillFuzzLevels(map.image.data, { columns: map.columns, rows: map.rows, originX: map.origin, originY: map.origin }, seconds, map.seed)
  map.context.putImageData(map.image, 0, 0)
  map.texture.source.update()
}

// Whole screen pixels, the same size at any zoom.
function animateUnchartedRipple() {
  if (!rippleBands.length || !world || prefersReducedMotion()) return
  const pixel = 1 / world.scale.x
  const time = performance.now() / 1000
  if (fuzzFilter) setFuzzTime(fuzzFilter, time)
  if (fuzzMap) updateFuzzMap(fuzzMap, time)
  rippleBands.forEach(band => {
    const wave = Math.sin(time * RIPPLE_SPEED - band.index * RIPPLE_STEP) +
      Math.sin(time * RIPPLE_SPEED * 2.3 - band.index * RIPPLE_STEP * 1.7) * 0.35
    band.container.x = Math.round(wave * RIPPLE_AMPLITUDE) * pixel
  })
}
</script>

<style scoped>
.galaxy-view {
  width: 100%;
  height: 100%;
  background: var(--ui-screen);
  position: absolute;
  top: 0;
  left: 0;
  cursor: none;
  /* Fingers move and zoom the map (useGalaxyCamera), not the browser page */
  touch-action: none;
}

.galaxy-star-container {
  position: absolute;
  width: 30px;
  height: 30px;
  pointer-events: none;
  cursor: none;
  z-index: 10;
  transform-origin: center center;
}
</style>
