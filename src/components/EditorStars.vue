<template>
  <div class="editor-galaxy">
    <div class="editor-pane galaxy-main">
      <section class="editor-card galaxy-card">
        <div class="editor-heading">{{ t('editor.galaxy', { columns: galaxy.columns, rows: galaxy.rows }) }}</div>
        <!-- Layer order: sectors, routes, stars, so a route never crosses a star or its name. -->
        <div
          class="galaxy-board"
          :class="{ 'is-moving': moving || linking }"
          :style="{ '--columns': galaxy.columns, '--rows': galaxy.rows, '--dot-y': `${DOT_Y * 100}%` }"
        >
          <div class="board-layer board-cells" aria-hidden="true">
            <div v-for="cell in cells" :key="cell.key" class="board-cell" :style="cell.color ? { '--faction': cell.color } : null" :class="{ 'has-star': cell.star }"></div>
          </div>
          <svg class="board-layer route-layer" :viewBox="`0 0 ${galaxy.columns} ${galaxy.rows}`" preserveAspectRatio="none" aria-hidden="true">
            <line
              v-for="route in drawnRoutes"
              :key="route.index"
              class="route-line"
              :class="{ 'is-selected': route.index === editor.selectedRoute }"
              :data-route="route.index"
              :x1="route.from.sectorX + 0.5"
              :y1="route.from.sectorY + DOT_Y"
              :x2="route.to.sectorX + 0.5"
              :y2="route.to.sectorY + DOT_Y"
              :stroke="cssColor(route.color)"
              :stroke-opacity="route.index === editor.selectedRoute ? 1 : route.opacity"
              :stroke-width="route.index === editor.selectedRoute ? route.width + 2 : route.width"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div class="board-layer board-sectors">
            <button
              v-for="cell in cells"
              :key="cell.key"
              type="button"
              class="star-cell"
              :class="{ 'has-star': cell.star, 'is-selected': cell.x === selected?.x && cell.y === selected?.y }"
              :style="cell.color ? { '--faction': cell.color } : null"
              :aria-label="cell.label"
              :title="cell.label"
              @click="pick(cell)"
            >
              <template v-if="cell.star">
                <span class="star-dot"></span>
                <span class="star-label">{{ cell.star.name ?? cell.star.id }}</span>
              </template>
            </button>
          </div>
        </div>
        <div v-if="moving" class="editor-actions editor-note is-warn">
          {{ t('editor.moving', { name: moving.name ?? moving.id }) }}
          <button type="button" class="editor-button is-small" @click="moving = null">{{ t('editor.cancel') }}</button>
        </div>
        <div v-if="linking" class="editor-actions editor-note is-warn">
          {{ t('editor.linking', { name: linking.name ?? linking.id }) }}
          <button type="button" class="editor-button is-small" @click="linking = null">{{ t('editor.cancel') }}</button>
        </div>
      </section>

      <EditorFactions />
      <EditorRoutes part="types" />
    </div>

    <aside class="editor-side galaxy-side">
      <section v-if="selected" class="editor-card star-panel" :aria-label="t('editor.sector', selected)">
        <div class="editor-heading">{{ star ? star.name ?? star.id : t('editor.sector', selected) }}<span v-if="star" class="editor-hint">{{ t('editor.sector', selected) }}</span></div>
        <template v-if="star">
          <label class="editor-field">
            <span>{{ t('editor.starName') }}</span>
            <input ref="nameRef" class="editor-input star-name" :value="star.name ?? ''" :placeholder="star.id" @change="setField('name', $event.target.value)" @keydown.enter="$event.target.blur()" />
          </label>
          <label class="editor-field">
            <span>{{ t('editor.starId') }}</span>
            <input class="editor-input star-id" :value="star.id" spellcheck="false" @change="renameId($event.target.value)" @keydown.enter="$event.target.blur()" />
          </label>
          <div class="editor-hint">{{ t('editor.starIdHint', { id: star.id }) }}</div>
          <label class="editor-field">
            <span>{{ t('editor.starFaction') }}</span>
            <select class="editor-input star-faction" :value="star.faction ?? ''" @change="setField('faction', $event.target.value)">
              <option value="">{{ t('editor.withoutFaction') }}</option>
              <option v-for="faction in factions" :key="faction.id" :value="faction.id">{{ faction.name }}</option>
            </select>
          </label>

          <div class="editor-subheading star-routes-heading">{{ t('editor.starRoutes') }}</div>
          <div v-if="!starRoutes.length" class="editor-note">{{ t('editor.noRoutes') }}</div>
          <div v-else class="editor-list">
            <button
              v-for="route in starRoutes"
              :key="route.index"
              type="button"
              class="editor-list-item star-route"
              :class="{ 'is-current': route.index === editor.selectedRoute }"
              @click="editor.selectedRoute = route.index"
            >
              <span class="star-route-swatch" :style="{ background: cssColor(route.color) }"></span>
              <span class="editor-list-text">{{ t('editor.routeLabel', { from: route.from?.name ?? '?', to: route.to?.name ?? '?' }) }}</span>
            </button>
          </div>
          <div class="editor-actions">
            <button type="button" class="editor-button add-route" @click="linking = star">{{ t('editor.addRoute') }}</button>
            <button type="button" class="editor-button star-move" @click="moving = star">{{ t('editor.move') }}</button>
          </div>
          <div v-if="!confirming" class="editor-actions">
            <button type="button" class="editor-button is-danger star-delete" @click="askDelete">{{ t('editor.delete') }}</button>
          </div>
          <div v-else class="editor-confirm" role="alertdialog">
            <div>{{ t('editor.confirmDeleteStar', { name: star.name ?? star.id }) }}</div>
            <label v-if="links.system" class="editor-check"><input v-model="withSystem" type="checkbox" /> {{ t('editor.withSystem') }}</label>
            <label v-if="links.lines.length" class="editor-check"><input v-model="withLines" type="checkbox" /> {{ t('editor.withLines', { count: links.lines.length }) }}</label>
            <div v-if="links.system && !withSystem" class="editor-note is-warn keep-system-note">{{ t('editor.keptSystemNote') }}</div>
            <div v-if="links.lines.length && !withLines" class="editor-note is-warn keep-lines-note">{{ t('editor.keptLinesNote', { count: links.lines.length }) }}</div>
            <div v-if="deleteOrphans.length" class="editor-note delete-files">{{ t('editor.withFiles', { files: deleteOrphans.join(', ') }) }}</div>
            <div class="editor-actions">
              <button type="button" class="editor-button is-danger confirm-yes" @click="removeSelected">{{ t('editor.yes') }}</button>
              <button type="button" class="editor-button" @click="confirming = false">{{ t('editor.no') }}</button>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="editor-note">{{ t('editor.emptySector') }}</div>
          <div class="editor-actions">
            <button type="button" class="editor-button is-primary new-star" @click="addHere">{{ t('editor.newStar') }}</button>
          </div>
        </template>
      </section>
      <EditorRoutes v-if="editor.selectedRoute !== null" class="star-side-route" part="route" />
      <div v-if="!selected && editor.selectedRoute === null" class="editor-note galaxy-side-hint">{{ t('editor.galaxySideHint') }}</div>
    </aside>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import { addStar, moveStar, removeStar, renameStarId, setStarField, starAt, starLinks } from '../editor/starEdits'
import { addRoute, routeList, routesOf } from '../editor/routeEdits'
import { cssColor, factionColor } from '../editor/colors'
import EditorRoutes from './EditorRoutes.vue'
import EditorFactions from './EditorFactions.vue'
import { collectMapNotes } from '../utils/mapJournal'
import { normalizeGalaxyConfig } from '../config/mapGeometry'

const DOT_Y = 0.32

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const stars = computed(() => (Array.isArray(map.value.stars) ? map.value.stars.filter(star => star && Number.isInteger(star.sectorX) && Number.isInteger(star.sectorY)) : []))
const factions = computed(() => Object.entries(map.value.factions && typeof map.value.factions === 'object' ? map.value.factions : {})
  .map(([id, faction]) => ({ id, name: faction?.name ?? id, color: factionColor(faction) })))
const galaxy = computed(() => collectMapNotes(() => normalizeGalaxyConfig(map.value.galaxy, stars.value)).result)

const cells = computed(() => {
  const byFaction = new Map(factions.value.map(faction => [faction.id, faction.color]))
  const list = []
  for (let y = 0; y < galaxy.value.rows; y++) {
    for (let x = 0; x < galaxy.value.columns; x++) {
      const star = stars.value.find(each => each.sectorX === x && each.sectorY === y) ?? null
      const sector = t('editor.sector', { x, y })
      list.push({ key: `${x},${y}`, x, y, star, color: star ? byFaction.get(star.faction) ?? null : null, label: star ? `${sector}: ${star.name ?? star.id}` : sector })
    }
  }
  return list
})

const { selectedSector: selected } = storeToRefs(editor)
const moving = ref(null)
const confirming = ref(false)
const withSystem = ref(true)
const withLines = ref(true)
const nameRef = ref(null)
const linking = ref(null)

const routes = computed(() => routeList(map.value))
const drawnRoutes = computed(() => routes.value.filter(route => route.from && route.to))
const starRoutes = computed(() => (star.value ? routesOf(map.value, star.value.id).map(index => routes.value[index]) : []))

const star = computed(() => (selected.value ? starAt({ stars: stars.value }, selected.value.x, selected.value.y) : null))
const links = computed(() => (star.value ? starLinks(map.value, star.value.id) : { system: false, lines: [] }))

watch(() => star.value?.id, () => { confirming.value = false })

function pick(cell) {
  if (linking.value) {
    if (cell.star && cell.star.id !== linking.value.id) {
      const done = editor.editMap(text => addRoute(text, { from: linking.value.id, to: cell.star.id }))
      if (done) editor.selectedRoute = done.index
    }
    linking.value = null
    return
  }
  if (moving.value) {
    if (!cell.star) editor.editMap(text => moveStar(text, moving.value.id, cell.x, cell.y))
    moving.value = null
  }
  selected.value = { x: cell.x, y: cell.y }
}

async function addHere() {
  const done = editor.editMap(text => addStar(text, { name: t('editor.newStarName'), sectorX: selected.value.x, sectorY: selected.value.y }))
  if (!done) return
  await nextTick()
  nameRef.value?.focus()
  nameRef.value?.select()
}

const setField = (field, value) => editor.editMap(text => setStarField(text, star.value.id, field, field === 'name' ? value.trim() : value))
const renameId = value => editor.editMap(text => renameStarId(text, star.value.id, value))

const deleteOrphans = computed(() => {
  if (!confirming.value || !star.value) return []
  try {
    return removeStar(editor.mapText, star.value.id, { withSystem: withSystem.value, withLines: withLines.value }).orphans
  } catch {
    return []
  }
})

function askDelete() {
  withSystem.value = true
  withLines.value = true
  confirming.value = true
}

function removeSelected() {
  editor.editMap(text => removeStar(text, star.value.id, { withSystem: withSystem.value, withLines: withLines.value }))
  confirming.value = false
}
</script>

<style scoped>
.editor-galaxy {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  height: 100%;
  min-height: 0;
}

.galaxy-side {
  border-right: 0;
  border-left: 1px solid var(--ed-border);
}

.galaxy-side .editor-card {
  background: var(--ed-raised);
}

.editor-heading .editor-hint {
  font-weight: 400;
}

.galaxy-board {
  position: relative;
  width: 100%;
  aspect-ratio: calc(var(--columns) * 5) / calc(var(--rows) * 4);
  border: 1px solid var(--ed-border);
  border-radius: var(--ed-radius);
  overflow: hidden;
  background: var(--ed-bg);
  container-type: inline-size;
}

.board-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.board-cells,
.board-sectors {
  display: grid;
  grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  grid-template-rows: repeat(var(--rows), minmax(0, 1fr));
}

.board-cells {
  z-index: 0;
}

.board-cell {
  box-shadow: inset -1px -1px 0 rgb(43 51 63 / 0.7);
}

.board-cell.has-star {
  background: color-mix(in srgb, var(--faction, var(--ed-faint)) 14%, transparent);
}

.route-layer {
  z-index: 1;
  pointer-events: none;
}

.route-line {
  stroke-linecap: round;
}

.board-sectors {
  z-index: 2;
}

.star-cell {
  position: relative;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ed-text);
  font: inherit;
}

.star-cell:hover {
  background: rgb(255 255 255 / 0.05);
}

.star-cell:focus-visible {
  outline: 2px solid var(--ed-accent);
  outline-offset: -2px;
}

.star-cell.is-selected {
  box-shadow: inset 0 0 0 2px var(--ed-accent);
}

.galaxy-board.is-moving .star-cell:not(.has-star) {
  background: rgb(217 163 58 / 0.08);
}

.star-dot {
  position: absolute;
  top: calc(var(--dot-y) - 6px);
  left: calc(50% - 6px);
  width: 12px;
  height: 12px;
  border: 2px solid var(--ed-bg);
  border-radius: 50%;
  background: var(--faction, var(--ed-muted));
  box-sizing: border-box;
}

.star-label {
  position: absolute;
  top: calc(var(--dot-y) + 8px);
  left: 2px;
  right: 2px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 12px;
  line-height: 14px;
  text-align: center;
  overflow-wrap: normal;
  word-break: normal;
  /* On a plate of the background, so a route never runs across the name. */
  width: max-content;
  max-width: calc(100% - 4px);
  margin: 0 auto;
  padding: 0 2px;
  border-radius: 3px;
  background: rgb(14 17 22 / 0.88);
}

@container (max-width: 760px) {
  .star-label {
    display: none;
  }
}

.star-route-swatch {
  flex: none;
  width: 14px;
  height: 3px;
  border-radius: 2px;
}

@media (max-width: 1100px) {
  .editor-galaxy {
    grid-template-columns: minmax(0, 1fr) 300px;
  }
}

@media (max-width: 760px) {
  .editor-galaxy {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: auto;
    padding: 16px;
  }

  .galaxy-main {
    display: contents;
  }

  .galaxy-card {
    order: 1;
  }

  .galaxy-side {
    order: 2;
    max-height: none;
    padding: 0;
    border: 0;
    background: none;
  }

  .galaxy-side:empty {
    display: none;
  }

  .galaxy-main > :not(.galaxy-card) {
    order: 3;
  }
}
</style>
