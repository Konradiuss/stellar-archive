import { describe, expect, it, vi } from 'vitest'
import { buildTabTitle, TAB_STATUS } from '../tabTitle'
import { normalizeSiteConfig } from '../siteConfig'

const site = normalizeSiteConfig({ title: 'Star Map TG' })
const sol = { id: 'sol', name: 'Sol' }
const earth = { name: 'Earth' }

describe('buildTabTitle', () => {
  it('names the place first and the map last', () => {
    expect(buildTabTitle({ site })).toBe('Star Map TG')
    expect(buildTabTitle({ site, star: sol })).toBe('Sol — Star Map TG')
    expect(buildTabTitle({ site, star: sol, planet: earth })).toBe('Earth · Sol — Star Map TG')
  })

  it('uses tabTitle of a star or a planet instead of its name', () => {
    expect(buildTabTitle({ site, star: { ...sol, tabTitle: 'Cradle' } })).toBe('Cradle — Star Map TG')
    expect(buildTabTitle({ site, star: sol, planet: { ...earth, tabTitle: '  Home  ' } })).toBe('Home — Star Map TG')
  })

  it('fills a custom template and drops separators of empty parts', () => {
    const custom = normalizeSiteConfig({ title: 'TG', titleTemplate: '[{site}] {planet} / {star} | {page}' })
    expect(buildTabTitle({ site: custom, star: sol, planet: earth })).toBe('[TG] Earth / Sol | Earth · Sol')
    expect(buildTabTitle({ site: custom, star: sol })).toBe('[TG] Sol | Sol')
    const tail = normalizeSiteConfig({ titleTemplate: '{page} — {site} — {planet}' })
    expect(buildTabTitle({ site: tail, star: sol })).toBe('Sol — SpaceMap')
  })

  it('shows a temporary state instead of the place', () => {
    expect(buildTabTitle({ site, status: TAB_STATUS.loading })).toBe('LOADING... — Star Map TG')
    expect(buildTabTitle({ site, star: sol, status: TAB_STATUS.jump('Vesper') })).toBe('JUMP > Vesper — Star Map TG')
    expect(buildTabTitle({ status: TAB_STATUS.offline })).toBe('NO SIGNAL — SpaceMap')
  })

  it('falls back to the default map name', () => {
    expect(buildTabTitle({ site: { title: '   ' }, star: sol })).toBe('Sol — SpaceMap')
    expect(buildTabTitle()).toBe('SpaceMap')
  })
})

describe('normalizeSiteConfig', () => {
  const base = 'http://localhost:5173/maps/map.json'

  it('keeps the defaults for a missing or broken section', () => {
    expect(normalizeSiteConfig()).toEqual({ title: 'SpaceMap', titleTemplate: '{page} — {site}', favicon: 'favicon.gif', url: null, description: '', preview: null })
    expect(normalizeSiteConfig({ title: 42, titleTemplate: 'no place', favicon: ['x'] })).toEqual(normalizeSiteConfig())
  })

  it('resolves the favicon against the map file', () => {
    expect(normalizeSiteConfig({ favicon: 'icons/tp.gif' }, base).favicon).toBe('http://localhost:5173/maps/icons/tp.gif')
    expect(normalizeSiteConfig({}, base).favicon).toBe('http://localhost:5173/maps/favicon.gif')
    expect(normalizeSiteConfig({ favicon: 'https://cdn.example/icon.gif' }, base).favicon).toBe('https://cdn.example/icon.gif')
  })

  it('refuses scripts and data URLs as the favicon', () => {
    expect(normalizeSiteConfig({ favicon: 'javascript:alert(1)' }).favicon).toBe('favicon.gif')
    expect(normalizeSiteConfig({ favicon: '//evil.example/x.gif' }).favicon).toBe('favicon.gif')
  })

  // Was: new URL('https://') threw while the map was built: a favicon no browser can read left the map on "catalog unavailable".
  it('keeps the default favicon for an address no browser can read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(normalizeSiteConfig({ favicon: 'https://' }, base).favicon).toBe('http://localhost:5173/maps/favicon.gif')
    expect(normalizeSiteConfig({ favicon: 'https://host:99999/x.gif' }, base).favicon).toBe('http://localhost:5173/maps/favicon.gif')
    warn.mockRestore()
  })

  // Was: the site had no address of its own, and link previews need absolute ones.
  it('takes the address of the site, its description and its own preview picture', () => {
    const site = normalizeSiteConfig({
      url: ' https://owner.github.io/reach?x=1#top ',
      description: `  ${'The Reach. '.repeat(40)}`,
      preview: 'images/card.png'
    }, base)
    expect(site.url).toBe('https://owner.github.io/reach/')
    expect(site.description.length).toBe(300)
    expect(site.description.startsWith('The Reach.')).toBe(true)
    expect(site.preview).toBe('http://localhost:5173/maps/images/card.png')
    expect(normalizeSiteConfig({ url: 'https://owner.github.io/reach/' }).url).toBe('https://owner.github.io/reach/')
  })

  it('leaves out an address that is no site, and a preview that is no picture', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(normalizeSiteConfig({ url: 'owner.github.io' }).url).toBeNull()
    expect(normalizeSiteConfig({ url: 'javascript:alert(1)' }).url).toBeNull()
    expect(normalizeSiteConfig({ url: 42 }).url).toBeNull()
    expect(normalizeSiteConfig({ preview: 'javascript:alert(1)' }).preview).toBeNull()
    expect(normalizeSiteConfig({ preview: 'data:image/png;base64,AAAA' }).preview).toBeNull()
    expect(normalizeSiteConfig({ description: 42 }).description).toBe('')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
