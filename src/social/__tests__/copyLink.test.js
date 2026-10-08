// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { copyText, shareUrl } from '../copyLink'
import { stubUrl } from '../stubPath'

const BASE = 'https://owner.github.io/reach/#/wiki/Earth'

// Was: the only address to share was "#/wiki/Earth", and social networks drop all after "#": every link showed the site's preview.
describe('the address COPY LINK gives', () => {
  it('is the preview page of the place in the built site', () => {
    expect(shareUrl({ page: { slug: 'Earth', kind: 'planet' } }, { base: BASE, previews: true })).toBe('https://owner.github.io/reach/wiki/Earth/')
    expect(shareUrl({ page: { slug: 'Земля', kind: 'article' } }, { base: BASE, previews: true })).toBe(stubUrl('wiki', 'Земля', BASE))
    expect(shareUrl({ starId: 'sol' }, { base: BASE, previews: true })).toBe('https://owner.github.io/reach/system/sol/')
  })

  it('is the address with "#" in development and for a service page', () => {
    expect(shareUrl({ page: { slug: 'Earth', kind: 'planet' } }, { base: BASE, previews: false })).toBe('https://owner.github.io/reach/#/wiki/Earth')
    expect(shareUrl({ page: { slug: 'Special:Icons', kind: 'special' } }, { base: BASE, previews: true })).toBe('https://owner.github.io/reach/#/wiki/Special:Icons')
    expect(shareUrl({ starId: 'sol' }, { base: BASE, previews: false })).toBe('https://owner.github.io/reach/#/system/sol')
  })

  // Was: with an editor draft, a new draft article got the address of its preview page, which the host has not got yet: a 404.
  it('is the address with "#" while the site is shown with the draft of the editor', () => {
    expect(shareUrl({ page: { slug: 'New_Article', kind: 'article' } }, { base: BASE, previews: true, previewing: true })).toBe('https://owner.github.io/reach/#/wiki/New_Article')
    expect(shareUrl({ starId: 'sol' }, { base: BASE, previews: true, previewing: true })).toBe('https://owner.github.io/reach/#/system/sol')
    sessionStorage.setItem('spacemap:preview', '1')
    expect(shareUrl({ starId: 'sol' }, { base: BASE, previews: true })).toBe('https://owner.github.io/reach/#/system/sol')
    sessionStorage.removeItem('spacemap:preview')
    expect(shareUrl({ starId: 'sol' }, { base: BASE, previews: true })).toBe('https://owner.github.io/reach/system/sol/')
  })
})

describe('copying a link', () => {
  it('uses the clipboard of the browser', async () => {
    const clipboard = { writeText: vi.fn(async () => {}) }
    expect(await copyText('x', { clipboard })).toBe(true)
    expect(clipboard.writeText).toHaveBeenCalledWith('x')
  })

  it('falls back to the old way when the clipboard refuses', async () => {
    const clipboard = { writeText: vi.fn(async () => { throw new Error('denied') }) }
    document.execCommand = vi.fn(() => true)
    expect(await copyText('x', { clipboard })).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('says so when neither way works', async () => {
    document.execCommand = vi.fn(() => false)
    expect(await copyText('x', { clipboard: null })).toBe(false)
    document.execCommand = vi.fn(() => { throw new Error('no') })
    expect(await copyText('x', { clipboard: null })).toBe(false)
  })
})
