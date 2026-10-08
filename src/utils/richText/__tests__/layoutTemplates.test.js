import { describe, expect, it } from 'vitest'
import { parseWikitext } from '../wikitextParser'
import { parseMarkdown } from '../markdownParser'
import { BOX_COLORS, DEFAULT_BOX_COLOR, DEFAULT_LOGO_SCALE, hasPageLayout } from '../templates'

const text = value => ({ type: 'text', value })
const blocks = source => parseWikitext(source).blocks

describe('names of the author that are properties of every object', () => {
  // Was: the parser's tables were plain objects: {{Box|icon=constructor}} broke the page and &constructor; showed a function's source.
  it('are no template, colour, entity or tag', () => {
    const [box] = blocks('{{Box|title=News|color=constructor|text=Hi}}')
    expect(box.color).toBe(DEFAULT_BOX_COLOR)
    expect(JSON.stringify(blocks('{{constructor|Foo}}'))).not.toContain('undefined')
    expect(blocks('&constructor; <constructor>x</constructor>')[0].children).toEqual([text('&constructor; <constructor>x</constructor>')])
    const [banner] = blocks('{{Banner|title=ARCHIVE|style=constructor}}')
    expect(banner.logo.style).toBe('steel')
  })
})

describe('layout templates of wiki pages', () => {
  it('reads a banner with a pixel logo, its caption and text', () => {
    const [banner] = blocks(`{{Banner
|title = ARCHIVE
|style = sunset
|colors = #ffcc00, #ff3300, blue
|outline = #200000
|shadow = no
|font = press
|scale = 20
|caption = Articles: {{NUMBEROFARTICLES}}
|text = Welcome to the [[Galaxy|archive]].
}}`)
    expect(banner.type).toBe('banner')
    expect(banner.image).toBeNull()
    expect(banner.logo).toEqual({
      text: 'ARCHIVE', style: 'sunset', colors: ['#ffcc00', '#ff3300'], outline: '#200000', shadow: false, font: 'press', scale: 12, animation: 'none'
    })
    expect(banner.frame).toBe('double')
    expect(banner.caption).toEqual([text('Articles: '), { type: 'magic', name: 'articles' }])
    expect(banner.blocks[0].children[1]).toMatchObject({ type: 'link', page: 'Galaxy' })
  })

  it('reads the frame of a banner and the animation of its logo', () => {
    const [banner] = blocks('{{Banner|title=ARCHIVE|frame=None|animation=Bounce}}')
    expect(banner.frame).toBe('none')
    expect(banner.logo.animation).toBe('bounce')
    for (const animation of ['wave', 'float', 'shine', 'flicker']) {
      expect(blocks(`{{Banner|title=A|animation=${animation}}}`)[0].logo.animation).toBe(animation)
    }
    const [unknown] = blocks('{{Banner|title=A|frame=dotted|animation=spin}}')
    expect(unknown.frame).toBe('double')
    expect(unknown.logo.animation).toBe('none')
    expect(blocks('{{Banner|title=A|frame=single}}')[0].frame).toBe('single')
  })

  it('takes a picture of the author instead of the pixel logo', () => {
    const [banner] = blocks('{{Banner|title=ARCHIVE|logo=File:logo.png|caption=Hello}}')
    expect(banner.image).toEqual({ file: 'logo.png', alt: 'logo.png' })
    expect(banner.logo).toBeNull()
    expect(banner.caption).toEqual([text('Hello')])
    expect(blocks('{{Banner|Archive}}')[0].logo).toMatchObject({ text: 'Archive', style: 'steel', font: 'tiny5', scale: DEFAULT_LOGO_SCALE, shadow: true })
  })

  it('reads a box: its title, colour, sign, link, width and any text inside', () => {
    const [box, wide] = blocks(`{{Box|Newcomers|color=green|icon=Question|link=Galaxy#History|
* [[Earth]]
* [[Mars]]
<gallery mode="tiles" widths=48px>
File:console.png|Console|link=Quantum Gates
</gallery>
}}
{{Box|title=Wide|wide=yes|color=#123456|text=Text}}`)
    expect(box).toMatchObject({ type: 'box', color: BOX_COLORS.green, icon: 'question', wide: false })
    expect(box.title).toEqual([{ type: 'link', page: 'Galaxy', section: 'History', children: [text('Newcomers')] }])
    expect(box.blocks.map(block => block.type)).toEqual(['list', 'gallery'])
    expect(box.blocks[1]).toMatchObject({ mode: 'tiles', width: 48 })
    expect(box.blocks[1].items[0].link).toEqual({ type: 'link', page: 'Quantum Gates', children: [] })
    expect(wide).toMatchObject({ type: 'box', title: [text('Wide')], color: '#123456', wide: true, icon: null })
    expect(blocks('{{Box|A|B|color=javascript:1}}')[0].color).toBe(DEFAULT_BOX_COLOR)
  })

  it('reads a row of links, a centred text and the sections of the archive', () => {
    const [links, center, portal] = blocks('{{Links|[[Galaxy]]|[[Settlement Chronicle|Chronicle]]|[https://discord.gg/x Discord]}}\n{{Center|Centered line}}\n{{Archive sections}}')
    expect(links.type).toBe('links')
    expect(links.items).toHaveLength(3)
    expect(links.items[1][0]).toMatchObject({ type: 'link', page: 'Settlement Chronicle', children: [text('Chronicle')] })
    expect(links.items[2][0]).toMatchObject({ type: 'link', href: 'https://discord.gg/x' })
    expect(center).toEqual({ type: 'center', blocks: [{ type: 'paragraph', children: [text('Centered line')] }] })
    expect(portal).toEqual({ type: 'portal' })
    expect(blocks('{{Portal sections}}')).toEqual([{ type: 'portal' }])
  })

  it('counts magic words when shown, in a line or alone', () => {
    expect(blocks('In all {{NUMBEROFPAGES}} pages and {{numberofplaces}} places.')[0].children).toEqual([
      text('In all '), { type: 'magic', name: 'pages' }, text(' pages and '), { type: 'magic', name: 'places' }, text(' places.')
    ])
    expect(blocks('{{NUMBEROFSYSTEMS}}')).toEqual([{ type: 'paragraph', children: [{ type: 'magic', name: 'systems' }] }])
    expect(blocks('{{SITENAME}}')[0].children).toEqual([{ type: 'magic', name: 'sitename' }])
  })

  it('keeps link= of a picture and the tile mode of a gallery', () => {
    const [figure] = blocks('[[File:console.png|thumb|Console|link=Earth]]')
    expect(figure).toMatchObject({ type: 'figure', link: { type: 'link', page: 'Earth' } })
    const [gallery] = blocks('<gallery>\nFile:a.png|A|link=https://example.org\n</gallery>')
    expect(gallery).toEqual({ type: 'gallery', items: [{ image: { file: 'a.png', alt: 'A' }, caption: [text('A')] }] })
  })

  it('knows a page its author laid out: then the main page adds no portal of its own', () => {
    expect(hasPageLayout(parseWikitext('{{Banner|ARCHIVE}}\nText'))).toBe(true)
    expect(hasPageLayout(parseWikitext('{{Box|A|B}}'))).toBe(true)
    expect(hasPageLayout(parseWikitext('Text\n{{Archive sections}}'))).toBe(true)
    expect(hasPageLayout(parseWikitext('World lore.\n{{Links|[[A]]}}\n{{Center|B}}'))).toBe(false)
    // The site is in English: Russian template names are not recognized.
    expect(hasPageLayout(parseWikitext('{{Баннер|АРХИВ}}\n{{Блок|А|Б}}'))).toBe(false)
    expect(hasPageLayout(null)).toBe(false)
  })

  it('knows the same templates and magic words in Markdown', () => {
    const doc = parseMarkdown('In all {{NUMBEROFARTICLES}}.\n\n{{Box|Title|Text **bold**|color=blue|icon=gear}}\n\n{{Archive sections}}')
    expect(doc.blocks[0].children).toEqual([text('In all '), { type: 'magic', name: 'articles' }, text('.')])
    expect(doc.blocks[1]).toMatchObject({ type: 'box', title: [text('Title')], color: BOX_COLORS.blue, icon: 'gear' })
    expect(doc.blocks[1].blocks[0].children[1]).toMatchObject({ type: 'strong' })
    expect(doc.blocks[2]).toEqual({ type: 'portal' })
  })
})
