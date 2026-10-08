<template>
  <section class="editor-card editor-lore" :aria-label="t('editor.lore')">
    <div class="editor-heading">{{ t('editor.lore') }}</div>
    <EditorTextSource
      :owner="owner"
      :label="t('editor.loreLabel', { name: body.name ?? '' })"
      :star-id="place.star"
      area-class="lore-text"
      compact
    />
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '../i18n'
import EditorTextSource from './EditorTextSource.vue'

const props = defineProps({
  place: { type: Object, required: true },
  body: { type: Object, required: true }
})

const owner = computed(() => ({ at: 'body', place: props.place, keys: 'lore' }))
</script>
