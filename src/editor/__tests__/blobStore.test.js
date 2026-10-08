// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { freeRoom, getBlob, putBlob, remember, sweep, useBackend } from '../blobStore'
import { memoryBackend } from './blobBackend'

const SHA = name => name.padEnd(40, '0')
const text = async blob => (blob ? blob.text() : null)

// Was: the draft kept recordings as data URLs in localStorage, ~5 MB for everything, a third lost to base64.
describe('the blob store of the draft', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useBackend(null)
  })

  it('keeps the bytes in IndexedDB, for this tab and the next', async () => {
    const backend = memoryBackend()
    useBackend(backend)
    expect(await putBlob(SHA('a'), new Blob(['click']))).toBe(true)
    expect(await text(await getBlob(SHA('a')))).toBe('click')
    // Another tab, or the page reloaded: nothing in memory.
    useBackend(backend)
    expect(await text(await getBlob(SHA('a')))).toBe('click')
    expect(await getBlob(SHA('b'))).toBeNull()
  })

  it('says when the browser has no IndexedDB, and keeps the bytes for this tab', async () => {
    useBackend(null)
    expect(await putBlob(SHA('a'), new Blob(['click']))).toBe(false)
    expect(await text(await getBlob(SHA('a')))).toBe('click')
    remember(SHA('h'), new Blob(['host']))
    expect(await text(await getBlob(SHA('h')))).toBe('host')
  })

  it('takes a failing IndexedDB for none', async () => {
    const backend = memoryBackend()
    backend.put = async () => { throw new Error('QuotaExceededError') }
    backend.get = async () => { throw new Error('gone') }
    useBackend(backend)
    expect(await putBlob(SHA('a'), new Blob(['click']))).toBe(false)
    useBackend(backend)
    expect(await getBlob(SHA('a'))).toBeNull()
  })

  it('deletes what no draft names, but not what another tab put a moment ago', async () => {
    const backend = memoryBackend()
    useBackend(backend)
    const now = Date.now()
    backend.records.set(`/:${SHA('old')}`, { blob: new Blob(['old']), at: now - 60 * 60 * 1000 })
    backend.records.set(`/:${SHA('named')}`, { blob: new Blob(['named']), at: now - 60 * 60 * 1000 })
    backend.records.set(`/:${SHA('fresh')}`, { blob: new Blob(['fresh']), at: now - 1000 })
    backend.records.set(`/other/:${SHA('old')}`, { blob: new Blob(['other site']), at: 0 })
    await sweep(new Set([SHA('named')]), now)
    expect([...backend.records.keys()].sort()).toEqual([`/other/:${SHA('old')}`, `/:${SHA('fresh')}`, `/:${SHA('named')}`].sort())
  })

  it('tells the room the browser has left, or nothing when it does not say', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 1000, usage: 400 }) } })
    expect(await freeRoom()).toBe(600)
    vi.stubGlobal('navigator', {})
    expect(await freeRoom()).toBeNull()
  })
})
