import { describe, expect, it } from 'vitest'
import { addTerminalFile, removeTerminalFile, renameTerminalFile, setLoreConfig, setPortal, setSiteField, setSyndicate, setTerminalFilePath, setTerminalScript } from '../siteEdits'
import { siteCard } from '../siteCard'

const MAP = '{\n  "stars": []\n}\n'
const read = text => JSON.parse(text)
const siteText = (...args) => setSiteField(...args).text

// Was: the site, its terminal and its wiki were set in map.json by hand only.
describe('the settings of the site in the editor', () => {
  it('set a field of the site and take it away, the empty object too', () => {
    const text = siteText(MAP, 'title', '  Atlas  ')
    expect(read(text).site).toEqual({ title: 'Atlas' })
    expect(siteText(text, 'title', '')).toBe(MAP)
    expect(read(siteText(text, 'language', 'pt-br')).site.language).toBe('pt-BR')
    expect(read(siteText(text, 'url', 'https://owner.github.io/atlas/')).site.url).toBe('https://owner.github.io/atlas/')
  })

  it('delete a picture of the site the map no longer names', () => {
    const text = siteText(MAP, 'favicon', 'favicon.png')
    expect(setSiteField(text, 'favicon', 'icons/star.gif').orphans).toEqual(['favicon.png'])
    expect(setSiteField(text, 'favicon', 'https://example.org/icon.png').orphans).toEqual(['favicon.png'])
    expect(setSiteField(siteText(text, 'preview', 'favicon.png'), 'favicon', '').orphans).toEqual([])
  })

  it('refuse what the site would not take, saying why', () => {
    expect(() => setSiteField(MAP, 'titleTemplate', '{site}')).toThrow('editor.templateNeedsPage')
    expect(() => setSiteField(MAP, 'url', 'owner.github.io')).toThrow('editor.badSiteUrl')
    expect(() => setSiteField(MAP, 'url', 'ftp://owner.github.io/')).toThrow('editor.badSiteUrl')
    expect(() => setSiteField(MAP, 'language', 'not a language')).toThrow('editor.badLanguage')
    expect(() => setLoreConfig(MAP, 'wikiUrl', 'wiki.example.org')).toThrow('editor.badWikiUrl')
    expect(() => setLoreConfig(MAP, 'images', '../pictures/')).toThrow('editor.badFilePath')
  })

  it('give the terminal a script and files of C:\\, renamed, moved and taken away with their texts', () => {
    let { text } = setTerminalScript(MAP, './terminal.txt')
    expect(read(text).terminal).toEqual({ script: 'terminal.txt' })
    const added = addTerminalFile(text, 'notes.txt', 'terminal/notes.txt')
    expect(read(added.text).terminal.files).toEqual({ 'NOTES.TXT': 'terminal/notes.txt' })
    expect(added.create).toEqual({ path: 'terminal/notes.txt', text: '' })
    text = added.text
    expect(() => addTerminalFile(text, 'Notes.TXT', 'a.txt')).toThrow('editor.dosNameTaken')
    expect(() => addTerminalFile(text, 'MY NOTES', 'a.txt')).toThrow('editor.badDosName')
    text = renameTerminalFile(text, 'NOTES.TXT', 'log.txt')
    expect(read(text).terminal.files).toEqual({ 'LOG.TXT': 'terminal/notes.txt' })
    const moved = setTerminalFilePath(text, 'LOG.TXT', 'terminal/log.txt')
    expect(moved.orphans).toEqual(['terminal/notes.txt'])
    const removed = removeTerminalFile(moved.text, 'LOG.TXT')
    expect(read(removed.text).terminal).toEqual({ script: 'terminal.txt' })
    expect(removed.orphans).toEqual(['terminal/log.txt'])
    const builtIn = setTerminalScript(removed.text, '')
    expect(builtIn.text).toBe(MAP)
    expect(builtIn.orphans).toEqual(['terminal.txt'])
  })

  it('write only what differs from what the site does anyway', () => {
    let text = setSyndicate(MAP, false)
    expect(read(text).terminal).toEqual({ syndicate: false })
    expect(setSyndicate(text, true)).toBe(MAP)
    text = setPortal(MAP, false)
    expect(read(text).wiki).toEqual({ portal: false })
    expect(setPortal(text, true)).toBe(MAP)
    text = setLoreConfig(MAP, 'format', 'markdown')
    expect(read(text).loreConfig).toEqual({ format: 'markdown' })
    expect(setLoreConfig(text, 'format', '')).toBe(MAP)
  })
})

describe('the link preview of the site in the editor', () => {
  const map = {
    site: { title: 'Atlas' },
    galaxy: { columns: 4, rows: 3 },
    stars: [{ id: 'sol', name: 'Sol', sectorX: 1, sectorY: 1 }],
    wiki: { home: 'Main', articles: [{ title: 'Main', file: 'wiki/main.wiki' }] }
  }

  it('is the card of the build, with the description the site would give', () => {
    const card = siteCard(map, path => (path === 'wiki/main.wiki' ? "'''Atlas''' maps the stars." : null))
    expect(card.title).toBe('Atlas')
    expect(card.description).toBe('Atlas maps the stars.')
    expect(card.svg).toMatch(/^<svg/)
    expect(card.svg).toContain('Atlas maps the stars.')
    const own = siteCard({ ...map, site: { title: 'Atlas', description: 'A map <of> stars.' } })
    expect(own.description).toBe('A map <of> stars.')
    expect(own.svg).toContain('A map &lt;of&gt; stars.')
    expect(siteCard({ stars: 'none' })).toBeNull()
  })
})
