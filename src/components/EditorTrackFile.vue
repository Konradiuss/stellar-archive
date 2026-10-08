<template>
  <div class="track-file-info">
    <button
      type="button"
      class="editor-button is-small is-code track-play"
      :class="{ 'is-playing': playing }"
      data-sfx="none"
      :disabled="!url"
      :aria-label="playing ? t('editor.trackStop') : t('editor.trackPlay', { title })"
      @click="toggle"
    >{{ playing ? '■' : '▶' }}</button>
    <span v-if="seconds !== undefined" class="editor-hint track-length" :data-seconds="seconds === null ? '' : Math.round(seconds)">
      {{ seconds === null ? t('editor.trackNoLength') : t('editor.trackFileLength', { time: formatTime(seconds) }) }}
    </span>
    <span v-if="failed" class="editor-note is-error track-unplayable" role="alert">{{ t('editor.trackUnplayable', { file }) }}</span>
  </div>
</template>

<script setup>
// Apart from the form: what the file says comes later, and redrawing the form would put
// the map's values back into fields being typed in.
import { computed, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorFileUrl } from '../composables/useEditorFileUrl'
import { audition, auditioning, stopAudition } from '../composables/useAudition'
import { audioLength } from '../utils/audioLength'
import { formatTime } from '../utils/musicPlaylist'

const props = defineProps({
  file: { type: String, default: '' },
  title: { type: String, default: '' }
})

const url = useEditorFileUrl(() => props.file)
const playing = computed(() => !!url.value && auditioning.value === url.value)
const failed = ref(false)
// undefined while it is read
const seconds = ref(undefined)

watch(url, async (address, before) => {
  if (before && auditioning.value === before) stopAudition()
  failed.value = false
  seconds.value = undefined
  if (!address) return
  const found = await audioLength(address)
  if (url.value === address) seconds.value = found
}, { immediate: true })

async function toggle() {
  failed.value = false
  const address = url.value
  if (address && !(await audition(address, async () => address))) failed.value = true
}

onUnmounted(() => {
  if (playing.value) stopAudition()
})
</script>

<style scoped>
.track-file-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
