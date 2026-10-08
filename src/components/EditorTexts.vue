<template>
  <section class="editor-pane texts-panel" :aria-label="t('editor.tabTexts')">
    <EditorStrings />
  </section>
</template>

<script setup>
import { t } from '../i18n'
import EditorStrings from './EditorStrings.vue'
</script>

<style scoped>
/* The editor's forms area does not scroll, so each tab scrolls itself. */
.texts-panel {
  height: 100%;
}

@media (max-width: 760px) {
  .texts-panel {
    height: auto;
  }
}
</style>
