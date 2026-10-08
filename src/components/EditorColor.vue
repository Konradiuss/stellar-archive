<template>
  <div class="editor-color" :class="{ 'is-auto': !isSet, 'is-locked': disabled }">
    <span v-if="label" class="editor-label">{{ label }}</span>
    <div class="editor-color-row">
      <label class="editor-swatch" :title="disabled ? null : t('editor.pickColor')">
        <input
          type="color"
          :class="inputClass"
          :value="shown"
          :disabled="disabled"
          :aria-label="label ? `${label}: ${t('editor.pickColor')}` : t('editor.pickColor')"
          @change="emit('set', fileColor($event.target.value, value))"
        />
      </label>
      <span v-if="isSet || disabled" class="editor-color-code">{{ shown }}</span>
      <span v-else class="editor-color-auto">{{ autoLabel || t('editor.auto') }}</span>
      <button v-if="isSet && !disabled" type="button" class="editor-button is-quiet is-small color-reset" @click="emit('reset')">{{ t('editor.reset') }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '../i18n'
import { cssColor, fileColor } from '../editor/colors'

const props = defineProps({
  value: { type: [String, Number], default: undefined },
  // '#rrggbb'
  auto: { type: String, default: '#808080' },
  autoLabel: { type: String, default: '' },
  label: { type: String, default: '' },
  inputClass: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['set', 'reset'])

const isSet = computed(() => !props.disabled && cssColor(props.value) !== null)
const shown = computed(() => (isSet.value ? cssColor(props.value) : props.auto))
</script>

<style scoped>
.editor-color {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.editor-color-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--ed-field);
}

.editor-swatch {
  display: inline-flex;
  flex: none;
}

.editor-swatch input {
  width: 30px;
  height: 30px;
  padding: 2px;
  border: 1px solid var(--ed-border-strong);
  border-radius: var(--ed-radius);
  background: var(--ed-bg);
  appearance: none;
}

.editor-swatch input::-webkit-color-swatch-wrapper {
  padding: 0;
}

.editor-swatch input::-webkit-color-swatch {
  border: 0;
  border-radius: 4px;
}

.editor-swatch input::-moz-color-swatch {
  border: 0;
  border-radius: 4px;
}

.editor-swatch input:hover:not(:disabled) {
  border-color: var(--ed-faint);
}

.editor-color.is-auto .editor-swatch input {
  border-style: dashed;
  opacity: 0.6;
}

.editor-color-code {
  font-family: var(--ed-mono);
  font-size: 12.5px;
}

.editor-color-auto {
  color: var(--ed-muted);
}

.editor-color.is-locked .editor-color-code {
  color: var(--ed-muted);
}
</style>
