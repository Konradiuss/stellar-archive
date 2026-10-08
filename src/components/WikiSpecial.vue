<template>
  <div class="wiki-special" :data-special="kind">
    <template v-if="kind === 'search'">
      <p v-if="!param" class="special-note">{{ t('special.searchNote') }}</p>
      <template v-else>
        <p class="special-note">
          <template v-if="results.exact">
            <template v-for="(piece, index) in pieces('special.exact')" :key="index">
              <button v-if="piece.slot === 'page'" type="button" class="special-link" @click="open(results.exact)">{{ results.exact.title }}</button>
              <template v-else>{{ piece.text }}</template>
            </template>
          </template>
          <template v-else>{{ t('special.noPage', { name: param }) }}</template>
          {{ t('special.found', { count: results.titles.length + results.text.length }) }}
        </p>
        <section v-if="results.titles.length" class="special-section">
          <h2 class="special-heading">{{ t('special.inTitles') }}</h2>
          <ul class="special-list">
            <li v-for="page in results.titles" :key="page.slug">
              <button type="button" class="special-link" @click="open(page)">{{ page.title }}</button>
              <span v-if="KIND_TAGS.includes(page.tag)" class="special-tag">{{ t(`kinds.${page.tag}`) }}</span>
            </li>
          </ul>
        </section>
        <section v-if="results.text.length" class="special-section">
          <h2 class="special-heading">{{ t('special.inText') }}</h2>
          <ul class="special-list is-results">
            <li v-for="result in results.text" :key="result.page.slug" class="search-result">
              <div>
                <button type="button" class="special-link" @click="open(result.page)">{{ result.page.title }}</button>
                <span class="special-tag">{{ t('special.matches', { count: result.count }) }}</span>
              </div>
              <p class="search-snippet">
                <template v-for="(part, index) in result.snippet" :key="index">
                  <mark v-if="part.hit" class="search-hit">{{ part.text }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
              </p>
            </li>
          </ul>
        </section>
      </template>
    </template>

    <template v-else-if="kind === 'allpages' || kind === 'category'">
      <p class="special-note">
        <template v-if="kind === 'category'">
          <template v-if="letters.length">{{ t('special.inCategory', { count: listed.length }) }}</template>
          <template v-else>{{ t('special.emptyCategory', { name: param }) }}</template>
          {{ ' ' }}<button type="button" class="special-link" @click="openSlug(categoriesSlug)">{{ t('special.allCategories') }}</button>
        </template>
        <template v-else>{{ t('special.inArchive', { count: listed.length }) }}</template>
      </p>
      <div class="special-letters">
        <section v-for="letter in letters" :key="letter.char" class="special-letter">
          <div class="special-char">[{{ letter.char }}]</div>
          <ul class="special-list">
            <li v-for="page in letter.pages" :key="page.slug">
              <button type="button" class="special-link" @click="open(page)">{{ page.title }}</button>
              <span v-if="KIND_TAGS.includes(page.tag)" class="special-tag">{{ t(`kinds.${page.tag}`) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <template v-else-if="kind === 'categories'">
      <p class="special-note">{{ t('special.categoryCount', { count: graph.categories.length }) }}</p>
      <ul class="special-list">
        <li v-for="category in graph.categories" :key="category.slug">
          <button type="button" class="special-link" @click="openSlug(category.slug)">{{ category.name }}</button>
          <span class="special-tag">{{ category.pages.length }}</span>
        </li>
      </ul>
    </template>

    <template v-else-if="kind === 'wanted'">
      <p class="special-note">
        <template v-if="graph.wanted.length">{{ t('special.wantedNote') }}</template>
        <template v-else>{{ t('special.noWanted') }}</template>
      </p>
      <ul class="special-list is-results">
        <li v-for="item in graph.wanted" :key="item.slug" class="wanted-item">
          <button type="button" class="special-link is-missing" @click="openSlug(item.slug)">{{ item.name }}</button>
          <span class="special-tag">{{ t('special.links', { count: item.from.length }) }}:</span>{{ ' ' }}
          <template v-for="(page, index) in item.from" :key="page.slug">
            <template v-if="index">, </template>
            <button type="button" class="special-link" @click="open(page)">{{ page.title }}</button>
          </template>
        </li>
      </ul>
    </template>

    <template v-else-if="kind === 'backlinks'">
      <p class="special-note">
        <template v-if="target">
          <template v-for="(piece, index) in pieces(linking.length ? 'special.linking' : 'special.noLinking', { count: linking.length })" :key="index">
            <button v-if="piece.slot === 'page'" type="button" class="special-link" @click="open(target)">{{ target.title }}</button>
            <template v-else>{{ piece.text }}</template>
          </template>
        </template>
        <template v-else>{{ t('special.noPage', { name: param }) }}</template>
      </p>
      <ul class="special-list">
        <li v-for="page in linking" :key="page.slug">
          <button type="button" class="special-link" @click="open(page)">{{ page.title }}</button>
          <span v-if="KIND_TAGS.includes(page.tag)" class="special-tag">{{ t(`kinds.${page.tag}`) }}</span>
        </li>
      </ul>
    </template>

    <template v-else-if="kind === 'mapcheck'">
      <p class="special-note">
        <template
          v-for="(piece, index) in pieces(errorCount + warningCount ? 'special.mapProblems' : 'special.mapClean', {
            errors: t('special.mapErrors', { count: errorCount }),
            warnings: t('special.mapWarnings', { count: warningCount })
          })"
          :key="index"
        >
          <code v-if="piece.slot === 'file'">{{ MAP_FILE }}</code>
          <template v-else>{{ piece.text }}</template>
        </template>
        <template v-if="noteCount">{{ ` ${t('special.mapNotes', { count: noteCount })}` }}</template>
      </p>
      <ul class="special-list is-results">
        <li v-for="(issue, index) in issues" :key="index" class="map-issue" :data-level="issue.level">
          <span class="map-issue-level">{{ t(LEVEL_LABELS[issue.level]) }}</span>
          <code class="map-issue-where">{{ issue.where }}</code>
          <p class="map-issue-message">{{ issue.message }}</p>
        </li>
      </ul>
    </template>

    <template v-else-if="kind === 'icons'">
      <p class="special-note">
        <template v-for="(piece, index) in pieces('special.iconsNote', { count: ICON_NAMES.length })" :key="index">
          <code v-if="piece.slot === 'template'">{{ BOX_EXAMPLE }}</code>
          <code v-else-if="piece.slot === 'field'">icon</code>
          <template v-else>{{ piece.text }}</template>
        </template>
      </p>
      <ul class="special-icons">
        <li v-for="name in ICON_NAMES" :key="name" class="special-icon" :data-icon="name">
          <img class="special-icon-image" :src="iconUri(name)" alt="" aria-hidden="true" />
          <span class="special-icon-name">{{ name }}</span>
        </li>
      </ul>
    </template>

    <template v-else-if="kind === 'banners'">
      <p class="special-note">
        <template v-for="(piece, index) in pieces('special.bannersNote')" :key="index">
          <code v-if="piece.slot === 'template'">{{ BANNER_EXAMPLE }}</code>
          <code v-else-if="piece.slot === 'box'">{{ BOX_COLOR_EXAMPLE }}</code>
          <template v-else>{{ piece.text }}</template>
        </template>
      </p>
      <section v-for="part in bannerParts" :key="part.field" class="special-banners" :data-part="part.field">
        <h3 class="special-subhead">{{ t(part.title) }}</h3>
        <ul class="special-samples">
          <li v-for="sample in part.samples" :key="sample.value" class="special-sample" :data-value="sample.value">
            <PixelLogo v-if="sample.logo" class="special-sample-logo" :logo="sample.logo" />
            <span v-else-if="part.field === 'frame'" class="special-sample-frame" :class="`is-${sample.value}`">ABC</span>
            <span v-else class="special-sample-color" :style="{ background: sample.color }"></span>
            <code class="special-sample-name">{{ part.field }}={{ sample.value }}</code>
          </li>
        </ul>
      </section>
    </template>

    <template v-else-if="kind === 'sounds'">
      <p class="special-note">
        <template v-if="mapStore.sounds.enabled">
          <template v-for="(piece, index) in pieces('special.soundsNote', { count: SOUND_NAMES.length })" :key="index">
            <code v-if="piece.slot === 'field'">sounds</code>
            <template v-else>{{ piece.text }}</template>
          </template>
        </template>
        <template v-else>{{ t('special.soundsOff') }}</template>
      </p>
      <ul class="special-list special-sounds">
        <li v-for="name in SOUND_NAMES" :key="name" class="special-sound" :data-sound="name">
          <button
            type="button"
            class="special-sound-play"
            data-sfx="none"
            :disabled="!mapStore.sounds.enabled"
            :aria-label="t('special.soundPlay', { name })"
            @click="hearSound(name)"
          >▶</button>
          <code class="special-sound-name">{{ name }}</code>
          <span v-if="soundTag(name)" class="special-sound-tag">{{ soundTag(name) }}</span>
          <span class="special-sound-what">{{ t(`sounds.${name}`) }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUIStore } from '../stores/uiStore'
import { compareText, t } from '../i18n'
import { searchWiki, servicePage } from '../utils/wikiService'
import { ICON_NAMES, iconUri } from '../utils/wikiIcons'
import { MAP_FILE } from '../utils/mapCheck'
import { BANNER_FRAMES, BOX_COLORS, LOGO_ANIMATIONS, LOGO_FONTS, LOGO_STYLE_NAMES } from '../utils/richText/templates'
import { SOUND_NAMES, soundEngine } from '../sound'
import PixelLogo from './PixelLogo.vue'

const BOX_EXAMPLE = '{{Box|Title|icon=…}}'
const BANNER_EXAMPLE = '{{Banner|title=…|style=…}}'
const BOX_COLOR_EXAMPLE = '{{Box|Title|color=…}}'

const sampleLogo = (text, look = {}) => ({ text, style: 'steel', colors: null, outline: null, shadow: true, font: 'tiny5', scale: 3, animation: 'none', ...look })

const bannerParts = [
  { field: 'style', title: 'special.bannerStyles', samples: Object.keys(LOGO_STYLE_NAMES).map(value => ({ value, logo: sampleLogo(value.toUpperCase(), { style: value }) })) },
  { field: 'font', title: 'special.bannerFonts', samples: LOGO_FONTS.map(value => ({ value, logo: sampleLogo('Archive', { font: value, scale: value === 'press' ? 2 : 3 }) })) },
  { field: 'animation', title: 'special.bannerAnimations', samples: LOGO_ANIMATIONS.map(value => ({ value, logo: sampleLogo('ARCHIVE', { style: 'sunset', animation: value }) })) },
  { field: 'frame', title: 'special.bannerFrames', samples: BANNER_FRAMES.map(value => ({ value })) },
  { field: 'color', title: 'special.boxColors', samples: Object.entries(BOX_COLORS).filter(([name]) => name !== 'gray').map(([value, color]) => ({ value, color })) }
]

// Asked for by name: ▶ plays even with the visitor's sound effects off.
function hearSound(name) {
  // A sleeping engine must wake before it can play.
  soundEngine.wake().then(awake => { if (awake) soundEngine.play(name, { evenIfOff: true }) })
}

function soundTag(name) {
  const sound = mapStore.sounds.sounds[name]
  if (sound?.silent) return t('special.soundSilent')
  return sound?.src ? t('special.soundFile') : null
}

const KIND_TAGS = ['world', 'star', 'planet', 'moon', 'station']

// Splits the text at each {placeholder} the params do not fill, leaving a slot
// for the template.
function pieces(key, params = {}) {
  return t(key, params).split(/(\{\w+\})/).filter(Boolean).map(part => {
    const slot = /^\{(\w+)\}$/.exec(part)?.[1]
    return slot ? { slot } : { text: part }
  })
}

const props = defineProps({
  // servicePage() of utils/wikiService.js
  page: { type: Object, required: true }
})

const mapStore = useMapStore()
const uiStore = useUIStore()

const kind = computed(() => props.page.special.kind)
const param = computed(() => props.page.special.param)
const graph = computed(() => mapStore.wikiGraph)
const index = computed(() => mapStore.wikiIndex)
const categoriesSlug = servicePage('Special:Categories').slug

const open = page => uiStore.openWiki(page.slug)
const openSlug = slug => uiStore.openWiki(slug)

const results = computed(() => searchWiki(index.value, param.value))

const listed = computed(() => (kind.value === 'category' ? graph.value.category(param.value)?.pages ?? [] : index.value.pages))
const letters = computed(() => {
  const sorted = [...listed.value].sort((a, b) => compareText(a.title, b.title))
  const groups = []
  for (const page of sorted) {
    const char = page.title.charAt(0).toUpperCase()
    if (groups[groups.length - 1]?.char !== char) groups.push({ char, pages: [] })
    groups[groups.length - 1].pages.push(page)
  }
  return groups
})

const issues = computed(() => mapStore.mapIssues)
const errorCount = computed(() => issues.value.filter(issue => issue.level === 'error').length)
const LEVEL_LABELS = { error: 'special.error', warning: 'special.warning', info: 'special.info' }
const warningCount = computed(() => issues.value.filter(issue => issue.level === 'warning').length)
// Notes (e.g. pictures from another site) are not problems: counted apart.
const noteCount = computed(() => issues.value.filter(issue => issue.level === 'info').length)

const target = computed(() => (param.value ? index.value.get(param.value) ?? index.value.find(param.value) : null))
const linking = computed(() => (target.value ? graph.value.linksTo(target.value) : []))
</script>

<style scoped>
.wiki-special {
  font-family: var(--wiki-font);
  font-size: var(--wiki-ui-size);
  line-height: var(--wiki-ui-line);
  color: var(--ui-text);
}

.special-note {
  margin: 0 0 20px;
}

.special-section + .special-section {
  margin-top: 20px;
}

.special-heading {
  margin: 0 0 12px;
  padding-bottom: 6px;
  background: repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 8px) left bottom / 100% 2px no-repeat;
  font-family: var(--font-pixel);
  font-size: 16px;
  font-weight: normal;
  line-height: 24px;
}

.special-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.special-list > li {
  position: relative;
  padding-left: 1.4em;
}

.special-list > li::before {
  content: '>';
  position: absolute;
  left: 0;
  color: var(--ui-dim);
}

.special-list.is-results > li + li {
  margin-top: 10px;
}

.special-letters {
  column-width: 240px;
  column-gap: 32px;
}

.special-letter {
  break-inside: avoid;
  margin-bottom: 12px;
}

.special-char,
.special-tag {
  color: var(--ui-dim);
}

.special-tag {
  margin-left: 8px;
}

.special-banners + .special-banners {
  margin-top: 20px;
}

.special-subhead {
  margin: 0 0 10px;
  color: var(--ui-text);
  font-family: var(--font-pixel);
  font-size: 10px;
  line-height: 16px;
  text-transform: uppercase;
}

.special-samples {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.special-sample {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding: 12px 6px 8px;
  border: 1px solid var(--ui-line);
}

.special-sample-name {
  color: var(--ui-text);
}

/* Same lines as .rt-banner */
.special-sample-frame {
  padding: 6px 16px;
  border: 4px double var(--ui-dim);
  color: var(--ui-text);
}

.special-sample-frame.is-single {
  border-style: solid;
  border-width: 2px;
}

.special-sample-frame.is-none {
  border-color: transparent;
}

.special-sample-color {
  width: 64px;
  height: 24px;
}

.special-icons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.special-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 4px;
  border: 1px solid var(--ui-line);
}

.special-icon-image {
  width: 64px;
  height: 64px;
  image-rendering: pixelated;
}

.special-icon-name {
  color: var(--ui-text);
}

.special-link {
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

.special-link.is-missing {
  color: var(--ui-dim);
  text-decoration-style: dashed;
}

.special-link:hover,
.special-link:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.search-snippet {
  margin: 2px 0 0;
  color: color-mix(in srgb, var(--ui-text) 35%, var(--ui-dim));
}

.map-issue-level {
  margin-right: 8px;
  color: var(--ui-warn);
}

.map-issue[data-level='error'] .map-issue-level {
  color: var(--ui-error);
}

.map-issue[data-level='info'] .map-issue-level {
  color: var(--ui-dim);
}

.special-sound {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.special-sound-play {
  flex-shrink: 0;
  padding: 0 4px;
  border: 1px solid var(--ui-text);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  appearance: none;
  cursor: none;
}

.special-sound-play:hover:not(:disabled),
.special-sound-play:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}

.special-sound-play:disabled {
  border-color: var(--ui-dim);
  color: var(--ui-dim);
}

.special-sound-name {
  flex-shrink: 0;
  min-width: 11ch;
  color: var(--ui-text);
  font-family: inherit;
}

.special-sound-tag {
  flex-shrink: 0;
  color: var(--ui-warn);
}

.special-sound-what {
  color: color-mix(in srgb, var(--ui-text) 35%, var(--ui-dim));
}

.map-issue-where {
  color: var(--ui-text);
  font-family: inherit;
}

.map-issue-message {
  margin: 2px 0 0;
  color: color-mix(in srgb, var(--ui-text) 35%, var(--ui-dim));
}

.search-hit {
  background: var(--ui-text);
  color: var(--ui-screen);
}
</style>
