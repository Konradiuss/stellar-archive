import { describe, expect, it } from 'vitest'
import { parseWikitext } from '../wikitextParser'

const text = value => ({ type: 'text', value })
const para = (...children) => ({ type: 'paragraph', children })
const blocks = source => parseWikitext(source).blocks
const inline = source => blocks(source)[0].children

describe('parseWikitext', () => {
  it('keeps plain old lore as one paragraph', () => {
    const lore = 'Cradle of humanity. The Sol system - center of the Concord: 8 billion (2026 AD)!'
    expect(blocks(lore)).toEqual([para(text(lore))])
  })

  it('joins single line breaks and splits paragraphs on empty lines', () => {
    expect(blocks('one\ntwo\n\nthree')).toEqual([para(text('one two')), para(text('three'))])
  })

  it('reads headings, rules and bold/italic runs', () => {
    expect(blocks('== Overview ==\n=== Details ===\n----')).toEqual([
      { type: 'heading', level: 2, children: [text('Overview')] },
      { type: 'heading', level: 3, children: [text('Details')] },
      { type: 'rule' }
    ])
    expect(inline("'''b''' ''i'' '''''bi''''' x")).toEqual([
      { type: 'strong', children: [text('b')] },
      text(' '),
      { type: 'em', children: [text('i')] },
      text(' '),
      { type: 'strong', children: [{ type: 'em', children: [text('bi')] }] },
      text(' x')
    ])
  })

  it('closes bold and italic at the end of a line', () => {
    expect(blocks("'''open\nnext")).toEqual([para({ type: 'strong', children: [text('open')] }, text(' next'))])
  })

  it('keeps overlapping bold and italic', () => {
    expect(inline("'''a ''b''' c''")).toEqual([
      { type: 'strong', children: [text('a '), { type: 'em', children: [text('b')] }] },
      { type: 'em', children: [text(' c')] }
    ])
  })

  it('builds nested and mixed lists', () => {
    expect(blocks('* a\n** b\n*# c\n# d')).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [{
          children: [text('a')],
          blocks: [
            { type: 'list', ordered: false, items: [{ children: [text('b')], blocks: [] }] },
            { type: 'list', ordered: true, items: [{ children: [text('c')], blocks: [] }] }
          ]
        }]
      },
      { type: 'list', ordered: true, items: [{ children: [text('d')], blocks: [] }] }
    ])
  })

  it('reads definitions, also on one line, without splitting URLs', () => {
    expect(blocks(';Term : def\n:indent')).toEqual([{
      type: 'definitions',
      items: [
        { kind: 'term', children: [text('Term')], blocks: [] },
        { kind: 'detail', children: [text('def')], blocks: [] },
        { kind: 'detail', children: [text('indent')], blocks: [] }
      ]
    }])
    const [definition] = blocks(';See https://x.org/a')
    expect(definition.items).toHaveLength(1)
  })

  it('reads internal links with labels and word endings', () => {
    expect(inline('[[planet]]s and [[Sol|the Sun]] and [[:Category:X]]')).toEqual([
      { type: 'link', page: 'planet', children: [text('planets')] },
      text(' and '),
      { type: 'link', page: 'Sol', children: [text('the Sun')] },
      text(' and '),
      { type: 'link', page: 'Category:X', children: [text('Category:X')] }
    ])
  })

  it('keeps the section of a link, to another page or to this one', () => {
    expect(inline('[[Solar Concord#Schism]], [[Solar Concord#Schism|schism]]s and [[#Fleet]]')).toEqual([
      { type: 'link', page: 'Solar Concord', section: 'Schism', children: [text('Solar Concord')] },
      text(', '),
      { type: 'link', page: 'Solar Concord', section: 'Schism', children: [text('schisms')] },
      text(' and '),
      { type: 'link', page: '', section: 'Fleet', children: [text('Fleet')] }
    ])
    expect(inline('a [[#]] b')).toEqual([text('a  b')])
  })

  it('reads external and bare links', () => {
    expect(inline('[https://a.org site] [https://b.org] see https://c.org/x.')).toEqual([
      { type: 'link', href: 'https://a.org', children: [text('site')] },
      text(' '),
      { type: 'link', href: 'https://b.org', children: [text('https://b.org')] },
      text(' see '),
      { type: 'link', href: 'https://c.org/x', children: [text('https://c.org/x')] },
      text('.')
    ])
  })

  it('puts the page into its categories and links to a category with a colon', () => {
    expect(parseWikitext('Text [[Category:Factions]]\n[[Category:Old_wars|sort]] [[category:factions]]')).toEqual({
      blocks: [para(text('Text'))],
      categories: ['Factions', 'Old wars', 'factions']
    })
    expect(parseWikitext('no categories')).toEqual({ blocks: [para(text('no categories'))] })
    expect(inline('[[:Category:Factions|all factions]]')).toEqual([{ type: 'link', page: 'Category:Factions', children: [text('all factions')] }])
    // The site is in English: a Russian namespace is only a page name.
    expect(parseWikitext('[[Категория:Фракции]]').categories).toBeUndefined()
  })

  // Was: any 2-3 letters and a colon were taken for a language link and dropped with their label: [[War: Part 1]] vanished.
  it('keeps links whose names have a short word and a colon', () => {
    const [war, , io] = inline('[[War: Part 1]] and [[Io: Colony|the colony]]')
    expect(war).toMatchObject({ type: 'link', page: 'War: Part 1' })
    expect(io).toMatchObject({ type: 'link', page: 'Io: Colony', children: [text('the colony')] })
  })

  // Was: an unclosed {{ stopped the protection of every template after it, and they showed as raw text.
  it('reads the templates after a {{ that is never closed', () => {
    const result = blocks('{{Main|Foo}\n\n{{Stub}}')
    expect(result[0]).toEqual(para(text('{{Main|Foo}')))
    expect(result[1]).toMatchObject({ type: 'notice', kind: 'stub' })
  })

  // Was: each unclosed {{ was looked for to the end of the text, so a paste of many took time quadratic in its length.
  it('reads a text of many unclosed {{ quickly', () => {
    const started = performance.now()
    blocks('{{'.repeat(50_000))
    expect(performance.now() - started).toBeLessThan(2000)
  })

  // Was: placeholder marks (U+E000, U+E001) pasted from an icon font pointed at a wrong slot: the tab froze or the stack overflowed.
  it('reads the marks of its placeholders as plain text', () => {
    expect(blocks('{{Stub}}\nend ')).toHaveLength(2)
    expect(() => blocks('{{x|0}}')).not.toThrow()
    expect(() => blocks('9')).not.toThrow()
  })

  it('drops categories, interwiki links, comments and magic words', () => {
    expect(blocks('a [[Category:Planets]][[en:Earth]]<!-- hidden -->b __NOTOC__')).toEqual([para(text('a b'))])
  })

  it('turns thumbnails into figures and plain files into inline images', () => {
    expect(blocks('Text [[File:Earth.png|thumb|left|200px|alt=Blue|Blue [[Earth]]]] more')).toEqual([
      para(text('Text')),
      {
        type: 'figure',
        align: 'left',
        image: { file: 'Earth.png', alt: 'Blue', width: 200 },
        caption: [text('Blue '), { type: 'link', page: 'Earth', children: [text('Earth')] }]
      },
      para(text('more'))
    ])
    expect(inline('[[Image:Icon.png|32px]] x')).toEqual([
      { type: 'image', image: { file: 'Icon.png', alt: 'Icon.png', width: 32 } },
      text(' x')
    ])
  })

  it('reads tables with captions, header cells, || and colspan', () => {
    const [table] = blocks('{| class="wikitable"\n|+ Cap\n! A !! B\n|-\n| 1 || [[X|y]]\n|-\n| colspan="2" style="x" | wide\nmore\n|}')
    const cell = (header, content, colspan = 1) => ({ header, colspan, blocks: [para(...content)] })
    expect(table).toEqual({
      type: 'table',
      caption: [text('Cap')],
      rows: [
        { cells: [cell(true, [text('A')]), cell(true, [text('B')])] },
        { cells: [cell(false, [text('1')]), cell(false, [{ type: 'link', page: 'X', children: [text('y')] }])] },
        { cells: [cell(false, [text('wide more')], 2)] }
      ]
    })
  })

  it('shows unknown templates with named data on their own line as an infobox', () => {
    const [box] = blocks('{{Item\n|name = Console\n|icon = Console.png\n|desc = {{color|red|dangerous}}\n|positional}}')
    expect(box).toEqual({
      type: 'infobox',
      name: 'Item',
      params: [
        { key: 'name', children: [text('Console')] },
        { key: 'icon', children: [{ type: 'image', image: { file: 'Console.png', alt: 'Console.png' } }] },
        { key: 'desc', children: [{ type: 'color', color: 'red', children: [text('dangerous')] }] },
        { key: null, children: [text('positional')] }
      ]
    })
  })

  it('reads an unknown template without named data as its text', () => {
    expect(blocks('{{Neutral|just text}}\n{{Empty}}\nonwards')).toEqual([para(text('just text onwards'))])
  })

  it('writes notes over a section: main articles and see also', () => {
    const link = (page, shown, section) => ({ type: 'link', page, ...(section ? { section } : {}), children: [text(shown)] })
    expect(blocks('{{Main|Solar Concord#Schism}}\n{{Main article|A|B|C|l2=bee}}\n{{See also|[[none]]|Quantum_Gates}}')).toEqual([
      { type: 'hatnote', kind: 'main', children: [text('Main article: '), link('Solar Concord', 'Solar Concord § Schism', 'Schism')] },
      { type: 'hatnote', kind: 'main', children: [text('Main articles: '), link('A', 'A'), text(', '), link('B', 'bee'), text(' and '), link('C', 'C')] },
      { type: 'hatnote', kind: 'see-also', children: [text('See also: '), link('[[none]]', '[[none]]'), text(' and '), link('Quantum Gates', 'Quantum Gates')] }
    ])
    expect(blocks('{{Main}}')).toEqual([])
  })

  it('draws notice boxes with their own or the usual text', () => {
    expect(blocks("{{Stub}}\n{{Warning|Do not '''jump'''.}}\n{{Notice|text=Help}}")).toEqual([
      { type: 'notice', kind: 'stub', title: 'STUB', blocks: [para(text('This article is a stub: the archive is still growing.'))] },
      { type: 'notice', kind: 'warning', title: 'WARNING', blocks: [para(text('Do not '), { type: 'strong', children: [text('jump')] }, text('.'))] },
      { type: 'notice', kind: 'notice', title: 'NOTE', blocks: [para(text('Help'))] }
    ])
  })

  it('numbers footnotes, repeats named ones and lists them where asked', () => {
    const doc = parseWikitext('Year<ref name="year">As counted on [[Earth|the Earth]].</ref> and fleet<ref>Second.</ref>, year again<ref name="year" />.\n== Notes ==\n<references />\nend')
    const [paragraph, heading, list, last] = doc.blocks
    expect(paragraph.children).toEqual([
      text('Year'), { type: 'ref', number: 1 }, text(' and fleet'), { type: 'ref', number: 2 }, text(', year again'), { type: 'ref', number: 1 }, text('.')
    ])
    expect(heading.type).toBe('heading')
    expect(list).toEqual({
      type: 'references',
      notes: [
        { number: 1, name: 'year', children: [text('As counted on '), { type: 'link', page: 'Earth', children: [text('the Earth')] }, text('.')] },
        { number: 2, name: null, children: [text('Second.')] }
      ]
    })
    expect(last).toEqual(para(text('end')))
    expect(blocks('a<ref>n</ref>').at(-1)).toEqual({ type: 'references', notes: [{ number: 1, name: null, children: [text('n')] }] })
    expect(blocks('a<ref>n</ref>\n{{Reflist}}').map(block => block.type)).toEqual(['paragraph', 'references'])
    expect(blocks('a<ref></ref>b')).toEqual([para(text('ab'))])
    expect(blocks('a<ref name=x/>b<ref name=x>t</ref>').at(-1).notes).toEqual([{ number: 1, name: 'x', children: [text('t')] }])
  })

  it('reads galleries of files with captions', () => {
    expect(blocks('<gallery>\nFile:earth.jpg|Blue [[Earth]]\nconsole.png\nNot a picture\n</gallery>')).toEqual([{
      type: 'gallery',
      items: [
        { image: { file: 'earth.jpg', alt: 'Blue Earth' }, caption: [text('Blue '), { type: 'link', page: 'Earth', children: [text('Earth')] }] },
        { image: { file: 'console.png', alt: 'console.png' }, caption: [] }
      ]
    }])
  })

  it('expands built-in templates and keeps text of unknown inline ones', () => {
    expect(inline('a {{color|#0f0|green}} {{br}} {{Unknown|shown}} {{Stub}} {{#if:x|y}}b')).toEqual([
      text('a '),
      { type: 'color', color: '#0f0', children: [text('green')] },
      text(' '),
      { type: 'break' },
      text(' shown  b')
    ])
    expect(blocks('{{Quote|We left the cradle.|admiral}}')).toEqual([{
      type: 'quote',
      blocks: [para(text('We left the cradle.')), para(text('— '), text('admiral'))]
    }])
  })

  it('keeps nowiki and pre text literal', () => {
    expect(inline("<nowiki>'''not bold''' [[x]]</nowiki>")).toEqual([text("'''not bold''' [[x]]")])
    expect(blocks("<pre>\n'''raw'''\n</pre>")).toEqual([{ type: 'pre', text: "'''raw'''\n" }])
    expect(blocks(' leading space')).toEqual([{ type: 'pre', text: 'leading space' }])
  })

  it('supports the safe HTML subset and decodes entities', () => {
    expect(inline('<b>b</b><span style="color: #ff0">y</span><br/>&lt;tag&gt;&nbsp;&#65;')).toEqual([
      { type: 'strong', children: [text('b')] },
      { type: 'color', color: '#ff0', children: [text('y')] },
      { type: 'break' },
      text('<tag> A')
    ])
  })

  it('shows unsafe markup as text', () => {
    expect(inline('<script>alert(1)</script>')).toEqual([text('<script>alert(1)</script>')])
    expect(inline('[javascript:alert(1) click]')).toEqual([text('[javascript:alert(1) click]')])
    expect(inline('<span style="color:url(x)">t</span>')).toEqual([text('t')])
  })
})
