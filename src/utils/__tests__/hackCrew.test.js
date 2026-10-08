import { afterEach, describe, expect, it, vi } from 'vitest'
import { crewList, randomCrew } from '../hackCrew'
import { setStrings } from '../../i18n'

describe('the crew of the hack monitor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setStrings()
  })

  it('gathers different people from the lists, each at another post and somewhere aboard', () => {
    const crew = randomCrew()
    expect(crew).toHaveLength(20)
    expect(new Set(crew.map(member => member.name)).size).toBe(20)
    for (const { name, post, place } of crew) {
      const [first, last] = name.split(' ')
      expect(crewList('syndicate.crewFirstNames')).toContain(first)
      expect(crewList('syndicate.crewSurnames')).toContain(last)
      expect(crewList('syndicate.crewPosts')).toContain(post)
      expect(crewList('syndicate.crewPlaces')).toContain(place)
    }
    expect(crewList('syndicate.crewPlaces')).toContain('AI CORE')
    expect(new Set(crew.map(member => member.post)).size).toBe(20)
  })

  it('is another crew each time', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const first = randomCrew(6)
    Math.random.mockReturnValue(0.8)
    const second = randomCrew(6)
    expect(second.map(member => member.name)).not.toEqual(first.map(member => member.name))
  })

  it('comes from the lists of the map, as long as the shortest one', () => {
    setStrings({
      'syndicate.crewFirstNames': 'ИВАН, ПЁТР , ,ОЛЬГА',
      'syndicate.crewSurnames': 'ПЕТРОВ, СИДОРОВА, КУЗНЕЦОВ, ОРЛОВ',
      'syndicate.crewPosts': 'КЭП, ВРАЧ, ИНЖ',
      'syndicate.crewPlaces': 'МОСТИК'
    }, 'ru')
    const crew = randomCrew(20)
    expect(crew).toHaveLength(3)
    expect(crew.map(member => member.name.split(' ')[0]).sort()).toEqual(['ИВАН', 'ОЛЬГА', 'ПЁТР'])
    expect(crew.every(member => member.place === 'МОСТИК')).toBe(true)
  })
})
