<template>
  <div class="planet-list-wrap">
    <!-- The key remounts the page, replaying the interference. -->
    <ol :key="currentPage" class="planet-list">
      <li v-for="(planet, offset) in pagePlanets" :key="range.start + offset">
        <button
          type="button"
          class="planet-list-item"
          :class="{
            'is-hovered': range.start + offset === hoveredIndex,
            'is-last-viewed': range.start + offset === lastViewedIndex
          }"
          :data-hint="t('system.openData', { name: planet.name.toUpperCase() })"
          @click="$emit('select', range.start + offset)"
          @mouseenter="$emit('hover', range.start + offset)"
          @mouseleave="$emit('hover', null)"
          @focus="$emit('hover', range.start + offset)"
          @blur="$emit('hover', null)"
        >
          <span class="planet-list-key">[{{ offset + 1 }}]</span>
          <span class="planet-list-name">{{ planet.name.toUpperCase() }}</span>
          <span class="planet-list-mark" aria-hidden="true">{{ range.start + offset === lastViewedIndex ? '*' : '' }}</span>
          <span class="planet-list-dots" aria-hidden="true"></span>
          <span class="planet-list-orbit">{{ t('system.orbit', { orbit: toRoman(orbitNumbers[range.start + offset] ?? range.start + offset + 1) }) }}</span>
        </button>
        <ul v-if="satellitesOf(planet).length" class="satellite-list">
          <li v-if="isFolding(planet)" class="satellite-list-row">
            <button
              type="button"
              class="planet-list-item satellite-list-item satellite-list-toggle"
              :aria-expanded="isExpanded(range.start + offset)"
              :data-hint="isExpanded(range.start + offset) ? t('system.collapse') : t('system.expand')"
              @click="toggle(range.start + offset)"
            >
              <span class="satellite-branch" aria-hidden="true"></span>
              <span class="planet-list-name">{{ countLabel(planet) }}</span>
              <span class="planet-list-dots" aria-hidden="true"></span>
              <span class="planet-list-orbit">{{ isExpanded(range.start + offset) ? '[-]' : '[+]' }}</span>
            </button>
          </li>
          <li
            v-for="satellite in (isFolding(planet) && !isExpanded(range.start + offset) ? [] : satellitesOf(planet))"
            :key="satellite.index"
            class="satellite-list-row"
          >
            <button
              type="button"
              class="planet-list-item satellite-list-item"
              :class="{ 'is-hovered': isHoveredSatellite(range.start + offset, satellite.index) }"
              :data-hint="t('system.openData', { name: satellite.data.name.toUpperCase() })"
              @click="$emit('select-satellite', range.start + offset, satellite.index)"
              @mouseenter="$emit('hover-satellite', range.start + offset, satellite.index)"
              @mouseleave="$emit('hover-satellite', null, null)"
              @focus="$emit('hover-satellite', range.start + offset, satellite.index)"
              @blur="$emit('hover-satellite', null, null)"
            >
              <span class="satellite-branch" aria-hidden="true"></span>
              <span class="planet-list-name">{{ satellite.data.name.toUpperCase() }}</span>
              <span class="planet-list-dots" aria-hidden="true"></span>
              <span class="planet-list-orbit">{{ satellite.kind === 'station' ? t('system.station') : t('system.moon') }}</span>
            </button>
          </li>
        </ul>
      </li>
    </ol>

    <div v-if="pages > 1" class="planet-list-pages">
      <button
        type="button"
        class="planet-list-page-btn"
        :disabled="currentPage === 0"
        :data-hint="t('system.previousPage')"
        @click="$emit('page', currentPage - 1)"
      >[ &lt; ]</button>
      <span class="planet-list-page-label">{{ t('panels.page', { page: currentPage + 1, pages }) }}</span>
      <button
        type="button"
        class="planet-list-page-btn"
        :disabled="currentPage >= pages - 1"
        :data-hint="t('system.nextPage')"
        @click="$emit('page', currentPage + 1)"
      >[ &gt; ]</button>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { toRoman } from '../utils/planetOrbit'
import { t } from '../i18n'
import { clampPage, pageCount, pageRange } from '../utils/planetPaging'
import { getSatellites } from '../utils/satellites'

const props = defineProps({
  planets: { type: Array, default: () => [] },
  // Global planet index
  hoveredIndex: { type: Number, default: null },
  lastViewedIndex: { type: Number, default: null },
  orbitNumbers: { type: Array, default: () => [] },
  page: { type: Number, default: 0 },
  // { planetIndex, satelliteIndex } or null
  hoveredSatellite: { type: Object, default: null }
})

defineEmits(['select', 'hover', 'page', 'select-satellite', 'hover-satellite'])

const satellitesOf = planet => getSatellites(planet)

const FOLD_AFTER = 3
const isFolding = planet => satellitesOf(planet).length > FOLD_AFTER
const toggled = reactive(new Map())
const isExpanded = index => (toggled.has(index) ? toggled.get(index) : index === props.lastViewedIndex)
const toggle = index => toggled.set(index, !isExpanded(index))

function countLabel(planet) {
  const bodies = satellitesOf(planet)
  const moons = bodies.filter(body => body.kind === 'moon').length
  const stations = bodies.length - moons
  const ofMoons = t('system.moonCount', { count: moons })
  const ofStations = t('system.stationCount', { count: stations })
  if (!stations) return ofMoons
  if (!moons) return ofStations
  return t('system.satellitesFolded', { moons: ofMoons, stations: ofStations })
}
const isHoveredSatellite = (planetIndex, satelliteIndex) => (
  props.hoveredSatellite?.planetIndex === planetIndex && props.hoveredSatellite?.satelliteIndex === satelliteIndex
)

const pages = computed(() => pageCount(props.planets.length))
const currentPage = computed(() => clampPage(props.page, props.planets.length))
const range = computed(() => pageRange(currentPage.value, props.planets.length))
const pagePlanets = computed(() => props.planets.slice(range.value.start, range.value.end))
</script>

<style scoped>
.planet-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: crt-interference 150ms linear both;
}

.planet-list-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 3px 4px;
  border: 0;
  background: transparent;
  color: var(--phosphor-text, color-mix(in srgb, var(--ui-text) 77%, var(--ui-dim)));
  font-family: var(--font-pixel);
  font-size: inherit;
  line-height: 2;
  text-align: left;
  cursor: none;
}

.planet-list-item:hover,
.planet-list-item:focus-visible,
.planet-list-item.is-hovered {
  background: var(--phosphor-bright, var(--ui-text));
  color: var(--ui-screen);
  outline: none;
}

.planet-list-item.is-last-viewed {
  outline: 1px dashed var(--phosphor-dim, var(--ui-dim));
  outline-offset: -1px;
}

.planet-list-key {
  color: var(--phosphor-bright, var(--ui-text));
}

.planet-list-item:hover .planet-list-key,
.planet-list-item.is-hovered .planet-list-key {
  color: inherit;
}

.planet-list-mark {
  min-width: 1ch;
  margin-left: -4px;
  color: var(--phosphor-bright, var(--ui-text));
}

.planet-list-item:hover .planet-list-mark,
.planet-list-item.is-hovered .planet-list-mark {
  color: inherit;
}

.planet-list-dots {
  flex: 1;
  min-width: 12px;
  border-bottom: 2px dotted currentColor;
  opacity: 0.5;
  transform: translateY(-4px);
}

.satellite-list {
  list-style: none;
  margin: 2px 0 0;
  padding: 0 0 0 3ch;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.satellite-list-row {
  position: relative;
}

.satellite-branch {
  flex-shrink: 0;
  align-self: stretch;
  width: 1.5ch;
  margin: -3px 0 -3px -1ch;
  background:
    linear-gradient(currentColor, currentColor) 0 0 / 2px 50% no-repeat,
    linear-gradient(currentColor, currentColor) 0 50% / 100% 2px no-repeat;
  opacity: 0.6;
}

.satellite-list-row:not(:last-child) .satellite-branch {
  background:
    linear-gradient(currentColor, currentColor) 0 0 / 2px 100% no-repeat,
    linear-gradient(currentColor, currentColor) 0 50% / 100% 2px no-repeat;
}

.planet-list-pages {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 10px;
  color: var(--phosphor-dim, var(--ui-dim));
  font-family: var(--font-pixel);
  line-height: 2;
}

.planet-list-page-btn {
  padding: 2px 4px;
  border: 0;
  background: transparent;
  color: var(--phosphor-bright, var(--ui-text));
  font: inherit;
  cursor: none;
}

.planet-list-page-btn:hover:not(:disabled),
.planet-list-page-btn:focus-visible {
  background: var(--phosphor-bright, var(--ui-text));
  color: var(--ui-screen);
  outline: none;
}

.planet-list-page-btn:disabled {
  color: var(--phosphor-dim, var(--ui-line));
  opacity: 0.5;
}

@media (prefers-reduced-motion: reduce) {
  .planet-list {
    animation: none;
  }
}
</style>
