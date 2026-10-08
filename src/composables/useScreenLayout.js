import { readonly, shallowRef } from 'vue'

// A narrow screen, or a phone turned on its side.
export const PHONE_QUERY = '(max-width: 600px), (max-height: 500px) and (max-width: 1000px)'
export const TABLET_QUERY = '(max-width: 1024px) and (orientation: portrait)'
// A screen wider than tall: a phone on its side keeps its strip at the side.
export const LANDSCAPE_QUERY = '(orientation: landscape)'

// 1 sprite pixel of a casing in CSS pixels: half on a phone, where every pixel of the screen counts.
export const CONSOLE_PX = 2
export const consolePx = layout => (layout === 'phone' ? 1 : CONSOLE_PX)

const layout = shallowRef('desktop')
const landscape = shallowRef(false)
let source = null
let queries = null

function read() {
  if (queries.phone.matches) return 'phone'
  if (queries.tablet.matches) return 'tablet'
  return 'desktop'
}

// The queries are made once per matchMedia (a test stubs a new one) and follow the screen live.
function watchScreen() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  if (source === window.matchMedia) return
  for (const query of Object.values(queries ?? {})) query.removeEventListener?.('change', update)
  source = window.matchMedia
  queries = {
    phone: window.matchMedia(PHONE_QUERY),
    tablet: window.matchMedia(TABLET_QUERY),
    landscape: window.matchMedia(LANDSCAPE_QUERY)
  }
  for (const query of Object.values(queries)) query.addEventListener?.('change', update)
  update()
}

function update() {
  const next = read()
  if (next !== layout.value) layout.value = next
  if (queries.landscape.matches !== landscape.value) landscape.value = queries.landscape.matches
}

// layout: 'phone' | 'tablet' | 'desktop'; landscape: wider than tall.
export function useScreenLayout() {
  watchScreen()
  return { layout: readonly(layout), landscape: readonly(landscape) }
}
