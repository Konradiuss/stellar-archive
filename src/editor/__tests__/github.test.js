import { describe, expect, it } from 'vitest'
import { PublishError, guessRepo, publish, repoPath } from '../github'

function fakeGitHub({ files = { 'public/map.json': 'base-map' }, push = true, status = {} } = {}) {
  const calls = []
  const send = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ method: init.method, url, body, auth: init.headers.Authorization })
    const path = url.replace('https://api.github.com/repos/owner/site', '')
    const reply = (data, code = 200) => ({ ok: code < 300, status: code, json: async () => data })
    if (status[path]) return reply({ message: 'nope' }, status[path])
    if (path === '') return reply({ permissions: { push } })
    if (path === '/git/ref/heads/main') return reply({ object: { sha: 'parent' } })
    if (path === '/git/commits/parent') return reply({ tree: { sha: 'tree' } })
    if (path === '/git/trees/tree?recursive=1') return reply({ tree: Object.entries(files).map(([file, sha]) => ({ path: file, type: 'blob', sha })) })
    if (path === '/git/blobs') return reply({ sha: 'blob-of-sound' })
    if (path === '/git/trees') return reply({ sha: 'new-tree' })
    if (path === '/git/commits') return reply({ sha: 'c0ffee1234567' })
    if (path === '/git/refs/heads/main') return reply({ ref: 'refs/heads/main' })
    return reply({}, 500)
  }
  return { calls, send }
}

const request = (send, more = {}) => publish({
  token: ' secret ',
  repo: 'owner/site',
  files: { 'map.json': '{ "stars": [] }', 'wiki/new.wiki': 'Новая статья' },
  bases: { 'map.json': 'base-map', 'wiki/new.wiki': null },
  message: 'Edit the map',
  fetch: send,
  ...more
})
const failure = async promise => promise.then(() => null, error => (error instanceof PublishError ? [error.key, error.params] : error))

describe('publishing to GitHub', () => {
  it('finds the repository of a site on GitHub Pages', () => {
    expect(guessRepo({ hostname: 'konrad.github.io', pathname: '/spacemap/' })).toBe('konrad/spacemap')
    expect(guessRepo({ hostname: 'konrad.github.io', pathname: '/spacemap/index.html' })).toBe('konrad/spacemap')
    expect(guessRepo({ hostname: 'konrad.github.io', pathname: '/' })).toBe('konrad/konrad.github.io')
    expect(guessRepo({ hostname: 'localhost', pathname: '/' })).toBe('')
    expect(repoPath('/public/', 'wiki/a.wiki')).toBe('public/wiki/a.wiki')
    expect(repoPath('', 'map.json')).toBe('map.json')
  })

  it('writes every file in one commit on the branch', async () => {
    const steps = []
    const { calls, send } = fakeGitHub()
    const result = await request(send, { log: (key, params) => steps.push(key) })
    expect(result).toEqual({ status: 'done', commit: 'c0ffee1234567', url: 'https://github.com/owner/site/commit/c0ffee1234567', actions: 'https://github.com/owner/site/actions' })
    expect(calls.map(call => `${call.method} ${call.url.replace('https://api.github.com/repos/owner/site', '')}`)).toEqual([
      'GET ', 'GET /git/ref/heads/main', 'GET /git/commits/parent', 'GET /git/trees/tree?recursive=1',
      'POST /git/trees', 'POST /git/commits', 'PATCH /git/refs/heads/main'
    ])
    expect(calls[4].body).toEqual({
      base_tree: 'tree',
      tree: [
        { path: 'public/map.json', mode: '100644', type: 'blob', content: '{ "stars": [] }' },
        { path: 'public/wiki/new.wiki', mode: '100644', type: 'blob', content: 'Новая статья' }
      ]
    })
    expect(calls[5].body).toEqual({ message: 'Edit the map', tree: 'new-tree', parents: ['parent'] })
    expect(calls[6].body).toEqual({ sha: 'c0ffee1234567' })
    expect(steps).toEqual(['editor.stepAccess', 'editor.stepCompare', 'editor.stepWrite', 'editor.stepDone'])
    // The token goes to the API only, in its header; never in an address or a body.
    for (const call of calls) {
      expect(call.url.startsWith('https://api.github.com/')).toBe(true)
      expect(call.auth).toBe('Bearer secret')
      expect(`${call.url} ${JSON.stringify(call.body)}`).not.toContain('secret')
    }
  })

  it('stops at a file changed on GitHub meanwhile, unless told to write over it', async () => {
    const changed = fakeGitHub({ files: { 'public/map.json': 'someone-else', 'public/wiki/new.wiki': 'theirs' } })
    expect(await request(changed.send)).toEqual({ status: 'conflict', conflicts: ['map.json', 'wiki/new.wiki'] })
    expect(changed.calls.some(call => call.method !== 'GET')).toBe(false)
    const forced = fakeGitHub({ files: { 'public/map.json': 'someone-else' } })
    expect((await request(forced.send, { overwrite: true })).status).toBe('done')
    const free = fakeGitHub({ files: { 'public/map.json': 'someone-else' } })
    expect((await request(free.send, { bases: {} })).status).toBe('done')
  })

  it('deletes the files of the draft that are null, if GitHub has them', async () => {
    const { calls, send } = fakeGitHub({ files: { 'public/map.json': 'base-map', 'public/wiki/old.wiki': 'old' } })
    const result = await request(send, {
      files: { 'map.json': '{}', 'wiki/old.wiki': null, 'wiki/never.wiki': null },
      bases: { 'map.json': 'base-map', 'wiki/old.wiki': 'old', 'wiki/never.wiki': null }
    })
    expect(result.status).toBe('done')
    expect(calls.find(call => call.method === 'POST' && call.url.endsWith('/git/trees')).body.tree).toEqual([
      { path: 'public/map.json', mode: '100644', type: 'blob', content: '{}' },
      { path: 'public/wiki/old.wiki', mode: '100644', type: 'blob', sha: null }
    ])
    const changed = fakeGitHub({ files: { 'public/wiki/old.wiki': 'theirs' } })
    expect(await request(changed.send, { files: { 'wiki/old.wiki': null }, bases: { 'wiki/old.wiki': 'old' } })).toEqual({ status: 'conflict', conflicts: ['wiki/old.wiki'] })
  })

  it('says why it cannot', async () => {
    expect(await failure(request(fakeGitHub({ status: { '': 401 } }).send))).toEqual(['editor.badToken', {}])
    expect(await failure(request(fakeGitHub({ status: { '': 404 } }).send))).toEqual(['editor.noRepo', { repo: 'owner/site', branch: 'main' }])
    expect(await failure(request(fakeGitHub({ status: { '/git/ref/heads/main': 404 } }).send))).toEqual(['editor.noBranch', { repo: 'owner/site', branch: 'main' }])
    expect(await failure(request(fakeGitHub({ push: false }).send))).toEqual(['editor.noWriteAccess', { repo: 'owner/site' }])
    expect(await failure(request(fakeGitHub({ status: { '/git/refs/heads/main': 422 } }).send))).toEqual(['editor.branchMoved', { message: 'nope' }])
    expect(await failure(request(async () => { throw new TypeError('Failed to fetch') }))).toEqual(['editor.network', {}])
    expect(await failure(request(fakeGitHub().send, { repo: 'not a repo' }))).toEqual(['editor.badRepo', {}])
    expect(await failure(request(fakeGitHub().send, { token: '' }))).toEqual(['editor.noToken', {}])
    expect(await failure(request(fakeGitHub().send, { files: {} }))).toEqual(['editor.nothingToPublish', {}])
  })

  // Was: the editor could publish texts only; a sound of the author's never reached the site.
  it('sends a sound as a blob of its bytes in base64, and puts its hash in the tree', async () => {
    const { calls, send } = fakeGitHub()
    await request(send, {
      files: { 'map.json': '{ "sounds": { "click": "sounds/click.wav" } }', 'sounds/click.wav': 'data:audio/wav;base64,UklGRg==' },
      bases: { 'map.json': 'base-map', 'sounds/click.wav': null }
    })
    const blob = calls.find(call => call.url.endsWith('/git/blobs'))
    expect(blob.method).toBe('POST')
    expect(blob.body).toEqual({ content: 'UklGRg==', encoding: 'base64' })
    expect(calls.find(call => call.url.endsWith('/git/trees')).body.tree).toEqual([
      { path: 'public/map.json', mode: '100644', type: 'blob', content: '{ "sounds": { "click": "sounds/click.wav" } }' },
      { path: 'public/sounds/click.wav', mode: '100644', type: 'blob', sha: 'blob-of-sound' }
    ])
  })

  it('sends the bytes of a file the editor read from its store', async () => {
    const { calls, send } = fakeGitHub()
    await request(send, {
      files: { 'sounds/click.wav': new Uint8Array([0x52, 0x49, 0x46, 0x46]) },
      bases: { 'sounds/click.wav': null }
    })
    expect(calls.find(call => call.url.endsWith('/git/blobs')).body).toEqual({ content: 'UklGRg==', encoding: 'base64' })
  })
})
