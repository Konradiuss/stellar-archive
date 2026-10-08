<template>
  <div class="satellite-grid">
  <ScrollArea class="satellite-grid-scroll" :bar-inset="[2, 2]">
    <section
      v-for="row in rows"
      :key="row.orbit"
      class="satellite-row"
      :data-orbit="row.orbit + 1"
    >
      <div class="satellite-row-title" :data-hint="t('system.orbitHint', { orbit: toRoman(row.orbit + 1), distance: formatDistance(row.distance) })">
        {{ t('system.orbitRow', { orbit: toRoman(row.orbit + 1), distance: formatDistance(row.distance) }) }}
      </div>
      <svg class="satellite-row-arc" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
        <path d="M1 9 Q50 -7 99 9" />
      </svg>
      <div class="satellite-row-bodies">
        <button
          v-for="tile in row.tiles"
          :key="tile.index"
          type="button"
          class="satellite-tile"
          :class="{ 'is-hovered': hoveredIndex === tile.index }"
          :aria-label="t(tile.station ? 'system.stationAria' : 'system.moonAria', { name: tile.name })"
          :data-hint="t('system.selectPlanet', { name: tile.name })"
          :data-satellite="tile.index"
          @click="$emit('select', tile.index)"
          @mouseenter="hoveredIndex = tile.index"
          @mouseleave="hoveredIndex = null"
        >
          <span class="satellite-tile-picture">
            <!-- Inset: a shipyard on 4 px cells reaches past its square. -->
            <StationVisualization v-if="tile.station" :config="tile.station" :fill="0.38" :paused="paused" />
            <PlanetVisualization
              v-else-if="tile.config"
              :planetConfig="tile.config"
              :targetFps="12"
              :ringFps="6"
              :paused="paused"
              fit-ring
            />
            <span v-else class="satellite-tile-dot"></span>
          </span>
          <span class="satellite-tile-name">{{ tile.name }}</span>
          <span class="satellite-tile-kind">{{ tile.station ? t('system.station') : t('system.moon') }}</span>
        </button>
      </div>
    </section>
  </ScrollArea>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { getSatellites, satelliteRows } from '../utils/satellites'
import { createPlanetVisualizationConfig } from '../utils/planetRenderer'
import { createStationConfig } from '../utils/stationRenderer'
import { toRoman } from '../utils/planetOrbit'
import { t } from '../i18n'
import PlanetVisualization from './PlanetVisualization.vue'
import StationVisualization from './StationVisualization.vue'
import ScrollArea from './ScrollArea.vue'

const props = defineProps({
  planet: { type: Object, required: true },
  paused: { type: Boolean, default: false }
})

defineEmits(['select'])

const configs = new WeakMap()
function configOf(satellite) {
  const { data } = satellite
  if (satellite.kind !== 'station' && !data.visualization) return null
  if (!configs.has(data)) {
    configs.set(data, satellite.kind === 'station' ? createStationConfig({ ...data, type: satellite.type }) : createPlanetVisualizationConfig(data))
  }
  return configs.get(data)
}

const rows = computed(() => satelliteRows(getSatellites(props.planet)).map(row => ({
  ...row,
  tiles: row.bodies.map(satellite => {
    const isStation = satellite.kind === 'station'
    return {
      index: satellite.index,
      name: satellite.data.name,
      config: isStation ? null : configOf(satellite),
      station: isStation ? configOf(satellite) : null
    }
  })
})))

const formatDistance = distance => distance.toFixed(1)

const hoveredIndex = ref(null)
</script>

<style scoped>
.satellite-grid {
  /* 48 px to 128 px in whole 8 px steps, so the 4 px pixels stay even. */
  --tile-picture: 48px;

  container-type: inline-size;
  display: flex;
  min-width: 0;
  min-height: 0;
  font-family: var(--font-pixel);
  font-size: 8px;
  color: color-mix(in srgb, var(--ui-text) 50%, var(--ui-dim));
}

.satellite-grid-scroll {
  flex: 1;
  min-width: 0;
}

@supports (width: round(down, 10px, 8px)) {
  .satellite-grid-scroll {
    --tile-picture: round(down, clamp(48px, 14cqw, 128px), 8px);
  }
}

.satellite-row {
  padding: 2px 4px calc(var(--tile-picture) / 4);
}

.satellite-row-title {
  color: color-mix(in srgb, var(--ui-dim) 74%, var(--ui-line));
  line-height: 1.6;
}

.satellite-row-arc {
  display: block;
  width: 100%;
  height: 10px;
  overflow: visible;
}

.satellite-row-arc path {
  fill: none;
  stroke: rgb(var(--ui-text-rgb) / 0.35);
  stroke-width: 1;
  stroke-dasharray: 2 3;
  vector-effect: non-scaling-stroke;
}

.satellite-row-bodies {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--tile-picture) / 4) calc(var(--tile-picture) / 2);
  padding: 4px 4px 0;
}

.satellite-tile {
  display: grid;
  grid-template-columns: var(--tile-picture) minmax(0, auto);
  grid-template-rows: 1fr 1fr;
  max-width: 100%;
  align-items: center;
  gap: 4px 12px;
  line-height: 12px;
  padding: 4px 12px 4px 4px;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  appearance: none;
  cursor: none;
}

.satellite-tile.is-hovered,
.satellite-tile:focus-visible {
  outline: 1px dashed rgb(var(--ui-text-rgb) / 0.8);
  outline-offset: 2px;
}

.satellite-tile-picture {
  grid-row: span 2;
  display: flex;
  width: var(--tile-picture);
  height: var(--tile-picture);
}

.satellite-tile-picture :deep(.planet-canvas),
.satellite-tile-picture :deep(canvas) {
  width: 100%;
  height: 100%;
}

.satellite-tile-name {
  align-self: end;
  overflow-wrap: break-word;
}

.satellite-tile-kind {
  align-self: start;
  color: color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line));
}

.satellite-tile-dot {
  width: 6px;
  height: 6px;
  margin: auto;
  background: color-mix(in srgb, var(--ui-text) 30%, var(--ui-dim));
}
</style>
