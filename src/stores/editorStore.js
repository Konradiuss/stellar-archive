import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { MAP_FILE, checkMap, isWebPage, parseMapJson } from '../utils/mapCheck'
import { collectMapNotes } from '../utils/mapJournal'
import { freshFetch } from '../utils/freshFetch'
import { normalizeWiki } from '../utils/wikiPages'
import { isObject } from '../utils/guards'
import { setStrings, t } from '../i18n'
import { applyTheme } from '../theme'
import { draftKey, forgetPublished, gitBlobSha, loadDraft, loadPublished, publishedKey, saveDraft, savePublished, setPreview } from '../editor/draft'
import { textFiles } from '../editor/siteFiles'
import { zipFiles } from '../editor/zip'
import { MAX_INLINE_BYTES, binaryRef, bytesOf as dataUrlBytes, fileBytes, isBinaryPath, isDataUrl, isImagePath, mimeOf, readRef, sizeText, toDataUrl } from '../editor/binaryFiles'
import { freeRoom, getBlob, putBlob, remember, sweep } from '../editor/blobStore'
import { EditError, formsCanEdit } from '../editor/starEdits'
import { PublishError, guessRepo, publish as publishToGitHub } from '../editor/github'
import { readStoredValue, safeStorage, siteFolder, writeStoredValue } from '../composables/usePersistentState'

// One token key per site folder: all GitHub Pages sites of a user share one origin.
// The legacy key is still read once, then cleared.
const LEGACY_TOKEN_KEY = 'spacemap:github-token'
const tokenKey = () => `${LEGACY_TOKEN_KEY}:${siteFolder()}`
const READ_TIMEOUT_MS = 15000

// Without "Remember" the token lives in sessionStorage: localStorage is readable by
// every GitHub Pages site of the same owner (one origin, owner.github.io).
const remembered = () => {
  try {
    const storage = safeStorage()
    return storage?.getItem(tokenKey()) ?? storage?.getItem(LEGACY_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

const sessionToken = () => {
  try {
    return safeStorage('sessionStorage')?.getItem(tokenKey()) ?? ''
  } catch {
    return ''
  }
}

const readToken = () => sessionToken() || remembered()

// One try per storage: one that throws must not keep the other from being cleared.
const tryStorage = (name, action) => {
  try {
    const storage = safeStorage(name)
    if (storage) action(storage)
  } catch {
    // Refused: nothing kept there.
  }
}

const forgetToken = () => {
  tryStorage('localStorage', storage => {
    storage.removeItem(tokenKey())
    storage.removeItem(LEGACY_TOKEN_KEY)
  })
  tryStorage('sessionStorage', storage => storage.removeItem(tokenKey()))
}

const keepToken = (value, remember) => {
  forgetToken()
  if (!value) return
  tryStorage(remember ? 'localStorage' : 'sessionStorage', storage => storage.setItem(tokenKey(), value))
}

// Keeps a byte order mark (response.text() drops it), so the hash is git's.
const responseText = async response => new TextDecoder('utf-8', { ignoreBOM: true }).decode(await response.arrayBuffer())

// A reference carries the git sha of its bytes.
const shaOf = (path, value) => readRef(value)?.sha ?? gitBlobSha(fileBytes(path, value))

// The shas the stored draft and the records of publishing still name.
function namedShas(draft, records) {
  const values = [...Object.values(draft.files), ...Object.values(records).map(record => record.text)]
  return new Set(values.map(value => readRef(value)?.sha).filter(Boolean))
}

export class LostFilesError extends Error {
  constructor(paths) {
    super(paths.join(', '))
    this.paths = paths
  }
}

export const useEditorStore = defineStore('editor', () => {
  // 'loading' | 'ready' | 'failed'
  const status = ref('loading')
  const loadError = ref('')
  // { path: text }, null for a file the host does not have.
  const originals = ref({})
  const originalShas = {}
  const draft = ref(loadDraft())
  const draftKept = ref(true)
  const otherTabFiles = ref([])
  // { path: reason }
  const readFailures = ref({})
  // Every tab saves the whole draft into one key: paths this tab did not touch are taken as the others left them.
  const touched = new Set()
  const published = loadPublished()
  const current = ref(MAP_FILE)
  const tab = ref('files')
  // { x, y }
  const selectedSector = ref(null)
  // selectedRoute: an index; selectedBody: { star, planet, satellite }.
  const selectedRoute = ref(null)
  const systemStar = ref(null)
  const selectedBody = ref(null)
  const selectedArticle = ref(null)
  const worldOpen = ref(false)
  // { key, params }
  const formError = ref(null)
  // Binary files of the draft whose bytes this browser no longer has.
  const lostFiles = ref([])

  const publishSettings = ref(readStoredValue('editor-publish', { repo: guessRepo(globalThis.location ?? {}), branch: 'main', folder: 'public' }))
  const token = ref(readToken())
  const rememberToken = ref(!!remembered())
  // Unticked: the token leaves localStorage at once and stays for this tab only.
  watch(rememberToken, remember => {
    if (remember) return
    const kept = readToken()
    keepToken(kept, false)
  })

  // Debounced fields register their `save()`; all are flushed before any other map edit, a preview,
  // a download, publishing and leaving the page, so nothing typed is lost or lands elsewhere.
  const pendingSaves = new Set()
  function holdSave(save) {
    pendingSaves.add(save)
    return () => pendingSaves.delete(save)
  }
  function flushPending() {
    for (const save of [...pendingSaves]) save()
  }
  globalThis.addEventListener?.('pagehide', flushPending)

  const isChanged = path => Object.hasOwn(draft.value.files, path)
  // The draft holds null for a deleted file.
  const isDeleted = path => isChanged(path) && draft.value.files[path] === null
  const textOf = path => (isChanged(path) ? draft.value.files[path] ?? '' : originals.value[path] ?? '')
  const exists = path => (isChanged(path) ? draft.value.files[path] !== null : typeof originals.value[path] === 'string')
  const changedFiles = computed(() => Object.keys(draft.value.files).sort())
  const deletedFiles = computed(() => changedFiles.value.filter(isDeleted))
  const mapText = computed(() => textOf(MAP_FILE))

  // { data } or { error }
  const parsed = shallowRef(parseMapJson(''))
  // [{ level, where, message }]
  const problems = shallowRef([])
  // The last readable map: the file list stays while a comma is missing.
  const lastReadable = shallowRef(null)
  let checkTimer = null

  function check() {
    clearTimeout(checkTimer)
    checkTimer = null
    parsed.value = parseMapJson(mapText.value)
    if (parsed.value.error) {
      problems.value = []
      return
    }
    lastReadable.value = parsed.value.data
    // normalizeWiki reports the wiki's own notes as it reads it.
    const { result, notes } = collectMapNotes(() => {
      const checked = checkMap(parsed.value.data)
      if (!checked.fatal && isObject(parsed.value.data.wiki)) normalizeWiki(parsed.value.data.wiki)
      return checked
    })
    problems.value = result.fatal ? [{ level: 'error', where: MAP_FILE, message: result.fatal }] : notes
    // Files the map starts naming are read as they appear; load() waits for the first ones.
    if (status.value === 'ready') loadNamed()
  }
  function checkSoon() {
    clearTimeout(checkTimer)
    checkTimer = setTimeout(check, 300)
  }

  const formsOpen = computed(() => !parsed.value.error && formsCanEdit(mapText.value))
  const mapBroken = computed(() => !!parsed.value.error || problems.value.some(problem => problem.where === MAP_FILE))

  const files = computed(() => {
    const listed = textFiles(lastReadable.value)
    const known = new Set(listed.map(file => file.path))
    for (const path of changedFiles.value) if (!known.has(path)) listed.push({ path, kind: isImagePath(path) ? 'picture' : isBinaryPath(path) ? 'sound' : 'text' })
    return listed
  })

  // null when the host has no such file; throws when it cannot say (500, offline, timeout),
  // so the file is not offered to be created anew.
  async function fetchOriginal(path) {
    const response = await freshFetch(new URL(path, document.baseURI).href, {
      signal: globalThis.AbortSignal?.timeout?.(READ_TIMEOUT_MS)
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (isBinaryPath(path)) {
      // A missing file answered with the site's own index.html.
      if (/text\/html/i.test(response.headers?.get('content-type') ?? '')) return null
      const bytes = new Uint8Array(await response.arrayBuffer())
      const sha = await gitBlobSha(bytes)
      remember(sha, new Blob([bytes], { type: mimeOf(path) }))
      return binaryRef(sha, bytes.length)
    }
    const text = await responseText(response)
    return isWebPage(text, { contentType: response.headers?.get('content-type'), path }) ? null : text
  }

  // Right after publishing the host may still serve the old file: the published text counts then.
  async function readOriginal(path) {
    const text = await fetchOriginal(path)
    const sha = text === null ? null : await shaOf(path, text)
    const record = published[path]
    return record && record.before === sha ? { text: record.text, sha: record.sha } : { text, sha }
  }

  const reading = shallowRef(new Set())

  async function loadNamed() {
    // A recording the draft deletes is not downloaded only to be deleted.
    const missing = files.value.map(file => file.path)
      .filter(path => !Object.hasOwn(originals.value, path) && !Object.hasOwn(readFailures.value, path) && !reading.value.has(path))
      .filter(path => !(isBinaryPath(path) && isDeleted(path)))
    if (!missing.length) return
    reading.value = new Set([...reading.value, ...missing])
    const results = await Promise.all(missing.map(async path => {
      try {
        return { path, ...(await readOriginal(path)) }
      } catch (error) {
        return { path, failure: String(error?.message ?? error) }
      }
    }))
    reading.value = new Set([...reading.value].filter(path => !missing.includes(path)))
    const next = { ...originals.value }
    const failures = { ...readFailures.value }
    const dropped = []
    for (const { path, text, sha, failure } of results) {
      if (failure !== undefined) {
        failures[path] = failure
        continue
      }
      next[path] = text
      originalShas[path] = sha
      if (isChanged(path) && draft.value.files[path] === text) {
        delete draft.value.files[path]
        delete draft.value.bases[path]
        dropped.push(path)
      }
    }
    originals.value = next
    readFailures.value = failures
    if (dropped.length) keep(dropped)
  }

  const isReading = path => !isChanged(path) && reading.value.has(path)
  const readFailure = path => (isChanged(path) ? null : readFailures.value[path] ?? null)

  function retryRead(path) {
    if (!Object.hasOwn(readFailures.value, path)) return
    const failures = { ...readFailures.value }
    delete failures[path]
    readFailures.value = failures
    loadNamed()
  }

  // Drafts kept their recordings as data URLs in localStorage: they move to the blob store, once.
  async function storeDataUrls() {
    const moved = []
    for (const [path, value] of Object.entries(draft.value.files)) {
      if (!isBinaryPath(path) || !isDataUrl(value)) continue
      const bytes = dataUrlBytes(value)
      const sha = await gitBlobSha(bytes)
      if (!(await putBlob(sha, new Blob([bytes], { type: mimeOf(path) })))) continue
      draft.value.files[path] = binaryRef(sha, bytes.length)
      moved.push(path)
    }
    if (moved.length) keep(moved)
  }

  async function findLost() {
    const lost = []
    for (const [path, value] of Object.entries(draft.value.files)) {
      const ref = isBinaryPath(path) ? readRef(value) : null
      if (ref && !(await getBlob(ref.sha))) lost.push(path)
    }
    lostFiles.value = lost
  }

  let sweepTimer = null
  function sweepSoon() {
    clearTimeout(sweepTimer)
    sweepTimer = setTimeout(() => sweep(namedShas(loadDraft(draftKey()), loadPublished())), 2000)
  }

  async function load() {
    status.value = 'loading'
    await storeDataUrls()
    await findLost()
    try {
      const { text, sha } = await readOriginal(MAP_FILE)
      if (text === null) throw new Error('HTTP 404')
      originals.value = { [MAP_FILE]: text }
      originalShas[MAP_FILE] = sha
    } catch (error) {
      loadError.value = t('editor.loadFailed', { file: MAP_FILE, reason: String(error?.message ?? error) })
      status.value = 'failed'
      return
    }
    check()
    if (parsed.value.data) {
      const { result } = collectMapNotes(() => checkMap(parsed.value.data))
      if (result.strings) {
        setStrings(result.strings, result.language)
        applyTheme(result.theme)
        document.documentElement.lang = result.language
      }
    }
    if (draft.value.files[MAP_FILE] === originals.value[MAP_FILE]) {
      delete draft.value.files[MAP_FILE]
      delete draft.value.bases[MAP_FILE]
      keep([MAP_FILE])
    }
    // Read before showing: a file shown empty while loading would be overwritten by the first key pressed.
    await loadNamed()
    status.value = 'ready'
  }

  // Saves the draft for the paths this tab changed. `settled` ({ path: text }, just published)
  // leaves the stored draft wherever it still holds that very text, even if another tab wrote it.
  function keep(paths = [], settled = {}) {
    paths.forEach(path => touched.add(path))
    const key = draftKey()
    const stored = loadDraft(key)
    for (const [path, text] of Object.entries(settled)) {
      if (Object.hasOwn(stored.files, path) && stored.files[path] === text) {
        delete stored.files[path]
        delete stored.bases[path]
      }
    }
    for (const path of touched) {
      if (isChanged(path)) {
        stored.files[path] = draft.value.files[path]
        // No base: a file never read, which publishing does not compare.
        if (Object.hasOwn(draft.value.bases, path)) stored.bases[path] = draft.value.bases[path]
        else delete stored.bases[path]
      } else {
        delete stored.files[path]
        delete stored.bases[path]
      }
    }
    draft.value = stored
    draftKept.value = saveDraft(stored, key)
    lostFiles.value = lostFiles.value.filter(path => isChanged(path) && draft.value.files[path] !== null)
    sweepSoon()
  }

  function adoptOtherDraft() {
    const stored = loadDraft(draftKey())
    const before = draft.value.files
    const changed = [...new Set([...Object.keys(before), ...Object.keys(stored.files)])]
      .filter(path => before[path] !== stored.files[path])
    if (!changed.length) return
    draft.value = stored
    const clashed = changed.filter(path => touched.has(path))
    if (clashed.length) otherTabFiles.value = clashed
    if (status.value === 'ready') check()
    findLost()
  }

  function adoptOtherPublishing() {
    const records = loadPublished()
    const next = { ...originals.value }
    let moved = false
    for (const [path, record] of Object.entries(records)) {
      if (published[path]?.sha === record.sha) continue
      published[path] = record
      if (Object.hasOwn(next, path) && originalShas[path] === record.before) {
        next[path] = record.text
        originalShas[path] = record.sha
        moved = true
      }
    }
    if (moved) originals.value = next
  }

  function adoptOtherTab(event) {
    if (event.key === publishedKey()) adoptOtherPublishing()
    else if (event.key === draftKey()) adoptOtherDraft()
  }
  globalThis.addEventListener?.('storage', adoptOtherTab)
  onScopeDispose(() => {
    globalThis.removeEventListener?.('storage', adoptOtherTab)
    globalThis.removeEventListener?.('pagehide', flushPending)
    clearTimeout(sweepTimer)
  })

  // → null, or the { key, params } of why it was not taken.
  async function setBinary(path, bytes) {
    const room = await freeRoom()
    if (room !== null && bytes.length > room) return { key: 'editor.noRoom', params: { file: path, size: sizeText(bytes.length), free: sizeText(room) } }
    const sha = await gitBlobSha(bytes)
    // Without IndexedDB the bytes go into the draft itself, as before.
    const stored = await putBlob(sha, new Blob([bytes], { type: mimeOf(path) }))
    if (!stored && bytes.length > MAX_INLINE_BYTES) return { key: 'editor.noFileStore', params: { file: path, size: sizeText(bytes.length), max: sizeText(MAX_INLINE_BYTES) } }
    setText(path, stored ? binaryRef(sha, bytes.length) : toDataUrl(bytes, path))
    lostFiles.value = lostFiles.value.filter(each => each !== path)
    return null
  }

  /** → the bytes of a binary file as the draft or the host has it, or null when they are gone. */
  async function bytesOf(path) {
    const value = textOf(path)
    if (isDataUrl(value)) return dataUrlBytes(value)
    const ref = readRef(value)
    const blob = ref && await getBlob(ref.sha)
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  }

  // { path: text | bytes | null } of the draft; throws LostFilesError naming every file whose bytes are gone.
  async function contents(paths) {
    const result = {}
    const lost = []
    for (const path of paths) {
      const value = draft.value.files[path]
      if (value === null || !isBinaryPath(path)) result[path] = value
      else if ((result[path] = await bytesOf(path)) === null) lost.push(path)
    }
    if (lost.length) {
      lostFiles.value = [...new Set([...lostFiles.value, ...lost])]
      throw new LostFilesError(lost)
    }
    return result
  }

  function setText(path, text) {
    if (text === originals.value[path]) {
      delete draft.value.files[path]
      delete draft.value.bases[path]
    } else {
      if (!isChanged(path)) draft.value.bases[path] = originalShas[path] ?? null
      draft.value.files[path] = text
    }
    keep([path])
    if (path === MAP_FILE) checkSoon()
  }

  const revert = path => {
    if (typeof originals.value[path] === 'string') setText(path, originals.value[path])
    else {
      delete draft.value.files[path]
      delete draft.value.bases[path]
      keep([path])
    }
  }
  const create = path => setText(path, '')

  // A file never read (a track of the playlist) is deleted with no version to compare:
  // publishing skips it if the host has none.
  function markDeleted(path) {
    if (!Object.hasOwn(originals.value, path)) {
      draft.value.files[path] = null
      delete draft.value.bases[path]
    } else if (typeof originals.value[path] !== 'string') {
      delete draft.value.files[path]
      delete draft.value.bases[path]
    } else {
      if (!isChanged(path)) draft.value.bases[path] = originalShas[path] ?? null
      draft.value.files[path] = null
    }
    keep([path])
  }

  function discard() {
    flushPending()
    touched.clear()
    draft.value = { files: {}, bases: {} }
    draftKept.value = saveDraft(draft.value, draftKey())
    lostFiles.value = []
    sweepSoon()
    check()
  }

  // edit(text) returns the new text, or { text, orphans, create }: orphans are deleted, create is a file the edit needs.
  function editMap(edit) {
    formError.value = null
    try {
      // Flushed first, where it was typed: a moved planet or a renamed article must not take another's lore.
      flushPending()
      const result = edit(mapText.value)
      const text = typeof result === 'string' ? result : result.text
      setText(MAP_FILE, text)
      for (const path of result?.orphans ?? []) markDeleted(path)
      if (result?.create && !exists(result.create.path)) setText(result.create.path, result.create.text)
      check()
      return result
    } catch (error) {
      if (!(error instanceof EditError)) throw error
      formError.value = { key: error.key, params: error.params }
      return null
    }
  }

  function preview() {
    flushPending()
    setPreview(true)
    window.location.hash = '#/'
  }

  function toSite() {
    flushPending()
    setPreview(false)
    window.location.hash = '#/'
  }

  async function downloadable() {
    const written = changedFiles.value.filter(path => !isDeleted(path))
    const files = await contents(written)
    if (written.length === 1 && !deletedFiles.value.length) {
      const [path] = written
      const blob = isBinaryPath(path)
        ? new Blob([files[path]], { type: mimeOf(path) })
        : new Blob([files[path]], { type: 'text/plain;charset=utf-8' })
      return { name: path.split('/').pop(), blob }
    }
    const entries = written.map(path => (isBinaryPath(path) ? { path, bytes: files[path] } : { path, text: files[path] }))
    if (deletedFiles.value.length) entries.push({ path: 'DELETED.txt', text: `${t('editor.deletedNote')}\n\n${deletedFiles.value.join('\n')}\n` })
    return { name: 'site-edits.zip', blob: new Blob([zipFiles(entries)], { type: 'application/zip' }) }
  }

  async function download() {
    flushPending()
    if (!changedFiles.value.length) return
    let file
    try {
      file = await downloadable()
    } catch (error) {
      if (!(error instanceof LostFilesError)) throw error
      formError.value = { key: 'editor.binaryLost', params: { files: error.paths.join(', ') } }
      return
    }
    const { name, blob } = file
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }

  // [{ key, params }]
  const publishLog = ref([])
  const publishResult = ref(null)
  const publishing = ref(false)

  async function publish({ message, overwrite = false } = {}) {
    flushPending()
    check()
    if (publishing.value || mapBroken.value) return
    publishing.value = true
    publishLog.value = []
    publishResult.value = null
    const settings = publishSettings.value
    writeStoredValue('editor-publish', settings)
    keepToken(token.value.trim(), rememberToken.value)
    try {
      const files = { ...draft.value.files }
      let sent
      try {
        sent = await contents(Object.keys(files))
      } catch (error) {
        if (!(error instanceof LostFilesError)) throw error
        throw new PublishError('editor.binaryLost', { files: error.paths.join(', ') })
      }
      const result = await publishToGitHub({
        token: token.value,
        repo: settings.repo.trim(),
        branch: settings.branch.trim() || 'main',
        folder: settings.folder.trim(),
        files: sent,
        bases: draft.value.bases,
        message: message?.trim() || t('editor.defaultMessage'),
        overwrite,
        log: (key, params) => { publishLog.value = [...publishLog.value, { key, params }] }
      })
      if (result.status === 'done') {
        // Kept for a while: the host serves the old files for some minutes yet.
        const next = { ...originals.value }
        const at = Date.now()
        for (const [path, text] of Object.entries(files)) {
          const sha = text === null ? null : await shaOf(path, text)
          published[path] = { before: originalShas[path] ?? null, sha, text, at }
          next[path] = text
          originalShas[path] = sha
          if (draft.value.files[path] === text) {
            delete draft.value.files[path]
            delete draft.value.bases[path]
          }
        }
        originals.value = next
        // Before the draft: another tab must learn what the host has before those files leave the draft.
        const recorded = savePublished(published)
        keep(Object.keys(files).filter(path => touched.has(path)), files)
        // Storage full: the draft wins over the publish record.
        if (recorded && !draftKept.value) {
          forgetPublished()
          keep()
        }
      }
      publishResult.value = result
    } catch (error) {
      publishResult.value = error instanceof PublishError
        ? { status: 'failed', key: error.key, params: error.params }
        : { status: 'failed', key: 'editor.publishCrashed', params: { message: String(error?.message ?? error) } }
    } finally {
      publishing.value = false
    }
  }

  return {
    status,
    loadError,
    originals,
    draft,
    draftKept,
    otherTabFiles,
    current,
    tab,
    selectedSector,
    selectedRoute,
    systemStar,
    selectedBody,
    selectedArticle,
    worldOpen,
    formError,
    lostFiles,
    publishSettings,
    token,
    rememberToken,
    mapText,
    parsed,
    problems,
    formsOpen,
    mapBroken,
    files,
    changedFiles,
    deletedFiles,
    publishLog,
    publishResult,
    publishing,
    textOf,
    exists,
    isChanged,
    isDeleted,
    isReading,
    readFailure,
    retryRead,
    markDeleted,
    holdSave,
    flushPending,
    check,
    load,
    setText,
    setBinary,
    bytesOf,
    revert,
    create,
    discard,
    editMap,
    preview,
    toSite,
    downloadable,
    download,
    publish
  }
})
