import { noteMap, warnMap } from './mapJournal'

const KINDS = {
  picture: {
    one: 'picture',
    many: 'pictures',
    http: 'Is an http address: the site asks for it over https, and a host without https shows nothing. Write https://.',
    other: 'Come from another site: its owner sees the address of every reader of these pages. Pictures next to the map (lore/images/) avoid it.'
  },
  sound: {
    one: 'sound',
    many: 'sounds',
    http: 'Is an http address: the site asks for it over https, and a host without https leaves the sound of the site in its place. Write https://.',
    other: 'Come from another site: its owner sees the address of every visitor, and it must send the header Access-Control-Allow-Origin (CORS), or the sounds of the site play instead. Files next to the map (sounds/) avoid both.'
  }
}

const httpOrigin = address => {
  try {
    const url = new URL(address)
    return /^https?:$/.test(url.protocol) ? url : null
  } catch {
    return null
  }
}

export function noteFileSource(src, baseUrl, { what = 'picture' } = {}) {
  const kind = KINDS[what]
  const url = httpOrigin(src)
  if (!kind || !url) return
  // A map read from disk (the build) has no site to compare with.
  const site = httpOrigin(baseUrl)
  // The CSP upgrades http to https; only a same-origin file (local dev server) may stay http.
  if (url.protocol === 'http:' && url.origin !== site?.origin) {
    warnMap(`${kind.one} "${src}"`, kind.http)
  }
  if (site && url.host !== site.host) {
    noteMap('info', `${kind.many} from ${url.host}`, kind.other)
  }
}
