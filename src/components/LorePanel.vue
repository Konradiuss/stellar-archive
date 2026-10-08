<template>
  <RetroPanel
    class="lore-panel"
    seed="lore"
    :file="file"
    :title="title"
    :content="mapStore.isLoaded ? content : null"
    :power-on-delay="150"
  >
    <template #default="{ content: shown }">
      <WikiContents v-if="shown.toc" :toc="shown.toc" />
      <PagedLore v-else :doc="shown" :typing-pace="TYPING_PACE" />
    </template>
  </RetroPanel>
</template>

<script setup>
import { computed } from 'vue'
import { useUIStore } from '../stores/uiStore'
import { useMapStore } from '../stores/mapStore'
import { collectHeadings } from '../utils/wikiToc'
import { TYPING_PACE } from '../composables/useReadingText'
import { t } from '../i18n'
import RetroPanel from './RetroPanel.vue'
import PagedLore from './PagedLore.vue'
import WikiContents from './WikiContents.vue'

const uiStore = useUIStore()
const mapStore = useMapStore()

const inWiki = computed(() => uiStore.currentView === 'wiki')
const showsHome = computed(() => !uiStore.selectedStar && !!mapStore.homeLoreDoc)

// A new object per page, so the panel switches channel on a page change.
const contents = computed(() => ({ toc: collectHeadings(uiStore.wikiPage?.doc), slug: uiStore.wikiPage?.slug ?? null }))
const content = computed(() => (inWiki.value ? contents.value : uiStore.activeLore))

const title = computed(() => {
  if (inWiki.value) return uiStore.wikiPage?.title ?? t('panels.noArticle')
  if (uiStore.selectedStar) {
    const star = mapStore.getStarById(uiStore.selectedStar)
    return star?.name || t('panels.system')
  }

  return showsHome.value ? mapStore.wikiIndex.home.title : t('pages.world')
})

const file = computed(() => {
  if (inWiki.value) return t('files.contents')
  if (uiStore.selectedStar) return t('files.starLore', { star: uiStore.selectedStar.toUpperCase() })
  return showsHome.value ? t('files.mainLore') : t('files.galaxyLore')
})
</script>

<style scoped>
/* Size and position come from the layout in App.vue. */
.lore-panel {
  min-width: 0;
  min-height: 0;
}
</style>
