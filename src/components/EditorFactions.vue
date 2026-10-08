<template>
  <section class="editor-card editor-factions" :aria-label="t('editor.factions')">
    <div class="editor-heading">
      {{ t('editor.factions') }}
      <button type="button" class="editor-button is-small new-faction" @click="add">{{ t('editor.newFaction') }}</button>
    </div>
    <div v-for="faction in factions" :key="faction.id" class="faction-row" :data-faction="faction.id">
      <div class="faction-top">
        <span class="faction-mark" :style="{ background: faction.mark }"></span>
        <input class="editor-input faction-name" :aria-label="t('editor.factionName')" :value="faction.name" :placeholder="faction.id" @change="set(faction.id, 'name', $event.target.value.trim() || faction.id)" @keydown.enter="$event.target.blur()" />
        <span class="editor-hint faction-count">{{ t('editor.factionStars', { count: faction.stars }) }}</span>
        <button v-if="confirming !== faction.id" type="button" class="editor-button is-danger is-small faction-delete" @click="confirming = faction.id">{{ t('editor.delete') }}</button>
      </div>
      <div v-if="confirming === faction.id" class="editor-confirm faction-confirm" role="alertdialog">
        <div>{{ t('editor.confirmDeleteFaction', { name: faction.name }) }}</div>
        <div class="editor-actions">
          <button type="button" class="editor-button is-danger confirm-yes" @click="remove(faction.id)">{{ t('editor.yes') }}</button>
          <button type="button" class="editor-button" @click="confirming = null">{{ t('editor.no') }}</button>
        </div>
      </div>
      <div class="faction-look">
        <EditorColor
          :label="t('editor.fillColor')"
          :value="faction.raw.fillColor"
          input-class="faction-fill"
          @set="value => set(faction.id, 'fillColor', value)"
          @reset="set(faction.id, 'fillColor', '')"
        />
        <label class="editor-field is-short">
          <span>{{ t('editor.fillOpacity') }}</span>
          <EditorNumber :value="faction.raw.fillOpacity" input-class="faction-fill-opacity" :min="0" :max="1" :placeholder="t('editor.autoDefault', { value: 0.15 })" @commit="value => set(faction.id, 'fillOpacity', value)" />
        </label>
        <EditorColor
          :label="t('editor.borderColor')"
          :value="faction.raw.borderColor"
          input-class="faction-border"
          @set="value => set(faction.id, 'borderColor', value)"
          @reset="set(faction.id, 'borderColor', '')"
        />
        <label class="editor-field is-short">
          <span>{{ t('editor.borderWidth') }}</span>
          <EditorNumber :value="faction.raw.borderWidth" input-class="faction-border-width" :min="0" above :placeholder="t('editor.autoDefault', { value: 2 })" @commit="value => set(faction.id, 'borderWidth', value)" />
          <span class="editor-hint border-width-hint">{{ t('editor.borderWidthHint') }}</span>
        </label>
        <EditorColor
          :label="t('editor.labelColor')"
          :value="labelColors[faction.id]"
          :auto="themeText"
          input-class="faction-label"
          @set="value => setLabel(faction.id, value)"
          @reset="setLabel(faction.id, '')"
        />
      </div>
    </div>

    <div class="editor-subheading">{{ t('editor.size') }}</div>
    <div class="editor-row galaxy-size">
      <label class="editor-field is-short">
        <span>{{ t('editor.columns') }}</span>
        <input v-model.number="columns" class="editor-input size-columns" type="number" min="1" max="100" />
      </label>
      <label class="editor-field is-short">
        <span>{{ t('editor.rows') }}</span>
        <input v-model.number="rows" class="editor-input size-rows" type="number" min="1" max="100" />
      </label>
      <button type="button" class="editor-button size-set" @click="setSize">{{ t('editor.setSize') }}</button>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import { addFaction, removeFaction, setFactionField, setGalaxySize, setLabelColor } from '../editor/starEdits'
import { cssColor, factionColor } from '../editor/colors'
import { checkTheme } from '../theme'
import { normalizeGalaxyConfig } from '../config/mapGeometry'
import { collectMapNotes } from '../utils/mapJournal'
import EditorColor from './EditorColor.vue'
import EditorNumber from './EditorNumber.vue'

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const stars = computed(() => (Array.isArray(map.value.stars) ? map.value.stars : []))

const factions = computed(() => Object.entries(map.value.factions && typeof map.value.factions === 'object' ? map.value.factions : {})
  .filter(([, faction]) => faction && typeof faction === 'object')
  .map(([id, faction]) => ({
    id,
    name: faction.name ?? id,
    mark: factionColor(faction) ?? 'var(--ed-faint)',
    raw: faction,
    stars: stars.value.filter(star => star?.faction === id).length
  })))

const labelColors = computed(() => (map.value.planetTextColors && typeof map.value.planetTextColors === 'object' ? map.value.planetTextColors : {}))
// Names without a colour of their faction's are in the text colour of the theme.
const themeText = computed(() => cssColor(collectMapNotes(() => checkTheme(map.value.theme, () => {})).result.colors.text) ?? '#ffffff')

const confirming = ref(null)
const set = (id, field, value) => editor.editMap(text => setFactionField(text, id, field, value))
const setLabel = (id, value) => editor.editMap(text => setLabelColor(text, id, value))
const add = () => editor.editMap(text => addFaction(text, { name: t('editor.newFactionName') }))

function remove(id) {
  editor.editMap(text => removeFaction(text, id))
  confirming.value = null
}

const size = computed(() => collectMapNotes(() => normalizeGalaxyConfig(map.value.galaxy, [])).result)
const columns = ref(size.value.columns)
const rows = ref(size.value.rows)
watch(size, value => {
  columns.value = value.columns
  rows.value = value.rows
})
const setSize = () => editor.editMap(text => setGalaxySize(text, columns.value, rows.value))
</script>

<style scoped>
.faction-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid var(--ed-border);
}

.faction-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.faction-mark {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.faction-name {
  flex: 1 1 200px;
  max-width: 360px;
}

.faction-count {
  margin-left: auto;
  white-space: nowrap;
}

.faction-look {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 24px;
  padding-left: 22px;
}

.galaxy-size {
  padding-top: 0;
}

@media (max-width: 760px) {
  .faction-top {
    flex-wrap: wrap;
  }

  .faction-look {
    padding-left: 0;
  }
}
</style>
