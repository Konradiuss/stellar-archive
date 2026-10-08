<template>
  <section class="editor-card station-look" :aria-label="t('editor.look')">
    <div class="editor-heading">{{ t('editor.look') }}</div>
    <div class="station-look-grid">
      <div class="station-look-picture">
        <StationVisualization class="look-station" :config="config" :fill="0.42" />
      </div>
      <div class="station-look-fields">
        <label class="editor-field station-type-field">
          <span>{{ t('editor.stationType') }}</span>
          <select class="editor-input station-type" :value="body.type ?? ''" @change="set('type', $event.target.value)">
            <option value="">{{ t('editor.autoValue', { value: t(`stationTypes.${DEFAULT_STATION_TYPE}`) }) }}</option>
            <option v-for="type in STATION_TYPES" :key="type" :value="type">{{ t(`stationTypes.${type}`) }}</option>
          </select>
        </label>
        <div class="editor-row look-colors">
          <EditorColor
            :label="t('editor.hullColor')"
            :value="body.color"
            :auto="cssColor(config.hull)"
            input-class="station-hull"
            @set="value => set('color', value)"
            @reset="set('color', '')"
          />
          <EditorColor
            :label="t('editor.lightsColor')"
            :value="body.lights"
            :auto="cssColor(config.lights)"
            input-class="station-lights"
            @set="value => set('lights', value)"
            @reset="set('lights', '')"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import StationVisualization from './StationVisualization.vue'
import EditorColor from './EditorColor.vue'
import { DEFAULT_STATION_TYPE, createStationConfig } from '../utils/stationRenderer'
import { STATION_TYPES, setBodyField } from '../editor/systemEdits'
import { cssColor } from '../editor/colors'

const props = defineProps({
  place: { type: Object, required: true },
  body: { type: Object, required: true }
})

const editor = useEditorStore()
const config = computed(() => createStationConfig({ ...props.body }))
const set = (field, value) => editor.editMap(text => setBodyField(text, props.place, field, value))
</script>

<style scoped>
.station-look-grid {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
}

.station-look-picture {
  height: 220px;
  border: 1px solid var(--ed-border);
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}

.look-station {
  width: 100%;
  height: 100%;
}

.station-look-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.station-type-field {
  max-width: 280px;
}

.look-colors {
  gap: 12px 28px;
}

@media (max-width: 900px) {
  .station-look-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
