import { describe, expect, it, vi } from 'vitest'
import { prepareLore } from '../lore'
import { mapJournal, startMapJournal } from '../../mapJournal'

// The parser fails on one text only, as it would on an input it cannot read.
vi.mock('../wikitextParser', async original => {
  const parser = await original()
  return {
    ...parser,
    parseWikitext: text => {
      if (text === 'BROKEN') throw new Error('the parser broke')
      return parser.parseWikitext(text)
    }
  }
})

describe('a lore text the parser cannot read', () => {
  // Was: a throw of the parser went up to loadMapData: one article left the whole map on "catalog unavailable".
  it('breaks its own page only, and the journal says which one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    startMapJournal()
    const data = {
      stars: [{ id: 'sol', name: 'Sol', lore: 'BROKEN' }, { id: 'pelagos', name: 'Pelagos', lore: 'Fine' }],
      systems: {}
    }
    await prepareLore(data, { baseUrl: 'http://localhost/map.json', fetchText: vi.fn() })
    vi.restoreAllMocks()

    expect(data.stars[0].loreDoc.blocks[0].children[0].value).toBe('[ ARCHIVE CORRUPTED: Sol ]')
    expect(data.stars[1].loreDoc.blocks[0].children[0].value).toBe('Fine')
    expect(mapJournal()).toEqual([
      { level: 'warning', where: 'lore of "Sol"', message: 'Cannot be read (the parser broke): "ARCHIVE CORRUPTED" is shown instead.' }
    ])
  })
})
