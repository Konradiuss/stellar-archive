import { describe, expect, it } from 'vitest'
import { addTrack, moveTrack, musicPath, parseDuration, removeTrack, setTrackField, setTrackFile, titleOf } from '../musicEdits'
import { lostFiles, musicFiles, textFiles } from '../siteFiles'

const MAP = '{\n  "stars": []\n}\n'
const read = text => JSON.parse(text)
const tracks = text => read(text).music.tracks

// Was: the playlist was set in map.json by hand only.
describe('the playlist in the editor', () => {
  it('adds tracks to a map without music, then to its list', () => {
    let { text, index } = addTrack(MAP, { title: 'Codebrain', file: './music/codebrain.mp3', duration: 168, author: '' })
    expect(index).toBe(0)
    expect(read(text).music).toEqual({ tracks: [{ title: 'Codebrain', file: 'music/codebrain.mp3', duration: 168 }] })
    ;({ text, index } = addTrack(text, { file: 'https://example.org/get-set.ogg' }))
    expect(index).toBe(1)
    expect(tracks(text)[1]).toEqual({ file: 'https://example.org/get-set.ogg' })
    expect(() => addTrack(MAP, { file: 'music/notes.txt' })).toThrow('editor.badTrackFile')
    expect(() => addTrack(MAP, { file: '../music/a.mp3' })).toThrow('editor.badTrackFile')
  })

  it('sets the fields of a track and takes them back, keeping keys the site does not read', () => {
    const map = JSON.stringify({ music: { tracks: [{ file: 'music/a.mp3', mood: 'calm' }] } }, null, 2)
    let text = setTrackField(map, 0, 'title', '  Night at the Citadel ')
    text = setTrackField(text, 0, 'duration', '3:45')
    text = setTrackField(text, 0, 'url', 'https://soundcloud.com/dukegneiss')
    expect(tracks(text)[0]).toEqual({ file: 'music/a.mp3', mood: 'calm', title: 'Night at the Citadel', duration: 225, url: 'https://soundcloud.com/dukegneiss' })
    for (const field of ['title', 'duration', 'url']) text = setTrackField(text, 0, field, '')
    expect(text).toBe(map)
    expect(() => setTrackField(map, 0, 'url', 'soundcloud.com')).toThrow('editor.badTrackUrl')
    expect(() => setTrackField(map, 0, 'duration', 'long')).toThrow('editor.badDuration')
    expect(() => setTrackField(map, 0, 'duration', '0')).toThrow('editor.badDuration')
  })

  it('reads a length written as seconds or as minutes and seconds', () => {
    expect(parseDuration('225')).toBe(225)
    expect(parseDuration('3:45')).toBe(225)
    expect(parseDuration('1:02:03')).toBe(3723)
    expect(parseDuration('12,5')).toBe(12.5)
    expect(parseDuration('3:75')).toBeNull()
    expect(parseDuration('-4')).toBeNull()
    expect(parseDuration(180)).toBe(180)
  })

  it('moves a track, and deletes the files of the site the playlist no longer names', () => {
    const map = JSON.stringify({ music: { tracks: [{ file: 'music/a.mp3' }, { file: 'music/b.mp3' }, { file: 'music/a.mp3' }] } }, null, 2)
    expect(tracks(moveTrack(map, 0, 1)).map(track => track.file)).toEqual(['music/b.mp3', 'music/a.mp3', 'music/a.mp3'])
    expect(moveTrack(map, 0, -1)).toBe(map)
    // Another track still plays a.mp3.
    expect(removeTrack(map, 0).orphans).toEqual([])
    expect(removeTrack(map, 1).orphans).toEqual(['music/b.mp3'])
    expect(setTrackFile(map, 1, 'https://example.org/b.mp3').orphans).toEqual(['music/b.mp3'])
    expect(() => setTrackFile(map, 1, 'b.txt')).toThrow('editor.badTrackFile')
  })

  it('takes `music` away with its last track, unless it holds more', () => {
    const only = JSON.stringify({ stars: [], music: { tracks: [{ file: 'music/a.mp3' }] } }, null, 2)
    expect(read(removeTrack(only, 0).text)).toEqual({ stars: [] })
    const more = JSON.stringify({ music: { tracks: [{ file: 'music/a.mp3' }], note: 'mine' } }, null, 2)
    expect(read(removeTrack(more, 0).text)).toEqual({ music: { tracks: [], note: 'mine' } })
  })

  it('refuses to edit an entry that is no track, but moves and removes it', () => {
    const map = JSON.stringify({ music: { tracks: ['music/a.mp3', { file: 'music/b.mp3' }] } }, null, 2)
    expect(() => setTrackField(map, 0, 'title', 'A')).toThrow('editor.trackNotObject')
    expect(tracks(moveTrack(map, 0, 1))).toEqual([{ file: 'music/b.mp3' }, 'music/a.mp3'])
    expect(tracks(removeTrack(map, 0).text)).toEqual([{ file: 'music/b.mp3' }])
  })

  it('names an added file for what it is, beside the ones taken', () => {
    expect(musicPath('Night_at the Citadel.MP3', new Set())).toBe('music/night-at-the-citadel.mp3')
    expect(musicPath('Ночь.ogg', new Set())).toBe('music/track.ogg')
    expect(musicPath('a.wav', new Set(['music/a.wav', 'music/a-2.wav']))).toBe('music/a-3.wav')
    expect(titleOf('night_at the-citadel.mp3')).toBe('night at the citadel')
  })

  it('knows the files of the playlist apart from the files the editor reads when it opens', () => {
    const map = { music: { tracks: [{ file: 'music/a.mp3' }, { file: 'https://example.org/b.mp3' }, { title: 'none' }, 'odd'] } }
    expect(musicFiles(map)).toEqual(['music/a.mp3'])
    expect(textFiles(map).map(file => file.path)).not.toContain('music/a.mp3')
    expect(lostFiles(JSON.stringify(map), '{}')).toEqual(['music/a.mp3'])
  })
})
