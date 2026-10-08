<template>
  <div class="box-card">
    <div class="box-top">
      <label class="editor-field">
        <span>{{ t('editor.boxTitle') }}</span>
        <EditorCommitText class="box-title" :value="fields.title" @commit="set('title', $event)" />
      </label>
      <label class="editor-field">
        <span>{{ t('editor.boxLink') }}</span>
        <EditorCommitText class="box-link" :value="fields.link" :placeholder="t('editor.noPlace')" @commit="set('link', $event)" />
      </label>
    </div>

    <div class="editor-field">
      <span>{{ t('editor.boxColor') }}</span>
      <div class="box-colors" role="radiogroup" :aria-label="t('editor.boxColor')">
        <button
          v-for="[name, color] in COLORS"
          :key="name"
          type="button"
          role="radio"
          class="box-color"
          :class="{ 'is-current': currentColor === name }"
          :aria-checked="currentColor === name"
          :title="name"
          :data-color="name"
          :style="{ '--swatch': color }"
          @click="set('color', name === 'grey' && !fields.color ? '' : name)"
        ><span class="box-color-name">{{ name }}</span></button>
        <EditorColor
          class="box-own-color"
          :class="{ 'is-current': currentColor === 'own' }"
          :value="currentColor === 'own' ? fields.color : undefined"
          :auto-label="t('editor.ownColor')"
          input-class="box-color-own"
          @set="value => set('color', cssColor(value) ?? '')"
          @reset="set('color', '')"
        />
      </div>
    </div>

    <div class="box-look">
      <label class="editor-field">
        <span>{{ t('editor.boxIcon') }}</span>
        <span class="box-icon-row">
          <img class="box-icon" :src="iconUri(fields.icon || null)" alt="" aria-hidden="true" />
          <select class="editor-input box-icon-select" :value="fields.icon" @change="set('icon', $event.target.value)">
            <option value="">{{ t('editor.usualIcon') }}</option>
            <option v-if="fields.icon && !ICON_NAMES.includes(fields.icon)" :value="fields.icon">{{ fields.icon }} ?</option>
            <option v-for="name in ICON_NAMES" :key="name" :value="name">{{ name }}</option>
          </select>
        </span>
      </label>
      <label class="editor-check box-wide-field">
        <input type="checkbox" class="box-wide" :checked="fields.wide" @change="set('wide', $event.target.checked)" />
        {{ t('editor.boxWide') }}
      </label>
    </div>

    <label class="editor-field">
      <span>{{ t('editor.boxText') }}</span>
      <EditorCommitText class="box-text" multiline :rows="5" :value="fields.text" @commit="set('text', $event)" />
    </label>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '../i18n'
import { boxFields, setBoxField } from '../editor/pageLayout'
import { BOX_COLORS, templateKey } from '../utils/richText/templates'
import { ICON_NAMES, iconUri } from '../utils/wikiIcons'
import { cssColor } from '../utils/color'
import EditorColor from './EditorColor.vue'
import EditorCommitText from './EditorCommitText.vue'

const props = defineProps({
  segment: { type: Object, required: true }
})
const emit = defineEmits(['update'])

// 'gray' is an alias of 'grey'.
const COLORS = Object.entries(BOX_COLORS).filter(([name]) => name !== 'gray')

const fields = computed(() => boxFields(props.segment))
const currentColor = computed(() => {
  const value = templateKey(fields.value.color)
  if (!value) return 'grey'
  if (value === 'gray') return 'grey'
  return Object.hasOwn(BOX_COLORS, value) ? value : 'own'
})

const set = (field, value) => emit('update', setBoxField(props.segment, field, value))
</script>

<style scoped>
.box-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.box-top,
.box-look {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
}

.box-top .editor-field {
  flex: 1 1 200px;
}

.box-colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.box-color {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--ed-radius);
  background: var(--swatch);
  color: #ffffff;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.box-color.is-current {
  border-color: var(--ed-text);
  box-shadow: 0 0 0 2px var(--ed-accent);
}

.box-own-color.is-current {
  outline: 2px solid var(--ed-accent);
  outline-offset: 2px;
  border-radius: var(--ed-radius);
}

.box-icon-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.box-icon {
  flex: none;
  width: 24px;
  height: 24px;
  image-rendering: pixelated;
}

.box-icon-select {
  flex: 1 1 160px;
  min-width: 0;
}

.box-wide-field {
  min-height: var(--ed-field);
}
</style>
