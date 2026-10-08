<template>
  <div ref="systemViewRef" class="system-view" :class="{ 'is-phone': screenLayout === 'phone' }" :style="crtStyle" @pointerover="handleHintOver" @pointerleave="hoverHint = null">
    <DosBackground ref="dosRef" :running="dosReady" :live="liveTerminal" :bottom-padding="taskbarHeight" />

    <div class="system-content" :class="{ 'is-empty': liveTerminal }" :style="gridStyle">
      <Transition name="window-power">
        <TerminalWindow
          v-show="isWindowVisible('system')"
          class="window-system"
          :class="windowClasses('system', openMenu === 'system' || openMenu === 'jump')"
          :title="t('files.systemView')"
          :maximized="layout.maximized === 'system'"
          :controls="!singleWindow"
          :alone="layout.alone === 'system'"
          :menu-open="openMenu === 'system'"
          :menu-items="systemMenuItems"
          @minimize="powerOffWindow('system')"
          @maximize="toggleWindowLayout('system')"
          @toggle-menu="toggleMenu('system')"
          @close-menu="closeMenu"
        >
          <template #actions="{ compact }">
            <div class="jump-anchor">
              <button
                type="button"
                class="back-btn"
                :disabled="!neighbors.length"
                :aria-expanded="openMenu === 'jump'"
                aria-haspopup="menu"
                :title="neighbors.length ? t('system.jumpTitle') : t('system.noJumpTitle')"
                :data-hint="neighbors.length ? t('system.jumpHint') : t('system.noJumpHint')"
                @click.stop="toggleMenu('jump')"
              >{{ t('system.jump') }}</button>
              <DosMenu v-if="openMenu === 'jump'" :title="t('system.jumpMenu')" align="left" :items="jumpMenuItems" @close="closeMenu" />
            </div>
            <button type="button" class="back-btn" :title="t('system.backToMapTitle')" :data-hint="t('system.backToMapHint')" @click="closeSystem">{{ compact ? t('system.backToMap') : t('system.backToMapLong') }}</button>
          </template>

          <div ref="containerRef" class="canvas-container terminal-body-planets">
            <SquaresBackground
              v-if="settings.system.grid && isWindowVisible('system')"
              direction="diagonal"
              :speed="0.3"
              :borderColor="themeMixHex('line', 0.6, 'screen')"
              :squareSize="50"
            />

            <div v-if="currentStar" class="star-container" :style="starStyle">
              <StarVisualization
                :starConfig="starVisualConfig"
                :scale="starScale"
                :targetFps="30"
              />
            </div>

            <div
              v-for="planet in orbitingPlanets"
              :key="planet.index"
              :ref="element => setPlanetElement(element, planet.index)"
              class="planet-container system-planet"
              :class="{
                // With a satellite open, its own corners mark it instead.
                'is-selected': planet.index === uiStore.selectedPlanetIndex && !uiStore.selectedSatellite,
                'is-hovered': planet.index === frozenPlanetIndex
              }"
              :data-hint="t('system.selectPlanet', { name: planet.data.name })"
              @click="uiStore.selectPlanet(planet.index)"
              @mouseenter="handlePlanetMouseEnter(planet.index)"
              @mouseleave="handlePlanetMouseLeave"
            >
              <div class="planet-scale-layer">
                <PlanetVisualization
                  :planetConfig="planet.config"
                  :scale="0.5"
                  :targetFps="18"
                  :ringFps="8"
                  :paused="!isWindowVisible('system')"
                />
              </div>
            </div>
          </div>
        </TerminalWindow>
      </Transition>

      <Transition name="window-power">
        <TerminalWindow
          v-show="isWindowVisible('data')"
          class="window-data"
          :class="windowClasses('data', openMenu === 'data')"
          :title="t('files.planetData')"
          :maximized="layout.maximized === 'data'"
          :controls="!singleWindow"
          :alone="layout.alone === 'data'"
          :menu-open="openMenu === 'data'"
          :menu-items="dataMenuItems"
          @minimize="powerOffWindow('data')"
          @maximize="toggleWindowLayout('data')"
          @toggle-menu="toggleMenu('data')"
          @close-menu="closeMenu"
        >
          <div class="terminal-body planet-data-body" :style="readingStyle">
            <Transition name="data-wipe" mode="out-in">
              <div v-if="!selectedPlanet" key="list" class="data-screen">
                <div class="terminal-prompt">C:\SYSTEM\PLANETS&gt; {{ typedCommand }}</div>
                <div class="terminal-text">
                  <template v-if="planetKeys">{{ t('system.selectWithKeys', { keys: planetKeys }) }}</template>
                  <template v-else>{{ t('system.selectOnOrbit') }}</template><span class="terminal-cursor"></span>
                </div>
                <PlanetList
                  class="planet-data-list"
                  :planets="systemPlanets"
                  :page="listPage"
                  :hovered-index="frozenPlanetIndex"
                  :last-viewed-index="lastViewedIndex"
                  :orbit-numbers="orbitNumbers"
                  :hovered-satellite="listHoveredSatellite"
                  @select="uiStore.selectPlanet"
                  @hover="hoverPlanetFromList"
                  @page="setListPage"
                  @select-satellite="uiStore.selectSatellite"
                  @hover-satellite="hoverSatelliteFromList"
                />
                <div v-if="!systemPlanets.length" class="terminal-text">{{ t('system.noPlanets') }}</div>
              </div>
              <div v-else :key="bodyKey" class="data-screen">
                <div class="terminal-prompt">C:\SYSTEM\PLANETS&gt; {{ typedCommand }}</div>
                <h3 class="planet-lore-title">{{ selectedBody.name.toUpperCase() }}</h3>
                <div v-if="selectedStationConfig" class="planet-lore-orbit">
                  {{ t('system.stationAt', { planet: selectedPlanet.name.toUpperCase(), type: t(`stationTypes.${selectedStationConfig.type}`).toUpperCase() }) }}
                </div>
                <div v-else-if="selectedSatellite" class="planet-lore-orbit">
                  {{ t('system.moonOf', { planet: selectedPlanet.name.toUpperCase(), orbit: toRoman(satellitePosition), orbits: toRoman(planetMoons.length) }) }}
                </div>
                <div v-else class="planet-lore-orbit">
                  {{ t('system.planetOrbit', { orbit: toRoman(orbitNumbers[uiStore.selectedPlanetIndex]), orbits: toRoman(systemPlanets.length) }) }}
                </div>
                <div
                  v-for="group in satelliteGroups"
                  :key="group.id"
                  class="planet-lore-satellites"
                  :class="`is-${group.id}`"
                >
                  <span class="satellites-label">{{ group.label }}</span>
                  <button
                    v-for="satellite in group.shown"
                    :key="satellite.index"
                    type="button"
                    class="terminal-link satellite-link"
                    :data-hint="t('system.openData', { name: satellite.data.name.toUpperCase() })"
                    @click="uiStore.selectSatellite(uiStore.selectedPlanetIndex, satellite.index)"
                  >[ {{ satellite.data.name.toUpperCase() }} ]</button>
                  <button
                    v-if="group.more"
                    type="button"
                    class="terminal-link satellite-link satellite-more-link"
                    :data-hint="t('system.showMore', { count: group.more })"
                    @click="showAllSatelliteLinks"
                  >[ +{{ group.more }} ]</button>
                </div>
                <div
                  class="planet-lore-text"
                  :data-hint="isPrinting ? t('system.skipHint') : null"
                  @click="isPrinting && skipTyping()"
                >
                  <RichText class="reading-text" :lang="language()" :doc="dataLoreDoc" :limit="commandTyped ? visibleLore : 0" :cursor="isTyping" />
                  <p v-if="isPrinting" class="skip-hint">{{ t('system.skip') }}</p>
                </div>
                <button
                  v-if="selectedSatellite"
                  type="button"
                  class="terminal-link"
                  :data-hint="t('system.backToPlanetHint', { name: selectedPlanet.name })"
                  @click="uiStore.selectPlanet(uiStore.selectedPlanetIndex)"
                >{{ t('system.backToPlanet', { name: selectedPlanet.name.toUpperCase() }) }}</button>
                <button
                  type="button"
                  class="terminal-link"
                  :data-hint="t('system.allPlanetsHint')"
                  @click="uiStore.selectPlanet(null)"
                >{{ t('system.allPlanets') }}</button>
              </div>
            </Transition>
          </div>
        </TerminalWindow>
      </Transition>

      <Transition name="window-power">
        <TerminalWindow
          v-show="isWindowVisible('visual')"
          class="window-visual"
          :class="windowClasses('visual', openMenu === 'visual')"
          :title="t('files.planetVisual')"
          :maximized="layout.maximized === 'visual'"
          :controls="!singleWindow"
          :alone="layout.alone === 'visual'"
          :menu-open="openMenu === 'visual'"
          :menu-items="visualMenuItems"
          @minimize="powerOffWindow('visual')"
          @maximize="toggleWindowLayout('visual')"
          @toggle-menu="toggleMenu('visual')"
          @close-menu="closeMenu"
        >
          <!-- On a satellite's screen, back to its planet: the only way back when this
               window is left alone -->
          <template #actions="{ compact }">
            <button
              v-if="selectedSatellite"
              type="button"
              class="back-btn visual-back-btn"
              :title="t('system.backToPlanetHint', { name: selectedPlanet.name })"
              :data-hint="t('system.backToPlanetHint', { name: selectedPlanet.name })"
              @click="uiStore.selectPlanet(uiStore.selectedPlanetIndex)"
            >{{ compact ? t('system.backToPlanetShort') : t('system.backToPlanet', { name: selectedPlanet.name.toUpperCase() }) }}</button>
            <button
              v-if="hasSatelliteView"
              type="button"
              class="back-btn layout-toggle"
              :disabled="satelliteGridForced"
              :title="layoutToggle.hint"
              :data-hint="layoutToggle.hint"
              @click="settings.set('visual', 'layout', satelliteGrid ? 'orbits' : 'grid')"
            >[ {{ layoutToggle.label }} ]</button>
          </template>
          <div class="terminal-body terminal-body-visual" :class="{ 'is-dragging': isPlanetDragged }">
            <SquaresBackground
              v-if="settings.visual.grid && isWindowVisible('visual')"
              direction="left"
              :speed="0.2"
              :borderColor="themeMixHex('line', 0.4, 'screen')"
              :squareSize="40"
            />

            <CrtSnow v-if="visualSwitching" class="visual-static" />
            <div ref="visualDisplayRef" class="planet-display-container" :class="{ 'is-switching': visualSwitching, 'is-grid': satelliteGrid }">
              <div
                class="planet-canvas-wrapper"
                :data-hint="selectedBody && selectedBody.visualization ? t('system.dragHint') : null"
              >
                <Transition name="planet-tube" mode="out-in" @before-enter="satellitesReady = true">
                <StationVisualization
                  v-if="selectedStationConfig"
                  :key="bodyKey"
                  :config="selectedStationConfig"
                  :fill="0.42"
                  :paused="!settings.visual.rotate"
                />
                <PlanetVisualization
                  v-else-if="selectedBody && selectedBody.visualization"
                  :key="bodyKey"
                  :planetConfig="getPlanetVisualizationConfig(selectedBody)"
                  :disc-share="planetSatellites.length && !selectedSatellite && !satelliteGrid ? visualDiscShare : planetDiscShare(planetScale(selectedPlanetConfig))"
                  :paused="!settings.visual.rotate"
                  fit-ring
                  draggable
                  @drag-start="isPlanetDragged = true"
                  @drag-end="isPlanetDragged = false"
                />
                <div v-else key="placeholder" class="planet-placeholder">
                  <svg class="planet-outline" viewBox="0 0 200 200">
                    <!-- pathLength is a multiple of the dash step: exactly 60 dashes, no merged joint -->
                    <circle
                      cx="100"
                      cy="100"
                      r="90"
                      fill="none"
                      stroke="url(#gradient)"
                      stroke-width="2"
                      pathLength="120"
                      stroke-dasharray="1 1"
                      class="dashed-circle"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:var(--ui-text);stop-opacity:0.3" />
                        <stop offset="50%" style="stop-color:var(--ui-text);stop-opacity:0.6" />
                        <stop offset="100%" style="stop-color:var(--ui-text);stop-opacity:0.3" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div class="question-mark">?</div>
                  <div class="placeholder-hint">{{ t('system.selectPlaceholder') }}</div>
                </div>
                </Transition>
                <!-- Go out and come on with their planet: the old ones at once, the new ones
                     when their planet starts (it waits for the old one, out-in) -->
                <Transition name="satellites-tube">
                <SatelliteOrbits
                  v-if="satellitesReady && hasSatelliteView && !satelliteGrid"
                  :key="`moons-${uiStore.selectedPlanetIndex}`"
                  :planet="selectedPlanet"
                  :paused="!settings.visual.rotate"
                  @select="index => uiStore.selectSatellite(uiStore.selectedPlanetIndex, index)"
                  @share="share => (visualDiscShare = share)"
                  @overflow="orbitOverflowKey = orbitFitKey"
                />
                </Transition>
              </div>

              <template v-if="settings.visual.params">
                <!-- key: the new planet's parameters decode in a cascade -->
                <div v-if="selectedStationConfig" :key="`params-${bodyKey}`" class="planet-params">
                  <div class="param-item">
                    <span class="param-label">{{ t('params.stationAt') }}</span>
                    <span class="param-value"><DecodeText :text="selectedPlanet.name.toUpperCase()" :delay="40" /></span>
                  </div>
                  <div class="param-item">
                    <span class="param-label">{{ t('params.type') }}</span>
                    <span class="param-value"><DecodeText :text="t(`stationTypes.${selectedStationConfig.type}`).toUpperCase()" :delay="60" /></span>
                  </div>
                  <div class="param-item">
                    <span class="param-label">{{ t('params.size') }}</span>
                    <span class="param-value"><DecodeText :text="bodySizeText" :delay="130" /></span>
                  </div>
                  <div class="param-item">
                    <span class="param-label">{{ t('params.hull') }}</span>
                    <span class="param-value color-box" :style="{ backgroundColor: hexColorToCSS(selectedStationConfig.hull) }"></span>
                  </div>
                  <div class="param-item">
                    <span class="param-label">{{ t('params.lights') }}</span>
                    <span class="param-value color-box" :style="{ backgroundColor: hexColorToCSS(selectedStationConfig.lights) }"></span>
                  </div>
                </div>
                <div v-else-if="selectedPlanetConfig" :key="`params-${bodyKey}`" class="planet-params">
                  <div v-if="selectedSatellite" class="param-item">
                    <span class="param-label">{{ t('params.moon') }}</span>
                    <span class="param-value"><DecodeText :text="selectedPlanet.name.toUpperCase()" :delay="40" /></span>
                  </div>
                  <div v-if="selectedPreset" class="param-item">
                    <span class="param-label">{{ t('params.reference') }}</span>
                    <span class="param-value"><DecodeText :text="t(`presets.${selectedPreset.id}`).toUpperCase()" :delay="60" /></span>
                  </div>
                  <div class="param-item">
                    <span class="param-label">{{ t('params.size') }}</span>
                    <span class="param-value"><DecodeText :text="bodySizeText" :delay="130" /></span>
                  </div>
                  <div class="param-item">
                    <span class="param-label">{{ t('params.landColor') }}</span>
                    <span class="param-value color-box" :style="{ backgroundColor: hexColorToCSS(selectedPlanetConfig.landColor) }"></span>
                  </div>
                  <div class="param-item">
                    <span class="param-label">{{ t('params.waterColor') }}</span>
                    <span class="param-value color-box" :style="{ backgroundColor: hexColorToCSS(selectedPlanetConfig.waterColor) }"></span>
                  </div>
                  <div class="param-item">
                    <span class="param-label">{{ t('params.waterAmount') }}</span>
                    <span class="param-value"><DecodeText :text="`${Math.round(selectedPlanetConfig.waterAmount * 100)}%`" :delay="165" /></span>
                  </div>
                  <div class="param-item">
                    <span class="param-label">{{ t('params.liquidType') }}</span>
                    <span class="param-value"><DecodeText :text="String(getWaterTypeName(selectedPlanetConfig.waterType))" :delay="200" /></span>
                  </div>
                  <div v-if="selectedPlanetConfig.ring" class="param-item">
                    <span class="param-label">{{ t('params.rings') }}</span>
                    <span class="param-value"><DecodeText :text="String(getRingSizeName(selectedPlanetConfig.ring.size))" :delay="270" /></span>
                  </div>
                  <div v-if="selectedPlanetConfig.ring" class="param-item">
                    <span class="param-label">{{ t('params.ringColor') }}</span>
                    <span class="param-value color-box" :style="{ backgroundColor: hexColorToCSS(selectedPlanetConfig.ring.color) }"></span>
                  </div>
                </div>
                <div v-else class="planet-params-placeholder">
                  <div class="glitch-line">
                    <span class="glitch-label"><GlitchText :length="6" :speed="145" />:</span> <span class="glitch-value"><GlitchText :length="3" :speed="55" /></span>
                  </div>
                  <div class="glitch-line">
                    <span class="glitch-label"><GlitchText :length="6" :speed="150" />:</span> <span class="glitch-value"><GlitchText :length="3" :speed="60" /></span>
                  </div>
                  <div class="glitch-line">
                    <span class="glitch-label"><GlitchText :length="6" :speed="170" />:</span> <span class="glitch-value"><GlitchText :length="3" :speed="55" /></span>
                  </div>
                  <div class="glitch-line">
                    <span class="glitch-label"><GlitchText :length="6" :speed="165" />:</span> <span class="glitch-value"><GlitchText :length="3" :speed="75" /></span>
                  </div>
                  <div class="glitch-line">
                    <span class="glitch-label"><GlitchText :length="6" :speed="158" />:</span> <span class="glitch-value"><GlitchText :length="3" :speed="62" /></span>
                  </div>
                </div>
              </template>

              <Transition name="satellites-tube">
                <SatelliteGrid
                  v-if="satellitesReady && satelliteGrid"
                  :key="`grid-${uiStore.selectedPlanetIndex}`"
                  class="visual-satellite-grid"
                  :planet="selectedPlanet"
                  :paused="!settings.visual.rotate"
                  @select="index => uiStore.selectSatellite(uiStore.selectedPlanetIndex, index)"
                />
              </Transition>
            </div>

            <div v-if="selectedBody && selectedBody.visualization" class="drag-hint" aria-hidden="true">{{ t('system.drag') }}</div>
          </div>
        </TerminalWindow>
      </Transition>
    </div>

    <SystemTaskbar
      :windows="taskbarWindows"
      :hints="keyHints"
      :hover-hint="copyNotice ?? hoverHint"
      :arriving="taskbarArriving"
      :tabs="taskbarTabs"
      :current="focusedWindow"
      @restore="taskbarSwitch"
    />
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, onUnmounted, watch, computed } from 'vue'
import * as PIXI from 'pixi.js'
import { useMapStore } from '../stores/mapStore'
import { hyperlineTypeName } from '../utils/mapLegend'
import { useUIStore } from '../stores/uiStore'
import { createPlanetVisualizationConfig, planetScale, ringOuterRadius } from '../utils/planetRenderer'
import { PLANET_PRESETS } from '../utils/planetPresets'
import { createStarVisualizationConfig } from '../utils/starRenderer'
import { getInitialOrbitAngle, getOrbitNumbers, getOrbitSpeed, toRoman } from '../utils/planetOrbit'
import { useRichTypewriter } from '../composables/useRichTypewriter'
import { nextFrame } from '../utils/nextFrame'
import { PIXEL_FONT, loadPixelFont } from '../utils/fontLoader'
import { rebuildOnContextRestore } from '../utils/webglContext'
import { isTypingTarget } from '../utils/keyboard'
import { SYSTEM_WINDOWS, computeWindowLayout } from '../utils/windowLayout'
import { useScreenLayout } from '../composables/useScreenLayout'
import { createStarCaption, pixelTextStyle, placePlanetLabel, typePlanetLabel } from '../utils/systemLabels'
import { clampPage, hotkeyRange, pageCount, pageOf, planetForKey } from '../utils/planetPaging'
import { findNeighborStars } from '../utils/starNeighbors'
import { orbitArea, orbitScaler, starCaptionY, starScaleFor } from '../utils/systemLayout'
import { leadFirst } from '../utils/richText/simplify'
import {
  MINI_ORBIT_MAX_PX,
  PLANET_DISC_SHARE,
  bodyDotColor,
  getSatellites,
  miniOrbitLayout,
  miniOrbitReach,
  needsSatelliteGrid,
  orbitCount,
  orbitViewSize,
  planetDiscShare
} from '../utils/satellites'
import { STATION_GLYPHS, createStationConfig } from '../utils/stationRenderer'
import { language, t } from '../i18n'
import { themeMixHex, themeMixNumber, themeNumber } from '../theme'
import { useSystemSettings } from '../stores/systemSettings'
import { TYPING_PACE, TYPING_SPEED, useReadingText } from '../composables/useReadingText'
import { CRT_OFF_MS, CRT_ON_MS } from '../utils/crtTiming'
import { prefersReducedMotion } from '../utils/reducedMotion'
import { copyText, shareUrl } from '../social/copyLink'
import { playSound } from '../sound'
import PlanetVisualization from './PlanetVisualization.vue'
import StarVisualization from './StarVisualization.vue'
import SquaresBackground from './SquaresBackground.vue'
import GlitchText from './GlitchText.vue'
import DecodeText from './DecodeText.vue'
import TerminalWindow from './TerminalWindow.vue'
import CrtSnow from './CrtSnow.vue'
import DosMenu from './DosMenu.vue'
import PlanetList from './PlanetList.vue'
import SatelliteOrbits from './SatelliteOrbits.vue'
import SatelliteGrid from './SatelliteGrid.vue'
import StationVisualization from './StationVisualization.vue'
import RichText from './RichText.vue'
import SystemTaskbar from './SystemTaskbar.vue'
import DosBackground from './DosBackground.vue'

// `true` would also release Pixi's global resources (the shared batch pool),
// which breaks the galaxy map that stays alive in KeepAlive.
const PIXI_DESTROY_OPTIONS = { removeView: true, releaseGlobalResources: false }

const containerRef = ref(null)
const mapStore = useMapStore()
const uiStore = useUIStore()
const planetVisualizationConfigCache = new WeakMap()

let app = null
let planets = []
// { planet (index in planets), ring, dot, light (stations), phase, mark, radius, angle, speed, data, satelliteIndex }
let satelliteMarks = []
let orbitGraphicsList = []
const orbitingPlanets = ref([])
const settings = useSystemSettings()
const { style: readingStyle, sizeItem: readingSizeItem } = useReadingText()
const selectedPlanet = computed(() => uiStore.selectedPlanet)
const selectedSatellite = computed(() => uiStore.selectedSatellite)
const selectedBody = computed(() => uiStore.selectedBody)
const planetSatellites = computed(() => getSatellites(selectedPlanet.value))
const planetMoons = computed(() => planetSatellites.value.filter(satellite => satellite.kind === 'moon'))
const planetStations = computed(() => planetSatellites.value.filter(satellite => satellite.kind === 'station'))
const visualDiscShare = ref(PLANET_DISC_SHARE)

const SATELLITE_LINKS_SHOWN = 4
const satelliteLinksExpanded = ref(false)
const satelliteGroups = computed(() => [
  { id: 'moons', label: t('system.moons'), list: planetMoons.value },
  { id: 'stations', label: t('system.stations'), list: planetStations.value }
].filter(group => !selectedSatellite.value && group.list.length).map(group => {
  // "[ +1 ]" would take the room of the one link it hides.
  const folds = !satelliteLinksExpanded.value && group.list.length > SATELLITE_LINKS_SHOWN + 1
  const shown = folds ? group.list.slice(0, SATELLITE_LINKS_SHOWN) : group.list
  return { ...group, shown, more: group.list.length - shown.length }
}))
function showAllSatelliteLinks() {
  satelliteLinksExpanded.value = true
}
watch(() => uiStore.selectedPlanetIndex, () => { satelliteLinksExpanded.value = false })
const selectedSatelliteInfo = computed(() => (
  selectedSatellite.value ? planetSatellites.value.find(satellite => satellite.data === selectedSatellite.value) ?? null : null
))
const satellitePosition = computed(() => (
  planetMoons.value.findIndex(satellite => satellite.index === uiStore.selectedSatelliteIndex) + 1
))
const stationConfigs = new WeakMap()
function stationConfigOf(satellite) {
  if (!stationConfigs.has(satellite.data)) stationConfigs.set(satellite.data, createStationConfig({ ...satellite.data, type: satellite.type }))
  return stationConfigs.get(satellite.data)
}
const selectedStationConfig = computed(() => (
  selectedSatelliteInfo.value?.kind === 'station' ? stationConfigOf(selectedSatelliteInfo.value) : null
))
// One key per shown body: screens switch when it changes.
const bodyKey = computed(() => `body-${uiStore.selectedPlanetIndex}-${uiStore.selectedSatelliteIndex ?? 'planet'}`)
// New satellites come on with their planet, not by a guessed delay: they wait
// for the planet's tube to start, after the old planet has gone out.
const satellitesReady = ref(true)
watch(bodyKey, () => { satellitesReady.value = false }, { flush: 'sync' })

const hasSatelliteView = computed(() => (
  !!selectedPlanet.value && !selectedSatellite.value && !!selectedPlanet.value.visualization && planetSatellites.value.length > 0
))
// The body size the planet and its satellites share: the same in both modes,
// so the choice between them never flips back and forth.
const visualDisplayRef = ref(null)
const visualDisplaySize = reactive({ width: 0, height: 0 })
let visualDisplayObserver = null
watch(visualDisplayRef, element => {
  visualDisplayObserver?.disconnect()
  visualDisplayObserver = null
  if (!element) return
  const measure = () => {
    visualDisplaySize.width = element.clientWidth
    visualDisplaySize.height = element.clientHeight
  }
  measure()
  visualDisplayObserver = new ResizeObserver(measure)
  visualDisplayObserver.observe(element)
})
onUnmounted(() => visualDisplayObserver?.disconnect())
// The orbits once found they could not show every body (SatelliteOrbits
// `overflow`): the grid stays for this planet and this size of the window.
const orbitFitKey = computed(() => `${bodyKey.value}:${visualDisplaySize.width}x${visualDisplaySize.height}:${settings.visual.params}`)
const orbitOverflowKey = ref(null)
const satelliteGridForced = computed(() => {
  if (!hasSatelliteView.value) return false
  if (orbitOverflowKey.value === orbitFitKey.value) return true
  const config = getPlanetVisualizationConfig(selectedPlanet.value)
  return needsSatelliteGrid(planetSatellites.value, orbitViewSize(visualDisplaySize, settings.visual.params), ringOuterRadius(config), planetScale(config))
})
const satelliteGrid = computed(() => (
  hasSatelliteView.value && (settings.visual.layout === 'grid' || satelliteGridForced.value)
))
const layoutToggle = computed(() => {
  if (satelliteGridForced.value) return { label: t('system.layoutOrbits'), hint: t('system.layoutForced') }
  return satelliteGrid.value
    ? { label: t('system.layoutOrbits'), hint: t('system.layoutOrbitsHint') }
    : { label: t('system.layoutGrid'), hint: t('system.layoutGridHint') }
})

// The command is typed letter by letter, then the lore; it starts once the old
// screen has wiped out (the data-wipe transition).
const COMMAND_CHAR_MS = 20
const COMMAND_START_MS = 180
const commandText = computed(() => (
  selectedBody.value ? `READ ${selectedBody.value.name.toUpperCase()}.txt` : 'DIR'
))
const typedCommand = ref('')
const commandTyped = ref(true)
let commandTimer = null

function stopCommand() {
  clearTimeout(commandTimer)
  clearInterval(commandTimer)
  commandTimer = null
}

function finishCommand() {
  stopCommand()
  typedCommand.value = commandText.value
  commandTyped.value = true
}

watch(commandText, text => {
  stopCommand()
  if (!settings.data.typing) {
    finishCommand()
    return
  }
  typedCommand.value = ''
  commandTyped.value = false
  commandTimer = setTimeout(() => {
    let length = 0
    commandTimer = setInterval(() => {
      length++
      typedCommand.value = text.slice(0, length)
      playSound('typing')
      if (length >= text.length) finishCommand()
    }, COMMAND_CHAR_MS)
  }, COMMAND_START_MS)
}, { immediate: true })
watch(() => settings.data.typing, typing => { if (!typing) finishCommand() })
onUnmounted(stopCommand)

// The text of the lore before its card: the window is short (simplify.js).
const dataLoreDoc = computed(() => leadFirst(selectedBody.value?.loreDoc))

const { visibleCount: visibleLore, isTyping, finish: finishTyping } = useRichTypewriter(
  () => (commandTyped.value ? dataLoreDoc.value : null),
  { speed: TYPING_SPEED, pace: TYPING_PACE, instant: () => !settings.data.typing }
)
const isPrinting = computed(() => isTyping.value || !commandTyped.value)
async function skipTyping() {
  finishCommand()
  await nextTick()
  finishTyping()
}
const hoveredPlanetIndex = ref(null)
const isPlanetDragged = ref(false)
const selectedPlanetConfig = computed(() => getPlanetVisualizationConfig(selectedBody.value))
const bodySizeText = computed(() => {
  const satellite = selectedSatelliteInfo.value
  if (satellite) return t('system.shareOfPlanet', { percent: Math.round(satellite.size * 100) })
  return String(selectedPlanetConfig.value?.size ?? '')
})
const selectedPreset = computed(() => {
  const id = selectedPlanetConfig.value?.preset
  return id ? { id, ...PLANET_PRESETS[id] } : null
})

const { layout: screenLayout } = useScreenLayout()
const NARROW_SYSTEM_WIDTH = 560
const narrowScreen = ref(false)
let narrowObserver = null
const singleWindow = computed(() => screenLayout.value === 'phone' || narrowScreen.value)
const focusedWindow = ref('system')
const layout = computed(() => computeWindowLayout(uiStore.systemWindows, { single: singleWindow.value, current: focusedWindow.value }))
watch(() => [uiStore.selectedPlanetIndex, uiStore.selectedSatellite, singleWindow.value], ([planet, , single]) => {
  if (single && planet !== null && planet !== undefined) focusedWindow.value = 'data'
}, { immediate: true })
function taskbarSwitch(id) {
  if (singleWindow.value) focusedWindow.value = id
  else uiStore.restoreWindow(id)
}
const gridStyle = computed(() => ({
  gridTemplateAreas: layout.value.gridTemplateAreas,
  gridTemplateColumns: layout.value.gridTemplateColumns,
  gridTemplateRows: layout.value.gridTemplateRows
}))
const taskbarWindows = computed(() => SYSTEM_WINDOWS
  .filter(window => layout.value.taskbar.includes(window.id))
  .map(window => ({ ...window, title: t(window.file) })))
const isWindowVisible = id => layout.value.visible.includes(id)
const taskbarTabs = computed(() => (screenLayout.value === 'phone' && singleWindow.value
  ? SYSTEM_WINDOWS.map(window => ({ id: window.id, label: t(`windows.tabs.${window.id}`), title: t(window.file) }))
  : null))

// 'system' | 'data' | 'visual' | 'jump' | null
const openMenu = ref(null)
function toggleMenu(id) {
  openMenu.value = openMenu.value === id ? null : id
}
function closeMenu() {
  openMenu.value = null
}

const systemPlanets = computed(() => mapStore.getSystemByStarId(uiStore.selectedStar)?.planets ?? [])
// Counted from the star: the planets in the data are not ordered by distance.
const orbitNumbers = computed(() => getOrbitNumbers(systemPlanets.value))
const neighbors = computed(() => findNeighborStars(mapStore.stars, mapStore.hyperlines, uiStore.selectedStar))

const toggleItem = (windowId, key, label) => ({
  type: 'toggle',
  label,
  value: settings[windowId][key],
  onChange: value => settings.set(windowId, key, value)
})
const choiceItem = (windowId, key, label, options) => ({
  type: 'choice',
  label,
  value: settings[windowId][key],
  options,
  onChange: value => settings.set(windowId, key, value)
})
const resetItems = windowId => [
  { type: 'separator' },
  { type: 'action', label: t('windows.resetWindow'), onSelect: () => settings.reset(windowId) },
  { type: 'action', label: t('windows.resetAll'), onSelect: () => settings.resetAll() }
]

const systemMenuItems = computed(() => [
  choiceItem('system', 'speed', t('windows.orbits'), [
    { label: t('windows.stop'), value: 0 },
    ...[0.5, 1, 2].map(value => ({ label: t('windows.speed', { value }), value }))
  ]),
  toggleItem('system', 'labels', t('windows.planetLabels')),
  toggleItem('system', 'orbits', t('windows.orbitLines')),
  toggleItem('system', 'grid', t('windows.grid')),
  { type: 'separator' },
  { type: 'action', label: t('windows.copyLink'), onSelect: copySystemLink },
  ...resetItems('system')
])

const COPY_NOTICE_MS = 1500
const copyNotice = ref(null)
let copyTimer = null
async function copySystemLink() {
  const copied = await copyText(shareUrl({ starId: uiStore.selectedStar }))
  copyNotice.value = copied ? t('windows.linkCopied') : t('windows.linkNotCopied')
  playSound(copied ? 'success' : 'error')
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copyNotice.value = null }, COPY_NOTICE_MS)
}
onUnmounted(() => clearTimeout(copyTimer))

const dataMenuItems = computed(() => [
  readingSizeItem.value,
  toggleItem('data', 'typing', t('windows.typing')),
  ...resetItems('data')
])

const visualMenuItems = computed(() => [
  toggleItem('visual', 'rotate', t('windows.rotation')),
  toggleItem('visual', 'params', t('windows.parameters')),
  toggleItem('visual', 'grid', t('windows.grid')),
  ...resetItems('visual')
])

const jumpMenuItems = computed(() => neighbors.value.map(({ star, hyperline }) => ({
  type: 'action',
  label: String(star.name).toUpperCase(),
  // Without a description, the name of its type as the legend has it, not the type's id.
  hint: hyperline.description || (hyperline.type ? hyperlineTypeName(hyperline.type, mapStore.hyperlineTypes) : ''),
  onSelect: () => uiStore.jumpToStar(star.id)
})))

// Own state: the row disappears when a planet is picked, and its mouseleave
// may never come.
const listHoveredIndex = ref(null)
function hoverPlanetFromList(index) {
  listHoveredIndex.value = index
  listHoveredSatellite.value = null
}
const listHoveredSatellite = ref(null)
function hoverSatelliteFromList(planetIndex, satelliteIndex) {
  listHoveredSatellite.value = planetIndex === null ? null : { planetIndex, satelliteIndex }
  listHoveredIndex.value = planetIndex
}
watch([selectedBody, () => isWindowVisible('data')], () => {
  listHoveredIndex.value = null
  listHoveredSatellite.value = null
})

const frozenPlanetIndex = computed(() => hoveredPlanetIndex.value ?? listHoveredIndex.value)

watch(() => uiStore.systemWindows, closeMenu, { deep: true })

const listPage = ref(clampPage(pageOf(uiStore.selectedPlanetIndex), systemPlanets.value.length))
const pageTotal = computed(() => pageCount(systemPlanets.value.length))
const planetKeys = computed(() => hotkeyRange(listPage.value, systemPlanets.value.length))
function setListPage(page) {
  listPage.value = clampPage(page, systemPlanets.value.length)
}

const lastViewedIndex = ref(null)
watch(() => uiStore.selectedPlanetIndex, (index, previous) => {
  if (index !== null) {
    setListPage(pageOf(index))
  } else if (Number.isInteger(previous) && previous < systemPlanets.value.length) {
    // Only a planet this system has: an index from an old address is none.
    lastViewedIndex.value = previous
    setListPage(pageOf(previous))
  }
})

const keyHints = computed(() => {
  if (liveTerminal.value) return [t('system.statusRun'), t('system.statusHelp'), t('system.statusMap')]
  const count = bodyOrder.value.length
  const escape = openMenu.value ? 'system.statusMenu' : layout.value.maximized || layout.value.alone ? 'system.statusWindows' : 'system.statusMap'
  return [
    t(escape),
    planetKeys.value && t('system.statusPlanetKeys', { keys: planetKeys.value }),
    pageTotal.value > 1 && t('system.statusPages', { page: listPage.value + 1, pages: pageTotal.value }),
    count > 1 && t('system.statusFlip'),
    selectedPlanet.value && t('system.statusList')
  ].filter(Boolean)
})

const hoverHint = ref(null)
function handleHintOver(event) {
  hoverHint.value = event.target instanceof Element
    ? event.target.closest('[data-hint]')?.dataset.hint ?? null
    : null
}

const WINDOW_INTERFERENCE_MS = 160
const VISUAL_SWITCH_MS = 300
const crtStyle = {
  '--crt-on-duration': `${CRT_ON_MS}ms`,
  '--crt-off-duration': `${CRT_OFF_MS}ms`
}

// The window goes out first and only then moves to the taskbar, or the grid
// would rebuild before the animation ends.
const TASKBAR_ARRIVE_MS = 600
const poweringOff = ref(null)
const taskbarArriving = ref([])

function blinkTaskbarButton(id) {
  taskbarArriving.value = [...taskbarArriving.value, id]
  scheduleTimeout(() => {
    taskbarArriving.value = taskbarArriving.value.filter(item => item !== id)
  }, TASKBAR_ARRIVE_MS)
}

function powerOffWindow(id) {
  if (poweringOff.value) return
  if (prefersReducedMotion()) {
    uiStore.minimizeWindow(id)
    blinkTaskbarButton(id)
    return
  }
  closeMenu()
  poweringOff.value = id
  scheduleTimeout(() => {
    poweringOff.value = null
    uiStore.minimizeWindow(id)
    blinkTaskbarButton(id)
  }, CRT_OFF_MS)
}

function restoreAllWindows() {
  uiStore.resetWindows()
}

function toggleWindowLayout(id) {
  if (layout.value.alone) restoreAllWindows()
  else uiStore.toggleMaximizeWindow(id)
}

const windowsInterfering = ref(false)
watch(() => layout.value.maximized, () => {
  windowsInterfering.value = false
  requestAnimationFrame(() => {
    windowsInterfering.value = true
    scheduleTimeout(() => { windowsInterfering.value = false }, WINDOW_INTERFERENCE_MS)
  })
})

function windowClasses(id, hasOpenMenu) {
  return {
    'has-open-menu': hasOpenMenu,
    'is-powering-off': poweringOff.value === id,
    'is-interfering': windowsInterfering.value
  }
}

const visualSwitching = ref(false)
watch(bodyKey, () => {
  if (prefersReducedMotion()) return
  visualSwitching.value = false
  requestAnimationFrame(() => {
    visualSwitching.value = true
    playSound('static')
    scheduleTimeout(() => { visualSwitching.value = false }, VISUAL_SWITCH_MS)
  })
})

const dosRef = ref(null)
const dosReady = ref(false)
const liveTerminal = computed(() => (
  dosReady.value &&
  layout.value.visible.length === 0 &&
  uiStore.currentView === 'system' &&
  uiStore.transitionPhase === 'idle' &&
  !uiStore.syndicateHack
))

// The command line stays above the taskbar, which wraps to more rows on a
// narrow screen when every window is in it.
const systemViewRef = ref(null)
const taskbarHeight = ref(0)
let taskbarResizeObserver = null

const planetElements = []
let canvasOffsetX = 0
let canvasOffsetY = 0
// canvasOffsetX/Y as a ref, for the star the template places
const canvasOffset = ref({ x: 0, y: 0 })

const currentStar = computed(() => {
  return mapStore.getStarById(uiStore.selectedStar)
})

const pendingTimeouts = new Set()

function scheduleTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    pendingTimeouts.delete(timeoutId)
    callback()
  }, delay)
  pendingTimeouts.add(timeoutId)
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  const taskbar = systemViewRef.value?.querySelector('.system-taskbar')
  if (taskbar && typeof ResizeObserver !== 'undefined') {
    taskbarResizeObserver = new ResizeObserver(() => { taskbarHeight.value = taskbar.offsetHeight })
    taskbarResizeObserver.observe(taskbar)
  }
  if (systemViewRef.value && typeof ResizeObserver !== 'undefined') {
    // A screen not laid out yet (0 wide, in a transition) says nothing of its width.
    narrowObserver = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width
      if (width > 0) narrowScreen.value = width < NARROW_SYSTEM_WIDTH
    })
    narrowObserver.observe(systemViewRef.value)
  }

  // After a reload on '#/system/...' the view mounts before the star catalog
  // and the pixel font of the Pixi labels.
  await Promise.all([mapStore.whenLoaded(), loadPixelFont(`8px ${PIXEL_FONT}`)])
  if (isUnmounted) return

  const starName = currentStar.value?.name ? currentStar.value.name.toUpperCase() : t('loader.unknownSystem')
  uiStore.logLoadingStep('loader.openingSystem', { star: starName })
  await nextFrame()
  if (isUnmounted) return

  uiStore.logLoadingStep('loader.calculatingOrbits', { count: orbitCount(systemPlanets.value) })
  try {
    await initPixi()
  } catch (error) {
    console.error('Failed to draw the system:', error)
    // A Pixi that never finished starting cannot be destroyed in full: what
    // can be let go is, and the view no longer holds it.
    if (!pixiReady) {
      try {
        app?.destroy(PIXI_DESTROY_OPTIONS, { children: true, texture: true })
      } catch {
        // Half built: nothing more to free.
      }
      app = null
    }
    if (!isUnmounted) uiStore.failLoading('loader.systemRendererFailure')
    return
  }
  if (isUnmounted) {
    // Gone while Pixi was starting: onUnmounted could not destroy it yet.
    if (!pixiReady) app?.destroy(PIXI_DESTROY_OPTIONS, { children: true, texture: true })
    return
  }

  dosReady.value = true

  // The planets and the star draw their first frame on the next tick after mounting.
  uiStore.logLoadingStep('loader.renderingPlanets', { count: systemPlanets.value.length })
  await nextTick()
  await nextFrame()
  await nextFrame()
  if (!isUnmounted) uiStore.markViewReady('system')
})

let canvasResizeObserver = null
let canvasResizeFrame = null
let isUnmounted = false
// Pixi 8 cannot destroy an Application whose init() has not finished.
let pixiReady = false

onUnmounted(() => {
  isUnmounted = true
  window.removeEventListener('keydown', handleKeydown)
  canvasResizeObserver?.disconnect()
  taskbarResizeObserver?.disconnect()
  narrowObserver?.disconnect()
  if (canvasResizeFrame) cancelAnimationFrame(canvasResizeFrame)
  if (app && pixiReady) {
    app.destroy(PIXI_DESTROY_OPTIONS, { children: true, texture: true })
  }
  pendingTimeouts.forEach(clearTimeout)
  pendingTimeouts.clear()
})

watch(() => isWindowVisible('system'), visible => {
  if (!app?.renderer) return
  if (visible) app.start()
  else app.stop()
})

watch(() => settings.system.orbits, visible => {
  orbitGraphicsList.forEach(graphics => { graphics.visible = visible })
})

watch(() => settings.system.labels, visible => {
  planets.forEach(planet => { planet.labelContainer.visible = visible })
})

// The window can change size without the browser window resizing
// (maximize, minimize the neighbours): follow the container itself.
function handleCanvasResize() {
  canvasResizeFrame = null
  const container = containerRef.value
  if (!app?.renderer || !container) return
  const width = container.clientWidth
  const height = container.clientHeight
  // Hidden (minimized) windows have no size: keep the last layout.
  if (width <= 0 || height <= 0) return
  if (width !== app.screen.width || height !== app.screen.height) {
    app.renderer.resize(width, height)
    renderSystem()
  }
  updateCanvasOffset()
}

function scheduleCanvasResize() {
  if (canvasResizeFrame === null) canvasResizeFrame = requestAnimationFrame(handleCanvasResize)
}

const bodyOrder = computed(() => systemPlanets.value.flatMap((planet, planetIndex) => [
  { planetIndex, satelliteIndex: null },
  ...getSatellites(planet).map(satellite => ({ planetIndex, satelliteIndex: satellite.index }))
]))

function stepPlanet(direction) {
  const order = bodyOrder.value
  if (!order.length) return
  const current = order.findIndex(body => (
    body.planetIndex === uiStore.selectedPlanetIndex &&
    body.satelliteIndex === (uiStore.selectedSatellite ? uiStore.selectedSatelliteIndex : null)
  ))
  const next = order[current === -1
    ? (direction > 0 ? 0 : order.length - 1)
    : (current + direction + order.length) % order.length]
  if (next.satelliteIndex === null) uiStore.selectPlanet(next.planetIndex)
  else uiStore.selectSatellite(next.planetIndex, next.satelliteIndex)
}

function handleKeydown(event) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
  if (uiStore.transitionPhase !== 'idle' || uiStore.syndicateHack || isTypingTarget(event.target)) return

  const { key } = event
  if (liveTerminal.value && key.length === 1) {
    dosRef.value?.focus()
    return
  }
  if (key === 'Escape') {
    if (openMenu.value) closeMenu()
    else if (layout.value.maximized) uiStore.toggleMaximizeWindow(layout.value.maximized)
    else if (layout.value.alone) restoreAllWindows()
    else closeSystem()
  } else if (/^[1-9]$/.test(key)) {
    const index = planetForKey(key, listPage.value, systemPlanets.value.length)
    if (index === null) return
    uiStore.selectPlanet(index)
  } else if ((key === 'PageDown' || key === 'ArrowDown' || key === 'PageUp' || key === 'ArrowUp') && pageTotal.value > 1) {
    const step = key === 'PageDown' || key === 'ArrowDown' ? 1 : -1
    setListPage(listPage.value + step)
  } else if (key === '0') {
    uiStore.selectPlanet(null)
  } else if (key === 'ArrowRight') {
    stepPlanet(1)
  } else if (key === 'ArrowLeft') {
    stepPlanet(-1)
  } else {
    return
  }
  event.preventDefault()
}

async function initPixi() {
  app = new PIXI.Application()

  const width = containerRef.value.clientWidth || 800
  const height = containerRef.value.clientHeight || 600

  await app.init({
    backgroundAlpha: 0,
    width: width,
    height: height,
    antialias: false,
    resolution: 1,
    roundPixels: true
  })
  // Unmounted while Pixi was starting: there is no container any more.
  if (isUnmounted) return
  pixiReady = true

  app.canvas.classList.add('system-orbit-canvas')
  containerRef.value.appendChild(app.canvas)
  // The labels do not survive a lost WebGL context (utils/webglContext.js).
  rebuildOnContextRestore(app.canvas, () => { if (!isUnmounted) renderSystem() })

  renderSystem()

  app.ticker.add((ticker) => {
    const orbitStep = settings.system.speed * ticker.deltaTime
    planets.forEach((planet, index) => {
      if (frozenPlanetIndex.value !== index && orbitStep) {
        planet.angle += planet.speed * orbitStep
        planet.sprite.x = planet.centerX + Math.cos(planet.angle) * planet.orbitRadius
        planet.sprite.y = planet.centerY + Math.sin(planet.angle) * planet.orbitRadius
      }

      placePlanetLabel(planet, app.screen)
      typePlanetLabel(planet, ticker.deltaMS)

      const element = planetElements[index]
      if (element) element.style.transform = planetTransform(planet)
    })
    if (orbitStep) stationBlinkMs += ticker.deltaMS
    satelliteMarks.forEach(mark => {
      const planet = planets[mark.planet]
      if (!planet) return
      if (orbitStep) mark.angle += mark.speed * orbitStep
      const x = planet.sprite.x
      const y = planet.sprite.y
      mark.ring.position.set(Math.round(x), Math.round(y))
      const dotX = Math.round(x + Math.cos(mark.angle) * mark.radius)
      const dotY = Math.round(y + Math.sin(mark.angle) * mark.radius)
      mark.dot.position.set(dotX, dotY)
      mark.mark.position.set(dotX, dotY)
      if (mark.light) {
        mark.light.position.set(dotX, dotY)
        mark.light.visible = ((stationBlinkMs / STATION_BLINK_MS + mark.phase) % 1) < 0.5
      }
    })
  })

  canvasResizeObserver = new ResizeObserver(scheduleCanvasResize)
  canvasResizeObserver.observe(containerRef.value)
  if (!isWindowVisible('system')) app.stop()
  updateCanvasOffset()
}

function updateCanvasOffset() {
  if (!app?.canvas || !containerRef.value) return
  const canvasRect = app.canvas.getBoundingClientRect()
  const containerRect = containerRef.value.getBoundingClientRect()
  canvasOffsetX = canvasRect.left - containerRect.left
  canvasOffsetY = canvasRect.top - containerRect.top
  if (canvasOffset.value.x !== canvasOffsetX || canvasOffset.value.y !== canvasOffsetY) canvasOffset.value = { x: canvasOffsetX, y: canvasOffsetY }
}

function planetTransform(planet) {
  const x = planet.sprite.x + canvasOffsetX
  const y = planet.sprite.y + canvasOffsetY
  return `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
}

// Only the ticker moves the planet element; it is not in the template, or every
// re-render of SystemView (a hint, a hover) would put the planet back at the start
// of its orbit and the sights would miss it.
function setPlanetElement(element, index) {
  if (!element) {
    delete planetElements[index]
    return
  }
  planetElements[index] = element
  if (planets[index]) element.style.transform = planetTransform(planets[index])
}

function applyLabelSelection() {
  planets.forEach((planet, index) => {
    const selected = index === uiStore.selectedPlanetIndex
    if (planet.isSelected === selected) return
    planet.isSelected = selected
    planet.label.style.fill = selected ? themeNumber('text') : planet.labelColor
    planet.leaderKey = null
  })
}
watch(() => uiStore.selectedPlanetIndex, applyLabelSelection)

function renderSystem() {
  if (!app || !uiStore.selectedStar) return

  const previousAngles = new Map([
    ...planets.map(planet => [planet.data, planet.angle]),
    ...satelliteMarks.map(mark => [mark.data, mark.angle])
  ])
  // Redrawn on every resize: the old objects are destroyed, not only taken off.
  app.stage.removeChildren().forEach(child => child.destroy({ children: true }))
  planets = []
  satelliteMarks = []
  orbitGraphicsList = []
  orbitingPlanets.value = []
  planetElements.length = 0
  updateCanvasOffset()

  const star = mapStore.getStarById(uiStore.selectedStar)
  const system = mapStore.getSystemByStarId(uiStore.selectedStar) ?? { planets: [] }

  if (!star) return

  let maxOrbitRadius = 0
  if (system.planets) {
    system.planets.forEach(planet => {
      if (planet.orbitRadius > maxOrbitRadius) {
        maxOrbitRadius = planet.orbitRadius
      }
    })
  }

  // Mini orbits of satellites stick out of the outer planet orbit: keep room for them.
  const miniOrbitRoom = (system.planets ?? []).reduce((room, planet) => Math.max(room, miniOrbitReach(miniLayoutOf(planet))), 0)

  const starCaption = createStarCaption(star, system.planets?.length ?? 0)
  const area = orbitArea(app.screen.width, app.screen.height, starCaption.width)
  const { centerX, centerY } = area
  starCenter.value = { x: centerX, y: centerY }
  const availableSpace = Math.max(40, area.size - Math.min(miniOrbitRoom, MINI_ORBIT_MAX_PX) * 2)

  const orbits = (system.planets ?? []).map(planet => planet.orbitRadius)
  const toPx = orbitScaler(orbits, availableSpace / 2, PLANET_DOT_RADIUS + STAR_ORBIT_GAP)

  const innermostOrbit = Math.min(...orbits.filter(radius => radius > 0))
  starScale.value = starScaleFor(toPx(innermostOrbit), PLANET_DOT_RADIUS + STAR_ORBIT_GAP)

  starCaption.x = Math.round(area.caption ? area.caption.x : centerX)
  starCaption.y = Math.round(area.caption ? area.caption.y : starCaptionY(centerY, toPx(maxOrbitRadius)))
  app.stage.addChild(starCaption)

  // Orbits first, so they lie under the planets.
  if (system.planets) {
    system.planets.forEach(planetData => {
      const scaledRadius = toPx(planetData.orbitRadius)
      const orbitGraphics = new PIXI.Graphics()
      orbitGraphics.circle(centerX, centerY, scaledRadius)
      orbitGraphics.stroke({ width: 1.5, color: themeNumber('line'), alpha: 0.8 })
      orbitGraphics.visible = settings.system.orbits
      orbitGraphicsList.push(orbitGraphics)
      app.stage.addChild(orbitGraphics)
    })
  }

  // Mini orbits of satellites: over the planet orbits, under the labels.
  const satelliteLayer = new PIXI.Container()
  app.stage.addChild(satelliteLayer)

  if (system.planets) {
    system.planets.forEach(planetData => {
      const planetContainer = new PIXI.Container()

      const textColor = mapStore.planetTextColors[star.faction] || themeNumber('text')
      const planetName = new PIXI.Text({
        text: planetData.name,
        style: pixelTextStyle(8, textColor)
      })
      planetName.anchor.set(0.5)
      const planetLabelWidth = planetName.width
      // Callout and text in one group: the "Labels" menu item hides both.
      const planetLeader = new PIXI.Graphics()
      const planetLabelContainer = new PIXI.Container()
      planetLabelContainer.addChild(planetLeader, planetName)
      planetLabelContainer.visible = settings.system.labels
      planetContainer.addChild(planetLabelContainer)

      app.stage.addChild(planetContainer)

      // A redraw on resize keeps the current angle, so the planet does not jump.
      const angle = previousAngles.get(planetData) ?? getInitialOrbitAngle(planetData)

      const initialX = centerX + Math.cos(angle) * toPx(planetData.orbitRadius)
      const initialY = centerY + Math.sin(angle) * toPx(planetData.orbitRadius)

      planetContainer.x = initialX
      planetContainer.y = initialY

      planets.push({
        sprite: planetContainer,
        label: planetName,
        labelContainer: planetLabelContainer,
        labelText: planetData.name,
        labelWidth: planetLabelWidth,
        labelColor: textColor,
        leader: planetLeader,
        leaderKey: null,
        isSelected: false,
        labelSide: null,
        labelTypingElapsed: 0,
        labelTypedCharacters: null,
        centerX,
        centerY,
        orbitRadius: toPx(planetData.orbitRadius),
        angle,
        speed: getOrbitSpeed(planetData),
        data: planetData
      })

      if (planetData.visualization && app.canvas) {
        orbitingPlanets.value.push({
          // Same index as in `planets` and in the system's planet list,
          // even when some planets have no visualization.
          index: planets.length - 1,
          config: getPlanetVisualizationConfig(planetData),
          data: planetData
        })
      }

      addSatelliteMarks(satelliteLayer, planetData, planets.length - 1, initialX, initialY, previousAngles)
    })
  }
  applyLabelSelection()
  applySatelliteSelection()
}

// Radius of a planet disc on the orbit screen (40 px box at scale 0.5).
const PLANET_DOT_RADIUS = 7
const STAR_ORBIT_GAP = 6

const STATION_BLINK_MS = 1400
const STATION_PANEL_COLOR = 0x34599a
let stationBlinkMs = 0
const SWARM_SPEED = 0.012

function moonDot(satellite) {
  const dotRadius = Math.max(1, Math.min(3, Math.round(satellite.size * PLANET_DOT_RADIUS)))
  const dot = new PIXI.Graphics()
  for (let row = -dotRadius; row < dotRadius; row++) {
    const half = Math.max(1, Math.round(Math.sqrt(dotRadius * dotRadius - (row + 0.5) ** 2)))
    dot.rect(-half, row, half * 2, 1)
  }
  dot.fill({ color: bodyDotColor(createPlanetVisualizationConfig(satellite.data)) })
  return { dot, light: null, extent: dotRadius }
}

function stationGlyph(satellite) {
  const config = stationConfigOf(satellite)
  const rows = STATION_GLYPHS[config.type]
  const left = -Math.floor(rows[0].length / 2)
  const top = -Math.floor(rows.length / 2)
  const dot = new PIXI.Graphics()
  const light = new PIXI.Graphics()
  const cells = symbol => rows.flatMap((row, rowIndex) => [...row]
    .map((character, column) => (character === symbol ? [left + column, top + rowIndex] : null))
    .filter(Boolean))
  const panels = cells('P')
  cells('#').forEach(([cellX, cellY]) => dot.rect(cellX, cellY, 1, 1))
  dot.fill({ color: config.hull })
  if (panels.length) {
    panels.forEach(([cellX, cellY]) => dot.rect(cellX, cellY, 1, 1))
    dot.fill({ color: STATION_PANEL_COLOR })
  }
  cells('L').forEach(([cellX, cellY]) => light.rect(cellX, cellY, 1, 1))
  light.fill({ color: config.lights })
  return { dot, light, extent: Math.ceil(Math.max(rows[0].length, rows.length) / 2) }
}

function miniLayoutOf(planetData) {
  const ringOuterPx = ringOuterRadius(getPlanetVisualizationConfig(planetData)) * PLANET_DOT_RADIUS
  return miniOrbitLayout(getSatellites(planetData), PLANET_DOT_RADIUS, ringOuterPx)
}

function drawHalo(graphics, radius) {
  const steps = Math.round((Math.PI * 2 * radius) / 2)
  for (let step = 0; step < steps; step += 2) {
    const angle = (step / steps) * Math.PI * 2
    graphics.rect(Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius), 1, 1)
  }
  return graphics.fill({ color: themeMixNumber('dim', 0.49, 'line'), alpha: 0.8 })
}

function addSatelliteMarks(layer, planetData, planetIndex, x, y, previousAngles) {
  const satellites = getSatellites(planetData)
  if (!satellites.length) return
  const layout = miniLayoutOf(planetData)
  const newRing = radius => {
    const ring = new PIXI.Graphics()
    if (layout.mode === 'swarm') drawHalo(ring, radius)
    else ring.circle(0, 0, radius).stroke({ width: 1, color: themeNumber('line'), alpha: 0.5, pixelLine: true })
    ring.visible = settings.system.orbits
    ring.position.set(Math.round(x), Math.round(y))
    orbitGraphicsList.push(ring)
    layer.addChild(ring)
    return ring
  }
  const rings = layout.mode === 'swarm' ? [newRing(layout.haloRadius)] : layout.radii.map(newRing)

  satellites.forEach((satellite, position) => {
    const swarm = layout.mode === 'swarm'
    const ring = swarm ? rings[0] : rings[satellite.orbit]
    const radius = swarm ? layout.haloRadius : layout.radii[satellite.orbit]
    const isStation = satellite.kind === 'station'
    const { dot, light, extent } = isStation ? stationGlyph(satellite) : moonDot(satellite)

    const reach = extent + 3
    const mark = new PIXI.Graphics()
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        mark.rect(sx < 0 ? -reach : reach - 2, sy * reach - (sy > 0 ? 1 : 0), 3, 1)
        mark.rect(sx * reach - (sx > 0 ? 1 : 0), sy < 0 ? -reach : reach - 2, 1, 3)
      }
    }
    mark.fill({ color: themeNumber('text') })
    mark.visible = false

    layer.addChild(dot, mark)
    if (light) layer.addChild(light)
    const angle = previousAngles.get(satellite.data) ??
      (swarm ? (position * Math.PI * 2) / satellites.length : satellite.angle)
    satelliteMarks.push({
      planet: planetIndex,
      ring,
      dot,
      light,
      phase: isStation ? (stationConfigOf(satellite).seed % 100) / 100 : 0,
      mark,
      radius,
      angle,
      speed: swarm ? SWARM_SPEED : satellite.speed,
      data: satellite.data,
      satelliteIndex: satellite.index
    })
  })
}

function applySatelliteSelection() {
  satelliteMarks.forEach(mark => {
    mark.mark.visible = mark.planet === uiStore.selectedPlanetIndex &&
      mark.satelliteIndex === uiStore.selectedSatelliteIndex && !!uiStore.selectedSatellite
  })
}
watch(() => [uiStore.selectedPlanetIndex, uiStore.selectedSatelliteIndex], applySatelliteSelection)

function closeSystem() {
  uiStore.closeSystemView()
}

function handlePlanetMouseEnter(index) {
  const bounds = planetElements[index]?.getBoundingClientRect()
  if (!bounds) return
  const screenX = bounds.left + bounds.width / 2
  const screenY = bounds.top + bounds.height / 2

  uiStore.setCursorTarget(screenX, screenY)
  playSound('planetHover')

  hoveredPlanetIndex.value = index
}

function handlePlanetMouseLeave() {
  uiStore.clearCursorTarget()

  hoveredPlanetIndex.value = null
}

function getPlanetVisualizationConfig(planet) {
  if (!planet?.visualization) return null

  const cached = planetVisualizationConfigCache.get(planet)
  if (cached?.source === planet.visualization) return cached.config

  const config = createPlanetVisualizationConfig(planet)
  planetVisualizationConfigCache.set(planet, {
    source: planet.visualization,
    config
  })
  return config
}

function hexColorToCSS(color) {
  // Config numbers and "0xRRGGBB" strings → "#RRGGBB"
  if (typeof color === 'number') return `#${color.toString(16).padStart(6, '0')}`
  if (typeof color === 'string' && color.startsWith('0x')) {
    return '#' + color.slice(2)
  }
  return color
}

const LIQUIDS = ['water', 'lava', 'acid', 'magma', 'ice', 'methane', 'ammonia', 'oil']
const RING_SIZES = ['thin', 'medium', 'large']

function getWaterTypeName(type) {
  return LIQUIDS.includes(type) ? t(`params.${type}`) : type
}

function getRingSizeName(size) {
  return RING_SIZES.includes(size) ? t(`params.${size}`) : size
}

// One object per star, not one per render: StarVisualization watches it
// deeply and redraws the star whenever it is a new one, and the DOS
// background re-renders this view several times a second.
const starVisualConfig = computed(() => createStarVisualizationConfig(currentStar.value))
const starScale = ref(1)
const starCenter = ref(null)
const starStyle = computed(() => (starCenter.value
  ? { left: `${starCenter.value.x + canvasOffset.value.x}px`, top: `${starCenter.value.y + canvasOffset.value.y}px` }
  : null))
</script>

<style scoped>
.system-view {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
}

/* The grid template comes from computeWindowLayout */
.system-content {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 16px;
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

.system-view.is-phone .system-content {
  gap: 8px;
  padding: 8px;
}

.window-system {
  grid-area: system;
}

.window-data {
  grid-area: data;
}

.window-visual {
  grid-area: visual;
}

/* A window with an open menu stays over its neighbours: the menu may overlap them */
.has-open-menu {
  z-index: 5;
}

.window-power-enter-active {
  animation: crt-on var(--crt-on-duration) both;
}

.window-power-enter-active :deep(.crt-bloom) {
  animation: bloom-on var(--crt-on-duration) both;
}

/* Already gone out (is-powering-off): v-show keeps it a frame or two without the
   animation, and without this it flashed in full over the empty screen. */
.window-power-leave-active {
  display: none;
}

.terminal-window.is-powering-off {
  animation: crt-off var(--crt-off-duration) both;
  pointer-events: none;
}

.terminal-window.is-powering-off :deep(.crt-bloom) {
  animation: bloom-off var(--crt-off-duration) both;
}

.terminal-window.is-interfering {
  animation: crt-interference 160ms linear both;
}

.data-wipe-leave-active {
  animation: data-wipe-out 160ms steps(6, end) both;
}

.data-wipe-enter-active {
  animation: data-wipe-in 220ms steps(8, end) both;
}

@keyframes data-wipe-out {
  from { clip-path: inset(0 0 0 0); }
  to { clip-path: inset(100% 0 0 0); }
}

@keyframes data-wipe-in {
  from { clip-path: inset(0 0 100% 0); }
  to { clip-path: inset(0 0 0 0); }
}

.planet-tube-enter-active {
  animation: crt-on 360ms both;
}

.planet-tube-leave-active {
  animation: crt-off 180ms both;
}

/* Drawn over the planet (z 2) during the animation: the flash of the tube hides it. */
.satellites-tube-enter-active {
  z-index: 2;
  animation: crt-on 360ms both;
}

.satellites-tube-leave-active {
  z-index: 2;
  animation: crt-off 180ms both;
}

.planet-display-container.is-switching {
  animation: crt-channel-roll 300ms linear both;
}

.visual-static {
  z-index: 3;
  opacity: 0.65;
}

.planet-params .color-box {
  animation: param-blink 420ms steps(1, end) both;
}

@keyframes param-blink {
  0%, 30%, 60% { opacity: 0; }
  15%, 45%, 75%, 100% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .window-power-enter-active,
  .terminal-window.is-powering-off,
  .terminal-window.is-interfering,
  .data-wipe-enter-active,
  .data-wipe-leave-active,
  .planet-tube-enter-active,
  .planet-tube-leave-active,
  .satellites-tube-enter-active,
  .satellites-tube-leave-active,
  .planet-display-container.is-switching,
  .planet-params .color-box {
    animation: none;
  }

  .visual-static {
    display: none;
  }
}

.jump-anchor {
  position: relative;
}

.canvas-container {
  width: 100%;
  height: 100%;
  background: var(--ui-screen);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.terminal-body-planets {
  flex: 1;
  padding: 0;
  overflow: hidden;
}

/* PixiJS canvas is appended dynamically, so it needs a deep selector. */
.canvas-container > :deep(.system-orbit-canvas) {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.terminal-body-planets :deep(.squares-canvas) {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 0 !important;
}

.star-container {
  position: absolute;
  width: 200px;
  height: 200px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 10;
}

.planet-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 40px;
  height: 40px;
  pointer-events: all;
  cursor: none;
  z-index: 20;
  will-change: transform;
}

.planet-scale-layer {
  width: 100%;
  height: 100%;
  transition: transform 0.2s ease;
}

.planet-container:hover .planet-scale-layer,
.planet-container.is-hovered .planet-scale-layer {
  transform: scale(1.2);
}

.planet-container.is-selected::after {
  content: '';
  position: absolute;
  inset: -6px;
  pointer-events: none;
  background:
    linear-gradient(var(--ui-text), var(--ui-text)) top left / 8px 2px,
    linear-gradient(var(--ui-text), var(--ui-text)) top left / 2px 8px,
    linear-gradient(var(--ui-text), var(--ui-text)) top right / 8px 2px,
    linear-gradient(var(--ui-text), var(--ui-text)) top right / 2px 8px,
    linear-gradient(var(--ui-text), var(--ui-text)) bottom left / 8px 2px,
    linear-gradient(var(--ui-text), var(--ui-text)) bottom left / 2px 8px,
    linear-gradient(var(--ui-text), var(--ui-text)) bottom right / 8px 2px,
    linear-gradient(var(--ui-text), var(--ui-text)) bottom right / 2px 8px;
  background-repeat: no-repeat;
  animation:
    selected-lock 200ms steps(4, end) both,
    selected-blink 1s steps(1, end) 200ms infinite;
}

@keyframes selected-lock {
  from { inset: -18px; }
  to { inset: -6px; }
}

@keyframes selected-blink {
  0%, 60% { opacity: 1; }
  60.01%, 100% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
  .planet-container.is-selected::after {
    animation: none;
  }
}

.back-btn {
  background: transparent;
  border: 1px solid var(--ui-text);
  color: var(--ui-text);
  font-family: var(--font-pixel);
  font-size: 8px;
  line-height: 1;
  height: 18px;
  padding: 0 6px;
  white-space: nowrap;
  cursor: none;
  transition: all 0.2s;
}

.back-btn:hover:not(:disabled),
.back-btn[aria-expanded="true"] {
  background: var(--ui-text);
  color: var(--ui-screen);
}

.back-btn:disabled {
  border-color: var(--ui-line);
  color: var(--ui-line);
}

.terminal-body {
  padding: 15px;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.terminal-prompt {
  color: color-mix(in srgb, var(--ui-dim) 74%, var(--ui-line));
  margin-bottom: 10px;
  font-family: var(--font-pixel);
  font-size: 8px;
  line-height: 2;
}

.terminal-text {
  color: color-mix(in srgb, var(--ui-dim) 74%, var(--ui-line));
  font-family: var(--font-pixel);
  font-size: 8px;
  line-height: 2;
}

.terminal-cursor {
  display: inline-block;
  width: 8px;
  height: 12px;
  background: var(--ui-text);
  animation: crt-blink 1s steps(1, end) infinite;
  margin-left: 4px;
  vertical-align: middle;
}

.terminal-body::-webkit-scrollbar {
  width: 12px;
}

.terminal-body::-webkit-scrollbar-track {
  background: rgba(20, 20, 20, 0.5);
  border-left: 2px solid rgb(var(--ui-text-rgb) / 0.2);
}

.terminal-body::-webkit-scrollbar-thumb {
  background: rgb(var(--ui-text-rgb) / 0.5);
  border: 2px solid rgb(var(--ui-text-rgb) / 0.2);
  box-shadow: 0 0 8px rgb(var(--ui-text-rgb) / 0.3);
}

.terminal-body::-webkit-scrollbar-thumb:hover {
  background: rgb(var(--ui-text-rgb) / 0.7);
  box-shadow: 0 0 12px rgb(var(--ui-text-rgb) / 0.5);
}

.planet-data-body .terminal-prompt,
.planet-data-body .terminal-text,
.planet-data-body .planet-lore-title,
.planet-data-body .planet-lore-orbit,
.planet-data-body .planet-lore-text,
.planet-data-list {
  font-size: 8px;
  color: color-mix(in srgb, var(--ui-text) 77%, var(--ui-dim));
}

.planet-data-body .terminal-prompt,
.planet-data-body .planet-lore-orbit {
  color: var(--ui-dim);
}

.planet-data-body .planet-lore-title {
  color: var(--ui-text);
}

.planet-lore-orbit {
  margin: -4px 0 12px;
  font-family: var(--font-pixel);
  line-height: 2;
}

.planet-lore-satellites {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin: -8px 0 12px;
  font-family: var(--font-pixel);
  font-size: 8px;
  line-height: 2;
}

.satellites-label {
  color: var(--ui-dim);
}

.planet-lore-satellites .satellite-link {
  margin: 0;
}

.planet-data-body .terminal-cursor {
  width: 8px;
  height: 12px;
  background: var(--ui-text);
}

.planet-data-body .cursor {
  color: var(--ui-text);
}

.planet-data-list {
  margin-top: 12px;
}

.terminal-link {
  margin-top: 14px;
  padding: 4px 6px;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font-family: var(--font-pixel);
  font-size: 8px;
  cursor: none;
}

.terminal-link:hover,
.terminal-link:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.planet-lore-title {
  font-size: 8px;
  font-weight: normal;
  color: color-mix(in srgb, var(--ui-dim) 74%, var(--ui-line));
  margin-bottom: 10px;
  font-family: var(--font-pixel);
  position: relative;
  z-index: 2;
  line-height: 2;
}

.planet-lore-text {
  line-height: 2;
  margin: 0;
  font-family: var(--font-pixel);
  position: relative;
  z-index: 2;
}

.skip-hint {
  margin: 1em 0 0;
  color: var(--ui-dim);
}


.cursor {
  animation: crt-blink 1s steps(1, end) infinite;
  color: white;
  text-shadow:
    0 0 8px rgb(var(--ui-text-rgb) / 0.8),
    0 0 16px rgb(var(--ui-text-rgb) / 0.5);
}

.terminal-body-visual {
  flex: 1;
  padding: 10px;
  overflow: hidden;
  position: relative;
  container-type: size;
}

.drag-hint {
  position: absolute;
  left: 50%;
  bottom: 8px;
  z-index: 3;
  transform: translateX(-50%);
  color: #666666;
  font-family: var(--font-pixel);
  font-size: 8px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}

.terminal-body-visual:hover .drag-hint {
  opacity: 1;
}

.terminal-body-visual.is-dragging .drag-hint {
  opacity: 0;
}

.terminal-body-visual :deep(.squares-canvas) {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 0 !important;
}

.planet-display-container {
  display: flex;
  flex-direction: row;
  gap: 20px;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
}

/* The big planet sits between the far and the near halves of its satellites' orbits */
.planet-canvas-wrapper > .planet-visualization {
  position: relative;
  z-index: 1;
}

.planet-canvas-wrapper {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-width: 60%;
  height: 100%;
  position: relative;
  z-index: 2;
}

.planet-display-container.is-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas:
    "planet satellites"
    "params satellites";
  gap: 10px 20px;
  align-items: stretch;
}

.planet-display-container.is-grid .planet-canvas-wrapper {
  grid-area: planet;
  max-width: none;
  min-height: 0;
  height: auto;
}

.planet-display-container.is-grid .planet-params {
  grid-area: params;
  justify-self: center;
}

.planet-display-container.is-grid:not(:has(.planet-params)) {
  grid-template-areas:
    "planet satellites"
    "planet satellites";
}

.visual-satellite-grid {
  grid-area: satellites;
  position: relative;
  z-index: 2;
}

/* Going out after a switch to the orbits: out of the way of the planet, or
   the orbits would measure themselves squeezed by it. */
.planet-display-container:not(.is-grid) .visual-satellite-grid {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 40%;
}

@container (max-height: 320px) and (min-width: 521px) {
  .planet-display-container.is-grid {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1.6fr);
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: "planet params satellites";
  }

  .planet-display-container.is-grid:not(:has(.planet-params)) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
    grid-template-areas: "planet satellites";
  }

  .planet-display-container.is-grid .planet-params {
    align-self: center;
  }
}

@container (max-width: 520px) {
  .planet-display-container.is-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(96px, 1fr) auto minmax(0, 1fr);
    grid-template-areas:
      "planet"
      "params"
      "satellites";
  }

  .planet-display-container.is-grid:not(:has(.planet-params)) {
    grid-template-rows: minmax(96px, 1fr) minmax(0, 1fr);
    grid-template-areas:
      "planet"
      "satellites";
  }
}

.planet-canvas-wrapper:only-child {
  max-width: 100%;
}

.planet-params {
  flex: 0 0 auto;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--font-pixel);
  font-size: 8px;
  color: color-mix(in srgb, var(--ui-text) 50%, var(--ui-dim));
  position: relative;
  z-index: 2;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-label {
  color: color-mix(in srgb, var(--ui-dim) 74%, var(--ui-line));
  min-width: 100px;
}

.param-value {
  color: var(--ui-text);
}

.param-value.color-box {
  width: 20px;
  height: 12px;
  border: 1px solid #666;
}

.planet-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.placeholder-hint {
  position: absolute;
  top: calc(50% + 40px);
  left: 50%;
  transform: translateX(-50%);
  color: color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line));
  font-family: var(--font-pixel);
  font-size: 8px;
  white-space: nowrap;
  animation: crt-blink 1s steps(1, end) infinite;
}

.planet-outline {
  width: 200px;
  height: 200px;
  filter: drop-shadow(0 0 10px rgb(var(--ui-text-rgb) / 0.3));
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

.dashed-circle {
  animation: rotate-outline 15s linear infinite, pulse-glow 2s ease-in-out infinite;
}

@keyframes rotate-outline {
  from {
    transform: rotate(0deg);
    transform-origin: center;
  }
  to {
    transform: rotate(360deg);
    transform-origin: center;
  }
}

@keyframes pulse-glow {
  0%, 100% {
    stroke-opacity: 0.3;
  }
  50% {
    stroke-opacity: 0.8;
  }
}

.question-mark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--font-pixel);
  font-size: 48px;
  color: var(--ui-text);
  text-shadow:
    0 0 10px rgb(var(--ui-text-rgb) / 0.8),
    0 0 20px rgb(var(--ui-text-rgb) / 0.5);
  animation: flicker-question 3s infinite;
  opacity: 0.6;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

@keyframes flicker-question {
  0%, 100% {
    opacity: 0.6;
  }
  10% {
    opacity: 0.3;
  }
  20% {
    opacity: 0.8;
  }
  30% {
    opacity: 0.4;
  }
  40%, 60% {
    opacity: 0.7;
  }
  50% {
    opacity: 0.2;
  }
  70% {
    opacity: 0.9;
  }
  80% {
    opacity: 0.5;
  }
  90% {
    opacity: 0.7;
  }
}

.planet-params-placeholder {
  flex: 0 0 auto;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--font-pixel);
  font-size: 8px;
  color: color-mix(in srgb, var(--ui-text) 50%, var(--ui-dim));
  position: relative;
  z-index: 2;
}

.glitch-line {
  display: flex;
  align-items: center;
  gap: 0;
}

.glitch-label {
  color: color-mix(in srgb, var(--ui-dim) 74%, var(--ui-line));
}

.glitch-value {
  color: var(--ui-text);
}

/* Narrow window (a laptop screen): a 200 px parameters column left the planet a
   sliver, so the parameters take the width of their text. */
@container (max-width: 440px) {
  .planet-display-container {
    gap: 12px;
  }

  .planet-params,
  .planet-params-placeholder {
    width: auto;
    gap: 6px;
  }

  .param-label {
    min-width: 0;
  }

  .planet-params {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    column-gap: 8px;
  }

  .planet-params .param-item {
    display: contents;
  }

  .planet-params .color-box {
    justify-self: start;
  }

  .planet-outline {
    width: min(200px, 100%);
    height: auto;
    max-height: 100%;
    aspect-ratio: 1;
  }

  .question-mark {
    font-size: 32px;
  }

  .placeholder-hint {
    top: calc(50% + 28px);
    max-width: 100%;
    white-space: normal;
    text-align: center;
  }
}

/* Ensure system content is above MS-DOS background */
.system-content {
  position: relative;
  z-index: 1;
}

/* All windows minimized: the empty grid lets clicks through to the terminal. */
.system-content.is-empty {
  pointer-events: none;
}
</style>
