<template>
  <section class="wiki-portal" :aria-label="t('wiki.archiveSections')">
    <p v-if="welcome" class="portal-welcome">{{ welcomeText }}</p>
    <div class="portal-grid">
      <div v-for="box in boxes" :key="box.id" class="portal-box" :data-group="box.id">
        <div class="portal-head">
          <img class="portal-icon" :src="iconUri(box.icon)" alt="" aria-hidden="true" />
          <button v-if="box.page" type="button" class="portal-link portal-title" @click="open(box.page)">{{ box.title }}</button>
          <span v-else class="portal-title">{{ box.title }}</span>
          <span class="portal-count">{{ box.count }}</span>
        </div>
        <div v-for="(row, rowIndex) in box.rows" :key="rowIndex" class="portal-row" :class="{ 'is-sub': row.depth > 1 }" :style="{ '--depth': row.depth }">
          <div v-if="row.title" class="portal-row-title">
            <span
              v-if="row.color"
              class="portal-sign"
              :style="{ borderColor: row.color, '--sign-fill': row.color }"
              aria-hidden="true"
            ></span>
            <span v-else class="portal-branch" aria-hidden="true"></span>
            <img v-if="row.icon" class="portal-row-icon" :src="iconUri(row.icon)" alt="" aria-hidden="true" />
            <button v-if="row.page" type="button" class="portal-link" @click="open(row.page)">{{ row.title }}</button>
            <span v-else>{{ row.title }}</span>
            <span v-if="row.note" class="portal-note">{{ ' ' }}<span class="portal-note-text">· {{ row.note }}</span></span>
          </div>
          <ul v-if="row.links.length" class="portal-links">
            <li v-for="page in row.links" :key="page.slug">
              <button type="button" class="portal-link" @click="open(page)">{{ page.title }}</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useUIStore } from '../stores/uiStore'
import { iconUri } from '../utils/wikiIcons'
import { t } from '../i18n'

const props = defineProps({
  // { home, groups } from utils/wikiNavbox.js
  navbox: { type: Object, default: () => ({ home: null, groups: [] }) },
  pages: { type: Array, default: () => [] },
  welcome: { type: Boolean, default: true }
})

const uiStore = useUIStore()

function open(page) {
  uiStore.openWiki(page.slug)
}

const pagesOf = items => items.map(item => item.page).filter(Boolean)

const boxes = computed(() => props.navbox.groups.map(group => {
  const rows = []
  if (group.items.length) rows.push({ title: null, depth: 0, links: pagesOf(group.items) })
  const places = group.id === 'places'
  const walk = (inner, depth) => {
    rows.push({
      title: inner.title,
      page: inner.page,
      color: inner.color,
      icon: inner.icon ?? null,
      depth,
      note: places ? t('wiki.systems', { count: inner.items.length }) : null,
      links: places ? [] : pagesOf(inner.items)
    })
    inner.groups.forEach(each => walk(each, depth + 1))
  }
  group.groups.forEach(inner => walk(inner, 1))
  return { id: group.id, title: group.title, page: group.page, icon: group.icon, count: group.slugs.size, rows }
}))

const welcomeText = computed(() => {
  const total = props.pages.length
  const articles = props.pages.filter(page => page.kind === 'article').length
  const places = props.pages.filter(page => ['star', 'planet', 'satellite'].includes(page.kind)).length
  return t('wiki.welcome', {
    pages: t('wiki.pages', { count: total }),
    articles: t('wiki.articles', { count: articles }),
    places: t('wiki.places', { count: places })
  })
})
</script>

<style scoped>
.wiki-portal {
  margin: 0 0 28px;
  /* Articles justify their text; these lists must not be */
  text-align: left;
  font-family: var(--wiki-font);
  font-size: var(--wiki-ui-size);
  line-height: var(--wiki-ui-line);
}

.portal-welcome {
  margin: 0 0 16px;
  padding: 8px 12px;
  border: 2px solid var(--ui-text);
  color: var(--ui-text);
}

.portal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.portal-box {
  min-width: 0;
  padding: 8px 12px 10px;
  border: 1px solid var(--ui-line);
}

.portal-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  background: repeating-linear-gradient(90deg, var(--ui-line) 0 4px, transparent 4px 8px) left bottom / 100% 2px no-repeat;
}

.portal-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  image-rendering: pixelated;
}

.portal-title {
  min-width: 0;
  color: var(--ui-text);
  font-family: var(--font-pixel);
  font-size: 10px;
  line-height: 16px;
  text-align: left;
  text-transform: uppercase;
}

.portal-count {
  margin-left: auto;
  color: var(--ui-dim);
}

.portal-row + .portal-row {
  margin-top: 6px;
}

.portal-row-title {
  color: var(--ui-dim);
}

.portal-row-icon {
  width: 16px;
  height: 16px;
  margin-right: 6px;
  vertical-align: -3px;
  image-rendering: pixelated;
}

.portal-row.is-sub {
  padding-left: calc((var(--depth) - 1) * 12px);
}

.portal-branch {
  display: inline-block;
  margin-right: 6px;
  vertical-align: 3px;
  width: 6px;
  height: 6px;
  border-left: 2px solid var(--ui-dim);
  border-bottom: 2px solid var(--ui-dim);
}

.portal-note {
  color: var(--ui-dim);
}

/* The "· 11 systems" count wraps as a whole, not by words */
.portal-note-text {
  white-space: nowrap;
}

.portal-sign {
  display: inline-block;
  margin-right: 6px;
  vertical-align: 2px;
  width: 4px;
  height: 4px;
  border: 2px solid;
  background: color-mix(in srgb, var(--sign-fill) 40%, transparent);
}

.portal-links {
  margin: 0;
  padding: 0;
  list-style: none;
}

.portal-links li {
  position: relative;
  padding-left: 1.2em;
}

.portal-links li::before {
  content: '>';
  position: absolute;
  left: 0;
  color: var(--ui-dim);
}

.portal-link {
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

.portal-title.portal-link {
  font-family: var(--font-pixel);
  font-size: 10px;
  line-height: 16px;
}

.portal-link:hover,
.portal-link:focus-visible {
  background: var(--ui-text);
  color: var(--ui-screen);
  outline: none;
}
</style>
