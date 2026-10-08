<template>
  <section class="editor-card body-look" :aria-label="t('editor.look')">
    <div class="editor-heading">{{ t('editor.look') }}</div>
    <div class="body-look-grid">
      <div class="body-look-picture">
        <PlanetVisualization v-if="config" class="look-planet" :planet-config="config" :disc-share="0.3" fit-ring />
        <div v-else class="editor-note body-look-none">{{ t('editor.noLook') }}</div>
      </div>
      <div class="body-look-fields">
        <div class="editor-row">
          <label class="editor-field">
            <span>{{ t('editor.seed') }}</span>
            <input
              class="editor-input look-seed"
              :value="look.seed ?? ''"
              :placeholder="t('editor.seedFromName', { name: seedName })"
              :disabled="!!preset"
              spellcheck="false"
              @change="set('seed', $event.target.value.trim())"
              @keydown.enter="$event.target.blur()"
            />
          </label>
          <label class="editor-field">
            <span>{{ t('editor.preset') }}</span>
            <select class="editor-input look-preset" :value="preset" @change="set('seed', $event.target.value)">
              <option value="">{{ t('editor.noPreset') }}</option>
              <option v-for="name in PRESETS" :key="name" :value="name">{{ t(`planetPresets.${name}`) }}</option>
            </select>
          </label>
          <label class="editor-field is-short">
            <span>{{ t('editor.lookSize') }}</span>
            <EditorNumber :value="look.size" input-class="look-size" :placeholder="t('editor.autoDefault', { value: DEFAULTS.size })" @commit="value => set('size', value)" />
          </label>
        </div>
        <div class="editor-hint">{{ t('editor.seedHint') }}</div>

        <div v-if="preset" class="editor-note look-locked">{{ t('editor.presetLocks', { name: t(`planetPresets.${preset}`) }) }}</div>
        <div class="editor-row look-colors">
          <EditorColor
            :label="t('editor.landColor')"
            :value="look.landColor"
            :auto="cssColor(config?.landColor) ?? '#44aa44'"
            :disabled="!!preset"
            input-class="look-land"
            @set="value => set('landColor', value)"
            @reset="set('landColor', '')"
          />
          <EditorColor
            :label="t('editor.waterColor')"
            :value="look.waterColor"
            :auto="cssColor(config?.waterColor) ?? '#2244aa'"
            :disabled="!!preset"
            input-class="look-water"
            @set="value => set('waterColor', value)"
            @reset="set('waterColor', '')"
          />
          <label class="editor-field look-liquid-field">
            <span>{{ t('editor.waterType') }}</span>
            <select class="editor-input look-liquid" :value="preset ? config?.waterType : look.waterType ?? ''" :disabled="!!preset" @change="set('waterType', $event.target.value)">
              <option v-if="!preset" value="">{{ t('editor.autoValue', { value: t('liquids.water') }) }}</option>
              <option v-for="type in WATER_TYPES" :key="type" :value="type">{{ t(`liquids.${type}`) }}</option>
            </select>
          </label>
        </div>

        <div class="editor-field look-amount-field">
          <span class="look-amount-label">
            {{ t('editor.waterAmount', { percent: Math.round(amount * 100) }) }}
            <em v-if="!amountSet || preset" class="editor-hint">{{ t('editor.auto') }}</em>
            <button v-if="amountSet && !preset" type="button" class="editor-button is-quiet is-small amount-reset" @click="set('waterAmount', '')">{{ t('editor.reset') }}</button>
          </span>
          <input
            class="look-amount"
            :class="{ 'is-auto': !amountSet }"
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="amount"
            :disabled="!!preset"
            :aria-label="t('editor.waterAmount', { percent: Math.round(amount * 100) })"
            @change="set('waterAmount', Number($event.target.value))"
          />
        </div>

        <div class="editor-row look-ring-row">
          <label class="editor-field look-ring-field">
            <span>{{ t('editor.ring') }}</span>
            <select class="editor-input look-ring" :value="look.ring?.size ?? ''" @change="setRing($event.target.value)">
              <option value="">{{ t('editor.noRing') }}</option>
              <option v-for="size in RING_SIZES" :key="size" :value="size">{{ t(`ringSizes.${size}`) }}</option>
            </select>
          </label>
          <EditorColor
            v-if="look.ring?.size"
            :label="t('editor.ringColor')"
            :value="look.ring.color"
            :auto="cssColor(config?.ring?.color) ?? '#aaaaaa'"
            input-class="look-ring-color"
            @set="value => set('ring', { ...look.ring, color: value })"
            @reset="set('ring', withoutColor(look.ring))"
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
import PlanetVisualization from './PlanetVisualization.vue'
import EditorColor from './EditorColor.vue'
import EditorNumber from './EditorNumber.vue'
import { createPlanetVisualizationConfig } from '../utils/planetRenderer'
import { PLANET_PRESETS } from '../utils/planetPresets'
import { collectMapNotes } from '../utils/mapJournal'
import { RING_SIZES, WATER_TYPES, setBodyLook } from '../editor/systemEdits'
import { cssColor } from '../editor/colors'

const props = defineProps({
  // { star, planet, satellite? }
  place: { type: Object, required: true },
  body: { type: Object, required: true }
})

// Must match the defaults in planetRenderer.js.
const DEFAULTS = { size: 100, waterAmount: 0.6 }
const PRESETS = Object.keys(PLANET_PRESETS)
const editor = useEditorStore()
const look = computed(() => (props.body.visualization && typeof props.body.visualization === 'object' ? props.body.visualization : {}))
// A new object on each change, so the picture redraws.
const config = computed(() => (props.body.visualization ? { ...collectMapNotes(() => createPlanetVisualizationConfig(props.body)).result } : null))
const preset = computed(() => (PRESETS.includes(String(look.value.seed ?? '').toLowerCase()) ? String(look.value.seed).toLowerCase() : ''))
// Same fallback seed as the site.
const seedName = computed(() => props.body.id ?? props.body.name ?? '')
const amountSet = computed(() => typeof look.value.waterAmount === 'number')
const amount = computed(() => Number(config.value?.waterAmount ?? DEFAULTS.waterAmount))

const set = (field, value) => editor.editMap(text => setBodyLook(text, props.place, field, value))
const setRing = size => set('ring', size ? { ...(look.value.ring ?? {}), size } : '')
const withoutColor = ({ color, ...ring }) => ring
</script>

<style scoped>
.body-look-grid {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
}

.body-look-picture {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 220px;
  border: 1px solid var(--ed-border);
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}

.look-planet {
  width: 100%;
  height: 100%;
}

.body-look-none {
  padding: 16px;
  text-align: center;
}

.body-look-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.look-colors {
  gap: 12px 28px;
}

.look-liquid-field {
  flex: 1 1 180px;
}

.look-amount-label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
}

.look-amount-label em {
  font-style: normal;
}

.look-amount.is-auto {
  opacity: 0.6;
}

.look-ring-field {
  flex: 0 1 200px !important;
}

@media (max-width: 900px) {
  .body-look-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
