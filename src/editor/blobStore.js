// The bytes of the draft's binary files, in IndexedDB under the git sha of their content:
// localStorage holds ~5 MB of strings, so the draft names each file by a short reference.
// Every tab of a site folder shares the store; this tab also keeps what it read in memory.
import { siteFolder } from '../composables/usePersistentState'

const DB_NAME = 'spacemap-editor'
const STORE = 'files'
// A file put by another tab a moment ago may not be in the saved draft yet.
const SWEEP_GRACE_MS = 10 * 60 * 1000

const memory = new Map()
let opened

const keyOf = sha => `${siteFolder()}:${sha}`

const done = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

function openDatabase() {
  return new Promise(resolve => {
    try {
      const request = globalThis.indexedDB?.open(DB_NAME, 1)
      if (!request) return resolve(null)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => {
        // Another page deleting or upgrading the store is not kept waiting.
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
      // Blocked or refused (a private window of some browsers): memory only.
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** { get(key), put(key, record), delete(key), keys() }, all async; null when the browser has no IndexedDB. */
function indexedBackend(database) {
  const run = (mode, action) => {
    const transaction = database.transaction(STORE, mode)
    return done(action(transaction.objectStore(STORE)))
  }
  return {
    get: key => run('readonly', store => store.get(key)),
    put: (key, record) => run('readwrite', store => store.put(record, key)),
    delete: key => run('readwrite', store => store.delete(key)),
    keys: () => run('readonly', store => store.getAllKeys())
  }
}

const backend = () => (opened ??= openDatabase().then(database => (database ? indexedBackend(database) : null)))

/** Tests: another backend (null: none), and memory emptied. */
export function useBackend(next) {
  opened = Promise.resolve(next)
  memory.clear()
}

/** Kept for this tab only (a file of the host, read to be compared). */
export function remember(sha, blob) {
  memory.set(keyOf(sha), blob)
}

/** → true when IndexedDB took it; false when it lives in this tab only. */
export async function putBlob(sha, blob) {
  memory.set(keyOf(sha), blob)
  try {
    const store = await backend()
    if (!store) return false
    await store.put(keyOf(sha), { blob, at: Date.now() })
    return true
  } catch {
    return false
  }
}

/** → Blob, or null when neither this tab nor the store has it. */
export async function getBlob(sha) {
  const key = keyOf(sha)
  if (memory.has(key)) return memory.get(key)
  try {
    const record = await (await backend())?.get(key)
    if (!record?.blob) return null
    memory.set(key, record.blob)
    return record.blob
  } catch {
    return null
  }
}

/** Deletes the files of this site no draft names any more, but none put a short while ago. */
export async function sweep(kept, now = Date.now()) {
  try {
    const store = await backend()
    if (!store) return
    const prefix = `${siteFolder()}:`
    const wanted = new Set([...kept].map(keyOf))
    for (const key of await store.keys()) {
      if (typeof key !== 'string' || !key.startsWith(prefix) || wanted.has(key)) continue
      const record = await store.get(key)
      if (record && now - (record.at ?? 0) < SWEEP_GRACE_MS) continue
      // Memory stays: it may hold the same bytes as a file of the host.
      await store.delete(key)
    }
  } catch {
    // Left for the next time.
  }
}

/** → bytes the browser can still store, or null when it does not say. */
export async function freeRoom() {
  try {
    const { quota, usage } = await globalThis.navigator?.storage?.estimate?.() ?? {}
    return Number.isFinite(quota) && Number.isFinite(usage) ? Math.max(0, quota - usage) : null
  } catch {
    return null
  }
}
