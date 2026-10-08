<template>
  <section class="article-panel world-panel" :aria-label="title">
    <div class="editor-card">
      <div class="editor-heading">{{ t('editor.worldPage', { name: title }) }}</div>
      <div class="editor-hint">{{ t('editor.worldNote', { name: title }) }}</div>
      <div class="world-fields">
        <label class="editor-field">
          <span>{{ t('editor.group') }}</span>
          <select class="editor-input world-group" :value="map.wiki?.worldGroup ?? ''" @change="setGroup($event.target.value)">
            <option value="">{{ t('editor.noGroup') }}</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">{{ '· '.repeat(group.depth) }}{{ group.title }}</option>
          </select>
        </label>
        <div v-if="isHome" class="editor-note world-is-home">{{ t('editor.worldIsHome') }}</div>
        <button v-else type="button" class="editor-button world-make-home" @click="makeHome">{{ t('editor.worldMakeHome') }}</button>
      </div>
    </div>

    <EditorTextSource :owner="{ at: 'root', keys: 'world' }" :label="t('editor.articleText', { title })" area-class="world-area" />
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import EditorTextSource from './EditorTextSource.vue'
import { setHome, setWorldGroup, wikiGroups } from '../editor/articleEdits'
import { worldPageTitle } from '../utils/wikiPages'

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const groups = computed(() => wikiGroups(map.value))
const title = computed(() => worldPageTitle())
const isHome = computed(() => !map.value.wiki?.home)

const setGroup = id => editor.editMap(text => setWorldGroup(text, id || null))
const makeHome = () => editor.editMap(text => setHome(text, null))
</script>

<style scoped>
.world-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
  margin-top: 12px;
}

.world-fields .editor-field {
  flex: 0 1 260px;
}
</style>
