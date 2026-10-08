// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SOUND_BYTES, UPLOAD_EXTENSIONS, binaryRef, binarySize, bytesOf, extensionOf, fileBytes, isBinaryPath, mimeOf, readRef, sizeText, toDataUrl } from '../binaryFiles'
import { draftFileFetch, draftKey, draftResponse, draftTracks, gitBlobSha, previewDraft, setPreview } from '../draft'
import { putBlob, useBackend } from '../blobStore'
import { memoryBackend } from './blobBackend'
import { crc32, zipFiles } from '../zip'
import { lostFiles, soundFiles, textFiles } from '../siteFiles'
import { resetSound, setSoundFile, setSoundVolume, setSoundsEnabled, setSoundsVolume, silenceSound, soundPath, soundState, soundsAreOn, unsilenceSound } from '../soundEdits'

const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 255, 128, 7])

// Was: the editor knew texts only, and an author could not put a recording of their own in place of a sound.
describe('sound files in the draft of the editor', () => {
  it('are told by their path, and named in the draft by the hash and size of their bytes', () => {
    expect(isBinaryPath('sounds/click.wav')).toBe(true)
    expect(isBinaryPath('sounds/CLICK.MP3')).toBe(true)
    expect(isBinaryPath('wiki/wav.wiki')).toBe(false)
    expect(extensionOf('my.Click.OGG')).toBe('ogg')
    expect(mimeOf('a.mp3')).toBe('audio/mpeg')
    const url = toDataUrl(WAV, 'sounds/click.wav')
    expect(url).toMatch(/^data:audio\/wav;base64,/)
    expect([...bytesOf(url)]).toEqual([...WAV])
    expect([...fileBytes('sounds/click.wav', url)]).toEqual([...WAV])
    const sha = 'ce013625030ba8dba906f756967f9e9ca394464a'
    expect(binaryRef(sha, 8)).toBe(`binary:${sha}:8`)
    expect(readRef(binaryRef(sha, 8))).toEqual({ sha, size: 8 })
    expect(readRef('binary:nope:8')).toBeNull()
    expect(readRef(null)).toBeNull()
    expect(binarySize(binaryRef(sha, 8))).toBe(8)
    expect(binarySize(url)).toBe(WAV.length)
  })

  // Was: 300 KB at most, for the draft lived in localStorage.
  it('may be 2 MB, and their size is told in KB or MB', () => {
    expect(MAX_SOUND_BYTES).toBe(2 * 1024 * 1024)
    expect(sizeText(0)).toBe('0 KB')
    expect(sizeText(310 * 1024)).toBe('310 KB')
    expect(sizeText(2.4 * 1024 * 1024)).toBe('2.4 MB')
  })

  // Was: a .m4a recording named by the map was opened, hashed and published as text.
  it('are every kind of recording a map may name, the dot of the extension included', () => {
    expect(['a.m4a', 'a.AAC', 'a.flac', 'a.webm', 'a.opus', 'a.oga'].every(isBinaryPath)).toBe(true)
    expect(mimeOf('sounds/a.m4a')).toBe('audio/mp4')
    expect(mimeOf('sounds/a.flac')).toBe('audio/flac')
    expect(mimeOf('sounds/a.opus')).toBe('audio/ogg')
    expect(isBinaryPath('sounds/xwav')).toBe(false)
    expect(isBinaryPath('sounds/a.wavs')).toBe(false)
    expect(UPLOAD_EXTENSIONS).toEqual(['wav', 'mp3', 'ogg'])
  })

  it('have the hash git gives them, from their bytes', async () => {
    // git hash-object of "hello\n".
    const hello = 'ce013625030ba8dba906f756967f9e9ca394464a'
    expect(await gitBlobSha('hello\n')).toBe(hello)
    expect(await gitBlobSha(new TextEncoder().encode('hello\n'))).toBe(hello)
    expect(await gitBlobSha(bytesOf(toDataUrl(new TextEncoder().encode('hello\n'), 'a.wav')))).toBe(hello)
  })

  it('go into a ZIP as their bytes', () => {
    const zip = zipFiles([{ path: 'sounds/click.wav', bytes: WAV }, { path: 'map.json', text: '{}' }], new Date(2026, 0, 1))
    const view = new DataView(zip.buffer)
    expect(view.getUint32(14, true)).toBe(crc32(WAV))
    expect(view.getUint32(18, true)).toBe(WAV.length)
    const at = 30 + 'sounds/click.wav'.length
    expect([...zip.slice(at, at + WAV.length)]).toEqual([...WAV])
  })
})

describe('the site previewed with the draft', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => useBackend(null))

  it('hears the sound files of the draft, and only while previewing', async () => {
    const backend = memoryBackend()
    useBackend(backend)
    const sha = await gitBlobSha(WAV)
    await putBlob(sha, new Blob([WAV]))
    // The page of the site has nothing in memory.
    useBackend(backend)
    const map = 'https://owner.github.io/site/map.json'
    const draft = {
      files: {
        'sounds/click.wav': binaryRef(sha, WAV.length),
        'sounds/old.wav': toDataUrl(WAV, 'sounds/old.wav'),
        'sounds/lost.wav': binaryRef('f'.repeat(40), 3),
        'sounds/gone.wav': null,
        'wiki/a.wiki': 'text'
      }
    }
    const answer = await draftResponse('https://owner.github.io/site/sounds/click.wav', map, draft)
    expect(answer.headers.get('content-type')).toBe('audio/wav')
    expect([...new Uint8Array(await answer.arrayBuffer())]).toEqual([...WAV])
    // A draft of before keeps its data URL.
    expect([...new Uint8Array(await (await draftResponse('https://owner.github.io/site/sounds/old.wav', map, draft)).arrayBuffer())]).toEqual([...WAV])
    // Gone from this browser: the host's file.
    expect(await draftResponse('https://owner.github.io/site/sounds/lost.wav', map, draft)).toBeNull()
    expect((await draftResponse('https://owner.github.io/site/sounds/gone.wav', map, draft)).status).toBe(404)
    expect(await draftResponse('https://owner.github.io/site/sounds/other.wav', map, draft)).toBeNull()
    expect(await draftResponse('https://owner.github.io/site/wiki/a.wiki', map, draft)).toBeNull()
    setPreview(false)
    expect(await draftResponse('https://owner.github.io/site/sounds/click.wav', map)).toBeNull()
  })

  // Was: the preview played the host's tracks: a track added in the editor had no file there yet.
  it('plays the tracks of the draft from blob: addresses, the others from the host', async () => {
    const map = 'https://owner.github.io/site/map.json'
    const draft = { files: { 'music/new.wav': toDataUrl(WAV, 'music/new.wav') }, bases: {} }
    const tracks = [{ title: 'New', src: 'https://owner.github.io/site/music/new.wav' }, { title: 'Old', src: 'https://owner.github.io/site/music/old.wav' }]
    const played = await draftTracks(tracks, map, draft)
    expect(played[0]).toEqual({ title: 'New', src: expect.stringMatching(/^blob:/) })
    expect(played[1]).toBe(tracks[1])
    expect(await draftTracks(tracks, map, null)).toBe(tracks)
  })

  // Was: each sound file of the engine parsed the whole localStorage draft again, up to 28 times on the first preview press.
  it('reads the draft once for the page, however many sound files it is asked for', async () => {
    const map = 'https://owner.github.io/site/map.json'
    localStorage.setItem(draftKey('/site/'), JSON.stringify({ files: { 'sounds/click.wav': toDataUrl(WAV, 'sounds/click.wav') }, bases: {} }))
    setPreview(true)
    const read = vi.spyOn(Storage.prototype, 'getItem')
    const host = vi.fn(async url => new Response(`host ${url}`))
    const fetchFile = draftFileFetch(host, () => map, () => previewDraft(draftKey('/site/')))
    const answers = await Promise.all(['click', 'hover', 'typing'].map(name => fetchFile(`https://owner.github.io/site/sounds/${name}.wav`)))
    expect(read.mock.calls.filter(([key]) => key.startsWith('spacemap:draft:'))).toHaveLength(1)
    read.mockRestore()
    expect([...new Uint8Array(await answers[0].arrayBuffer())]).toEqual([...WAV])
    expect(host.mock.calls.map(([url]) => url)).toEqual(['https://owner.github.io/site/sounds/hover.wav', 'https://owner.github.io/site/sounds/typing.wav'])
    setPreview(false)
  })
})

describe('the sounds of the map file in the editor', () => {
  const MAP = '{\n  "site": { "title": "X" },\n  "stars": []\n}\n'
  const read = text => JSON.parse(text)

  it('are files of the site, and a recording no sound names is deleted', () => {
    const map = { sounds: { volume: 0.5, click: 'sounds/click.wav', hover: false, breaker: { file: './sounds/b.mp3', volume: 0.8 }, menuOpen: 'https://cdn.example/x.wav' } }
    expect(soundFiles(map)).toEqual(['sounds/click.wav', 'sounds/b.mp3'])
    expect(textFiles(map).filter(file => file.kind === 'sound').map(file => file.path)).toEqual(['sounds/b.mp3', 'sounds/click.wav'])
    expect(lostFiles(JSON.stringify(map), JSON.stringify({ sounds: { click: 'sounds/click.wav' } }))).toEqual(['sounds/b.mp3'])
  })

  it('take a recording, silence and the sound of the site back, touching nothing else', () => {
    expect(soundPath('click', 'My Click.WAV')).toBe('sounds/click.wav')
    let { text } = setSoundFile(MAP, 'click', 'sounds/click.wav')
    expect(read(text).sounds).toEqual({ click: 'sounds/click.wav' })
    expect(text.startsWith('{\n  "site": { "title": "X" },\n  "stars": [],\n')).toBe(true)
    expect(soundState(read(text), 'click')).toEqual({ kind: 'file', path: 'sounds/click.wav' })

    ;({ text } = silenceSound(text, 'hover'))
    expect(soundState(read(text), 'hover')).toEqual({ kind: 'silent' })

    let orphans
    ;({ text, orphans } = setSoundFile(text, 'click', 'sounds/click.mp3'))
    expect(orphans).toEqual(['sounds/click.wav'])
    ;({ text, orphans } = resetSound(text, 'click'))
    expect(orphans).toEqual(['sounds/click.mp3'])
    ;({ text } = resetSound(text, 'hover'))
    expect(read(text).sounds).toBeUndefined()
    expect(text).toBe(MAP)
  })

  it('keep the volume of a sound when its file is replaced, and set the volume of the site', () => {
    const start = '{ "sounds": { "breaker": { "volume": 0.8 } } }'
    expect(read(setSoundFile(start, 'breaker', 'sounds/breaker.wav').text).sounds.breaker).toEqual({ file: 'sounds/breaker.wav', volume: 0.8 })
    const { text } = setSoundsVolume(MAP, 42)
    expect(read(text).sounds).toEqual({ volume: 0.42 })
    expect(setSoundsVolume(text, null).text).toBe(MAP)
  })

  // Was: "USE BUILT-IN" left the file to be deleted, and publishing removed it though the playlist played that same file.
  it('leave a file that another part of the map still names', () => {
    const shared = JSON.stringify({
      music: [{ file: './music/theme.ogg', title: 'Theme' }],
      site: { favicon: 'sounds/icon.wav' },
      sounds: { glitch: 'music/theme.ogg', click: 'sounds/click.wav', hover: 'sounds/icon.wav' }
    }, null, 2)
    expect(resetSound(shared, 'glitch').orphans).toEqual([])
    expect(resetSound(shared, 'hover').orphans).toEqual([])
    expect(resetSound(shared, 'click').orphans).toEqual(['sounds/click.wav'])
    expect(setSoundsEnabled(shared, false).orphans).toEqual([])
  })

  // Was: turning sounds off wrote `false` over the whole object: the volume, every sound of the map and their recordings were gone.
  it('are turned off for the whole site and on again with all their settings', () => {
    let { text } = setSoundFile(MAP, 'click', 'sounds/click.wav')
    ;({ text } = setSoundsVolume(text, 42))
    const { text: off, orphans } = setSoundsEnabled(text, false)
    expect(read(off).sounds).toEqual({ click: 'sounds/click.wav', volume: 0.42, off: true })
    expect(soundsAreOn(read(off))).toBe(false)
    expect(orphans).toEqual([])
    expect(setSoundsEnabled(off, true).text).toBe(text)
    // Nothing of its own to keep: the short form.
    expect(read(setSoundsEnabled(MAP, false).text).sounds).toBe(false)
    expect(setSoundsEnabled(setSoundsEnabled(MAP, false).text, true).text).toBe(MAP)
  })

  // Was: the loudness of one sound was set in map.json by hand only.
  it('set the loudness of one sound, keeping its file and its silence, in the short form when nothing else is left', () => {
    let { text } = setSoundVolume(MAP, 'hover', 40)
    expect(read(text).sounds).toEqual({ hover: { volume: 0.4 } })
    expect(setSoundVolume(text, 'hover', null).text).toBe(MAP)
    ;({ text } = setSoundFile(MAP, 'click', 'sounds/click.wav'))
    const loud = setSoundVolume(text, 'click', 150).text
    expect(read(loud).sounds.click).toEqual({ file: 'sounds/click.wav', volume: 1 })
    expect(setSoundVolume(loud, 'click', null).text).toBe(text)
    const quiet = silenceSound(MAP, 'hover').text
    expect(read(setSoundVolume(quiet, 'hover', 20).text).sounds.hover).toEqual({ off: true, volume: 0.2 })
    expect(setSoundVolume(setSoundVolume(quiet, 'hover', 20).text, 'hover', null).text).toBe(quiet)
  })

  // Was: Silence wrote `false` over the sound's own file and volume, and the file was deleted.
  it('silence a sound and give it back with its own file and volume', () => {
    let { text } = setSoundFile(MAP, 'click', 'sounds/click.wav')
    const silenced = silenceSound(text, 'click')
    expect(read(silenced.text).sounds.click).toEqual({ file: 'sounds/click.wav', off: true })
    expect(silenced.orphans).toEqual([])
    expect(soundState(read(silenced.text), 'click')).toEqual({ kind: 'silent', path: 'sounds/click.wav', volume: undefined })
    expect(unsilenceSound(silenced.text, 'click').text).toBe(text)

    const loud = '{ "sounds": { "breaker": { "file": "sounds/b.wav", "volume": 0.8 } } }'
    const quiet = silenceSound(loud, 'breaker').text
    expect(read(quiet).sounds.breaker).toEqual({ file: 'sounds/b.wav', volume: 0.8, off: true })
    expect(read(unsilenceSound(quiet, 'breaker').text).sounds.breaker).toEqual({ file: 'sounds/b.wav', volume: 0.8 })
    // A built-in sound silenced is `false`, and heard again is the built-in one.
    ;({ text } = silenceSound(MAP, 'hover'))
    expect(read(text).sounds.hover).toBe(false)
    expect(unsilenceSound(text, 'hover').text).toBe(MAP)
  })
})
