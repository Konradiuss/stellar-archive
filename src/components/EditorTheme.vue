<template>
  <section class="editor-pane theme-panel" :aria-label="t('editor.tabTheme')">
    <div class="editor-card">
      <div class="editor-heading">{{ t('editor.themeTitle') }}</div>
      <div class="editor-hint">{{ t('editor.themeNote') }}</div>
      <div class="theme-grid">
        <div class="theme-fields">
          <label class="editor-field theme-preset-field">
            <span>{{ t('editor.themePreset') }}</span>
            <select class="editor-input theme-preset" :value="ownPreset" @change="setPreset($event.target.value)">
              <option value="">{{ t('editor.autoValue', { value: t(`editor.themePresets.${DEFAULT_PRESET}`) }) }}</option>
              <option v-for="name in PRESETS" :key="name" :value="name">{{ t(`editor.themePresets.${name}`) }}</option>
              <option v-if="unknownPreset" :value="ownPreset">? {{ ownPreset }}</option>
            </select>
          </label>

          <div class="editor-subheading">{{ t('editor.themeColors') }}</div>
          <div class="theme-colors">
            <div v-for="role in COLOR_ROLES" :key="role" class="theme-color" :data-role="role">
              <EditorColor
                :label="t(`editor.themeRoles.${role}`)"
                :value="ownColors[role]"
                :auto="presetColors[role]"
                :input-class="`theme-color-${role}`"
                @set="value => setColor(role, value)"
                @reset="setColor(role, '')"
              />
              <div v-if="badColor(role)" class="editor-note is-warn theme-bad-color">{{ t('editor.themeBadColor', { value: String(ownColors[role]) }) }}</div>
            </div>
          </div>

          <div class="editor-subheading">{{ t('editor.themeCrt') }}</div>
          <div class="theme-crt">
            <div v-for="effect in EFFECTS" :key="effect" class="editor-field theme-effect" :data-effect="effect">
              <span class="theme-effect-label">
                {{ t(`editor.themeEffects.${effect}`, { percent: Math.round(theme.crt[effect] * 100) }) }}
                <em v-if="!effectSet(effect)" class="editor-hint">{{ t('editor.auto') }}</em>
                <button v-if="effectSet(effect)" type="button" class="editor-button is-quiet is-small effect-reset" @click="setEffect(effect, '')">{{ t('editor.reset') }}</button>
              </span>
              <input
                :class="['theme-effect-range', `theme-${effect}`, { 'is-auto': !effectSet(effect) }]"
                type="range"
                min="0"
                max="2"
                step="0.05"
                :value="theme.crt[effect]"
                :aria-label="t(`editor.themeEffects.${effect}`, { percent: Math.round(theme.crt[effect] * 100) })"
                @change="setEffect(effect, Number($event.target.value))"
              />
            </div>
          </div>

          <div class="editor-subheading">{{ t('editor.themeCasings') }}</div>
          <div class="editor-hint">{{ t('editor.themeCasingsHint') }}</div>
          <div v-if="casingsList" class="editor-note theme-casings-list">{{ t('editor.themeCasingsList', { names: casingsList }) }}</div>
          <div class="theme-casings">
            <div v-for="frame in CASING_FRAMES" :key="frame" class="theme-frame" :data-frame="frame">
              <span class="theme-steel" :style="steelStyle(theme.casings[frame])" aria-hidden="true"></span>
              <label class="editor-field">
                <span>{{ t(`editor.themeFrames.${frame}`) }}</span>
                <select :class="['editor-input', `theme-casing-${frame}`]" :value="ownSteel(frame)" @change="setFrame(frame, $event)">
                  <option value="">{{ t('editor.autoValue', { value: steelName(autoSteel(frame)) }) }}</option>
                  <option v-for="name in CASING_NAMES" :key="name" :value="name">{{ steelName(name) }}</option>
                  <option v-if="ownSteel(frame) && !CASING_NAMES.includes(ownSteel(frame))" :value="ownSteel(frame)">? {{ ownSteel(frame) }}</option>
                </select>
              </label>
            </div>
            <div class="theme-frame theme-frame-all">
              <span class="theme-steel" aria-hidden="true"></span>
              <label class="editor-field">
                <span>{{ t('editor.themeCasingAll') }}</span>
                <select class="editor-input theme-casing-all" :value="allSteel" @change="setAll($event)">
                  <option value="*" disabled>{{ t('editor.themeCasingMixed') }}</option>
                  <option value="">{{ t('editor.themeCasingAllAuto') }}</option>
                  <option v-for="name in CASING_NAMES" :key="name" :value="name">{{ steelName(name) }}</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <figure class="theme-preview" :aria-label="t('editor.themePreview')">
          <figcaption class="editor-label">{{ t('editor.themePreview') }}</figcaption>
          <!-- The theme's variables on this screen only: the editor keeps its own colours. -->
          <div class="theme-casing-frame" :style="steelStyle(theme.casings.map)">
            <div class="theme-screen" :style="variables">
              <div class="theme-screen-text">
                <div class="theme-line-title">{{ t('editor.themeSampleTitle') }}</div>
                <div class="theme-line-dim">{{ t('editor.themeSampleDim') }}</div>
                <div class="theme-line-box">
                  <span class="theme-line-link">{{ t('editor.themeSampleLink') }}</span>
                </div>
                <div class="theme-line-states">
                  <span class="theme-ok">{{ t('editor.themeSampleOk') }}</span>
                  <span class="theme-warn">{{ t('editor.themeSampleWarn') }}</span>
                  <span class="theme-error">{{ t('editor.themeSampleError') }}</span>
                </div>
                <div class="theme-beam" aria-hidden="true"></div>
              </div>
              <div class="crt-glass" aria-hidden="true">
                <div class="crt-glass-scan"></div>
              </div>
            </div>
          </div>
          <!-- Where each frame is on the site, in its steel. -->
          <div class="theme-layout" aria-hidden="true">
            <span v-for="frame in CASING_FRAMES" :key="frame" :class="['theme-layout-frame', `is-${frame}`]" :style="steelStyle(theme.casings[frame])">{{ t(`editor.themeFrames.${frame}`) }}</span>
          </div>
        </figure>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '../i18n'
import { useEditorStore } from '../stores/editorStore'
import EditorColor from './EditorColor.vue'
import { CASING_FRAMES, CASING_NAMES, COLOR_ROLES, DEFAULT_PRESET, THEME_PRESETS, autoCasing, checkTheme, themeHex, themeVariables } from '../theme'
import { STEEL_TINTS } from '../utils/bezelSprites'
import { setAllCasings, setCrt, setFrameCasing, setThemeColor, setThemePreset } from '../editor/themeEdits'
import { isObject } from '../utils/guards'

const PRESETS = Object.keys(THEME_PRESETS)
const EFFECTS = ['scanlines', 'vignette', 'sweep', 'glow']

const editor = useEditorStore()
const raw = computed(() => (isObject(editor.parsed.data?.theme) ? editor.parsed.data.theme : {}))
// The theme as the site makes it of the map.
const theme = computed(() => checkTheme(editor.parsed.data?.theme ?? null, () => {}))
const variables = computed(() => themeVariables(theme.value))

const ownPreset = computed(() => (typeof raw.value.preset === 'string' ? raw.value.preset : ''))
const unknownPreset = computed(() => !!ownPreset.value && !PRESETS.includes(ownPreset.value))
const presetColors = computed(() => THEME_PRESETS[PRESETS.includes(ownPreset.value) ? ownPreset.value : DEFAULT_PRESET])
const ownColors = computed(() => (isObject(raw.value.colors) ? raw.value.colors : {}))
const badColor = role => ownColors.value[role] !== undefined && !themeHex(typeof ownColors.value[role] === 'string' ? ownColors.value[role] : '')
// { frame: steel } as the map writes it; a list of steels is a pool the frames pick from.
const ownCasings = computed(() => (isObject(raw.value.casings) ? raw.value.casings : {}))
const casingsList = computed(() => {
  const value = raw.value.casings
  if (value == null || isObject(value)) return ''
  return (Array.isArray(value) ? value : [value]).map(String).join(', ')
})
const ownSteel = frame => (ownCasings.value[frame] === undefined ? '' : String(ownCasings.value[frame]))
// What Auto gives: from the pool while the map has one.
const autoSteel = frame => (casingsList.value ? theme.value.casings[frame] : autoCasing(frame))
const steelName = name => (CASING_NAMES.includes(name) ? t(`editor.themeSteels.${name}`) : `? ${name}`)
const steelStyle = name => ({ background: STEEL_TINTS[name]?.body, borderColor: STEEL_TINTS[name]?.highlight })
const allSteel = computed(() => {
  const own = new Set(CASING_FRAMES.map(ownSteel))
  return own.size === 1 && !casingsList.value ? [...own][0] : '*'
})
const effectSet = effect => isObject(raw.value.crt) && Object.hasOwn(raw.value.crt, effect)

const setPreset = value => editor.editMap(text => setThemePreset(text, value))
const setColor = (role, value) => editor.editMap(text => setThemeColor(text, role, value))
const setEffect = (effect, value) => editor.editMap(text => setCrt(text, effect, value))

// A refused change puts the choice back: the map did not change, so nothing redraws the list.
function setFrame(frame, event) {
  if (!editor.editMap(text => setFrameCasing(text, frame, event.target.value))) event.target.value = ownSteel(frame)
}
function setAll(event) {
  if (!editor.editMap(text => setAllCasings(text, event.target.value))) event.target.value = allSteel.value
}
</script>

<style scoped>
.theme-panel {
  height: 100%;
  gap: 12px;
}

@media (max-width: 760px) {
  .theme-panel {
    height: auto;
  }
}

.theme-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 420px);
  gap: 24px;
  margin-top: 12px;
}

.theme-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.theme-preset-field {
  max-width: 260px;
}

.theme-colors {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 14px 20px;
}

.theme-crt {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px 20px;
}

.theme-effect-label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
}

.theme-effect-label em {
  font-style: normal;
}

.theme-effect-range.is-auto {
  opacity: 0.6;
}

.theme-casings {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px 20px;
}

.theme-frame {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.theme-frame .editor-field {
  flex: 1;
  min-width: 0;
}

.theme-frame .theme-steel {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.theme-frame-all .theme-steel {
  visibility: hidden;
}

.theme-steel {
  width: 18px;
  height: 14px;
  border: 2px solid;
  border-radius: 2px;
}

.theme-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  min-width: 0;
}

.theme-layout {
  display: grid;
  grid-template-areas: 'map lore' 'legend music';
  grid-template-columns: 3fr 1fr;
  grid-template-rows: 3fr 1fr;
  gap: 4px;
  height: 120px;
  margin-top: 8px;
}

.theme-layout-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
  border: 3px solid;
  border-radius: 4px;
  font-size: 11px;
  color: #000;
  text-align: center;
}

.theme-layout-frame.is-map { grid-area: map; }
.theme-layout-frame.is-lore { grid-area: lore; }
.theme-layout-frame.is-legend { grid-area: legend; }
.theme-layout-frame.is-music { grid-area: music; }

.theme-casing-frame {
  padding: 14px;
  border: 3px solid;
  border-radius: 10px;
}

.theme-screen {
  /* Declared on :root, the glow would take the page's text colour, not the theme's. */
  --crt-glow: rgb(var(--ui-text-rgb) / calc(0.85 * var(--crt-glow-strength, 1)));

  position: relative;
  overflow: hidden;
  min-height: 220px;
  background: var(--ui-screen);
  font-family: 'Press Start 2P', monospace;
  font-size: 10px;
  line-height: 1.6;
}

.theme-screen-text {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  color: var(--ui-text);
}

.theme-line-title {
  font-size: 16px;
  letter-spacing: 1px;
}

.theme-line-dim {
  color: var(--ui-dim);
}

.theme-line-box {
  padding: 8px 10px;
  border: 1px solid var(--ui-line);
}

.theme-line-link {
  color: var(--ui-accent);
  text-decoration: underline;
}

.theme-line-states {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.theme-ok {
  color: var(--ui-ok);
}

.theme-warn {
  color: var(--ui-warn);
}

.theme-error {
  color: var(--ui-error);
}

.theme-beam {
  height: 2px;
  margin: 6px 0;
  background: var(--ui-text);
  box-shadow: 0 0 6px 1px var(--crt-glow);
}

@media (max-width: 900px) {
  .theme-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
