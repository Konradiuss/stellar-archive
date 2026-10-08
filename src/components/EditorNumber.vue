<template>
  <input
    type="text"
    inputmode="decimal"
    autocomplete="off"
    spellcheck="false"
    class="editor-input editor-number"
    :class="[inputClass, { 'is-invalid': invalid }]"
    :value="text"
    :placeholder="placeholder"
    :disabled="disabled"
    :aria-invalid="invalid"
    :title="invalid ? invalidText : null"
    @change="commit($event.target.value)"
    @keydown.enter="$event.target.blur()"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { t } from '../i18n'
import { parseNumber } from '../editor/numbers'

const props = defineProps({
  value: { type: [Number, String], default: undefined },
  placeholder: { type: String, default: '' },
  inputClass: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  // The values the site takes; outside them the number is not written. `above`: the minimum itself is not taken.
  min: { type: Number, default: null },
  max: { type: Number, default: null },
  above: { type: Boolean, default: false }
})
const emit = defineEmits(['commit'])

const invalid = ref(false)
const outside = ref(false)
const text = computed(() => (props.value === undefined || props.value === null ? '' : String(props.value)))
watch(() => props.value, () => { invalid.value = false })

const fits = value => {
  if (typeof value !== 'number') return true
  if (props.min !== null && (props.above ? value <= props.min : value < props.min)) return false
  return props.max === null || value <= props.max
}

const invalidText = computed(() => {
  if (!outside.value) return t('editor.notNumber')
  if (props.min !== null && props.max !== null) return t(props.above ? 'editor.numberAboveTo' : 'editor.numberFromTo', { min: props.min, max: props.max })
  return props.min !== null ? t(props.above ? 'editor.numberAbove' : 'editor.numberFrom', { min: props.min }) : t('editor.numberTo', { max: props.max })
})

function commit(raw) {
  const value = parseNumber(raw)
  outside.value = value !== null && !fits(value)
  invalid.value = value === null || outside.value
  if (!invalid.value) emit('commit', value)
}
</script>
