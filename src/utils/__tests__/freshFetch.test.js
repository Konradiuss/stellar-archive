import { afterEach, describe, expect, it, vi } from 'vitest'
import { freshFetch } from '../freshFetch'

afterEach(() => vi.unstubAllGlobals())

// Was: map.json and the articles came from the browser cache, so a newly published map reached readers up to 10 minutes later.
describe('the files of the map', () => {
  it('are asked of the host each time, the address unchanged', async () => {
    const fetch = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    await freshFetch('https://owner.github.io/wiki/map.json')
    expect(fetch).toHaveBeenCalledWith('https://owner.github.io/wiki/map.json', { cache: 'no-cache' })
  })

  it('keep the other options of the caller', async () => {
    const fetch = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    const signal = new AbortController().signal
    await freshFetch('map.json', { signal })
    expect(fetch).toHaveBeenCalledWith('map.json', { cache: 'no-cache', signal })
  })
})
