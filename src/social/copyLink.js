// Shared links point at the place's preview page (stubPath.js): a bare "#/…" address shows the preview of the whole site.

import { buildRoute } from '../utils/hashRoute'
import { isPreview } from '../editor/draft'
import { stubUrl } from './stubPath'

// Preview pages exist only in the build, not for service pages, and not while an editor draft is previewed.
export function shareUrl({ page = null, starId = null }, { base = globalThis.document?.baseURI, previews = import.meta.env.PROD, previewing = isPreview() } = {}) {
  const withPreviews = previews && !previewing
  if (page) {
    const hasPreview = withPreviews && page.slug && page.kind !== 'special'
    return hasPreview ? stubUrl('wiki', page.slug, base) : new URL(buildRoute({ wiki: page.slug ?? '' }), base).href
  }
  if (starId) return withPreviews ? stubUrl('system', starId, base) : new URL(buildRoute({ starId }), base).href
  return new URL('#/', base).href
}

export async function copyText(text, { clipboard = globalThis.navigator?.clipboard, doc = globalThis.document } = {}) {
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    // No Clipboard API (an http page, an old browser) or refused: the old way.
  }
  try {
    const field = doc.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    doc.body.append(field)
    field.select()
    const copied = doc.execCommand('copy')
    field.remove()
    return copied
  } catch {
    return false
  }
}
