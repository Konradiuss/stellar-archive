import { onUnmounted, ref, watch } from 'vue'
import { useEditorStore } from '../stores/editorStore'
import { isBinaryPath, mimeOf } from '../editor/binaryFiles'
import { sitePathOf } from '../editor/siteFiles'

/** An address an <img> can show for `source()`: a file of the site as the draft has it, or an https:// one. */
export function useEditorFileUrl(source) {
  const editor = useEditorStore()
  const url = ref(null)
  let own = null
  let asked = 0

  const release = () => {
    if (own) URL.revokeObjectURL(own)
    own = null
  }

  // A string, so that only another file or other bytes make another address: a page redrawn
  // for nothing puts the map's values back into fields being typed in.
  watch(() => {
    const value = typeof source() === 'string' ? source().trim() : ''
    const path = sitePathOf(value)
    // The text names the bytes: a new file of the draft is a new address.
    return `${value}\n${path ? editor.textOf(path) : ''}`
  }, async key => {
    const value = key.slice(0, key.indexOf('\n'))
    const ask = ++asked
    if (/^https?:\/\//i.test(value)) {
      release()
      url.value = value
      return
    }
    const path = sitePathOf(value)
    const bytes = path && isBinaryPath(path) ? await editor.bytesOf(path) : null
    if (ask !== asked) return
    release()
    if (bytes) own = URL.createObjectURL(new Blob([bytes], { type: mimeOf(path) }))
    // A file the map does not name (the default icon) is not read by the editor: the host's.
    url.value = own ?? (path && !editor.isChanged(path) ? new URL(path, document.baseURI).href : null)
  }, { immediate: true })

  onUnmounted(() => {
    asked++
    release()
  })
  return url
}
