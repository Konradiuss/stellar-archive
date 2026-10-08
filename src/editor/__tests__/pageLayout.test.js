import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  appendBlock, bannerFields, readPage, writePage, boxFields, isGap, linkItems, moveBlock, newBlock, parseLayout, removeBlock,
  replaceBlock, serializeLayout, setBannerField, setBlockText, setBoxField, setLinkItems, textOfBlock
} from '../pageLayout'
import { parseWikitext } from '../../utils/richText/wikitextParser'

const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)
const FILE = readFileSync('public/wiki/main.wiki', 'utf8')
// The form works on LF; the file may have Windows line breaks (a git checkout).
const MAIN = FILE.replaceAll(CRLF, LF)
const cards = segments => segments.filter(segment => !isGap(segment)).map(segment => segment.kind)
const blocksOf = text => parseWikitext(text).blocks

describe('the main page as a row of blocks', () => {
  it('reads the cards of the main page, and joins them back to the very text', () => {
    const segments = parseLayout(MAIN)
    expect(cards(segments)).toEqual(['banner', 'links', 'box', 'box', 'box', 'box', 'portal'])
    expect(serializeLayout(segments)).toBe(MAIN)
    const windows = MAIN.replaceAll(LF, CRLF)
    const page = readPage(windows)
    expect(page.eol).toBe(CRLF)
    expect(writePage(page.segments, page.eol)).toBe(windows)
    expect(writePage(readPage(FILE).segments, readPage(FILE).eol)).toBe(FILE)
    for (const text of ['', 'Just text.', '{{Banner|A}}', 'A\r\n{{Box|B|\nC\n}}\r\nD', '{{Box|unclosed']) {
      expect(serializeLayout(parseLayout(text)), JSON.stringify(text)).toBe(text)
    }
  })

  it('leaves a template inside a sentence, a comment or <nowiki> to the text', () => {
    const text = 'See {{Box|inline}} here.\n<!-- {{Banner|old}} -->\n<nowiki>{{Links|[[A]]}}</nowiki>\n{{Stub}}\n{{Center|{{Box|inside}}}}\n'
    expect(cards(parseLayout(text))).toEqual(['text'])
  })

  it('writes a banner as the main page does, one field changed and the rest kept', () => {
    const segments = parseLayout(MAIN)
    const banner = segments[0]
    expect(bannerFields(banner)).toMatchObject({ title: 'GALAXY ARCHIVE', style: 'sunset', animation: '', frame: '' })
    let next = setBannerField(banner, 'style', 'ice')
    next = setBannerField(next, 'animation', 'bounce')
    const text = serializeLayout(replaceBlock(segments, 0, next))
    expect(text.split('\n').slice(0, 5)).toEqual(['{{Banner', '|title = GALAXY ARCHIVE', '|style = ice', '|animation = bounce', '|caption = Welcome to the archive: {{NUMBEROFARTICLES}} articles and {{NUMBEROFPLACES}} places on the map'])
    expect(text.slice(text.indexOf('{{Links'))).toBe(MAIN.slice(MAIN.indexOf('{{Links')))
    expect(blocksOf(text)[0]).toMatchObject({ type: 'banner', logo: { style: 'ice', animation: 'bounce', text: 'GALAXY ARCHIVE' } })
    expect(setBannerField(next, 'animation', '').raw).not.toContain('animation')
  })

  it('names the title and text of a banner written without names, keeps what the form does not know, escapes "|"', () => {
    const [banner] = parseLayout('{{Banner|Archive|Hello|glow=yes}}')
    expect(bannerFields(banner)).toMatchObject({ title: 'Archive', text: 'Hello' })
    const next = setBannerField(banner, 'caption', 'A | B [[Mars|the red one]]')
    expect(next.raw).toBe('{{Banner\n|title = Archive\n|caption = A {{!}} B [[Mars|the red one]]\n|text = Hello\n|glow = yes\n}}')
    expect(bannerFields(next).caption).toBe('A | B [[Mars|the red one]]')
    expect(blocksOf(next.raw)[0].caption.map(node => node.value ?? node.children?.[0]?.value).join('')).toContain('A | B')
  })

  it('writes a box: title, colour, icon, link, width, then its text on lines of its own', () => {
    const segments = parseLayout(MAIN)
    const index = segments.findIndex(segment => segment.kind === 'box')
    const box = segments[index]
    expect(boxFields(box)).toMatchObject({ title: 'New to the archive', color: 'green', icon: 'question', link: '', wide: false })
    expect(boxFields(box).text.startsWith('Begin with')).toBe(true)
    expect(setBoxField(box, 'color', 'green').raw).toBe(box.raw)
    const wide = setBoxField(setBoxField(box, 'wide', true), 'link', 'Galaxy')
    expect(wide.raw.split('\n')[0]).toBe('{{Box|New to the archive|color=green|icon=question|link=Galaxy|wide=yes|')
    expect(blocksOf(wide.raw)[0]).toMatchObject({ type: 'box', wide: true, color: '#2f8f46', icon: 'question' })
    const odd = setBoxField(setBoxField(box, 'text', 'Speed = 5'), 'title', 'a=b')
    expect(boxFields(odd)).toMatchObject({ title: 'a=b', text: 'Speed = 5' })
  })

  it('reads and writes the links of a row', () => {
    const links = parseLayout(MAIN).find(segment => segment.kind === 'links')
    const items = linkItems(links)
    expect(items[0]).toEqual({ kind: 'page', target: 'Galaxy', label: 'About the world' })
    expect(items.at(-1)).toEqual({ kind: 'url', target: 'https://github.com/Konradiuss/stellar-archive', label: 'Source code' })
    expect(setLinkItems(links, items).raw).toBe(links.raw)
    const next = setLinkItems(links, [{ kind: 'page', target: 'Mars', label: '' }, { kind: 'page', target: 'https://x.org', label: 'X' }, { kind: 'page', target: '', label: 'none' }])
    expect(next.raw).toBe('{{Links|[[Mars]]|[https://x.org X]}}')
  })

  it('adds, moves and takes away blocks, with no empty lines piling up', () => {
    let segments = parseLayout('{{Banner|A}}\n\nIntro.\n\n{{Archive sections}}\n')
    expect(cards(segments)).toEqual(['banner', 'text', 'portal'])
    segments = appendBlock(segments, newBlock('box'))
    expect(serializeLayout(segments)).toBe('{{Banner|A}}\n\nIntro.\n\n{{Archive sections}}\n{{Box|New box|color=blue|icon=book|\nThe text of the box.\n}}\n')
    const portal = segments.findIndex(segment => segment.kind === 'portal')
    segments = moveBlock(segments, portal, -1)
    expect(cards(segments)).toEqual(['banner', 'portal', 'text', 'box'])
    expect(cards(parseLayout(serializeLayout(segments)))).toEqual(['banner', 'portal', 'text', 'box'])
    segments = removeBlock(segments, segments.findIndex(segment => segment.kind === 'text' && !isGap(segment)))
    expect(serializeLayout(segments)).not.toMatch(/\n\n\n/)
    expect(cards(segments)).toEqual(['banner', 'portal', 'box'])
    expect(moveBlock(segments, 0, -1)).toBe(segments)
  })

  it('keeps the line breaks around a text it changes', () => {
    const [, text] = parseLayout('{{Banner|A}}\n\nOld text.\n\n{{Archive sections}}')
    expect(textOfBlock(text)).toBe('Old text.')
    expect(setBlockText(text, 'New\ntext.').raw).toBe('\n\nNew\ntext.\n\n')
  })
})
