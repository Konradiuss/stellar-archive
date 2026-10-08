<template>
  <section class="editor-card editor-groups" :aria-label="t('editor.groups')">
    <div class="editor-heading">{{ t('editor.groups') }}</div>
    <div class="editor-hint groups-note">{{ t('editor.groupsNote') }}</div>
    <div v-if="!groups.length" class="editor-note">{{ t('editor.noGroups') }}</div>

    <div v-for="group in groups" :key="group.id" class="group-row" :data-group="group.id" :style="{ paddingLeft: `${group.depth * 24}px` }">
      <div class="group-top">
        <img class="group-icon" :src="iconUri(group.icon)" alt="" aria-hidden="true" />
        <input class="editor-input group-title" :aria-label="t('editor.groupTitle')" :value="group.title" @change="set(group.id, 'title', $event.target.value)" @keydown.enter="$event.target.blur()" />
        <select class="editor-input group-icon-select" :aria-label="t('editor.groupIcon')" :value="group.icon ?? ''" @change="set(group.id, 'icon', $event.target.value)">
          <option value="">{{ t('editor.usualIcon') }}</option>
          <option v-if="group.icon && !ICON_NAMES.includes(group.icon)" :value="group.icon">{{ group.icon }} ?</option>
          <option v-for="name in ICON_NAMES" :key="name" :value="name">{{ name }}</option>
        </select>
        <select class="editor-input group-parent" :aria-label="t('editor.groupInside')" :title="t('editor.groupInside')" :value="group.parent ?? ''" @change="moveInto(group.id, $event)">
          <option value="">{{ t('editor.topLevel') }}</option>
          <option v-for="target in targetsOf(group)" :key="target.id" :value="target.id">{{ '· '.repeat(target.depth) }}{{ t('editor.insideGroup', { name: target.title }) }}</option>
        </select>
        <span class="editor-hint group-count">{{ t('editor.groupArticles', { count: counts.get(group.id) ?? 0 }) }}</span>
        <button type="button" class="editor-button is-icon is-small group-up" :aria-label="t('editor.moveUp')" :title="t('editor.moveUp')" :disabled="group.first" @click="move(group.id, -1)">↑</button>
        <button type="button" class="editor-button is-icon is-small group-down" :aria-label="t('editor.moveDown')" :title="t('editor.moveDown')" :disabled="group.last" @click="move(group.id, 1)">↓</button>
        <button v-if="confirming !== group.id" type="button" class="editor-button is-danger is-small group-delete" @click="confirming = group.id">{{ t('editor.delete') }}</button>
      </div>
      <div v-if="confirming === group.id" class="editor-confirm group-confirm" role="alertdialog">
        <div>{{ t('editor.confirmDeleteGroup', { name: group.title }) }}</div>
        <div class="editor-actions">
          <button type="button" class="editor-button is-danger confirm-yes" @click="remove(group.id)">{{ t('editor.yes') }}</button>
          <button type="button" class="editor-button" @click="confirming = null">{{ t('editor.no') }}</button>
        </div>
      </div>
    </div>

    <form class="editor-row new-group" @submit.prevent="add">
      <label class="editor-field">
        <span>{{ t('editor.newGroupTitle') }}</span>
        <input v-model="newTitle" class="editor-input new-group-title" />
      </label>
      <label class="editor-field">
        <span>{{ t('editor.groupInside') }}</span>
        <select v-model="newParent" class="editor-input new-group-parent">
          <option value="">{{ t('editor.topLevel') }}</option>
          <option v-for="group in parents" :key="group.id" :value="group.id">{{ '· '.repeat(group.depth) }}{{ group.title }}</option>
        </select>
      </label>
      <button type="submit" class="editor-button is-primary new-group-create" :disabled="!newTitle.trim()">{{ t('editor.newGroup') }}</button>
    </form>
    <div class="editor-hint group-depth-note">{{ t('editor.groupDepthNote', { max: MAX_GROUP_DEPTH }) }}</div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import { addGroup, groupTargets, moveGroup, moveGroupInto, removeGroup, setGroupField, wikiGroups } from '../editor/articleEdits'
import { ICON_NAMES, iconUri } from '../utils/wikiIcons'
import { MAX_GROUP_DEPTH } from '../utils/wikiPages'

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const groups = computed(() => wikiGroups(map.value))
const parents = computed(() => groups.value.filter(group => group.depth + 1 < MAX_GROUP_DEPTH))

function targetsOf(group) {
  const allowed = new Set(groupTargets(map.value, group.id))
  return groups.value.filter(each => allowed.has(each.id) || each.id === group.parent)
}

function moveInto(id, event) {
  const parent = event.target.value || null
  // Refused (too deep): put the select back.
  if (!editor.editMap(text => moveGroupInto(text, id, parent))) event.target.value = groups.value.find(group => group.id === id)?.parent ?? ''
}

const counts = computed(() => {
  const list = Array.isArray(map.value.wiki?.articles) ? map.value.wiki.articles : []
  const result = new Map()
  for (const article of list) {
    if (typeof article?.group === 'string') result.set(article.group.trim(), (result.get(article.group.trim()) ?? 0) + 1)
  }
  return result
})

const confirming = ref(null)
const newTitle = ref('')
const newParent = ref('')
watch(parents, list => {
  if (newParent.value && !list.some(group => group.id === newParent.value)) newParent.value = ''
})

const set = (id, field, value) => editor.editMap(text => setGroupField(text, id, field, value))
const move = (id, step) => editor.editMap(text => moveGroup(text, id, step))

function add() {
  const done = editor.editMap(text => addGroup(text, { title: newTitle.value, parent: newParent.value || null }))
  if (done) newTitle.value = ''
}

function remove(id) {
  editor.editMap(text => removeGroup(text, id))
  confirming.value = null
}
</script>

<style scoped>
.groups-note {
  margin-bottom: 4px;
}

.group-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
  padding-bottom: 10px;
  border-top: 1px solid var(--ed-border);
}

.group-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.group-icon {
  flex: none;
  width: 16px;
  height: 16px;
  image-rendering: pixelated;
}

.group-title {
  flex: 1 1 180px;
  min-width: 0;
  max-width: 320px;
}

.group-icon-select,
.group-parent {
  flex: 0 1 170px;
  min-width: 0;
}

.group-count {
  margin-left: auto;
  white-space: nowrap;
}

.new-group {
  align-items: flex-end;
  padding-top: 16px;
  border-top: 1px solid var(--ed-border);
}

.group-depth-note {
  margin-top: -4px;
}
</style>
