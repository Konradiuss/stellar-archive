import { describe, expect, it } from 'vitest'
import { removeFaction, removeStar, renameStarId, setLabelColor, setStarField } from '../starEdits'
import { removeBody, setBodyField } from '../systemEdits'

const read = text => JSON.parse(text)
const MAP = JSON.stringify({
  factions: { tide: { name: 'Free Tide' }, crown: { name: 'Crown' } },
  planetTextColors: { tide: '#00ff00' },
  stars: [{ id: 'a-lyr', name: 'Vega', sectorX: 0, sectorY: 0 }, { id: 'rigel', sectorX: 1, sectorY: 0 }],
  systems: { 'a-lyr': { planets: [{ name: 'Lumen', satellites: [{ name: 'Wisp' }] }, { name: 'Ash' }] } },
  wiki: {
    articles: [
      { title: 'Vega star', place: 'a-lyr' },
      { title: 'Vega by name', place: 'Vega' },
      { title: 'Lumen', place: 'lumen' },
      { title: 'Wisp', place: 'Wisp' },
      { title: 'Rigel', place: 'rigel' },
      { title: 'Nowhere', place: 'Atlantis' }
    ]
  }
}, null, 2)
const places = text => read(text).wiki.articles.map(article => article.place)

// Was: renaming or deleting left articles tied to a place the map had no more.
describe('the places of articles follow the map', () => {
  it('follow a star to its new id and its new name', () => {
    expect(places(renameStarId(MAP, 'a-lyr', 'alpha-lyrae'))).toEqual(['alpha-lyrae', 'Vega', 'lumen', 'Wisp', 'rigel', 'Atlantis'])
    expect(places(renameStarId(MAP, 'rigel', 'rigel-b'))[4]).toBe('rigel-b')
    expect(places(setStarField(MAP, 'a-lyr', 'name', 'Wega'))).toEqual(['a-lyr', 'Wega', 'lumen', 'Wisp', 'rigel', 'Atlantis'])
    // Without a name the star goes by its id.
    expect(places(setStarField(MAP, 'a-lyr', 'name', ''))).toEqual(['a-lyr', 'a-lyr', 'lumen', 'Wisp', 'rigel', 'Atlantis'])
  })

  it('follow a planet or a moon to its new name', () => {
    expect(places(setBodyField(MAP, { star: 'a-lyr', planet: 0 }, 'name', 'Lux'))).toEqual(['a-lyr', 'Vega', 'Lux', 'Wisp', 'rigel', 'Atlantis'])
    expect(places(setBodyField(MAP, { star: 'a-lyr', planet: 0, satellite: 0 }, 'name', 'Shade'))[3]).toBe('Shade')
  })

  it('are left out with what is deleted, and kept for what is still there', () => {
    expect(places(removeStar(MAP, 'a-lyr').text)).toEqual([undefined, undefined, undefined, undefined, 'rigel', 'Atlantis'])
    // The system stays: its planets are still places.
    expect(places(removeStar(MAP, 'a-lyr', { withSystem: false }).text)).toEqual([undefined, undefined, 'lumen', 'Wisp', 'rigel', 'Atlantis'])
    expect(places(removeBody(MAP, { star: 'a-lyr', planet: 0 }).text)).toEqual(['a-lyr', 'Vega', undefined, undefined, 'rigel', 'Atlantis'])
  })

  it('drop the label colour of a deleted faction', () => {
    expect(read(removeFaction(MAP, 'tide'))).not.toHaveProperty('planetTextColors')
    expect(read(removeFaction(MAP, 'crown')).planetTextColors).toEqual({ tide: '#00ff00' })
  })

  // Was: the colour of a faction's names was set in map.json by hand only.
  it("set the colour of a faction's names, and give it back to the theme", () => {
    expect(read(setLabelColor(MAP, 'crown', '#ff0000')).planetTextColors).toEqual({ tide: '#00ff00', crown: '#ff0000' })
    expect(read(setLabelColor(MAP, 'tide', ''))).not.toHaveProperty('planetTextColors')
    const bare = setLabelColor(MAP, 'tide', '')
    expect(read(setLabelColor(bare, 'crown', '#ff0000')).planetTextColors).toEqual({ crown: '#ff0000' })
    expect(setLabelColor(MAP, 'crown', '')).toBe(MAP)
    expect(() => setLabelColor(MAP, 'nobody', '#fff')).toThrow('editor.noFaction')
  })
})
