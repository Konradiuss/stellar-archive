<template>
  <div
    v-if="shouldShowCursor"
    class="cursor-wrapper"
    :class="{ 'is-dragging': isDraggingMap }"
    :style="{ clipPath: cursorClipPath }"
  >
    <div v-show="shouldShowSquare" ref="outerSquare" class="cursor-square outer">
      <div class="corner top-left"></div>
      <div class="corner top-right"></div>
      <div class="corner bottom-left"></div>
      <div class="corner bottom-right"></div>
      <div class="drag-arrow up"></div>
      <div class="drag-arrow down"></div>
      <div class="drag-arrow left"></div>
      <div class="drag-arrow right"></div>
    </div>

    <div v-show="shouldShowCrosshair" ref="crosshair" class="crosshair">
      <div class="crosshair-line top"></div>
      <div class="crosshair-line bottom"></div>
      <div class="crosshair-line left"></div>
      <div class="crosshair-line right"></div>
    </div>

    <div v-show="shouldShowDot" ref="centerDot" class="center-dot"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import gsap from 'gsap'
import { useUIStore } from '../stores/uiStore'
import { createViewportClipPath } from '../utils/cursorClipping'
import { prefersReducedMotion } from '../utils/reducedMotion'
import { FOLLOW_MS, followStep, toDevicePixel } from '../utils/cursorMotion'

const SQUARE_SIZE = 40
const SNAP_DEFAULT_SIZE = 56
const DRAG_SIZE = 56
// Free, the layers follow the mouse as one with a short smoothing (cursorMotion.js):
// a long one floated, and corners slower than the dot trailed behind it, which sickened.
const SNAP_GLIDE = { square: 0.1, dot: 0.06 }
// ms; a longer frame (a hidden tab) does not throw the cursor
const MAX_FRAME_MS = 100
const RETURN_MS = 150
const PRESS_SCALE = 0.8

const uiStore = useUIStore()
const outerSquare = ref(null)
const centerDot = ref(null)
const crosshair = ref(null)

let mouseX = window.innerWidth / 2
let mouseY = window.innerHeight / 2
let targetX = mouseX
let targetY = mouseY
let isSnapped = false
let snappedSize = null
let returnUntil = 0
let followX = mouseX
let followY = mouseY
let pressed = false
// A finger leaves no cursor: nothing shows before the first real mouse move,
// so a phone gets no dot in the middle of its screen.
let hasPointer = false
const isOverInteractiveArea = ref(false)
const shouldShowSquare = ref(false)
const shouldShowCrosshair = ref(false)
const shouldShowDot = ref(true)
const cursorClipPath = ref('none')

const shouldShowCursor = computed(() => isOverInteractiveArea.value)
const isDraggingMap = computed(() => uiStore.cursorMode === 'drag')
let outerMotion = null
let crosshairMotion = null
let dotMotion = null
let cachedPlanetsPanel = null
let cachedPanelBounds = null
let cachedCrosshair = null
let cachedCrosshairLines = null
let activeClipElement = null

watch(shouldShowCursor, (show, oldShow) => {
  if (show && !oldShow && centerDot.value) {
    gsap.set(centerDot.value, {
      xPercent: -50,
      yPercent: -50,
      x: mouseX,
      y: mouseY,
      opacity: 1
    })

    if (outerSquare.value) {
      gsap.set(outerSquare.value, {
        xPercent: -50,
        yPercent: -50,
        x: mouseX,
        y: mouseY,
        opacity: 1,
        scale: 1,
        rotation: 0
      })
    }

    targetX = mouseX
    targetY = mouseY
    followX = mouseX
    followY = mouseY
  }
})

watch(shouldShowSquare, (show) => {
  if (!outerSquare.value) return

  if (show) {
    gsap.to(outerSquare.value, {
      opacity: 1,
      scale: 1,
      duration: 0.2,
      ease: 'power2.out'
    })
  }
})

onMounted(() => {
  document.body.style.cursor = 'auto'

  // Pointer events, not mouse ones: a press that calls preventDefault (the
  // planet turned by dragging) stops mousemove until the button is released.
  document.addEventListener('pointermove', handleMouseMove)
  document.addEventListener('pointerdown', handlePress)
  document.addEventListener('pointerup', handleRelease)
  document.addEventListener('pointercancel', handleRelease)
  document.addEventListener('pointerout', handlePointerOut)

  gsap.ticker.add(updateCursorPosition)
  window.addEventListener('resize', invalidateCrosshairBounds)
})

onUnmounted(() => {
  document.removeEventListener('pointermove', handleMouseMove)
  document.removeEventListener('pointerdown', handlePress)
  document.removeEventListener('pointerup', handleRelease)
  document.removeEventListener('pointercancel', handleRelease)
  document.removeEventListener('pointerout', handlePointerOut)
  gsap.ticker.remove(updateCursorPosition)
  window.removeEventListener('resize', invalidateCrosshairBounds)
  clearMotionControllers()
  gsap.killTweensOf([outerSquare.value, crosshair.value, centerDot.value].filter(Boolean))
  document.body.style.cursor = 'auto'
})

watch(isOverInteractiveArea, (overArea) => {
  document.body.style.cursor = overArea ? 'none' : 'auto'
})

watch(() => uiStore.cursorTarget, (target) => {
  if (target) {
    if (isSnapped) {
      targetX = target.x
      targetY = target.y
      resizeSnappedSquare(target.size ?? SNAP_DEFAULT_SIZE)
    } else {
      snapToTarget(target.x, target.y, target.size ?? SNAP_DEFAULT_SIZE)
    }
  } else {
    releaseSnap()
  }
}, { flush: 'sync' })

// TargetCursor survives the view switch: reset the old screen's state, then
// classify the real pointer position against the new screen instead of
// waiting for another pointermove.
watch(() => uiStore.currentView, async () => {
  if (uiStore.cursorTarget) uiStore.clearCursorTarget()
  resetCursorForViewChange()

  await nextTick()
  checkUnderResting()
}, { flush: 'sync' })

// The shutter overlay only catches the pointer during a transition, so the
// area under a resting cursor changes when the shutters close or open.
watch(() => uiStore.transitionPhase === 'idle', async () => {
  await nextTick()
  checkUnderResting()
})

// Minimizing or maximizing a sector window moves the terminal edges without a
// browser resize: the crosshair and the clipping need the new bounds.
watch(() => uiStore.systemWindows, async () => {
  await nextTick()
  requestAnimationFrame(() => {
    invalidateCrosshairBounds()
    checkUnderResting()
  })
}, { deep: true })

function checkUnderResting() {
  if (!hasPointer) return
  checkIfOverGalaxyMap({
    target: document.elementFromPoint(mouseX, mouseY),
    clientX: mouseX,
    clientY: mouseY
  })
}

function handlePointerOut(e) {
  if (e.relatedTarget || e.pointerType === 'touch') return
  isOverInteractiveArea.value = false
}

function handleMouseMove(e) {
  if (e.pointerType === 'touch') return
  hasPointer = true
  mouseX = e.clientX
  mouseY = e.clientY

  checkIfOverGalaxyMap(e)

  if (!isSnapped) {
    targetX = mouseX
    targetY = mouseY
  }
}

function checkIfOverGalaxyMap(e) {
  const elementUnderCursor = e.target instanceof Element
    ? e.target
    : document.elementFromPoint(e.clientX, e.clientY)

  if (!elementUnderCursor) {
    isOverInteractiveArea.value = false
    shouldShowSquare.value = false
    shouldShowCrosshair.value = false
    updateCursorClipping(null)
    return
  }

  const galaxyView = elementUnderCursor.closest('.galaxy-view')
  const isOverStar = elementUnderCursor.closest('.galaxy-star-container')
  const isOverPlanet = elementUnderCursor.closest('.system-planet')
  const lorePanel = elementUnderCursor.closest('.lore-panel')
  const mapLegend = elementUnderCursor.closest('.map-legend')
  const systemView = elementUnderCursor.closest('.system-view')
  const systemViewExe = elementUnderCursor.closest('.terminal-title')
  const planetsPanel = elementUnderCursor.closest('.terminal-body-planets')
  const transitionOverlay = elementUnderCursor.closest('.crt-overlay')
  if (transitionOverlay) {
    isOverInteractiveArea.value = true
    shouldShowSquare.value = false
    shouldShowCrosshair.value = false
    shouldShowDot.value = true
    updateCursorClipping(null)
    return
  }

  const isOverSystemViewExe = systemView && systemViewExe && !!systemViewExe.closest('.window-system')
  const systemTerminal = isOverSystemViewExe
    ? systemViewExe.closest('.terminal-window')
    : null

  const consoleBoard = elementUnderCursor.closest('.responsive-layout')
  const shouldShow = !!(galaxyView || isOverStar || isOverPlanet || lorePanel || mapLegend || systemView || consoleBoard)
  isOverInteractiveArea.value = shouldShow

  shouldShowSquare.value = !!(galaxyView || isOverStar || isOverSystemViewExe || planetsPanel || isOverPlanet)

  shouldShowCrosshair.value = !!planetsPanel

  shouldShowDot.value = !planetsPanel

  // TargetCursor lives outside the screen DOM, so CSS overflow on the
  // terminal or the map screen cannot clip it. Apply their bounds to the
  // global layer so the corners never cross onto the console casing.
  updateCursorClipping(planetsPanel || systemTerminal || galaxyView)
}

// The square grows by width/height rather than scale, so the corners stay
// crisp 2px pixel lines at any size.
function snapToTarget(x, y, size) {
  isSnapped = true
  snappedSize = size
  clearMotionControllers()
  targetX = x
  targetY = y

  if (!outerSquare.value) return
  gsap.killTweensOf(outerSquare.value, 'rotation,scale,width,height')
  gsap.set(outerSquare.value, { rotation: 0, scale: 1 })

  gsap.to(outerSquare.value, {
    width: size,
    height: size,
    duration: 0.3,
    ease: 'back.out(2)'
  })

  gsap.to(outerSquare.value, {
    rotation: 360,
    duration: 2,
    ease: 'none',
    repeat: -1
  })
}

function resizeSnappedSquare(size) {
  if (size === snappedSize || !outerSquare.value) return
  snappedSize = size
  gsap.killTweensOf(outerSquare.value, 'width,height')
  gsap.to(outerSquare.value, {
    width: size,
    height: size,
    duration: 0.15,
    ease: 'power2.out'
  })
}

function releaseSnap() {
  const wasSnapped = isSnapped
  isSnapped = false
  snappedSize = null
  targetX = mouseX
  targetY = mouseY
  if (wasSnapped) returnUntil = performance.now() + RETURN_MS

  if (!outerSquare.value) return
  gsap.killTweensOf(outerSquare.value, 'rotation,scale,width,height')
  // The inactive corners must be aligned immediately: a rotation tween here
  // made them look broken for several frames after a view transition.
  gsap.set(outerSquare.value, { ...restingLook(), rotation: 0 })
}

function restingLook() {
  if (isDraggingMap.value) return { width: DRAG_SIZE, height: DRAG_SIZE, scale: 1 }
  return { width: SQUARE_SIZE, height: SQUARE_SIZE, scale: pressed ? PRESS_SCALE : 1 }
}

function killMotion(motion) {
  motion?.x?.tween?.kill()
  motion?.y?.tween?.kill()
}

function clearMotionControllers() {
  killMotion(outerMotion)
  killMotion(crosshairMotion)
  killMotion(dotMotion)
  outerMotion = null
  crosshairMotion = null
  dotMotion = null
}

function resetCursorForViewChange() {
  isSnapped = false
  snappedSize = null
  clearMotionControllers()

  const elements = [outerSquare.value, crosshair.value, centerDot.value].filter(Boolean)
  gsap.killTweensOf(elements)
  returnUntil = 0
  pressed = false

  targetX = mouseX
  targetY = mouseY
  followX = mouseX
  followY = mouseY
  shouldShowSquare.value = false
  shouldShowCrosshair.value = false
  shouldShowDot.value = true
  updateCursorClipping(null)

  if (outerSquare.value) {
    gsap.set(outerSquare.value, {
      xPercent: -50,
      yPercent: -50,
      x: mouseX,
      y: mouseY,
      scale: 1,
      rotation: 0,
      width: SQUARE_SIZE,
      height: SQUARE_SIZE
    })
  }
  if (crosshair.value) {
    gsap.set(crosshair.value, { xPercent: -50, yPercent: -50, x: mouseX, y: mouseY })
  }
  if (centerDot.value) {
    gsap.set(centerDot.value, { xPercent: -50, yPercent: -50, x: mouseX, y: mouseY })
  }
}

function createMotion(element, duration) {
  gsap.set(element, { xPercent: -50, yPercent: -50 })
  return {
    element,
    x: gsap.quickTo(element, 'x', { duration, ease: 'power2.out' }),
    y: gsap.quickTo(element, 'y', { duration, ease: 'power2.out' })
  }
}

function ensureMotion(motion, element, duration) {
  return motion?.element === element ? motion : createMotion(element, duration)
}

// size: { width, height } of the layer, read before any layer was moved.
function moveLayer(motion, element, x, y, glide, duration, size = null) {
  if (glide) {
    const controller = ensureMotion(motion, element, duration)
    controller.x(x)
    controller.y(y)
    return controller
  }
  killMotion(motion)
  // The layer is centred on (x, y) by -50%: its edge, not its middle, goes on
  // the screen pixels (a 3px dot has a half-pixel middle).
  const dpr = window.devicePixelRatio || 1
  const halfWidth = (size?.width ?? element.offsetWidth) / 2
  const halfHeight = (size?.height ?? element.offsetHeight) / 2
  gsap.set(element, {
    xPercent: -50,
    yPercent: -50,
    x: toDevicePixel(x - halfWidth, dpr) + halfWidth,
    y: toDevicePixel(y - halfHeight, dpr) + halfHeight
  })
  return null
}

// gsap ticker: time in seconds, deltaTime in ms since the last frame.
function updateCursorPosition(time, deltaTime = 16) {
  if (!centerDot.value) return
  const glide = isSnapped || performance.now() < returnUntil
  if (glide) {
    const leader = shouldShowSquare.value && outerSquare.value ? outerSquare.value : centerDot.value
    followX = Number(gsap.getProperty(leader, 'x'))
    followY = Number(gsap.getProperty(leader, 'y'))
  } else {
    const dt = Math.min(MAX_FRAME_MS, deltaTime)
    const tau = prefersReducedMotion() ? 0 : FOLLOW_MS
    followX = followStep(followX, targetX, dt, tau)
    followY = followStep(followY, targetY, dt, tau)
  }
  const x = glide ? targetX : followX
  const y = glide ? targetY : followY

  // Every size is read before any layer moves: a read after a move makes the
  // browser lay the page out again, up to three times a frame.
  const sizeOf = (element, shown) => (!glide && element && shown ? { width: element.offsetWidth, height: element.offsetHeight } : null)
  const squareSize = sizeOf(outerSquare.value, shouldShowSquare.value)
  const crosshairSize = sizeOf(crosshair.value, shouldShowCrosshair.value)
  const dotSize = sizeOf(centerDot.value, shouldShowDot.value)

  if (outerSquare.value && shouldShowSquare.value) {
    outerMotion = moveLayer(outerMotion, outerSquare.value, x, y, glide, SNAP_GLIDE.square, squareSize)
  }

  if (crosshair.value && shouldShowCrosshair.value) {
    crosshairMotion = moveLayer(crosshairMotion, crosshair.value, x, y, glide, SNAP_GLIDE.square, crosshairSize)
    const currentX = Number(gsap.getProperty(crosshair.value, 'x'))
    const currentY = Number(gsap.getProperty(crosshair.value, 'y'))
    updateCrosshairClipping(currentX, currentY)
  }

  if (shouldShowDot.value) {
    dotMotion = moveLayer(dotMotion, centerDot.value, x, y, glide, SNAP_GLIDE.dot, dotSize)
  }
}

function handlePress(event) {
  if (event.pointerType === 'touch' || event.button !== 0 || !shouldShowSquare.value || !outerSquare.value || isDraggingMap.value) return
  pressed = true
  gsap.killTweensOf(outerSquare.value, 'scale')
  gsap.to(outerSquare.value, { scale: PRESS_SCALE, duration: prefersReducedMotion() ? 0 : 0.06, ease: 'power2.out' })
}

function handleRelease() {
  if (!pressed) return
  pressed = false
  if (!outerSquare.value) return
  gsap.killTweensOf(outerSquare.value, 'scale')
  gsap.to(outerSquare.value, { scale: 1, duration: prefersReducedMotion() ? 0 : 0.25, ease: 'back.out(3)' })
}

watch(isDraggingMap, () => {
  if (!outerSquare.value || isSnapped) return
  gsap.killTweensOf(outerSquare.value, 'width,height,scale')
  gsap.to(outerSquare.value, { ...restingLook(), duration: prefersReducedMotion() ? 0 : 0.12, ease: 'power2.out' })
})

function invalidateCrosshairBounds() {
  cachedPanelBounds = null
  updateCursorClipping(activeClipElement, true)
}

function updateCursorClipping(element, force = false) {
  if (!element?.isConnected) {
    activeClipElement = null
    cursorClipPath.value = 'none'
    return
  }
  if (!force && activeClipElement === element) return

  activeClipElement = element
  cursorClipPath.value = createViewportClipPath(
    element.getBoundingClientRect(),
    window.innerWidth,
    window.innerHeight
  )
}

function ensureCrosshairCache() {
  if (!cachedPlanetsPanel?.isConnected) {
    cachedPlanetsPanel = document.querySelector('.terminal-body-planets')
    cachedPanelBounds = null
  }

  if (cachedCrosshair !== crosshair.value) {
    cachedCrosshair = crosshair.value
    cachedCrosshairLines = cachedCrosshair ? {
      top: cachedCrosshair.querySelector('.crosshair-line.top'),
      bottom: cachedCrosshair.querySelector('.crosshair-line.bottom'),
      left: cachedCrosshair.querySelector('.crosshair-line.left'),
      right: cachedCrosshair.querySelector('.crosshair-line.right')
    } : null
  }

  if (!cachedPanelBounds && cachedPlanetsPanel) {
    cachedPanelBounds = cachedPlanetsPanel.getBoundingClientRect()
  }

  return cachedPanelBounds && cachedCrosshairLines
}

function updateCrosshairClipping(currentX, currentY) {
  if (!ensureCrosshairCache()) return

  const bounds = cachedPanelBounds
  const lines = cachedCrosshairLines
  const offset = 30

  lines.top.style.height = `${Math.max(0, currentY - bounds.top - offset)}px`
  lines.bottom.style.height = `${Math.max(0, bounds.bottom - currentY - offset)}px`
  lines.left.style.width = `${Math.max(0, currentX - bounds.left - offset)}px`
  lines.right.style.width = `${Math.max(0, bounds.right - currentX - offset)}px`
}

</script>

<style scoped>
.cursor-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

.cursor-square {
  position: absolute;
  pointer-events: none;
  top: 0;
  left: 0;
}

.cursor-square.outer {
  width: 40px;
  height: 40px;
}

.corner {
  position: absolute;
  background: rgb(var(--ui-text-rgb) / 0.9);
  image-rendering: pixelated;
}

.cursor-square.outer .corner.top-left {
  width: 12px;
  height: 2px;
  top: 0;
  left: 0;
}
.cursor-square.outer .corner.top-left::after {
  content: '';
  position: absolute;
  width: 2px;
  height: 12px;
  top: 0;
  left: 0;
  background: rgb(var(--ui-text-rgb) / 0.9);
}

.cursor-square.outer .corner.top-right {
  width: 12px;
  height: 2px;
  top: 0;
  right: 0;
}
.cursor-square.outer .corner.top-right::after {
  content: '';
  position: absolute;
  width: 2px;
  height: 12px;
  top: 0;
  right: 0;
  background: rgb(var(--ui-text-rgb) / 0.9);
}

.cursor-square.outer .corner.bottom-left {
  width: 12px;
  height: 2px;
  bottom: 0;
  left: 0;
}
.cursor-square.outer .corner.bottom-left::after {
  content: '';
  position: absolute;
  width: 2px;
  height: 12px;
  bottom: 0;
  left: 0;
  background: rgb(var(--ui-text-rgb) / 0.9);
}

.cursor-square.outer .corner.bottom-right {
  width: 12px;
  height: 2px;
  bottom: 0;
  right: 0;
}
.cursor-square.outer .corner.bottom-right::after {
  content: '';
  position: absolute;
  width: 2px;
  height: 12px;
  bottom: 0;
  right: 0;
  background: rgb(var(--ui-text-rgb) / 0.9);
}

.drag-arrow {
  position: absolute;
  display: none;
  width: 2px;
  height: 2px;
  background: rgb(var(--ui-text-rgb) / 0.9);
}

.cursor-wrapper.is-dragging .drag-arrow {
  display: block;
}

.drag-arrow.up {
  left: calc(50% - 1px);
  top: -12px;
  box-shadow: -2px 2px 0 rgb(var(--ui-text-rgb) / 0.9), 2px 2px 0 rgb(var(--ui-text-rgb) / 0.9), -4px 4px 0 rgb(var(--ui-text-rgb) / 0.9), 4px 4px 0 rgb(var(--ui-text-rgb) / 0.9);
}

.drag-arrow.down {
  left: calc(50% - 1px);
  bottom: -12px;
  box-shadow: -2px -2px 0 rgb(var(--ui-text-rgb) / 0.9), 2px -2px 0 rgb(var(--ui-text-rgb) / 0.9), -4px -4px 0 rgb(var(--ui-text-rgb) / 0.9), 4px -4px 0 rgb(var(--ui-text-rgb) / 0.9);
}

.drag-arrow.left {
  top: calc(50% - 1px);
  left: -12px;
  box-shadow: 2px -2px 0 rgb(var(--ui-text-rgb) / 0.9), 2px 2px 0 rgb(var(--ui-text-rgb) / 0.9), 4px -4px 0 rgb(var(--ui-text-rgb) / 0.9), 4px 4px 0 rgb(var(--ui-text-rgb) / 0.9);
}

.drag-arrow.right {
  top: calc(50% - 1px);
  right: -12px;
  box-shadow: -2px -2px 0 rgb(var(--ui-text-rgb) / 0.9), -2px 2px 0 rgb(var(--ui-text-rgb) / 0.9), -4px -4px 0 rgb(var(--ui-text-rgb) / 0.9), -4px 4px 0 rgb(var(--ui-text-rgb) / 0.9);
}

.center-dot {
  position: absolute;
  width: 3px;
  height: 3px;
  background: rgb(var(--ui-text-rgb) / 1);
  top: 0;
  left: 0;
  image-rendering: pixelated;
}

.crosshair {
  position: absolute;
  pointer-events: none;
  top: 0;
  left: 0;
  width: 40px;
  height: 40px;
}

.crosshair-line {
  position: absolute;
  background: rgb(var(--ui-text-rgb) / 0.7);
  image-rendering: pixelated;
}

.crosshair-line.top {
  width: 2px;
  height: 0; /* set in JS */
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
}

.crosshair-line.bottom {
  width: 2px;
  height: 0; /* set in JS */
  left: 50%;
  top: calc(100% + 10px);
  transform: translateX(-50%);
}

.crosshair-line.left {
  width: 0; /* set in JS */
  height: 2px;
  right: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
}

.crosshair-line.right {
  width: 0; /* set in JS */
  height: 2px;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
}
</style>
