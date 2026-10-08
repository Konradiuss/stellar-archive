<template>
  <section class="editor-card strings-card" :aria-label="t('editor.stringsTitle')">
    <div class="editor-heading">{{ t('editor.stringsTitle') }}</div>
    <div class="editor-hint">{{ t('editor.stringsNote', { language: languageName }) }}</div>
    <div class="strings-tools">
      <input v-model="query" class="editor-input strings-search" type="search" :placeholder="t('editor.stringsSearch')" :aria-label="t('editor.stringsSearch')" />
      <label class="editor-check"><input v-model="onlyChanged" type="checkbox" class="strings-changed" /> {{ t('editor.stringsChanged') }}</label>
      <span v-if="query.trim()" class="editor-hint strings-found">{{ t('editor.stringsFound', { count: found }) }}</span>
    </div>
  </section>

  <section v-if="foreign.length" class="editor-card strings-foreign" :aria-label="t('editor.stringsForeign')">
    <div class="editor-heading">{{ t('editor.stringsForeign') }}</div>
    <div class="editor-hint">{{ t('editor.stringsForeignNote') }}</div>
    <div v-for="key in foreign" :key="key" class="string-foreign" :data-key="key">
      <code>{{ key }}</code>
      <button type="button" class="editor-button is-small is-danger string-remove" @click="remove(key)">{{ t('editor.remove') }}</button>
    </div>
  </section>

  <section v-for="section in sections" :key="section.id" class="editor-card strings-section" :data-section="section.id">
    <button type="button" class="strings-section-head" :aria-expanded="section.open" @click="toggle(section.id)">
      <span class="strings-chevron" aria-hidden="true">{{ section.open ? '▾' : '▸' }}</span>
      <span class="strings-section-title">{{ t(`editor.textGroups.${section.id}`) }}</span>
      <code class="strings-section-id">{{ section.id }}</code>
      <span class="editor-hint strings-section-count">{{ t('editor.stringsCount', { changed: section.changed, count: section.total }) }}</span>
    </button>
    <!-- The English texts are what is translated here, not words of the interface. -->
    <div v-if="section.open" class="strings-rows is-code">
      <div v-for="row in section.rows" :key="row.key" class="string-row" :class="{ 'is-changed': row.value !== undefined }" :data-key="row.key">
        <code class="string-key">{{ row.key }}</code>
        <div class="string-fields">
          <template v-if="row.plural">
            <label v-for="form in formsOf(row)" :key="form" class="string-form">
              <span class="string-form-name">{{ form }}</span>
              <input class="editor-input string-field" :data-form="form" :value="formValue(row, form)" :placeholder="row.fallback[form] ?? row.fallback.other" spellcheck="false" @change="setForm(row, form, $event)" @keydown.enter="$event.target.blur()" />
            </label>
          </template>
          <textarea
            v-else-if="isLong(row)"
            class="editor-input string-field is-long"
            :rows="Math.min(8, row.fallback.split('\n').length + 1)"
            :value="typeof row.value === 'string' ? row.value : ''"
            :placeholder="row.fallback"
            spellcheck="false"
            @change="setText(row, $event)"
          ></textarea>
          <input v-else class="editor-input string-field" :value="typeof row.value === 'string' ? row.value : ''" :placeholder="row.fallback" spellcheck="false" @change="setText(row, $event)" @keydown.enter="$event.target.blur()" />
          <div v-if="row.value !== undefined && !row.plural" class="editor-hint string-default">{{ row.fallback }}</div>
          <div v-for="problem in problemsOf(row)" :key="`${problem.problem}:${problem.form ?? ''}`" class="editor-note is-warn string-problem" :data-problem="problem.problem" :data-form="problem.form">
            <code v-if="problem.form">{{ problem.form }}</code>
            {{ problem.problem === 'type' ? t('editor.stringNotText', { value: JSON.stringify(row.value) }) : problem.problem === 'breaker' ? t('editor.stringBreaker') : t('editor.stringLost', { names: problem.names }) }}
          </div>
        </div>
      </div>
      <div v-if="!section.rows.length" class="editor-hint">{{ t('editor.stringsNone') }}</div>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { checkLanguage, t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import { TEXT_SECTIONS, foreignStrings, pluralForms, rowMatches, stringProblems, stringRows } from '../editor/stringList'
import { setPluralForm, setString } from '../editor/stringEdits'
import { isObject } from '../utils/guards'

const LONG_TEXT = 90

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const language = computed(() => checkLanguage(isObject(map.value.site) ? map.value.site.language : null, () => {}))
const languageName = computed(() => {
  try {
    return new Intl.DisplayNames([language.value], { type: 'language' }).of(language.value) ?? language.value
  } catch {
    return language.value
  }
})

const query = ref('')
const onlyChanged = ref(false)
const opened = reactive(new Set())
const toggle = id => (opened.has(id) ? opened.delete(id) : opened.add(id))

const rows = computed(() => stringRows(map.value))
const shown = computed(() => rows.value.filter(row => rowMatches(row, query.value) && (!onlyChanged.value || row.value !== undefined)))
const found = computed(() => shown.value.length)
// While searching or filtering, the sections that have rows are open by themselves.
const sections = computed(() => TEXT_SECTIONS.map(id => {
  const all = rows.value.filter(row => row.section === id)
  const own = shown.value.filter(row => row.section === id)
  const filtering = !!query.value.trim() || onlyChanged.value
  return { id, rows: own, total: all.length, changed: all.filter(row => row.value !== undefined).length, open: filtering ? own.length > 0 : opened.has(id) }
}).filter(section => section.rows.length || !(query.value.trim() || onlyChanged.value)))
const foreign = computed(() => foreignStrings(map.value))

const isLong = row => row.fallback.includes('\n') || row.fallback.length > LONG_TEXT
const formsOf = row => pluralForms(language.value, row.value)
const formValue = (row, form) => (isObject(row.value) ? row.value[form] ?? '' : form === 'other' && typeof row.value === 'string' ? row.value : '')
const problemsOf = row => stringProblems(row.key, row.value, language.value)

// A text the map has that is no text (a number) stays until something is written over it.
function setText(row, event) {
  if (!editor.editMap(text => setString(text, row.key, event.target.value))) event.target.value = typeof row.value === 'string' ? row.value : ''
}
const setForm = (row, form, event) => editor.editMap(text => setPluralForm(text, row.key, form, event.target.value))
const remove = key => editor.editMap(text => setString(text, key, ''))
</script>

<style scoped>
.strings-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 18px;
  margin-top: 12px;
}

.strings-search {
  flex: 1 1 280px;
  max-width: 420px;
}

.string-foreign {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.strings-section-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.strings-section-title {
  font-weight: 600;
}

.strings-section-id {
  color: var(--ed-muted);
}

.strings-section-count {
  margin-left: auto;
}

.strings-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.string-row {
  display: grid;
  grid-template-columns: minmax(0, 260px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.string-row.is-changed .string-key {
  color: var(--ed-accent-text);
}

.string-key {
  padding-top: 7px;
  overflow-wrap: anywhere;
  color: var(--ed-muted);
}

.string-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.string-form {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.string-form-name {
  color: var(--ed-muted);
}

.string-field.is-long {
  resize: vertical;
  font-family: var(--ed-mono);
}

.string-default {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

@media (max-width: 760px) {
  .string-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
</style>
