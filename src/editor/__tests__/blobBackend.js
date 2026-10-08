// IndexedDB as the blob store sees it, in memory: happy-dom has none.
export function memoryBackend() {
  const records = new Map()
  return {
    records,
    get: async key => records.get(key),
    put: async (key, record) => { records.set(key, record) },
    delete: async key => { records.delete(key) },
    keys: async () => [...records.keys()]
  }
}
