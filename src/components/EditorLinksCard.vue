<template>
  <div class="links-card">
    <div v-for="(item, index) in items" :key="index" class="link-row" :data-index="index">
      <template v-if="item.kind === 'raw'">
        <code class="link-raw" :title="t('editor.rawLink')">{{ item.raw }}</code>
      </template>
      <template v-else>
        <EditorCommitText class="link-target" :list="listId" :value="item.target" :placeholder="t('editor.linkTarget')" :aria-label="t('editor.linkTarget')" @commit="setItem(index, { target: $event })" />
        <EditorCommitText class="link-label" :value="item.label" :placeholder="item.target || t('editor.linkLabel')" :aria-label="t('editor.linkLabel')" @commit="setItem(index, { label: $event })" />
      </template>
      <button type="button" class="editor-button is-icon is-small link-up" :aria-label="t('editor.moveUp')" :title="t('editor.moveUp')" :disabled="index === 0" @click="move(index, -1)">↑</button>
      <button type="button" class="editor-button is-icon is-small link-down" :aria-label="t('editor.moveDown')" :title="t('editor.moveDown')" :disabled="index === items.length - 1" @click="move(index, 1)">↓</button>
      <button type="button" class="editor-button is-icon is-small is-danger link-remove" :aria-label="t('editor.removeLink')" :title="t('editor.removeLink')" @click="remove(index)">✕</button>
    </div>
    <datalist :id="listId">
      <option v-for="title in titles" :key="title" :value="title"></option>
    </datalist>
    <div class="editor-actions">
      <button type="button" class="editor-button is-small link-add" @click="add">{{ t('editor.addLink') }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, useId } from 'vue'
import { t } from '../i18n'
import { linkItems, setLinkItems } from '../editor/pageLayout'
import EditorCommitText from './EditorCommitText.vue'

const props = defineProps({
  segment: { type: Object, required: true },
  titles: { type: Array, default: () => [] }
})
const emit = defineEmits(['update'])

const items = computed(() => linkItems(props.segment))
const write = list => emit('update', setLinkItems(props.segment, list))

const setItem = (index, change) => write(items.value.map((item, at) => (at === index ? { ...item, ...change } : item)))
const remove = index => write(items.value.filter((_, at) => at !== index))
const add = () => write([...items.value, { kind: 'page', target: props.titles[0] ?? 'Special:All pages', label: '' }])

function move(index, step) {
  const list = [...items.value]
  ;[list[index], list[index + step]] = [list[index + step], list[index]]
  write(list)
}

const listId = useId()
</script>

<style scoped>
.links-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.link-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.link-target,
.link-label {
  flex: 1 1 160px;
  min-width: 0;
}

.link-raw {
  flex: 1 1 320px;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--ed-muted);
}
</style>
