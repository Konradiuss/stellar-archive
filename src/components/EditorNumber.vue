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
    :title="invalid ? t('editor.notNumber') : null"
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
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['commit'])

const invalid = ref(false)
const text = computed(() => (props.value === undefined || props.value === null ? '' : String(props.value)))
watch(() => props.value, () => { invalid.value = false })

function commit(raw) {
  const value = parseNumber(raw)
  invalid.value = value === null
  if (value !== null) emit('commit', value)
}
</script>
