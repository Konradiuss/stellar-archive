import { describe, expect, it } from 'vitest'
import { stubName, stubPath, stubUrl } from '../stubPath'

const SITE = 'https://owner.github.io/reach/'

// Was: social network bots drop all after "#", so every wiki page had the preview of the site.
describe('the addresses of the link preview pages', () => {
  it('keeps the readable name of a page, letters of any alphabet included', () => {
    expect(stubPath('wiki', 'Earth')).toBe('wiki/Earth/')
    expect(stubPath('wiki', 'Земля')).toBe('wiki/Земля/')
    expect(stubPath('system', 'silent-reach')).toBe('system/silent-reach/')
    expect(stubUrl('wiki', 'Земля', SITE)).toBe('https://owner.github.io/reach/wiki/%D0%97%D0%B5%D0%BC%D0%BB%D1%8F/')
    expect(stubUrl('system', 'sol', SITE)).toBe('https://owner.github.io/reach/system/sol/')
  })

  it('names by a short hash a page that cannot be a folder', () => {
    for (const unsafe of ['A/B', 'Why?', '100%', 'Special:Icons', '..', '', 'Tab\there']) {
      expect(stubName(unsafe)).toMatch(/^_[0-9a-f]{8}$/)
    }
    expect(stubName('A/B')).toBe(stubName('A/B'))
    expect(stubName('A/B')).not.toBe(stubName('A/C'))
    expect(stubUrl('wiki', 'A/B', SITE)).toBe(`${SITE}wiki/${stubName('A/B')}/`)
  })

  it('knows only its kinds of pages', () => {
    expect(() => stubPath('editor', 'x')).toThrow()
  })
})
