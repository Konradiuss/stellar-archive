import { reactive } from 'vue'
import {
  cameraKeeping,
  cameraLimits,
  clampCamera,
  clampScale,
  fitCamera,
  panBy,
  relativeZoom,
  screenToWorld,
  stretchCamera
} from '../utils/galaxyCamera'

// ms: time constant of the smooth zoom and of the spring back from the edge.
const EASE_MS = 120
// ms: inertia after a drag decays with this time constant.
const INERTIA_DECAY_MS = 260
const INERTIA_MIN_SPEED = 0.02 // screen px per ms
// Wheel: a mouse notch (deltaY 100) zooms by about 16%.
const WHEEL_ZOOM_RATE = 0.0015
export const KEY_ZOOM_FACTOR = 1.25
const KEY_PAN_SPEED = 0.7 // screen px per ms
const EPSILON = 1e-4

const PAN_KEYS = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1]
}
const ZOOM_IN_KEYS = new Set(['Equal', 'NumpadAdd'])
const ZOOM_OUT_KEYS = new Set(['Minus', 'NumpadSubtract'])

const sameCamera = (a, b) => (
  Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON && Math.abs(a.scale - b.scale) < EPSILON * a.scale
)

// The view calls tick() every frame and applies the camera when it returns true.
// getGalaxy(), getScreen(): { width, height }; onSettle(camera): the camera has stopped.
export function useGalaxyCamera({ getGalaxy, getScreen, onSettle = () => {} }) {
  let current = { x: 0, y: 0, scale: 1 }
  let target = { ...current }
  // Zoom anchor: this world point stays under this screen point while zooming.
  let anchor = null
  let drag = null // { pointerId, raw, lastX, lastY, lastTime, velocityX, velocityY }
  let pinch = null
  const pointers = new Map()
  let inertia = null // { vx, vy } in screen px per ms
  const heldKeys = new Set()
  let dirty = true

  const hud = reactive({ zoom: 1, canZoomIn: false, canZoomOut: false })

  const limits = () => cameraLimits(getGalaxy(), getScreen())
  const clamp = camera => clampCamera(camera, getGalaxy(), getScreen(), limits())

  function updateHud() {
    const bounds = limits()
    hud.zoom = relativeZoom(target, bounds)
    hud.canZoomIn = target.scale < bounds.maxScale * (1 - EPSILON)
    hud.canZoomOut = target.scale > bounds.minScale * (1 + EPSILON)
  }

  function setTarget(camera, zoomAnchor = null) {
    target = clamp(camera)
    anchor = zoomAnchor
    inertia = null
    updateHud()
  }

  function jumpTo(camera) {
    current = clamp(camera)
    target = { ...current }
    anchor = null
    inertia = null
    dirty = true
    updateHud()
  }

  function zoomBy(factor, screenPoint = null) {
    const screen = getScreen()
    const point = screenPoint ?? { x: screen.width / 2, y: screen.height / 2 }
    const world = screenToWorld(current, screen, point)
    const scale = clampScale(target.scale * factor, limits())
    setTarget(cameraKeeping(world, point, scale, screen), { world, screen: point })
  }

  function fit() {
    setTarget(fitCamera(getGalaxy(), getScreen()))
  }

  function refresh() {
    current = clamp(current)
    target = clamp(target)
    dirty = true
    updateHud()
  }

  function restore(saved) {
    const valid = saved && [saved.x, saved.y, saved.scale].every(Number.isFinite)
    jumpTo(valid ? saved : fitCamera(getGalaxy(), getScreen()))
  }

  function pointerDown(event, position) {
    pointers.set(event.pointerId, position)
    inertia = null
    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()]
      drag = null
      pinch = {
        startDistance: Math.hypot(second.x - first.x, second.y - first.y) || 1,
        startScale: current.scale,
        world: screenToWorld(current, getScreen(), { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 })
      }
      return
    }
    if (event.button !== 0 || pointers.size > 1) return
    drag = {
      pointerId: event.pointerId,
      raw: { ...current },
      lastX: position.x,
      lastY: position.y,
      lastTime: event.timeStamp,
      velocityX: 0,
      velocityY: 0
    }
    anchor = null
  }

  function pointerMove(event, position) {
    if (!pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, position)

    if (pinch && pointers.size >= 2) {
      const [first, second] = [...pointers.values()]
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      const middle = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      const scale = clampScale(pinch.startScale * distance / pinch.startDistance, limits())
      jumpTo(cameraKeeping(pinch.world, middle, scale, getScreen()))
      return
    }
    if (!drag || drag.pointerId !== event.pointerId) return

    const dx = position.x - drag.lastX
    const dy = position.y - drag.lastY
    const dt = Math.max(1, event.timeStamp - drag.lastTime)
    drag.raw = panBy(drag.raw, dx, dy)
    drag.velocityX = drag.velocityX * 0.6 + (dx / dt) * 0.4
    drag.velocityY = drag.velocityY * 0.6 + (dy / dt) * 0.4
    drag.lastX = position.x
    drag.lastY = position.y
    drag.lastTime = event.timeStamp

    current = stretchCamera(drag.raw, getGalaxy(), getScreen(), limits())
    target = { ...current }
    dirty = true
  }

  function pointerUp(event) {
    pointers.delete(event.pointerId)
    if (pinch) {
      if (pointers.size < 2) pinch = null
      settleSoon()
      return
    }
    if (!drag || drag.pointerId !== event.pointerId) return
    const released = drag
    drag = null

    const inside = clamp(current)
    if (!sameCamera(inside, current)) {
      setTarget(inside)
      return
    }
    // A pause before release means no throw.
    const idle = event.timeStamp - released.lastTime
    if (idle < 80 && Math.hypot(released.velocityX, released.velocityY) > INERTIA_MIN_SPEED) {
      inertia = { vx: released.velocityX, vy: released.velocityY }
    } else {
      settleSoon()
    }
    updateHud()
  }

  function pointerCancel(event) {
    pointerUp(event)
  }

  function wheel(event, position) {
    event.preventDefault()
    // Pixel, line and page deltas feel alike.
    const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1
    zoomBy(Math.exp(-event.deltaY * unit * WHEEL_ZOOM_RATE), position)
  }

  function keyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false
    if (PAN_KEYS[event.code]) {
      heldKeys.add(event.code)
      inertia = null
      return true
    }
    if (event.repeat && (ZOOM_IN_KEYS.has(event.code) || ZOOM_OUT_KEYS.has(event.code))) return true
    if (ZOOM_IN_KEYS.has(event.code)) { zoomBy(KEY_ZOOM_FACTOR); return true }
    if (ZOOM_OUT_KEYS.has(event.code)) { zoomBy(1 / KEY_ZOOM_FACTOR); return true }
    if (event.code === 'Home') { fit(); return true }
    return false
  }

  function keyUp(event) {
    if (heldKeys.delete(event.code) && !heldKeys.size) settleSoon()
  }

  function releaseKeys() {
    heldKeys.clear()
  }

  let settleTimer = null
  function settleSoon() {
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => onSettle({ ...current }), 300)
  }

  // dt in ms; true when the camera moved.
  function tick(dt) {
    const animating = heldKeys.size || inertia || (!drag && !pinch && !sameCamera(current, target))
    if (!animating && !dirty) return false
    const before = { ...current }

    if (heldKeys.size && !drag && !pinch) {
      let dx = 0
      let dy = 0
      heldKeys.forEach(code => { dx += PAN_KEYS[code][0]; dy += PAN_KEYS[code][1] })
      const length = Math.hypot(dx, dy) || 1
      const step = KEY_PAN_SPEED * dt
      // The view moves the way the key points: the camera goes there.
      const moved = clamp(panBy(target, -dx / length * step, -dy / length * step))
      target = moved
      current = clamp({ ...moved, scale: current.scale })
      anchor = null
    } else if (inertia) {
      const next = clamp(panBy(current, inertia.vx * dt, inertia.vy * dt))
      if (Math.abs(next.x - current.x) < EPSILON) inertia.vx = 0
      if (Math.abs(next.y - current.y) < EPSILON) inertia.vy = 0
      current = next
      target = { ...next }
      const decay = Math.exp(-dt / INERTIA_DECAY_MS)
      inertia.vx *= decay
      inertia.vy *= decay
      if (Math.hypot(inertia.vx, inertia.vy) < INERTIA_MIN_SPEED) {
        inertia = null
        settleSoon()
      }
    } else if (!drag && !pinch && !sameCamera(current, target)) {
      const blend = 1 - Math.exp(-dt / EASE_MS)
      const scale = Math.exp(Math.log(current.scale) + (Math.log(target.scale) - Math.log(current.scale)) * blend)
      current = anchor
        ? clamp(cameraKeeping(anchor.world, anchor.screen, scale, getScreen()))
        : clamp({
          x: current.x + (target.x - current.x) * blend,
          y: current.y + (target.y - current.y) * blend,
          scale
        })
      if (sameCamera(current, target)) {
        current = { ...target }
        anchor = null
        settleSoon()
      }
    }

    const changed = dirty || !sameCamera(before, current)
    dirty = false
    if (changed) updateHud()
    return changed
  }

  return {
    hud,
    get camera() { return current },
    limits,
    tick,
    refresh,
    restore,
    fit,
    zoomBy,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    wheel,
    keyDown,
    keyUp,
    releaseKeys,
    isDragging: () => Boolean(drag || pinch)
  }
}
