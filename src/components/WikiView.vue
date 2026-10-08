<template>
  <div class="wiki-view" :style="readingStyle">
    <header class="wiki-header">
      <div class="wiki-top-row">
        <button
          type="button"
          class="wiki-action wiki-home"
          :class="{ 'is-current': onHome }"
          :aria-current="onHome ? 'page' : null"
          :data-hint="t('wiki.home')"
          :title="t('wiki.home')"
          @click="goHome"
        >[ <svg class="wiki-home-icon" viewBox="0 0 8 8" width="8" height="8" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="0" width="2" height="1" /><rect x="2" y="1" width="4" height="1" /><rect x="1" y="2" width="6" height="1" /><rect x="0" y="3" width="8" height="1" /><rect x="1" y="4" width="6" height="1" /><rect x="1" y="5" width="2" height="3" /><rect x="5" y="5" width="2" height="3" /></svg> {{ t('wiki.homeButton') }} ]</button>
        <WikiSearch v-if="searchOpen" class="wiki-top-main" @close="searchOpen = false" />
        <div v-else class="wiki-path-row wiki-top-main">
          <div class="wiki-path">
            <template v-if="typing">{{ typing.prompt }}&gt; {{ typing.command.slice(0, typing.shown) }}<span class="wiki-path-cursor">_</span></template>
            <template v-else><template v-for="(crumb, index) in crumbs" :key="index"><template v-if="index">\</template><button v-if="crumb.slug !== null" type="button" class="wiki-crumb" :data-hint="crumbHint(crumb)" @click="goTo(crumb.slug, crumb.command)">{{ crumb.label }}</button><span v-else>{{ crumb.label }}</span></template>{{ pathTail }}</template>
          </div>
          <div v-if="recent.length" class="wiki-recent">
            <span>{{ t('wiki.recent') }}</span>
            <template v-for="(item, index) in recent" :key="item.slug">
              <span v-if="index" aria-hidden="true">·</span>
              <button type="button" class="wiki-crumb" :data-hint="t('wiki.openAgain', { title: item.title })" @click="goTo(item.slug, `TYPE ${fileName(item.slug)}`)">{{ folderLabel(item.title) }}</button>
            </template>
          </div>
        </div>
      </div>
      <div class="wiki-heading">
        <h1 class="wiki-title">{{ title }}</h1>
        <div class="wiki-actions">
          <template v-if="layout !== 'phone'">
            <button
              v-if="page?.mapTarget"
              type="button"
              class="wiki-action"
              :data-hint="t('wiki.showOnMapHint')"
              @click="uiStore.showOnMap(page.mapTarget)"
            >{{ t('wiki.showOnMap') }}</button>
            <button
              type="button"
              class="wiki-action"
              :data-hint="t('wiki.searchHint')"
              @pointerdown.prevent
              @click="searchOpen = !searchOpen"
            >{{ t('wiki.search') }}</button>
            <button
              type="button"
              class="wiki-action"
              :data-hint="t('wiki.randomHint')"
              @click="uiStore.openRandomWiki()"
            >{{ t('wiki.random') }}</button>
            <button
              type="button"
              class="wiki-action wiki-copy-link"
              data-sfx="none"
              :data-hint="t('wiki.copyLinkHint')"
              @click="copyPageLink"
            >{{ copyState === 'copied' ? t('wiki.copied') : copyState === 'failed' ? t('wiki.copyFailed') : t('wiki.copyLink') }}</button>
          </template>
          <template v-if="layout === 'phone'">
            <button
              v-if="headings.length"
              type="button"
              class="wiki-action wiki-open-contents"
              :class="{ 'is-active': sheet === 'contents' }"
              :data-hint="t('wiki.contentsHint')"
              @click="toggleSheet('contents')"
            >{{ t('wiki.contentsButton') }}</button>
            <button
              type="button"
              class="wiki-action wiki-open-nav"
              :class="{ 'is-active': sheet === 'navbox' }"
              :data-hint="t('wiki.navHint')"
              @click="toggleSheet('navbox')"
            >{{ t('wiki.navButton') }}</button>
          </template>
          <div class="wiki-menu-anchor">
            <button
              type="button"
              class="wiki-action wiki-menu-button"
              :class="{ 'is-active': menuOpen }"
              aria-haspopup="menu"
              :aria-expanded="menuOpen"
              :data-hint="t('wiki.menuHint')"
              @click="menuOpen = !menuOpen"
            >[ <span class="wiki-menu-icon" aria-hidden="true"></span> {{ t('wiki.menu') }} ]</button>
            <DosMenu v-if="menuOpen" :title="t('files.wikiMenu')" :items="menuItems" @close="menuOpen = false" />
          </div>
        </div>
      </div>
      <div v-if="uiStore.wikiRedirectedFrom" class="wiki-redirect">{{ t('wiki.redirected', { name: uiStore.wikiRedirectedFrom }) }}</div>
    </header>

    <!-- Scrolling by hand (the text or its bar) takes over from a held section. -->
    <div class="wiki-body" @wheel.passive="takeOver" @pointerdown="takeOver" @touchstart.passive="takeOver">
      <ScrollArea ref="areaRef" class="wiki-scroll" :bar-inset="[14, 10]">
        <Transition
          name="wiki-wipe"
          mode="out-in"
          @before-leave="startSwap"
          @before-enter="resetScroll"
          @after-enter="articleShown"
        >
          <article :key="articleKey" ref="articleRef" class="wiki-article">
            <WikiPortal v-if="isPortal" :navbox="mapStore.wikiNavbox" :pages="mapStore.wikiIndex.pages" />
            <RichText v-if="page && page.doc" class="wiki-text reading-text" :lang="language()" :doc="page.doc" wiki />
            <WikiSpecial v-else-if="page?.kind === 'special'" :page="page" />
            <div v-else-if="page" class="wiki-text reading-text wiki-empty" :lang="language()">{{ t('wiki.empty') }}</div>
            <div v-else-if="mapStore.isLoaded" class="wiki-text reading-text wiki-missing" :lang="language()">
              <p class="wiki-missing-title">{{ t('wiki.notFound') }}</p>
              <p>{{ t('wiki.noPage', { name: missingName }) }}</p>
              <p>
                <button type="button" class="wiki-footer-link" @click="uiStore.openWiki(searchSlug(missingName))">{{ t('wiki.searchFor', { name: missingName }) }}</button>
              </p>
              <template v-if="wantedFrom.length">
                <p>{{ t('wiki.linkingPages') }}</p>
                <ul class="wiki-missing-links">
                  <li v-for="from in wantedFrom" :key="from.slug">
                    <button type="button" class="wiki-footer-link" @click="uiStore.openWiki(from.slug)">{{ from.title }}</button>
                  </li>
                </ul>
              </template>
            </div>
            <footer v-if="page && page.kind !== 'special'" class="wiki-footer">
              <div v-if="pageCategories.length" class="wiki-categories">
                <span class="wiki-footer-label">{{ pageCategories.length > 1 ? t('wiki.categories') : t('wiki.category') }}</span>
                <template v-for="(category, index) in pageCategories" :key="category.slug">
                  <span v-if="index" class="wiki-footer-label"> | </span>
                  <button type="button" class="wiki-footer-link" @click="uiStore.openWiki(category.slug)">{{ category.name }}</button>
                </template>
              </div>
              <button type="button" class="wiki-footer-link is-backlinks" @click="uiStore.openWiki(backlinksSlug(page))">{{ t('wiki.linksHere', { count: backlinkCount }) }}</button>
            </footer>
          </article>
        </Transition>
      </ScrollArea>
    </div>

    <WikiSheet v-if="sheet" :kind="sheet" @close="sheet = null" />

    <PanelStatusBar class="wiki-status">
      <template #left>{{ copyState && layout === 'phone' ? t(copyState === 'copied' ? 'wiki.linkCopied' : 'wiki.linkNotCopied') : layout === 'phone' ? '' : t('wiki.status') }}</template>
      <template #right>{{ scrollable ? `${Math.round(progress * 100)}%` : t('wiki.wholeArticle') }}</template>
    </PanelStatusBar>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUIStore } from '../stores/uiStore'
import { useSystemSettings } from '../stores/systemSettings'
import { useReadingText } from '../composables/useReadingText'
import { nextFrame } from '../utils/nextFrame'
import { collectHeadings, findSection } from '../utils/wikiToc'
import { isTypingTarget } from '../utils/keyboard'
import RichText from './RichText.vue'
import WikiPortal from './WikiPortal.vue'
import WikiSearch from './WikiSearch.vue'
import WikiSpecial from './WikiSpecial.vue'
import { backlinksSlug, searchSlug } from '../utils/wikiService'
import { hasPageLayout } from '../utils/richText/templates'
import DosMenu from './DosMenu.vue'
import WikiSheet from './WikiSheet.vue'
import { useScreenLayout } from '../composables/useScreenLayout'
import PanelStatusBar from './PanelStatusBar.vue'
import ScrollArea from './ScrollArea.vue'
import { fileName, folderLabel, pathCrumbs, recentPages } from '../utils/wikiCrumbs'
import { prefersReducedMotion } from '../utils/reducedMotion'
import { copyText, shareUrl } from '../social/copyLink'
import { playSound } from '../sound'
import { language, t } from '../i18n'

const LINE_STEP = 40
const SECTION_MARGIN = 8

const mapStore = useMapStore()
const uiStore = useUIStore()
const settings = useSystemSettings()
const { style: readingStyle, sizeItem } = useReadingText()

const areaRef = ref(null)
const articleRef = ref(null)

const page = computed(() => uiStore.wikiPage)
const home = computed(() => mapStore.wikiIndex.home)
const isPortal = computed(() => (
  !!page.value && page.value === home.value && mapStore.wiki.portal !== false && !hasPageLayout(page.value.doc)
))
const missingName = computed(() => String(uiStore.wikiSlug ?? '').replace(/_/g, ' '))
const title = computed(() => page.value?.title ?? (mapStore.isLoaded ? missingName.value : '...'))
const articleKey = computed(() => page.value?.slug ?? `missing:${uiStore.wikiSlug}`)

const searchOpen = ref(false)
watch(() => uiStore.wikiSlug, () => { searchOpen.value = false })

// 'contents' | 'navbox' | null
const { layout } = useScreenLayout()
const sheet = ref(null)
const toggleSheet = kind => { sheet.value = sheet.value === kind ? null : kind }
watch(() => uiStore.wikiSlug, () => { sheet.value = null })
watch(layout, value => { if (value !== 'phone') sheet.value = null })

const pageCategories = computed(() => (page.value ? mapStore.wikiGraph.categoriesOf(page.value) : []))
const backlinkCount = computed(() => (page.value ? mapStore.wikiGraph.linksTo(page.value).length : 0))
const wantedFrom = computed(() => (page.value ? [] : mapStore.wikiGraph.wantedFrom(missingName.value)))

const crumbs = computed(() => pathCrumbs(page.value, { index: mapStore.wikiIndex, graph: mapStore.wikiGraph }))
const pathTail = computed(() => (
  page.value?.kind === 'special' ? `> ${page.value.command}` : `> TYPE ${fileName(page.value?.slug ?? uiStore.wikiSlug)}`
))
const crumbHint = crumb => t('wiki.goTo', { label: crumb.label })
const onHome = computed(() => !!page.value && page.value === home.value)

function goHome() {
  if (!onHome.value) goTo('', 'CD \\')
}

watch(page, value => {
  if (value && mapStore.wikiIndex.get(value.slug)) uiStore.rememberWikiPage(value.slug)
}, { immediate: true })
const recent = computed(() => recentPages(uiStore.wikiRecent, { index: mapStore.wikiIndex, current: page.value }))

const COMMAND_CHAR_MS = 18
const COMMAND_MAX_MS = 250
const COMMAND_PAUSE_MS = 80
const typing = ref(null) // { prompt, command, shown }
let typingTimer = null

function stopTyping() {
  clearTimeout(typingTimer)
  typingTimer = null
  typing.value = null
}

function goTo(slug, command) {
  if (typing.value) return
  if (prefersReducedMotion()) {
    uiStore.openWiki(slug)
    return
  }
  const step = Math.min(COMMAND_CHAR_MS, COMMAND_MAX_MS / Math.max(1, command.length))
  typing.value = { prompt: crumbs.value.map(crumb => crumb.label).join('\\'), command, shown: 0 }
  const typeNext = () => {
    if (!typing.value) return
    if (typing.value.shown < command.length) {
      typing.value.shown++
      typingTimer = setTimeout(typeNext, step)
      return
    }
    typingTimer = setTimeout(() => {
      stopTyping()
      uiStore.openWiki(slug)
    }, COMMAND_PAUSE_MS)
  }
  typingTimer = setTimeout(typeNext, step)
}

watch(() => uiStore.wikiSlug, stopTyping)
onBeforeUnmount(stopTyping)

const scrollElement = () => areaRef.value?.element ?? null
const scrollable = computed(() => areaRef.value?.scrollable ?? false)
const progress = computed(() => areaRef.value?.progress ?? 0)

function updateScrollbar() {
  areaRef.value?.update()
}

function resetScroll() {
  const element = scrollElement()
  if (element) element.scrollTop = 0
  updateScrollbar()
}

function scrollToY(top, smooth = false) {
  areaRef.value?.scrollToY(top, smooth)
}

function scrollByPage(direction) {
  areaRef.value?.scrollByPage(direction)
}

const headings = computed(() => collectHeadings(page.value?.doc))
// The new article reaches the DOM once the wipe is over.
const shownKey = ref(null)
let pendingRequest = null
// An article opened at a section keeps it at the top while the fonts and
// pictures arrive and move the text: checked every frame for a while, until
// the reader scrolls by themselves.
const HOLD_MS = 5000
let held = null
let holdFrame = null
// The section asked for last stays the one being read while it is on screen
// (near the end of an article it cannot reach the top edge).
let requestedIndex = null
let swapping = false
function startSwap() {
  swapping = true
}

const headingElements = () => articleRef.value?.querySelectorAll('.rt-heading') ?? []

// -1: the top of the article
function scrollToSection(index, smooth) {
  if (index < 0) {
    scrollToY(0, smooth)
    return
  }
  const heading = headingElements()[index]
  const element = scrollElement()
  if (!heading || !element) return
  const top = heading.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop
  scrollToY(top - SECTION_MARGIN, smooth)
}

// { index } from the contents panel or { section } by name (a link, the URL).
function applyRequest(request, smooth) {
  const index = request.section === undefined ? request.index : findSection(headings.value, request.section)
  if (request.section !== undefined && index < 0) {
    uiStore.followSection(null)
    return
  }
  scrollToSection(index, smooth)
  releaseHold()
  requestedIndex = index >= 0 ? index : null
  if (!smooth && index >= 0) {
    held = { index, until: performance.now() + HOLD_MS }
    holdFrame = requestAnimationFrame(keepHeldSection)
  }
}

function keepHeldSection() {
  holdFrame = null
  if (!held || performance.now() > held.until) {
    held = null
    return
  }
  const heading = headingElements()[held.index]
  const element = scrollElement()
  if (heading && element) {
    const offset = heading.getBoundingClientRect().top - element.getBoundingClientRect().top - SECTION_MARGIN
    // At the end of the article it cannot go any higher: that is fine.
    const canMove = offset < 0 ? element.scrollTop > 0 : element.scrollTop < element.scrollHeight - element.clientHeight - 1
    if (Math.abs(offset) > 1 && canMove) scrollToSection(held.index, false)
  }
  holdFrame = requestAnimationFrame(keepHeldSection)
}

function releaseHold() {
  held = null
  if (holdFrame !== null) cancelAnimationFrame(holdFrame)
  holdFrame = null
}

function takeOver() {
  releaseHold()
  requestedIndex = null
}

watch(() => uiStore.wikiSectionRequest, request => {
  if (!request) return
  if (shownKey.value === articleKey.value) nextTick(() => applyRequest(request, true))
  else pendingRequest = request
})

function articleShown() {
  swapping = false
  shownKey.value = articleKey.value
  updateScrollbar()
  takeOver()
  if (pendingRequest) applyRequest(pendingRequest, false)
  pendingRequest = null
  spySection()
}

// At the very bottom: the last heading on screen, for the short last sections.
function spySection() {
  const element = scrollElement()
  if (!element || shownKey.value !== articleKey.value) return
  const box = element.getBoundingClientRect()
  const edge = box.top + SECTION_MARGIN + 2
  const atBottom = element.scrollTop > 0 && element.scrollTop >= element.scrollHeight - element.clientHeight - 1
  let active = -1
  const elements = headingElements()
  elements.forEach((heading, index) => {
    const top = heading.getBoundingClientRect().top
    if (top <= edge || (atBottom && top < box.bottom)) active = index
  })
  const asked = requestedIndex !== null ? elements[requestedIndex] : null
  if (asked) {
    const top = asked.getBoundingClientRect().top
    if (top >= box.top - 1 && top < box.bottom) active = requestedIndex
  }
  const anchor = active >= 0 ? headings.value[active]?.anchor ?? null : null
  if (active !== uiStore.wikiActiveSection || anchor !== uiStore.wikiSection) uiStore.followSection(anchor, active)
}

let spyFrame = null
function handleScroll() {
  if (spyFrame === null) {
    spyFrame = requestAnimationFrame(() => {
      spyFrame = null
      spySection()
    })
  }
}

const menuOpen = ref(false)
const COPY_NOTICE_MS = 1500
const copyState = ref(null)
let copyTimer = null
async function copyPageLink() {
  if (!page.value) return
  const copied = await copyText(shareUrl({ page: page.value }))
  copyState.value = copied ? 'copied' : 'failed'
  playSound(copied ? 'success' : 'error')
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copyState.value = null }, COPY_NOTICE_MS)
}
onBeforeUnmount(() => clearTimeout(copyTimer))

const phoneItems = computed(() => (layout.value === 'phone'
  ? [
      page.value?.mapTarget && { type: 'action', label: t('wiki.menuShowOnMap'), onSelect: () => uiStore.showOnMap(page.value.mapTarget) },
      { type: 'action', label: t('wiki.menuSearch'), onSelect: () => { searchOpen.value = true } },
      { type: 'action', label: t('wiki.menuRandom'), onSelect: () => uiStore.openRandomWiki() },
      page.value && { type: 'action', label: t('wiki.menuCopyLink'), onSelect: copyPageLink },
      { type: 'separator' }
    ].filter(Boolean)
  : []))
const menuItems = computed(() => [
  ...phoneItems.value,
  sizeItem.value,
  { type: 'separator' },
  { type: 'action', label: t('wiki.resetSettings'), onSelect: () => settings.reset('text') }
])

function handleKeydown(event) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
  if (uiStore.transitionPhase !== 'idle' || isTypingTarget(event.target)) return
  const element = scrollElement()
  if (!element) return
  takeOver()
  switch (event.key) {
    case '/':
      searchOpen.value = true
      break
    case 'Escape':
      if (menuOpen.value) menuOpen.value = false
      else if (sheet.value) sheet.value = null
      else uiStore.closeWiki()
      break
    case 'PageDown':
      scrollByPage(1)
      break
    case 'PageUp':
      scrollByPage(-1)
      break
    case 'ArrowDown':
      scrollToY(element.scrollTop + LINE_STEP)
      break
    case 'ArrowUp':
      scrollToY(element.scrollTop - LINE_STEP)
      break
    case 'Home':
      scrollToY(0, true)
      break
    case 'End':
      scrollToY(element.scrollHeight, true)
      break
    default:
      return
  }
  event.preventDefault()
}

let isUnmounted = false

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  scrollElement()?.addEventListener('scroll', handleScroll, { passive: true })
  pendingRequest = uiStore.wikiSectionRequest

  await mapStore.whenLoaded()
  if (page.value?.title) uiStore.logLoadingStep('loader.openingArticle', { page: page.value.title.toUpperCase() })
  else uiStore.logLoadingStep('loader.openingWiki')
  uiStore.logLoadingStep('loader.mountingWiki')
  await nextTick()
  await nextFrame()
  if (isUnmounted) return
  // It may still be wiping in (it was 'not found' before the map loaded).
  if (!swapping) articleShown()
  uiStore.markViewReady('wiki')
})

onBeforeUnmount(() => {
  isUnmounted = true
  window.removeEventListener('keydown', handleKeydown)
  scrollElement()?.removeEventListener('scroll', handleScroll)
  releaseHold()
  if (spyFrame !== null) cancelAnimationFrame(spyFrame)
})
</script>

<style scoped>
.wiki-view {
  --wiki-font: 'Ark Pixel 10', 'Tiny5', monospace;
  --wiki-ui-size: 16px;
  --wiki-ui-line: 24px;

  position: absolute;
  inset: 0;
  /* Margins and menus follow the width of the screen itself, not the browser window */
  container: wiki-view / inline-size;
  display: flex;
  flex-direction: column;
  background: var(--ui-screen);
  color: var(--ui-text);
  font-family: var(--font-pixel);
}

.wiki-header {
  flex-shrink: 0;
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--ui-text);
  container: wiki-header / inline-size;
}

.wiki-path-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}

.wiki-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-dim);
  font-size: 8px;
  line-height: 14px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.wiki-top-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}

.wiki-top-main {
  flex: 1 1 auto;
  min-width: 0;
}

.wiki-home {
  flex: 0 0 auto;
}

.wiki-home.is-current {
  background: var(--ui-text);
  color: var(--ui-screen);
}

.wiki-home-icon {
  display: inline-block;
  vertical-align: -1px;
  fill: currentColor;
}

.wiki-crumb {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  line-height: inherit;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  appearance: none;
  cursor: none;
}

.wiki-crumb:hover,
.wiki-crumb:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.wiki-path-cursor {
  color: var(--ui-text);
}

.wiki-recent {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  color: #6f6f6f;
  font-size: 8px;
  line-height: 14px;
  white-space: nowrap;
}

@container wiki-header (max-width: 600px) {
  .wiki-recent {
    display: none;
  }
}

.wiki-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 16px;
  margin-top: 8px;
}

.wiki-title {
  margin: 0;
  font-size: 16px;
  font-weight: normal;
  line-height: 24px;
  text-transform: uppercase;
}

.wiki-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}

/* Flex: no line box around the button, or it sits on its baseline below its neighbours */
.wiki-menu-anchor {
  position: relative;
  display: flex;
}

.wiki-menu-button.is-active {
  background: var(--ui-text);
  color: var(--ui-screen);
}

.wiki-menu-icon {
  position: relative;
  display: inline-block;
  width: 8px;
  height: 8px;
  vertical-align: -1px;
}

.wiki-menu-icon::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: currentColor;
  box-shadow: 0 3px 0 currentColor, 0 6px 0 currentColor;
}

.wiki-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 24px;
  margin-top: 28px;
  padding-top: 10px;
  border-top: 1px solid var(--ui-line);
  font-family: var(--wiki-font);
  font-size: var(--wiki-ui-size);
  line-height: var(--wiki-ui-line);
}

.wiki-footer-label {
  color: var(--ui-dim);
  white-space: pre;
}

.wiki-footer-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  appearance: none;
  cursor: none;
}

.wiki-footer-link.is-backlinks {
  margin-left: auto;
  color: var(--ui-dim);
  text-decoration: none;
}

.wiki-footer-link:hover,
.wiki-footer-link:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.wiki-missing-links {
  list-style: "> ";
  margin: 0;
  padding-left: 1.4em;
}

.wiki-redirect {
  margin-top: 4px;
  color: var(--ui-dim);
  font-size: 8px;
  line-height: 14px;
}

.wiki-action {
  padding: 2px 4px;
  white-space: nowrap;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 8px;
  line-height: 14px;
  appearance: none;
  cursor: none;
}

.wiki-action:hover,
.wiki-action:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.wiki-body {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 0 6px 0 18px;
}

.wiki-article {
  padding: 14px 16px 28px 0;
}

/* Headings with a rule go around the card, not under it */
@container (min-width: 640px) {
  .wiki-text :deep(.rt-infobox) {
    float: right;
    width: min(400px, 40%);
    margin: 0 0 16px 24px;
  }

  .wiki-text :deep(.rt-heading) {
    overflow: hidden;
  }

  /* A picture on the right after the card stands under it, not beside it:
     the two side by side left the text a sliver of the screen */
  .wiki-text :deep(.rt-infobox ~ .rt-figure.align-right) {
    clear: right;
  }
}

.wiki-missing-title {
  color: var(--ui-text);
  font-family: var(--font-pixel);
  font-size: 12px;
}

.wiki-empty,
.wiki-missing {
  color: var(--ui-dim);
}

.wiki-wipe-leave-active {
  animation: wiki-wipe-out 140ms steps(5, end) both;
}

.wiki-wipe-enter-active {
  animation: wiki-wipe-in 280ms steps(10, end) both;
}

@keyframes wiki-wipe-out {
  from { clip-path: inset(0 0 0 0); }
  to { clip-path: inset(100% 0 0 0); }
}

@keyframes wiki-wipe-in {
  from { clip-path: inset(0 0 100% 0); }
  to { clip-path: inset(0 0 0 0); }
}

@media (prefers-reduced-motion: reduce) {
  .wiki-wipe-enter-active,
  .wiki-wipe-leave-active {
    animation: none;
  }
}

@container wiki-view (max-width: 720px) {
  .wiki-header {
    padding: 10px 10px 8px;
  }

  .wiki-body {
    padding: 0 4px 0 10px;
  }

  .wiki-article {
    padding-right: 8px;
  }

  .wiki-menu-anchor :deep(.dos-menu) {
    right: auto;
    left: 0;
  }
}
</style>
