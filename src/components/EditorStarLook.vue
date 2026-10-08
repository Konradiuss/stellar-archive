<template>
  <section class="editor-card star-look" :aria-label="t('editor.look')">
    <div class="editor-heading">{{ t('editor.look') }}</div>
    <div class="star-look-grid">
      <div class="star-look-picture">
        <StarVisualization class="look-star" :starConfig="config" :targetFps="30" />
      </div>
      <div class="star-look-fields">
        <div class="editor-row look-colors">
          <EditorColor
            v-for="(field, index) in COLOR_FIELDS"
            :key="field"
            :label="t('editor.starColor', { number: index + 1 })"
            :value="look[field]"
            :auto="cssColor(DEFAULT_CONFIG[field])"
            :input-class="`star-${field}`"
            @set="value => set(field, value)"
            @reset="set(field, '')"
          />
        </div>
        <div class="editor-hint">{{ t('editor.starColorsHint') }}</div>
        <div class="editor-row">
          <label class="editor-field is-short">
            <span>{{ t('editor.starSize') }}</span>
            <EditorNumber :value="look.size" input-class="star-size" :placeholder="t('editor.autoDefault', { value: DEFAULT_CONFIG.size })" @commit="value => set('size', value)" />
          </label>
          <label class="editor-field is-short">
            <span>{{ t('editor.starSeed') }}</span>
            <EditorNumber :value="look.seed" input-class="star-seed" :placeholder="t('editor.auto')" @commit="value => set('seed', value)" />
          </label>
          <label class="editor-field is-short">
            <span>{{ t('editor.angle') }}</span>
            <EditorNumber :value="look.rotation" input-class="star-rotation" :placeholder="t('editor.auto')" @commit="value => set('rotation', value)" />
          </label>
          <label class="editor-field is-short">
            <span>{{ t('editor.starSpin') }}</span>
            <EditorNumber :value="look.spinSpeed" input-class="star-spin" :placeholder="t('editor.auto')" @commit="value => set('spinSpeed', value)" />
          </label>
        </div>
        <div class="editor-hint">{{ t('editor.starNumbersHint') }}</div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import StarVisualization from './StarVisualization.vue'
import EditorColor from './EditorColor.vue'
import EditorNumber from './EditorNumber.vue'
import { DEFAULT_CONFIG, createStarVisualizationConfig } from '../utils/starRenderer'
import { setBodyLook } from '../editor/systemEdits'
import { cssColor } from '../editor/colors'
import { isObject } from '../utils/guards'

const COLOR_FIELDS = ['color1', 'color2', 'color3']

const props = defineProps({
  place: { type: Object, required: true },
  body: { type: Object, required: true }
})

const editor = useEditorStore()
const look = computed(() => (isObject(props.body.starVisualization) ? props.body.starVisualization : {}))
// A new object each time: the picture watches its config deeply.
const config = computed(() => createStarVisualizationConfig({ ...props.body }))
const set = (field, value) => editor.editMap(text => setBodyLook(text, props.place, field, value))
</script>

<style scoped>
.star-look-grid {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
}

.star-look-picture {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 220px;
  border: 1px solid var(--ed-border);
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}

.star-look-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.look-colors {
  gap: 12px 28px;
}

@media (max-width: 900px) {
  .star-look-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
