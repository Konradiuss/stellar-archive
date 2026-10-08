import { ref, watch } from 'vue'

// Bump when a stored shape changes incompatibly: old values are then ignored.
const STORAGE_PREFIX = 'spacemap:v1:'

// All GitHub Pages sites of one user share one origin: each keeps its values under its own folder.
export const siteFolder = (pathname = globalThis.location?.pathname ?? '/') => pathname.replace(/[^/]*$/, '') || '/'

export function safeStorage(name = 'localStorage') {
  try {
    return globalThis[name] ?? null
  } catch {
    // Access itself can throw (blocked site data, sandboxed frames).
    return null
  }
}

const storedKey = key => `${STORAGE_PREFIX}${siteFolder()}${key}`

export function readStoredValue(key, fallback) {
  try {
    const storage = safeStorage()
    // A value kept before the keys had the folder of the site is taken too.
    const raw = storage?.getItem(storedKey(key)) ?? storage?.getItem(STORAGE_PREFIX + key)
    if (raw === null || raw === undefined) return fallback
    const value = JSON.parse(raw)
    // Objects are merged over the defaults so new fields get their default.
    if (isPlainObject(fallback)) return isPlainObject(value) ? { ...fallback, ...value } : fallback
    return typeof value === typeof fallback ? value : fallback
  } catch {
    return fallback
  }
}

export function writeStoredValue(key, value) {
  try {
    safeStorage()?.setItem(storedKey(key), JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled: the value just is not remembered.
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function usePersistentState(key, fallback) {
  const state = ref(readStoredValue(key, fallback))
  watch(state, value => writeStoredValue(key, value), { deep: true })
  return state
}
