<template>
  <div class="banner-card">
    <label class="editor-field">
      <span>{{ t('editor.bannerTitle') }}</span>
      <EditorCommitText class="banner-title" :value="fields.title" @commit="set('title', $event)" />
    </label>

    <div class="editor-field">
      <span>{{ t('editor.bannerStyle') }}</span>
      <div class="banner-styles" role="radiogroup" :aria-label="t('editor.bannerStyle')">
        <button
          v-for="style in STYLES"
          :key="style"
          type="button"
          role="radio"
          class="banner-style"
          :class="{ 'is-current': !ownColors && current.style === style }"
          :aria-checked="!ownColors && current.style === style"
          :data-style="style"
          @click="pickStyle(style)"
        >
          <PixelLogo :logo="sample(style)" />
          <span class="banner-style-name">{{ style }}</span>
        </button>
        <button
          type="button"
          role="radio"
          class="banner-style banner-own"
          :class="{ 'is-current': ownColors }"
          :aria-checked="ownColors"
          @click="pickOwn"
        >
          <PixelLogo :logo="{ ...sample(current.style), colors: colors.length ? colors : null, outline: fields.outline || null }" />
          <span class="banner-style-name">{{ t('editor.ownColors') }}</span>
        </button>
      </div>
    </div>

    <div v-if="ownColors" class="banner-colors">
      <div v-for="(color, index) in colors" :key="index" class="banner-color">
        <EditorColor :label="`${index + 1}`" :value="color" :input-class="`banner-color-${index}`" @set="value => setColor(index, value)" @reset="removeColor(index)" />
      </div>
      <button v-if="colors.length < 4" type="button" class="editor-button is-small banner-add-color" @click="addColor">{{ t('editor.addColor') }}</button>
      <EditorColor :label="t('editor.logoOutline')" :value="fields.outline || undefined" :auto="LOGO_STYLES[current.style].outline" input-class="banner-outline" @set="value => set('outline', cssColor(value) ?? '')" @reset="set('outline', '')" />
    </div>

    <div class="banner-look">
      <label class="editor-field is-short">
        <span>{{ t('editor.logoFont') }}</span>
        <select class="editor-input banner-font" :value="current.font" @change="set('font', $event.target.value === 'tiny5' ? '' : $event.target.value)">
          <option v-for="font in LOGO_FONTS" :key="font" :value="font">{{ t(`editor.fonts.${font}`) }}</option>
        </select>
      </label>
      <label class="editor-field is-short">
        <span>{{ t('editor.logoScale') }}</span>
        <select class="editor-input banner-scale" :value="current.scale" @change="set('scale', Number($event.target.value) === DEFAULT_LOGO_SCALE ? '' : $event.target.value)">
          <option v-for="scale in MAX_LOGO_SCALE" :key="scale" :value="scale">{{ scale }}</option>
        </select>
      </label>
      <label class="editor-field">
        <span>{{ t('editor.logoAnimation') }}</span>
        <select class="editor-input banner-animation" :value="current.animation" @change="set('animation', $event.target.value === 'none' ? '' : $event.target.value)">
          <option v-for="motion in LOGO_ANIMATIONS" :key="motion" :value="motion">{{ t(`editor.motions.${motion}`) }}</option>
        </select>
      </label>
      <label class="editor-field">
        <span>{{ t('editor.bannerFrame') }}</span>
        <select class="editor-input banner-frame" :value="current.frame" @change="set('frame', $event.target.value === 'double' ? '' : $event.target.value)">
          <option v-for="frame in BANNER_FRAMES" :key="frame" :value="frame">{{ t(`editor.frames.${frame}`) }}</option>
        </select>
      </label>
      <label class="editor-check banner-shadow-field">
        <input type="checkbox" class="banner-shadow" :checked="current.shadow" @change="set('shadow', $event.target.checked ? '' : 'no')" />
        {{ t('editor.logoShadow') }}
      </label>
    </div>

    <label class="editor-field">
      <span>{{ t('editor.bannerCaption') }}</span>
      <EditorCommitText class="banner-caption" :value="fields.caption" @commit="set('caption', $event)" />
    </label>
    <label class="editor-field">
      <span>{{ t('editor.bannerText') }}</span>
      <EditorCommitText class="banner-text" multiline :rows="3" :value="fields.text" @commit="set('text', $event)" />
    </label>
    <label class="editor-field">
      <span>{{ t('editor.bannerPicture') }}</span>
      <EditorCommitText class="banner-picture" placeholder="File:logo.png" :value="fields.logo" @commit="set('logo', $event)" />
    </label>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '../i18n'
import { bannerFields, setBannerField } from '../editor/pageLayout'
import { BANNER_FRAMES, DEFAULT_LOGO_SCALE, LOGO_ANIMATIONS, LOGO_FONTS, LOGO_STYLE_NAMES, MAX_LOGO_SCALE, layoutTemplateBlock } from '../utils/richText/templates'
import { LOGO_STYLES } from '../utils/pixelLogo'
import { cssColor } from '../utils/color'
import PixelLogo from './PixelLogo.vue'
import EditorColor from './EditorColor.vue'
import EditorCommitText from './EditorCommitText.vue'

const props = defineProps({
  segment: { type: Object, required: true }
})
const emit = defineEmits(['update'])

const STYLES = Object.keys(LOGO_STYLE_NAMES)

const fields = computed(() => bannerFields(props.segment))
const current = computed(() => {
  const block = layoutTemplateBlock(props.segment.name, props.segment.params, () => [])
  const logo = block?.logo ?? { style: 'steel', font: 'tiny5', scale: DEFAULT_LOGO_SCALE, shadow: true, animation: 'none' }
  return { ...logo, frame: block?.frame ?? 'double' }
})
const colors = computed(() => fields.value.colors.split(',').map(color => color.trim()).filter(Boolean))
const ownColors = computed(() => colors.value.length > 0)

const sampleText = computed(() => (fields.value.title || 'ARCHIVE').slice(0, 14))
const sample = style => ({ text: sampleText.value, style, colors: null, outline: null, shadow: current.value.shadow, font: current.value.font, scale: 2, animation: 'none' })

const update = segment => emit('update', segment)
const set = (field, value) => update(setBannerField(props.segment, field, value))

function pickStyle(style) {
  let next = setBannerField(props.segment, 'style', style === 'steel' && !fields.value.style ? '' : style)
  next = setBannerField(next, 'colors', '')
  update(setBannerField(next, 'outline', ''))
}

function pickOwn() {
  if (!ownColors.value) set('colors', LOGO_STYLES[current.value.style].fill.join(', '))
}

const setColors = list => set('colors', list.join(', '))
const setColor = (index, value) => setColors(colors.value.map((color, at) => (at === index ? cssColor(value) ?? color : color)))
const removeColor = index => setColors(colors.value.filter((_, at) => at !== index))
const addColor = () => setColors([...colors.value, colors.value.at(-1) ?? '#ffffff'])
</script>

<style scoped>
.banner-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.banner-styles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
}

.banner-style {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
  padding: 10px 6px 6px;
  overflow: hidden;
  border: 1px solid var(--ed-border);
  border-radius: var(--ed-radius);
  background: #000000;
  color: var(--ed-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.banner-style:hover {
  border-color: var(--ed-border-strong);
}

.banner-style.is-current {
  border-color: var(--ed-accent);
  box-shadow: 0 0 0 1px var(--ed-accent);
  color: var(--ed-text);
}

.banner-colors,
.banner-look {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 20px;
}

.banner-shadow-field {
  min-height: var(--ed-field);
}
</style>
