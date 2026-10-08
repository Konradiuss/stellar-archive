<template>
  <section v-if="part === 'route' && line" class="editor-card route-panel" :aria-label="t('editor.routeHeading')">
    <div class="editor-heading">{{ t('editor.routeHeading') }} <span class="route-id">{{ line.line.id ?? '' }}</span></div>
    <div class="editor-row route-ends">
      <label class="editor-field">
        <span>{{ t('editor.routeFrom') }}</span>
        <select class="editor-input route-from" :value="line.from?.id ?? ''" @change="setEnd('from', $event.target.value)">
          <option v-for="star in stars" :key="star.id" :value="star.id">{{ star.name }}</option>
        </select>
      </label>
      <label class="editor-field">
        <span>{{ t('editor.routeTo') }}</span>
        <select class="editor-input route-to" :value="line.to?.id ?? ''" @change="setEnd('to', $event.target.value)">
          <option v-for="star in stars" :key="star.id" :value="star.id">{{ star.name }}</option>
        </select>
      </label>
    </div>
    <label class="editor-field">
      <span>{{ t('editor.routeType') }}</span>
      <select class="editor-input route-type" :value="line.line.type ?? ''" @change="set('type', $event.target.value)">
        <option value="">{{ t('editor.noType') }}</option>
        <option v-for="type in types" :key="type.id" :value="type.id">{{ typeName(type) }}</option>
      </select>
    </label>
    <label class="editor-field">
      <span>{{ t('editor.routeDescription') }}</span>
      <input class="editor-input route-description" :value="line.line.description ?? ''" @change="set('description', $event.target.value.trim())" @keydown.enter="$event.target.blur()" />
    </label>
    <label class="editor-field">
      <span>{{ t('editor.routeDirection') }}</span>
      <select class="editor-input route-direction" :value="line.line.direction ?? 'both'" @change="set('direction', $event.target.value === 'both' ? '' : $event.target.value)">
        <option value="both">{{ t('editor.directionBoth') }}</option>
        <option value="forward">{{ t('editor.directionForward') }}</option>
      </select>
    </label>
    <EditorColor
      :label="t('editor.routeColor')"
      :value="line.line.color"
      :auto="cssColor(line.ofType.color)"
      :auto-label="t('editor.asType')"
      input-class="route-color"
      @set="value => set('color', value)"
      @reset="set('color', '')"
    />
    <div class="editor-row">
      <label class="editor-field is-short">
        <span>{{ t('editor.routeWidth') }}</span>
        <EditorNumber :value="line.line.width" input-class="route-width" :placeholder="t('editor.asTypeValue', { value: line.ofType.width })" @commit="value => set('width', value)" />
      </label>
      <label class="editor-field is-short">
        <span>{{ t('editor.routeOpacity') }}</span>
        <EditorNumber :value="line.line.opacity" input-class="route-opacity" :placeholder="t('editor.asTypeValue', { value: line.ofType.opacity })" @commit="value => set('opacity', value)" />
      </label>
    </div>
    <label class="editor-check"><input type="checkbox" class="route-pulses" :checked="line.line.pulse !== false" @change="set('pulse', $event.target.checked ? '' : false)" /> {{ t('editor.pulses') }}</label>
    <div v-if="!confirming" class="editor-actions">
      <button type="button" class="editor-button is-danger route-delete" @click="confirming = true">{{ t('editor.delete') }}</button>
    </div>
    <div v-else class="editor-confirm" role="alertdialog">
      <div>{{ t('editor.confirmDeleteRoute') }}</div>
      <div class="editor-actions">
        <button type="button" class="editor-button is-danger confirm-yes" @click="remove">{{ t('editor.yes') }}</button>
        <button type="button" class="editor-button" @click="confirming = false">{{ t('editor.no') }}</button>
      </div>
    </div>
  </section>

  <section v-else-if="part === 'types'" class="editor-card route-types" :aria-label="t('editor.routeTypes')">
    <div class="editor-heading">
      {{ t('editor.routeTypes') }}
      <button type="button" class="editor-button is-small new-type" @click="addType">{{ t('editor.newType') }}</button>
    </div>
    <div v-for="type in types" :key="type.id" class="route-type-row" :data-type="type.id">
      <div class="type-top">
        <span class="type-sample" :style="{ background: cssColor(type.color), height: `${Math.min(type.width, 6)}px`, opacity: type.opacity }"></span>
        <input
          class="editor-input type-name"
          :aria-label="t('editor.typeName')"
          :value="type.name ?? ''"
          :placeholder="type.builtIn ? t(`hyperlineTypes.${type.id}`) : ''"
          @change="setType(type.id, 'name', $event.target.value.trim())"
          @keydown.enter="$event.target.blur()"
        />
        <span v-if="type.builtIn" class="editor-hint type-built-in">{{ t('editor.builtIn') }}</span>
        <button v-if="type.builtIn && rawType(type.id) !== undefined" type="button" class="editor-button is-small type-reset" @click="removeType(type.id)">{{ t('editor.resetType') }}</button>
        <button v-if="!type.builtIn && confirmingType !== type.id" type="button" class="editor-button is-danger is-small type-delete" @click="confirmingType = type.id">{{ t('editor.delete') }}</button>
      </div>
      <div v-if="confirmingType === type.id" class="editor-confirm type-confirm" role="alertdialog">
        <div>{{ t('editor.confirmDeleteType', { name: typeName(type) }) }}</div>
        <div class="editor-actions">
          <button type="button" class="editor-button is-danger confirm-yes" @click="removeType(type.id)">{{ t('editor.yes') }}</button>
          <button type="button" class="editor-button" @click="confirmingType = null">{{ t('editor.no') }}</button>
        </div>
      </div>
      <div class="type-look">
        <EditorColor
          :label="t('editor.routeColor')"
          :value="rawField(type.id, 'color')"
          :auto="cssColor(type.builtInStyle.color)"
          input-class="type-color"
          @set="value => setType(type.id, 'color', value)"
          @reset="setType(type.id, 'color', '')"
        />
        <label class="editor-field is-short">
          <span>{{ t('editor.routeWidth') }}</span>
          <EditorNumber :value="rawField(type.id, 'width')" input-class="type-width" :placeholder="t('editor.autoDefault', { value: type.builtInStyle.width })" @commit="value => setType(type.id, 'width', value)" />
        </label>
        <label class="editor-field is-short">
          <span>{{ t('editor.routeOpacity') }}</span>
          <EditorNumber :value="rawField(type.id, 'opacity')" input-class="type-opacity" :placeholder="t('editor.autoDefault', { value: type.builtInStyle.opacity })" @commit="value => setType(type.id, 'opacity', value)" />
        </label>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import { addRouteType, removeRoute, removeRouteType, routeList, routeTypes, setRouteEnd, setRouteField, setRouteTypeField } from '../editor/routeEdits'
import { cssColor } from '../editor/colors'
import EditorColor from './EditorColor.vue'
import EditorNumber from './EditorNumber.vue'

defineProps({
  part: { type: String, default: 'types' }
})

const editor = useEditorStore()
const map = computed(() => editor.parsed.data ?? {})
const stars = computed(() => (Array.isArray(map.value.stars) ? map.value.stars : [])
  .filter(star => star && typeof star.id === 'string')
  .map(star => ({ id: star.id, name: star.name ?? star.id })))
const routes = computed(() => routeList(map.value))
const line = computed(() => (editor.selectedRoute === null ? null : routes.value[editor.selectedRoute] ?? null))
const types = computed(() => routeTypes(map.value))
const rawType = id => (map.value.hyperlineTypes && typeof map.value.hyperlineTypes === 'object' ? map.value.hyperlineTypes[id] : undefined)
const rawField = (id, field) => {
  const type = rawType(id)
  return type && typeof type === 'object' ? type[field] : undefined
}
const typeName = type => type.name || (type.builtIn ? t(`hyperlineTypes.${type.id}`) : type.id)

const confirming = ref(false)
const confirmingType = ref(null)
watch(() => editor.selectedRoute, () => { confirming.value = false })

const set = (field, value) => editor.editMap(text => setRouteField(text, editor.selectedRoute, field, value))
const setEnd = (end, starId) => editor.editMap(text => setRouteEnd(text, editor.selectedRoute, end, starId))
const setType = (id, field, value) => editor.editMap(text => setRouteTypeField(text, id, field, value))

function remove() {
  editor.editMap(text => removeRoute(text, editor.selectedRoute))
  editor.selectedRoute = null
}

function removeType(id) {
  editor.editMap(text => removeRouteType(text, id))
  confirmingType.value = null
}

const addType = () => editor.editMap(text => addRouteType(text, { name: t('editor.newTypeName') }))
</script>

<style scoped>
.route-id {
  font-family: var(--ed-mono);
  font-size: 12px;
  font-weight: 400;
  color: var(--ed-muted);
}

.route-type-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid var(--ed-border);
}

.type-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.type-sample {
  flex: none;
  width: 22px;
  border-radius: 2px;
}

.type-name {
  flex: 1 1 200px;
  max-width: 360px;
}

.type-look {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 24px;
  padding-left: 32px;
}

@media (max-width: 760px) {
  .type-look {
    padding-left: 0;
  }
}
</style>
