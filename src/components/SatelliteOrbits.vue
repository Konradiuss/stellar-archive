<template>
  <!-- No z-index here: the pieces share the wrapper's stacking with the planet
       (z 1); behind is 0, in front is 2. -->
  <div ref="rootRef" class="satellite-orbits" aria-hidden="false">
    <svg class="orbit-lines orbit-back" :viewBox="viewBox" aria-hidden="true">
      <path v-for="(radius, orbit) in layout.orbits" :key="`back-${orbit}`" :d="arcPath(radius, true)" />
    </svg>
    <svg class="orbit-lines orbit-front" :viewBox="viewBox" aria-hidden="true">
      <path v-for="(radius, orbit) in layout.orbits" :key="`front-${orbit}`" :d="arcPath(radius, false)" />
    </svg>
    <button
      v-for="orbit in orbits"
      :key="orbit.index"
      :ref="element => setBodyElement(element, orbit.index)"
      type="button"
      class="satellite-body"
      :class="{ 'is-hovered': hoveredIndex === orbit.index }"
      :style="{ width: `${orbit.box}px`, height: `${orbit.box}px` }"
      :aria-label="t(orbit.station ? 'system.stationAria' : 'system.moonAria', { name: orbit.name })"
      :data-hint="t('system.selectPlanet', { name: orbit.name })"
      :data-satellite="orbit.index"
      @click="$emit('select', orbit.index)"
      @mouseenter="handleEnter(orbit.index, $event)"
      @mouseleave="handleLeave"
    >
      <StationVisualization
        v-if="orbit.station"
        :config="orbit.station"
        :paused="paused"
      />
      <PlanetVisualization
        v-else-if="orbit.config"
        :planetConfig="orbit.config"
        :targetFps="12"
        :ringFps="6"
        :paused="paused"
      />
      <span v-else class="satellite-dot"></span>
    </button>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useUIStore } from '../stores/uiStore'
import { ORBIT_TILT, PLANET_DISC_SHARE, ellipsePosition, fitPlanetView, getSatellites, orbitLight } from '../utils/satellites'
import { createPlanetVisualizationConfig, ringOuterRadius } from '../utils/planetRenderer'
import { createStationConfig } from '../utils/stationRenderer'
import { t } from '../i18n'
import { playSound } from '../sound'
import PlanetVisualization from './PlanetVisualization.vue'
import StationVisualization from './StationVisualization.vue'

// A moon's PlanetVisualization draws its disc 0.35 of its box wide on each side.
const DISC_SHARE = 0.35
// Speed is radians per frame at this rate.
const FRAME_MS = 1000 / 60
// While the pointer is over the planet or its orbits, the bodies in sight ease
// down to a quarter of their speed; behind the planet they cannot be clicked
// and keep their speed.
const AIMING_SPEED = 0.25
const SPEED_CHANGE_MS = 250
const TERRITORY_MARGIN_PX = 6

const props = defineProps({
  planet: { type: Object, required: true },
  paused: { type: Boolean, default: false }
})

// share: the planet's drawn size (see fitPlanetView)
const emit = defineEmits(['select', 'share', 'overflow'])

const uiStore = useUIStore()
const rootRef = ref(null)
const size = reactive({ width: 0, height: 0 })
const hoveredIndex = ref(null)
const satellites = computed(() => getSatellites(props.planet))
const configs = new WeakMap()

function configOf(satellite) {
  const { data } = satellite
  if (satellite.kind !== 'station' && !data.visualization) return null
  if (!configs.has(data)) {
    configs.set(data, satellite.kind === 'station' ? createStationConfig({ ...data, type: satellite.type }) : createPlanetVisualizationConfig(data))
  }
  return configs.get(data)
}

const ringOuter = computed(() => ringOuterRadius(createPlanetVisualizationConfig(props.planet)))
const layout = computed(() => (
  size.width && size.height
    ? fitPlanetView(satellites.value, { width: size.width, height: size.height, ringOuter: ringOuter.value })
    : { share: PLANET_DISC_SHARE, bodies: [], orbits: [], hidden: 0 }
))
watch(() => layout.value.share, share => emit('share', share), { immediate: true })
// SystemView decides on a grid beforehand; this is the last word, said once the
// view has settled (a grid going out squeezes it for a moment).
const OVERFLOW_SETTLE_MS = 400
let overflowTimer = null
watch(() => layout.value.hidden, hidden => {
  clearTimeout(overflowTimer)
  overflowTimer = hidden ? setTimeout(() => emit('overflow'), OVERFLOW_SETTLE_MS) : null
}, { immediate: true })
const orbits = computed(() => layout.value.bodies.map(({ satellite, orbitRadius, bodyRadius }) => {
  const isStation = satellite.kind === 'station'
  return {
    index: satellite.index,
    name: satellite.data.name,
    radius: orbitRadius,
    // The box of a PlanetVisualization whose disc has this radius; a
    // station fills its box.
    box: Math.round(isStation ? bodyRadius * 2 : (bodyRadius * 2) / (DISC_SHARE * 2)),
    config: isStation ? null : configOf(satellite),
    station: isStation ? configOf(satellite) : null
  }
}))

const viewBox = computed(() => `${-size.width / 2} ${-size.height / 2} ${size.width} ${size.height}`)

function arcPath(radius, far) {
  const ry = radius * ORBIT_TILT
  return `M ${-radius} 0 A ${radius} ${ry} 0 0 ${far ? 1 : 0} ${radius} 0`
}

const angles = new Map()
const bodyElements = new Map()

function setBodyElement(element, index) {
  if (element) {
    bodyElements.set(index, element)
    place(index)
  } else {
    bodyElements.delete(index)
  }
}

function place(index) {
  const element = bodyElements.get(index)
  const orbit = orbits.value.find(item => item.index === index)
  if (!element || !orbit) return
  const satellite = satellites.value.find(item => item.index === index)
  if (!angles.has(index)) angles.set(index, satellite?.angle ?? 0)
  const angle = angles.get(index)
  const { x, y, behind } = ellipsePosition(angle, orbit.radius)
  element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`
  element.classList.toggle('is-behind', behind)
  const light = orbitLight(angle)
  element.style.filter = light > 0.999 ? '' : `brightness(${light.toFixed(3)})`
}

let aiming = false
const speedFactors = new Map()

function inTerritory(clientX, clientY) {
  const root = rootRef.value
  if (!root || !orbits.value.length) return false
  const box = root.getBoundingClientRect()
  // The window may be scaled: the layout is in its own pixels.
  const scale = box.width / (root.clientWidth || 1) || 1
  const x = (clientX - box.left - box.width / 2) / scale
  const y = (clientY - box.top - box.height / 2) / scale
  if (Math.hypot(x, y) <= (layout.value.discRadius ?? 0)) return true
  const reach = Math.max(...orbits.value.map(orbit => orbit.box / 2)) + TERRITORY_MARGIN_PX
  const outer = Math.max(...orbits.value.map(orbit => orbit.radius))
  const rx = outer + reach
  const ry = outer * ORBIT_TILT + reach
  return (x / rx) ** 2 + (y / ry) ** 2 <= 1
}

function handlePointerMove(event) {
  aiming = inTerritory(event.clientX, event.clientY)
}

function handlePointerLeave() {
  aiming = false
}

let frame = null
let lastTime = null
function tick(time) {
  frame = requestAnimationFrame(tick)
  const elapsed = lastTime === null ? 0 : Math.min(100, time - lastTime)
  lastTime = time
  // The whole orbit slows down, so the bodies on it keep their places.
  const inSight = new Set()
  if (aiming) {
    for (const { satellite } of layout.value.bodies) {
      if (!ellipsePosition(angles.get(satellite.index) ?? satellite.angle, 1).behind) inSight.add(satellite.orbit)
    }
  }
  const change = (elapsed / SPEED_CHANGE_MS) * (1 - AIMING_SPEED)
  for (const orbit of new Set(layout.value.bodies.map(({ satellite }) => satellite.orbit))) {
    const target = inSight.has(orbit) ? AIMING_SPEED : 1
    const factor = speedFactors.get(orbit) ?? 1
    speedFactors.set(orbit, factor < target ? Math.min(target, factor + change) : Math.max(target, factor - change))
  }
  for (const { satellite } of layout.value.bodies) {
    if (!props.paused && hoveredIndex.value !== satellite.index) {
      const step = satellite.speed * (speedFactors.get(satellite.orbit) ?? 1) * (elapsed / FRAME_MS)
      angles.set(satellite.index, (angles.get(satellite.index) ?? satellite.angle) + step)
    }
    place(satellite.index)
  }
}

function handleEnter(index, event) {
  hoveredIndex.value = index
  const box = event.currentTarget.getBoundingClientRect()
  uiStore.setCursorTarget(box.left + box.width / 2, box.top + box.height / 2)
  playSound('planetHover')
}

function handleLeave() {
  hoveredIndex.value = null
  uiStore.clearCursorTarget()
}

let resizeObserver = null
function measure() {
  // clientWidth: the size before the window's zoom (a CSS scale), in which
  // the orbits are laid out.
  const root = rootRef.value
  if (!root) return
  size.width = root.clientWidth
  size.height = root.clientHeight
}

watch(orbits, () => { for (const index of bodyElements.keys()) place(index) }, { flush: 'post' })

onMounted(() => {
  document.addEventListener('pointermove', handlePointerMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', handlePointerLeave)
  measure()
  resizeObserver = new ResizeObserver(measure)
  resizeObserver.observe(rootRef.value)
  frame = requestAnimationFrame(tick)
})

// No share is sent on unmount: the old orbits leave with an animation after
// the next planet's orbits have sent theirs.
onBeforeUnmount(() => {
  document.removeEventListener('pointermove', handlePointerMove)
  document.documentElement.removeEventListener('pointerleave', handlePointerLeave)
  clearTimeout(overflowTimer)
  resizeObserver?.disconnect()
  if (frame !== null) cancelAnimationFrame(frame)
  if (hoveredIndex.value !== null) uiStore.clearCursorTarget()
})
</script>

<style scoped>
.satellite-orbits {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.orbit-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  fill: none;
  stroke: rgb(var(--ui-text-rgb) / 0.35);
  stroke-width: 1;
  stroke-dasharray: 2 3;
  shape-rendering: crispEdges;
}

.orbit-back {
  z-index: 0;
}

.orbit-front {
  z-index: 2;
}

.satellite-body {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 3;
  display: flex;
  padding: 0;
  border: 0;
  background: transparent;
  pointer-events: auto;
  appearance: none;
  cursor: none;
}

.satellite-body.is-behind {
  z-index: 0;
}

.satellite-body :deep(.planet-canvas) {
  width: 100%;
  height: 100%;
}

.satellite-body.is-hovered {
  outline: 1px dashed rgb(var(--ui-text-rgb) / 0.8);
  outline-offset: 2px;
}

.satellite-dot {
  width: 6px;
  height: 6px;
  margin: auto;
  background: color-mix(in srgb, var(--ui-text) 30%, var(--ui-dim));
}
</style>
