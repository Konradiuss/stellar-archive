// Shared by the site (mapData.js) and the editor's loader preview, so both show the same numbers.

import { loreEntries } from './richText/lore'
import { normalizeWiki } from './wikiPages'
import { collectMapNotes } from './mapJournal'

export const textCount = data => loreEntries(data).filter(entry => entry.file || entry.text).length

/** Quiet: the editor lists the problems of the map itself. */
export function mapLoaderCounts(raw) {
  try {
    return collectMapNotes(() => {
      const data = { ...(raw && typeof raw === 'object' ? raw : {}), wiki: normalizeWiki(raw?.wiki) }
      return { texts: textCount(data), articles: data.wiki.articles }
    }).result
  } catch {
    // A map still being typed may throw.
    return { texts: 0, articles: [] }
  }
}
