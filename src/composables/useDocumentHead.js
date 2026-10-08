import { computed, onScopeDispose, watch } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUIStore } from '../stores/uiStore'
import { startAnimatedFavicon } from '../utils/animatedFavicon'
import { buildTabTitle, TAB_STATUS } from '../utils/tabTitle'
import { draftFileUrl } from '../editor/draft'
import { MAP_FILE } from '../utils/mapCheck'

export function useDocumentHead() {
  const mapStore = useMapStore()
  const uiStore = useUIStore()

  const status = computed(() => {
    if (uiStore.loadError) return TAB_STATUS.offline
    if (!mapStore.isLoaded) return TAB_STATUS.loading
    const target = uiStore.transitionTarget
    if (target?.kind !== 'star') return null
    const star = mapStore.getStarById(target.starId)
    return star ? TAB_STATUS.jump(star.name) : null
  })

  const title = computed(() => {
    const star = uiStore.currentView === 'system' ? mapStore.getStarById(uiStore.selectedStar) : null
    return buildTabTitle({
      site: mapStore.siteConfig,
      star,
      planet: star ? uiStore.selectedBody : null,
      // The name asked for when there is no such page.
      article: uiStore.currentView === 'wiki' && mapStore.isLoaded
        ? uiStore.wikiPage ?? { title: String(uiStore.wikiSlug ?? '').replace(/_/g, ' ') }
        : null,
      status: status.value
    })
  })

  watch(title, value => { document.title = value }, { immediate: true })

  let stopFavicon = null
  // Absolute, so the default before and after the map loads is one icon.
  const favicon = computed(() => {
    const url = mapStore.siteConfig.favicon
    return url ? new URL(url, document.baseURI).href : null
  })
  // The preview of the editor shows the icon of its draft.
  let ownUrl = null
  let asked = 0
  watch(favicon, async url => {
    const ask = ++asked
    stopFavicon?.()
    stopFavicon = null
    if (ownUrl) URL.revokeObjectURL(ownUrl)
    ownUrl = null
    if (!url) return
    const own = await draftFileUrl(url, new URL(MAP_FILE, document.baseURI).href).catch(() => null)
    if (ask !== asked) {
      if (own) URL.revokeObjectURL(own)
      return
    }
    ownUrl = own
    stopFavicon = startAnimatedFavicon(own ?? url)
  }, { immediate: true })

  onScopeDispose(() => {
    stopFavicon?.()
    if (ownUrl) URL.revokeObjectURL(ownUrl)
  })

  return { title }
}
