import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeSoundConfig } from '../soundConfig'
import { mapJournal, startMapJournal } from '../../utils/mapJournal'

const MAP = 'https://owner.github.io/wiki/map.json'
const notes = () => mapJournal().map(note => `${note.where}: ${note.message}`)

describe('the sounds of a map file', () => {
  beforeEach(() => {
    startMapJournal()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('are the sounds of the site when the map says nothing', () => {
    expect(normalizeSoundConfig(undefined, MAP)).toEqual({ enabled: true, volume: null, sounds: {} })
    expect(notes()).toEqual([])
  })

  it('can all be turned off', () => {
    expect(normalizeSoundConfig(false, MAP)).toEqual({ enabled: false, volume: null, sounds: {} })
  })

  // Was: off was only `false`, written over the volume and every sound of the map.
  it('are turned off by "off", keeping their settings for when they are on again', () => {
    const config = normalizeSoundConfig({ off: true, volume: 0.2, click: 'sounds/click.wav', hover: { file: 'sounds/hover.wav', volume: 0.5, off: true } }, MAP)
    expect(config).toEqual({
      enabled: false,
      volume: 0.2,
      sounds: { click: { src: 'https://owner.github.io/wiki/sounds/click.wav' }, hover: { silent: true } }
    })
    expect(normalizeSoundConfig({ off: false }, MAP).enabled).toBe(true)
    expect(notes()).toEqual([])
    expect(normalizeSoundConfig({ off: 'yes', typing: { off: 1 } }, MAP)).toEqual({ enabled: true, volume: null, sounds: {} })
    expect(notes()).toEqual(['sounds.off: Must be true or false: left out.', 'sounds.typing.off: Must be true or false: left out.'])
  })

  it('take a file next to the map or on another site, silence, a volume of their own', () => {
    const config = normalizeSoundConfig({
      volume: 0.2,
      click: 'sounds/click.wav',
      hover: false,
      breaker: { file: 'https://cdn.example/switch.mp3', volume: 0.8 },
      typing: { volume: 0.5 }
    }, MAP)
    expect(config).toEqual({
      enabled: true,
      volume: 0.2,
      sounds: {
        click: { src: 'https://owner.github.io/wiki/sounds/click.wav' },
        hover: { silent: true },
        breaker: { src: 'https://cdn.example/switch.mp3', volume: 0.8 },
        typing: { volume: 0.5 }
      }
    })
    expect(mapJournal().map(note => [note.level, note.where])).toEqual([['info', 'sounds from cdn.example']])
  })

  it('tell the author what is wrong and keep the sound of the site for it', () => {
    const config = normalizeSoundConfig({
      volume: 2,
      clik: 'sounds/click.wav',
      click: 'javascript:alert(1)',
      hover: 3,
      breaker: { file: '//cdn.example/switch.mp3', volume: -1 }
    }, MAP)
    expect(config).toEqual({ enabled: true, volume: null, sounds: {} })
    expect(notes()).toEqual([
      'sounds.volume: Must be a number from 0 to 1: left out.',
      'sounds.clik: Is not a sound of the site: left out. The names are on the wiki page Special:Sounds.',
      'sounds.click: Bad file "javascript:alert(1)": the sound of the site is used.',
      'sounds.hover: Must be a file, false or { "file", "volume", "off" }: the sound of the site is used.',
      'sounds.breaker.file: Bad file "//cdn.example/switch.mp3": the sound of the site is used.',
      'sounds.breaker.volume: Must be a number from 0 to 1: left out.'
    ])
    expect(normalizeSoundConfig('loud', MAP)).toEqual({ enabled: true, volume: null, sounds: {} })
    expect(notes().at(-1)).toBe('sounds: Must be an object or false: the sounds of the site are used.')
  })

  // Was: an http address or a file of another site was not reported, as pictures are: the site played its own sound and nobody knew why.
  it('warn of an http file and note the files of another site once per site, as pictures', () => {
    const config = normalizeSoundConfig({
      click: 'http://cdn.example/click.wav',
      hover: 'https://cdn.example/hover.wav',
      breaker: { file: 'https://other.example/switch.mp3' },
      typing: 'sounds/typing.wav'
    }, MAP)
    expect(config.sounds.click).toEqual({ src: 'http://cdn.example/click.wav' })
    expect(mapJournal().map(note => [note.level, note.where])).toEqual([
      ['warning', 'sound "http://cdn.example/click.wav"'],
      ['info', 'sounds from cdn.example'],
      ['info', 'sounds from other.example']
    ])
    expect(notes()[1]).toMatch(/CORS/)
  })

  it('say nothing of files next to the map, nor of any when read from disk at the build', () => {
    normalizeSoundConfig({ click: 'sounds/click.wav', hover: './sounds/hover.wav' }, MAP)
    normalizeSoundConfig({ click: 'https://cdn.example/click.wav' }, 'file:///site/public/map.json')
    expect(notes()).toEqual([])
  })
})
