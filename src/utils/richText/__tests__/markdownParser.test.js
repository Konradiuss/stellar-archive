import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../markdownParser'

const text = value => ({ type: 'text', value })
const para = (...children) => ({ type: 'paragraph', children })
const blocks = source => parseMarkdown(source).blocks
const inline = source => blocks(source)[0].children

describe('parseMarkdown', () => {
  it('reads headings, paragraphs and soft and hard line breaks', () => {
    expect(blocks('# Title\n### Sub ###\none\ntwo  \nthree\n\nfour')).toEqual([
      { type: 'heading', level: 1, children: [text('Title')] },
      { type: 'heading', level: 3, children: [text('Sub')] },
      para(text('one two'), { type: 'break' }, text('three')),
      para(text('four'))
    ])
  })

  it('reads emphasis, strikethrough and code, but not inside words or escaped', () => {
    expect(inline('**b** *i* _i_ ***bi*** ~~s~~ `a*b` snake_case 2*3*4 \\*x\\*')).toEqual([
      { type: 'strong', children: [text('b')] },
      text(' '),
      { type: 'em', children: [text('i')] },
      text(' '),
      { type: 'em', children: [text('i')] },
      text(' '),
      { type: 'strong', children: [{ type: 'em', children: [text('bi')] }] },
      text(' '),
      { type: 'strike', children: [text('s')] },
      text(' '),
      { type: 'code', children: [text('a*b')] },
      text(' snake_case 2'),
      { type: 'em', children: [text('3')] },
      text('4 *x*')
    ])
    expect(inline('a * b and ** c')).toEqual([text('a * b and ** c')])
  })

  it('reads links: external, to map pages, autolinks and bare URLs', () => {
    expect(inline('[site](https://a.org "t") [Mars](Mars) [SR](Silent_Reach) <https://b.org> https://c.org')).toEqual([
      { type: 'link', href: 'https://a.org', children: [text('site')] },
      text(' '),
      { type: 'link', page: 'Mars', children: [text('Mars')] },
      text(' '),
      { type: 'link', page: 'Silent Reach', children: [text('SR')] },
      text(' '),
      { type: 'link', href: 'https://b.org', children: [text('https://b.org')] },
      text(' '),
      { type: 'link', href: 'https://c.org', children: [text('https://c.org')] }
    ])
  })

  it('keeps the section of a link, to another page or to this one', () => {
    expect(inline('[schism](Solar_Concord#Schism) [fleet](#Fleet) [x](Crucible%20Yard#Early%20years)')).toEqual([
      { type: 'link', page: 'Solar Concord', section: 'Schism', children: [text('schism')] },
      text(' '),
      { type: 'link', page: '', section: 'Fleet', children: [text('fleet')] },
      text(' '),
      { type: 'link', page: 'Crucible Yard', section: 'Early years', children: [text('x')] }
    ])
  })

  it('never creates links with unsafe schemes', () => {
    expect(inline('[click](javascript:alert(1))')).toEqual([text('click')])
  })

  it('turns a lone image into a figure and keeps inline ones inline', () => {
    expect(blocks('![Earth](earth.png "Blue planet")')).toEqual([{
      type: 'figure',
      align: 'center',
      image: { url: 'earth.png', alt: 'Earth', title: 'Blue planet' },
      caption: [text('Blue planet')]
    }])
    expect(inline('icon ![i](i.png) here')).toEqual([
      text('icon '),
      { type: 'image', image: { url: 'i.png', alt: 'i', title: '' } },
      text(' here')
    ])
  })

  it('builds nested lists with their own paragraphs', () => {
    expect(blocks('- a\n- b\n  - c\n    continued\n3. x\n4. y')).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [
          { children: [text('a')], blocks: [] },
          {
            children: [text('b')],
            blocks: [{ type: 'list', ordered: false, items: [{ children: [text('c continued')], blocks: [] }] }]
          }
        ]
      },
      {
        type: 'list',
        ordered: true,
        start: 3,
        items: [{ children: [text('x')], blocks: [] }, { children: [text('y')], blocks: [] }]
      }
    ])
  })

  it('reads quotes, rules and code blocks', () => {
    expect(blocks('> quoted **text**\n> more\n\n---\n```js\nconst a = 1 * 2\n```\n\n    indented code')).toEqual([
      { type: 'quote', blocks: [para(text('quoted '), { type: 'strong', children: [text('text')] }, text(' more'))] },
      { type: 'rule' },
      { type: 'pre', text: 'const a = 1 * 2' },
      { type: 'pre', text: 'indented code' }
    ])
  })

  it('reads GFM tables with alignment and escaped pipes', () => {
    const [table] = blocks('| Name | Orbit |\n|:-----|------:|\n| Earth | `a|b` |\n| Mars \\| 2 |  |')
    const cell = (header, align, children) => ({
      header,
      colspan: 1,
      align,
      blocks: children ? [para(...children)] : []
    })
    expect(table).toEqual({
      type: 'table',
      caption: null,
      rows: [
        { cells: [cell(true, 'left', [text('Name')]), cell(true, 'right', [text('Orbit')])] },
        { cells: [cell(false, 'left', [text('Earth')]), cell(false, 'right', [{ type: 'code', children: [text('a|b')] }])] },
        { cells: [cell(false, 'left', [text('Mars | 2')]), cell(false, 'right', null)] }
      ]
    })
  })

  it('writes the notes and notice boxes of the wiki on a line of their own', () => {
    expect(blocks('## History\n{{Main article|Solar_Concord#Schism}}\nText\n{{Stub}}\nand {{Main|X}} in a line')).toEqual([
      { type: 'heading', level: 2, children: [text('History')] },
      {
        type: 'hatnote',
        kind: 'main',
        children: [text('Main article: '), { type: 'link', page: 'Solar Concord', section: 'Schism', children: [text('Solar Concord § Schism')] }]
      },
      para(text('Text')),
      { type: 'notice', kind: 'stub', title: 'STUB', blocks: [para(text('This article is a stub: the archive is still growing.'))] },
      para(text('and {{Main|X}} in a line'))
    ])
    expect(blocks('{{Unknown|x}}')).toEqual([para(text('{{Unknown|x}}'))])
  })

  it('reads alerts of GitHub as notice boxes', () => {
    expect(blocks('> [!WARNING]\n> Do not **jump**.\n\n> [!note]\n> Help\n\n> [x] just a quote')).toEqual([
      { type: 'notice', kind: 'warning', title: 'WARNING', blocks: [para(text('Do not '), { type: 'strong', children: [text('jump')] }, text('.'))] },
      { type: 'notice', kind: 'notice', title: 'NOTE', blocks: [para(text('Help'))] },
      { type: 'quote', blocks: [para(text('[x] just a quote'))] }
    ])
  })

  it('numbers footnotes by first use and lists them at the end or where asked', () => {
    const doc = parseMarkdown('Year[^year] and fleet[^Fleet], again[^YEAR]. No such[^none].\n\n[^fleet]: Second\n    fleet.\n[^year]: As counted on [the Earth](Earth).\n[^unused]: Nobody links here.\n\n```\n[^year]: code\n```')
    const [paragraph, code, list] = doc.blocks
    expect(paragraph.children).toEqual([
      text('Year'), { type: 'ref', number: 1 }, text(' and fleet'), { type: 'ref', number: 2 }, text(', again'), { type: 'ref', number: 1 }, text('. No such[^none].')
    ])
    expect(code).toEqual({ type: 'pre', text: '[^year]: code' })
    expect(list).toEqual({
      type: 'references',
      notes: [
        { number: 1, name: 'year', children: [text('As counted on '), { type: 'link', page: 'Earth', children: [text('the Earth')] }, text('.')] },
        { number: 2, name: 'fleet', children: [text('Second fleet.')] }
      ]
    })
    expect(blocks('a[^1]\n\n{{References}}\n\nend\n\n[^1]: n').map(block => block.type)).toEqual(['paragraph', 'references', 'paragraph'])
    expect(blocks('no footnotes')).toEqual([para(text('no footnotes'))])
  })

  it('makes a gallery of a paragraph of images only', () => {
    expect(blocks('![Earth](earth.jpg "Blue")\n![Console](console.png)')).toEqual([{
      type: 'gallery',
      items: [
        { image: { url: 'earth.jpg', alt: 'Earth', title: 'Blue' }, caption: [text('Blue')] },
        { image: { url: 'console.png', alt: 'Console', title: '' }, caption: [] }
      ]
    }])
    expect(blocks('![a](a.png) and ![b](b.png)')[0].type).toBe('paragraph')
  })

  it('puts the page into categories written as in wikitext', () => {
    expect(parseMarkdown('Text about [[Category:Factions]] fleet.\n\n[[Category:Old_wars]] [[Category:Factions]]')).toEqual({
      blocks: [para(text('Text about  fleet.'))],
      categories: ['Factions', 'Old wars']
    })
  })

  it('shares the safe HTML subset with wikitext', () => {
    expect(inline('<span style="color:red">r</span><br><script>x</script>')).toEqual([
      { type: 'color', color: 'red', children: [text('r')] },
      { type: 'break' },
      text('<script>x</script>')
    ])
  })
})
