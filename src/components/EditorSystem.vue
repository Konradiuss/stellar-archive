<template>
  <div class="editor-split editor-system">
    <aside class="editor-side system-side">
      <label class="editor-field system-star">
        <span>{{ t('editor.systemOf') }}</span>
        <select class="editor-input system-star-select" :value="starId ?? ''" @change="chooseStar($event.target.value)">
          <option value="" disabled>{{ t('editor.chooseStar') }}</option>
          <option v-for="each in stars" :key="each.id" :value="each.id">{{ each.name }}</option>
        </select>
      </label>

      <template v-if="star && system">
        <svg class="orbit-sketch" viewBox="-110 -110 220 220" role="img" :aria-label="t('editor.planets')">
          <circle class="orbit-star" r="7" />
          <circle v-for="orbit in orbits" :key="`o${orbit.index}`" class="orbit-ring" :r="orbit.r" />
          <circle
            v-for="orbit in orbits"
            :key="`p${orbit.index}`"
            class="orbit-planet"
            :class="{ 'is-selected': orbit.index === place?.planet }"
            :cx="orbit.x"
            :cy="orbit.y"
            :fill="orbit.color"
            r="6"
            @click="select({ star: starId, planet: orbit.index })"
          />
        </svg>

        <div class="editor-subheading">{{ t('editor.planets') }}</div>
        <div class="editor-list body-list">
          <template v-for="(planet, index) in planets" :key="index">
            <div class="body-row">
              <button type="button" class="editor-list-item body-item planet-item" :class="{ 'is-current': isCurrent(index, null) }" @click="select({ star: starId, planet: index })">
                <span class="body-dot" :style="{ background: orbits[index]?.color }"></span>
                <span class="editor-list-text">{{ planet.name ?? '?' }}</span>
              </button>
              <button type="button" class="editor-button is-icon is-small body-up" :aria-label="t('editor.moveUp')" :title="t('editor.moveUp')" :disabled="index === 0" @click="move({ star: starId, planet: index }, -1)">↑</button>
              <button type="button" class="editor-button is-icon is-small body-down" :aria-label="t('editor.moveDown')" :title="t('editor.moveDown')" :disabled="index === planets.length - 1" @click="move({ star: starId, planet: index }, 1)">↓</button>
            </div>
            <div v-if="place?.planet === index" class="body-satellites">
              <div class="editor-hint satellites-heading">{{ t('editor.satellites') }}</div>
              <div v-for="(satellite, at) in satellitesOf(planet)" :key="at" class="body-row is-satellite">
                <button type="button" class="editor-list-item body-item satellite-item" :class="{ 'is-current': isCurrent(index, at) }" @click="select({ star: starId, planet: index, satellite: at })">
                  <span class="body-kind" aria-hidden="true">{{ satellite.kind === 'station' ? '▣' : '●' }}</span>
                  <span class="editor-list-text">{{ satellite.name ?? '?' }}</span>
                </button>
                <button type="button" class="editor-button is-icon is-small body-up" :aria-label="t('editor.moveUp')" :title="t('editor.moveUp')" :disabled="at === 0" @click="move({ star: starId, planet: index, satellite: at }, -1)">↑</button>
                <button type="button" class="editor-button is-icon is-small body-down" :aria-label="t('editor.moveDown')" :title="t('editor.moveDown')" :disabled="at === satellitesOf(planet).length - 1" @click="move({ star: starId, planet: index, satellite: at }, 1)">↓</button>
              </div>
              <div class="editor-actions">
                <button type="button" class="editor-button is-small add-moon" @click="addSatelliteHere('moon')">{{ t('editor.addMoon') }}</button>
                <button type="button" class="editor-button is-small add-station" @click="addSatelliteHere('station')">{{ t('editor.addStation') }}</button>
              </div>
            </div>
          </template>
        </div>
        <div class="editor-actions">
          <button type="button" class="editor-button add-planet" @click="addPlanetHere">{{ t('editor.addPlanet') }}</button>
        </div>
      </template>
    </aside>

    <div class="editor-pane system-pane">
      <div v-if="star && !system" class="editor-card system-none">
        <div class="editor-note">{{ t('editor.noSystem', { name: star.name }) }}</div>
        <div class="editor-actions">
          <button type="button" class="editor-button is-primary add-system" @click="addSystemHere">{{ t('editor.addSystem') }}</button>
        </div>
      </div>

      <template v-else-if="body">
        <div :key="placeKey" class="body-panel" :aria-label="body.name ?? ''" role="region">
          <section class="editor-card body-orbit-card">
            <div class="editor-heading body-title">{{ body.name ?? '?' }}</div>
            <div class="editor-row">
              <label class="editor-field body-name-field">
                <span>{{ t('editor.bodyName') }}</span>
                <input class="editor-input body-name" :value="body.name ?? ''" @change="set('name', $event.target.value.trim())" @keydown.enter="$event.target.blur()" />
              </label>
              <label v-if="!isSatellite" class="editor-field">
                <span>{{ t('editor.tabTitle') }}</span>
                <input class="editor-input body-tab" :value="body.tabTitle ?? ''" :placeholder="body.name ?? ''" @change="set('tabTitle', $event.target.value.trim())" @keydown.enter="$event.target.blur()" />
              </label>
            </div>
            <div class="editor-subheading">{{ t('editor.orbit') }}</div>
            <div class="editor-row">
              <template v-if="isSatellite">
                <label class="editor-field">
                  <span>{{ t('editor.distance') }}</span>
                  <EditorNumber :value="body.distance" input-class="body-distance" :placeholder="t('editor.auto')" @commit="value => set('distance', value)" />
                </label>
                <label class="editor-field">
                  <span>{{ t('editor.satelliteSize') }}</span>
                  <EditorNumber :value="body.size" input-class="body-size" :placeholder="t('editor.auto')" @commit="value => set('size', value)" />
                </label>
              </template>
              <label v-else class="editor-field is-short">
                <span>{{ t('editor.orbitRadius') }}</span>
                <EditorNumber :value="body.orbitRadius" input-class="body-orbit" :placeholder="t('editor.auto')" @commit="value => set('orbitRadius', value)" />
              </label>
              <label class="editor-field is-short">
                <span>{{ t('editor.angle') }}</span>
                <EditorNumber :value="body.angle" input-class="body-angle" :placeholder="t('editor.auto')" @commit="value => set('angle', value)" />
              </label>
              <label class="editor-field is-short">
                <span>{{ t('editor.speed') }}</span>
                <EditorNumber :value="body.speed" input-class="body-speed" :placeholder="t('editor.auto')" @commit="value => set('speed', value)" />
              </label>
            </div>
          </section>

          <EditorStationLook v-if="isStation" :place="place" :body="body" />
          <EditorBodyLook v-else :place="place" :body="body" />
          <EditorLore :place="place" :body="body" />

          <div v-if="!confirming" class="editor-actions">
            <button type="button" class="editor-button is-danger body-delete" @click="confirming = true">{{ t('editor.delete') }}</button>
          </div>
          <div v-else class="editor-confirm" role="alertdialog">
            <div>{{ t('editor.confirmDeleteBody', { name: body.name ?? '?' }) }}</div>
            <div v-if="deleteOrphans.length" class="editor-note delete-files">{{ t('editor.withFiles', { files: deleteOrphans.join(', ') }) }}</div>
            <div class="editor-actions">
              <button type="button" class="editor-button is-danger confirm-yes" @click="removeHere">{{ t('editor.yes') }}</button>
              <button type="button" class="editor-button" @click="confirming = false">{{ t('editor.no') }}</button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import { addPlanet, addSatellite, addSystem, bodyAt, moveBody, removeBody, setBodyField } from '../editor/systemEdits'
import { starAt } from '../editor/starEdits'
import { cssColor } from '../editor/colors'
import { createPlanetVisualizationConfig } from '../utils/planetRenderer'
import { collectMapNotes } from '../utils/mapJournal'
import EditorBodyLook from './EditorBodyLook.vue'
import EditorStationLook from './EditorStationLook.vue'
import EditorLore from './EditorLore.vue'
import EditorNumber from './EditorNumber.vue'

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const stars = computed(() => (Array.isArray(map.value.stars) ? map.value.stars : [])
  .filter(each => each && typeof each.id === 'string')
  .map(each => ({ id: each.id, name: each.name ?? each.id })))

if (!editor.systemStar && editor.selectedSector) editor.systemStar = starAt(map.value, editor.selectedSector.x, editor.selectedSector.y)?.id ?? null
const starId = computed(() => editor.systemStar)
const star = computed(() => stars.value.find(each => each.id === starId.value) ?? null)
const system = computed(() => {
  const value = map.value.systems?.[starId.value]
  return value && typeof value === 'object' ? value : null
})
const planets = computed(() => (Array.isArray(system.value?.planets) ? system.value.planets : []).map(planet => (planet && typeof planet === 'object' ? planet : {})))
const satellitesOf = planet => (Array.isArray(planet.satellites) ? planet.satellites : []).map(each => (each && typeof each === 'object' ? each : {}))

const place = computed(() => (editor.selectedBody?.star === starId.value ? editor.selectedBody : null))
const body = computed(() => (place.value ? bodyAt(map.value, place.value) : null))
const placeKey = computed(() => JSON.stringify(place.value))
const isSatellite = computed(() => place.value?.satellite !== null && place.value?.satellite !== undefined)
const isStation = computed(() => isSatellite.value && body.value?.kind === 'station')
const isCurrent = (planet, satellite) => place.value?.planet === planet && (place.value?.satellite ?? null) === satellite

const landOf = planet => {
  const config = collectMapNotes(() => createPlanetVisualizationConfig(planet)).result
  return config ? cssColor(config.landColor) : 'var(--ed-muted)'
}

// As the site lays them out: a planet without a radius goes 30 further out.
const orbits = computed(() => {
  let previous = 0
  const radii = planets.value.map(planet => {
    previous = Number(planet.orbitRadius) > 0 ? Number(planet.orbitRadius) : previous + 30
    return previous
  })
  const furthest = Math.max(...radii, 1)
  return radii.map((radius, index) => {
    const r = 14 + (radius / furthest) * 88
    const angle = ((Number(planets.value[index].angle) || 0) * Math.PI) / 180
    return { index, r, x: Math.cos(angle) * r, y: Math.sin(angle) * r, color: landOf(planets.value[index]) }
  })
})

const confirming = ref(false)
watch(placeKey, () => { confirming.value = false })

function chooseStar(id) {
  editor.systemStar = id
  editor.selectedBody = null
}

const select = value => { editor.selectedBody = { satellite: null, ...value } }
const set = (field, value) => editor.editMap(text => setBodyField(text, place.value, field, value))

const addSystemHere = () => editor.editMap(text => addSystem(text, starId.value))

function addPlanetHere() {
  const done = editor.editMap(text => addPlanet(text, starId.value, { name: t('editor.newPlanetName') }))
  if (done) select({ star: starId.value, planet: done.index })
}

function addSatelliteHere(kind) {
  const planetPlace = { star: starId.value, planet: place.value.planet }
  const done = editor.editMap(text => addSatellite(text, planetPlace, { kind, name: t(kind === 'station' ? 'editor.newStationName' : 'editor.newMoonName') }))
  if (done) select({ ...planetPlace, satellite: done.index })
}

function move(target, delta) {
  editor.editMap(text => moveBody(text, target, delta))
  const current = place.value
  if (!current) return
  const isSatellitePlace = target.satellite !== null && target.satellite !== undefined
  if (!isSatellitePlace && current.planet === target.planet) select({ ...current, planet: current.planet + delta })
  else if (!isSatellitePlace && current.planet === target.planet + delta) select({ ...current, planet: target.planet })
  else if (isSatellitePlace && current.planet === target.planet && current.satellite === target.satellite) select({ ...current, satellite: current.satellite + delta })
  else if (isSatellitePlace && current.planet === target.planet && current.satellite === target.satellite + delta) select({ ...current, satellite: target.satellite })
}

const deleteOrphans = computed(() => {
  if (!confirming.value || !place.value) return []
  try {
    return removeBody(editor.mapText, place.value).orphans
  } catch {
    return []
  }
})

function removeHere() {
  editor.editMap(text => removeBody(text, place.value))
  editor.selectedBody = null
  confirming.value = false
}
</script>

<style scoped>
.orbit-sketch {
  flex: none;
  width: 100%;
  max-width: 256px;
  aspect-ratio: 1;
  align-self: center;
  border: 1px solid var(--ed-border);
  border-radius: 8px;
  background: var(--ed-bg);
}

.orbit-star {
  fill: var(--ed-warn);
}

.orbit-ring {
  fill: none;
  stroke: var(--ed-border-strong);
  stroke-width: 0.8;
}

.orbit-planet {
  stroke: var(--ed-bg);
  stroke-width: 2;
  cursor: pointer;
}

.orbit-planet.is-selected {
  stroke: var(--ed-accent);
  stroke-width: 3;
}

.body-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.body-row .body-item {
  flex: 1;
  min-width: 0;
}

.body-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.body-kind {
  flex: none;
  width: 12px;
  font-size: 12px;
  color: var(--ed-muted);
  text-align: center;
}

.body-satellites {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 2px 0 8px 18px;
  padding-left: 10px;
  border-left: 1px solid var(--ed-border);
}

.satellites-heading {
  padding: 4px 0 0;
}

.body-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.body-title {
  font-size: 15px;
}

.body-name-field {
  flex: 2 1 220px !important;
}
</style>
