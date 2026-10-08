import { defineStore } from 'pinia'
import { usePersistentState } from '../composables/usePersistentState'

export const SYSTEM_VIEW_DEFAULTS = Object.freeze({
  speed: 1, // 0 (orbits stopped) | 0.5 | 1 | 2
  labels: true,
  orbits: true,
  grid: true
})

export const PLANET_DATA_DEFAULTS = Object.freeze({
  typing: true // false: the lore appears at once
})

export const PLANET_VISUAL_DEFAULTS = Object.freeze({
  rotate: true,
  layout: 'orbits', // 'orbits' | 'grid': the satellites fly round the planet or stand in rows
  params: true,
  grid: true
})

export const TEXT_DEFAULTS = Object.freeze({
  size: 16 // 16 | 20 | 24 px
})

const DEFAULTS = {
  system: SYSTEM_VIEW_DEFAULTS,
  data: PLANET_DATA_DEFAULTS,
  visual: PLANET_VISUAL_DEFAULTS,
  text: TEXT_DEFAULTS
}

const RESETS = {
  system: ['system'],
  data: ['data', 'text'],
  visual: ['visual'],
  text: ['text']
}

export const useSystemSettings = defineStore('systemSettings', () => {
  const system = usePersistentState('window-system', { ...SYSTEM_VIEW_DEFAULTS })
  const data = usePersistentState('window-data', { ...PLANET_DATA_DEFAULTS })
  const visual = usePersistentState('window-visual', { ...PLANET_VISUAL_DEFAULTS })
  const text = usePersistentState('text', { ...TEXT_DEFAULTS })
  const settings = { system, data, visual, text }

  function set(group, key, value) {
    settings[group].value = { ...settings[group].value, [key]: value }
  }

  function reset(menu) {
    for (const group of RESETS[menu]) settings[group].value = { ...DEFAULTS[group] }
  }

  function resetAll() {
    for (const group of Object.keys(DEFAULTS)) settings[group].value = { ...DEFAULTS[group] }
  }

  return { system, data, visual, text, set, reset, resetAll }
})
