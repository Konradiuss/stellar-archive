<template>
  <div class="legend-dock board-block">
    <ModeBreaker :tint="legendTint" />
    <RetroPanel
      v-if="layout !== 'phone'"
      class="map-legend"
      :seed="LEGEND_SEED"
      :file="inWiki ? t('files.navbox') : t('files.legend')"
      :title="title"
      :content="mapStore.isLoaded ? content : null"
      :power-on-delay="400"
    >
      <template #default="{ content: shown }">
        <WikiNavbox
          v-if="shown.navbox"
          :navbox="shown.navbox"
          :pages="shown.pages"
          :current-slug="uiStore.wikiPage?.slug ?? null"
        />
        <LegendSections v-else :sections="shown" :view="view" />
      </template>
    </RetroPanel>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUIStore } from '../stores/uiStore'
import { pickTint } from '../utils/bezelSprites'
import { themeCasings } from '../theme'
import { buildLegend } from '../utils/mapLegend'
import { t } from '../i18n'
import RetroPanel from './RetroPanel.vue'
import LegendSections from './LegendSections.vue'
import WikiNavbox from './WikiNavbox.vue'
import ModeBreaker from './ModeBreaker.vue'
import { useScreenLayout } from '../composables/useScreenLayout'

const LEGEND_SEED = 'legend'
const { layout } = useScreenLayout()
const legendTint = computed(() => pickTint(LEGEND_SEED, themeCasings()))

const mapStore = useMapStore()
const uiStore = useUIStore()

const inWiki = computed(() => uiStore.currentView === 'wiki')
const view = computed(() => (uiStore.currentView === 'system' && uiStore.selectedStar ? 'system' : 'galaxy'))

const sections = computed(() => buildLegend({
  stars: mapStore.stars,
  factions: mapStore.factions,
  hyperlines: mapStore.hyperlines,
  hyperlineTypes: mapStore.hyperlineTypes,
  systems: mapStore.systems,
  legendDoc: mapStore.legendDoc
}, { view: view.value, starId: uiStore.selectedStar }))

const index = computed(() => ({ navbox: mapStore.wikiNavbox, pages: mapStore.wikiIndex.pages }))
const content = computed(() => (inWiki.value ? index.value : sections.value))

const title = computed(() => {
  if (inWiki.value) return t('panels.navigation')
  if (view.value !== 'system') return t('panels.legend')
  return mapStore.getStarById(uiStore.selectedStar)?.name || t('panels.system')
})
</script>

<style scoped>
.legend-dock {
  display: flex;
  align-items: stretch;
}

.map-legend {
  flex: 1;
  min-width: 0;
  height: 100%;
}

/* Size comes from the layout in App.vue. */
</style>
