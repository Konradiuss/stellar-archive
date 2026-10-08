<script setup>
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { useMapStore } from './stores/mapStore'
import { useUIStore } from './stores/uiStore'
import GalaxyView from './components/GalaxyView.vue'
import LorePanel from './components/LorePanel.vue'
import MapLegend from './components/MapLegend.vue'
import MusicPlayer from './components/MusicPlayer.vue'
import TargetCursor from './components/TargetCursor.vue'
import CrtScreen from './components/CrtScreen.vue'
import ScreenBezel from './components/ScreenBezel.vue'
import CircuitBoard from './components/CircuitBoard.vue'
import DraftBanner from './components/DraftBanner.vue'
import { useRouteSync } from './composables/useRouteSync'
import { useDocumentHead } from './composables/useDocumentHead'
import { useScreenLayout } from './composables/useScreenLayout'
import { useSoundCues } from './composables/useSoundCues'
import { isEditorRoute } from './utils/hashRoute'
import { previewDraft } from './editor/draft'

const EditorView = defineAsyncComponent(() => import('./components/EditorView.vue'))

const mapStore = useMapStore()
const uiStore = useUIStore()
useSoundCues()
const { layout, landscape } = useScreenLayout()
// A phone on its side: the strip under the screen would take a quarter of it.
const sideDock = computed(() => layout.value === 'phone' && landscape.value)

const lazyScreen = load => defineAsyncComponent({
  loader: load,
  onError(error, retry, fail) {
    console.error('A screen of the site could not be loaded:', error)
    uiStore.failLoading('loader.screenUnavailable', {}, [String(error?.message ?? error)])
    fail()
  }
})
const SystemView = lazyScreen(() => import('./components/SystemView.vue'))
const WikiView = lazyScreen(() => import('./components/WikiView.vue'))
const SyndicateHack = lazyScreen(() => import('./components/SyndicateHack.vue'))

// Decided once per load: going between the editor and the site reloads the page.
const editing = isEditorRoute(window.location.hash)
window.addEventListener('hashchange', () => {
  if (isEditorRoute(window.location.hash) !== editing) window.location.reload()
})
const showingDraft = !editing && !!previewDraft()

if (!editing) {
  useRouteSync()
  useDocumentHead()
}

const mainScreenStatus = computed(() => {
  if (uiStore.loadError || uiStore.syndicateHack) return 'error'
  return uiStore.transitionPhase === 'idle' ? 'on' : 'busy'
})

onMounted(() => {
  if (!editing) mapStore.loadMapData()
})
</script>

<template>
  <EditorView v-if="editing" />
  <div v-else class="app-container" :class="{ 'is-hacked': uiStore.syndicateHack }">
    <DraftBanner v-if="showingDraft" />
    <TargetCursor />
    <div v-if="uiStore.syndicateHack" class="syndicate-blocker"></div>

    <div class="responsive-layout" :class="[`is-${layout}`, { 'is-side-dock': sideDock }]">
      <CircuitBoard />
      <LorePanel v-if="layout !== 'phone'" class="lore-panel" />
      <ScreenBezel class="canvas-area" seed="map" :status="mainScreenStatus">
        <CrtScreen>
          <KeepAlive include="GalaxyView">
            <GalaxyView v-if="uiStore.currentView === 'galaxy'" />
            <!-- The key remounts the sector screen on a hyperline jump, behind the CRT effect. -->
            <SystemView v-else-if="uiStore.currentView === 'system'" :key="uiStore.selectedStar" />
            <WikiView v-else-if="uiStore.currentView === 'wiki'" />
          </KeepAlive>
          <SyndicateHack v-if="uiStore.syndicateHack" />
        </CrtScreen>
      </ScreenBezel>
      <MapLegend class="legend" />
      <MusicPlayer class="music-player" :compact="layout !== 'desktop'" :vertical="sideDock" />
    </div>
  </div>
</template>

<style>
.app-container {
  width: 100%;
  height: 100%;
  background: #000;
  position: relative;
}

.responsive-layout {
  --console-gap: 14px;

  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  gap: var(--console-gap);
  /* Shows until CircuitBoard first draws, and in the casings' rounded corners */
  background: #173a27;
}

.syndicate-blocker {
  position: fixed;
  inset: 0;
  z-index: 10000;
}

/* Keep the lore terminal above SystemView's DOS background layers. */
.responsive-layout > .lore-panel {
  z-index: 1;
}

.responsive-layout .canvas-area {
  min-width: 0;
  min-height: 0;
}

.responsive-layout.is-desktop {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: minmax(0, 1fr) auto;
}

.is-desktop > .lore-panel {
  grid-column: 2;
  grid-row: 1;
  width: 320px;
  height: 100%;
}

/* Rises by the gap to sit right under the lore terminal; contain: size keeps it
   from making the legend row taller. */
.is-desktop > .music-player {
  grid-column: 2;
  grid-row: 2;
  width: 320px;
  margin-top: calc(-1 * var(--console-gap));
  contain: size;
}

.is-desktop > .canvas-area {
  grid-column: 1;
  grid-row: 1;
}

.is-desktop > .legend {
  grid-column: 1;
  grid-row: 2;
  min-width: 0;
  width: 100%;
  /* ~52px of this is the metal casing */
  height: 186px;
}

.responsive-layout.is-tablet {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 3fr) minmax(0, 2fr) auto;
  grid-template-areas:
    "screen screen"
    "legend lore"
    "player player";
}

.is-tablet > .canvas-area { grid-area: screen; }
.is-tablet > .lore-panel { grid-area: lore; }
.is-tablet > .legend { grid-area: legend; }
.is-tablet > .music-player { grid-area: player; }

.is-tablet > .lore-panel,
.is-tablet > .legend {
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.is-tablet > .music-player,
.is-phone > .music-player {
  width: 100%;
  height: 76px;
}

.responsive-layout.is-phone {
  --console-gap: 8px;

  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) 88px;
  grid-template-areas:
    "screen screen"
    "dock player";
}

.is-phone > .canvas-area { grid-area: screen; }
.is-phone > .legend {
  grid-area: dock;
  height: 100%;
}

.is-phone > .music-player {
  grid-area: player;
  align-self: center;
}

.responsive-layout.is-phone.is-side-dock {
  grid-template-columns: 66px minmax(0, 1fr);
  grid-template-rows: 88px minmax(0, 1fr);
  grid-template-areas:
    "dock screen"
    "player screen";
}

.is-side-dock > .legend {
  justify-self: center;
}

.is-side-dock > .music-player {
  align-self: start;
  height: auto;
}
</style>
