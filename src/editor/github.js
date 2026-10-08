// Publishes the draft as one commit through the GitHub API (it allows CORS) with the author's token.
// The token is sent only to api.github.com, in the Authorization header.
import { base64Of, isBinaryPath, toBase64 } from './binaryFiles'

const API = 'https://api.github.com'

export class PublishError extends Error {
  constructor(key, params = {}) {
    super(key)
    this.key = key
    this.params = params
  }
}

export const REPO_NAME = /^[\w.-]+\/[\w.-]+$/

export function guessRepo({ hostname = '', pathname = '/' } = {}) {
  const owner = /^([\w-]+)\.github\.io$/i.exec(hostname)?.[1]
  if (!owner) return ''
  const first = pathname.split('/').filter(Boolean)[0]
  return `${owner}/${first && !first.includes('.') ? first : `${owner}.github.io`}`
}

export const repoPath = (folder, path) => [String(folder ?? '').replace(/^\/+|\/+$/g, ''), path].filter(Boolean).join('/')

/**
 * files: { path: text | bytes | null (delete) }; bases: { path: git sha | null } as editing began.
 * A binary file is its bytes (Uint8Array), or a data URL.
 * Returns { status: 'conflict', conflicts } if GitHub has another version (unless `overwrite`),
 * else { status: 'done', commit, url, actions }.
 */
export async function publish({ token, repo, branch = 'main', folder = 'public', files, bases = {}, message, overwrite = false, fetch: send = globalThis.fetch, log = () => {} }) {
  if (!REPO_NAME.test(repo ?? '')) throw new PublishError('editor.badRepo')
  if (!String(token ?? '').trim()) throw new PublishError('editor.noToken')
  const paths = Object.keys(files)
  if (!paths.length) throw new PublishError('editor.nothingToPublish')

  async function call(method, path, body) {
    let response
    try {
      response = await send(`${API}/repos/${repo}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token.trim()}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      })
    } catch {
      throw new PublishError('editor.network')
    }
    const data = await response.json().catch(() => ({}))
    if (response.ok) return data
    if (response.status === 401) throw new PublishError('editor.badToken')
    if (response.status === 403) throw new PublishError('editor.forbidden', { message: data.message ?? '' })
    if (response.status === 404) throw new PublishError(path ? 'editor.noBranch' : 'editor.noRepo', { repo, branch })
    if (response.status === 409 || response.status === 422) throw new PublishError('editor.branchMoved', { message: data.message ?? '' })
    throw new PublishError('editor.githubError', { status: response.status, message: data.message ?? '' })
  }

  log('editor.stepAccess', { repo })
  const about = await call('GET', '')
  if (about.permissions && !about.permissions.push) throw new PublishError('editor.noWriteAccess', { repo })

  log('editor.stepCompare', { branch })
  const ref = await call('GET', `/git/ref/heads/${encodeURIComponent(branch)}`)
  const parent = ref.object.sha
  const tree = (await call('GET', `/git/commits/${parent}`)).tree.sha
  const remote = new Map((await call('GET', `/git/trees/${tree}?recursive=1`)).tree.filter(entry => entry.type === 'blob').map(entry => [entry.path, entry.sha]))
  const conflicts = paths.filter(path => Object.hasOwn(bases, path) && (remote.get(repoPath(folder, path)) ?? null) !== bases[path])
  if (conflicts.length && !overwrite) return { status: 'conflict', conflicts }

  log('editor.stepWrite', { count: paths.length })
  // A deletion is a tree entry with sha null (skipped if GitHub lacks the file);
  // a binary file is uploaded first as a base64 blob.
  const entries = await Promise.all(paths
    .filter(path => files[path] !== null || remote.has(repoPath(folder, path)))
    .map(async path => {
      const entry = { path: repoPath(folder, path), mode: '100644', type: 'blob' }
      if (files[path] === null) return { ...entry, sha: null }
      const bytes = files[path] instanceof Uint8Array ? files[path] : null
      if (!bytes && !isBinaryPath(path)) return { ...entry, content: files[path] }
      const blob = await call('POST', '/git/blobs', { content: bytes ? toBase64(bytes) : base64Of(files[path]), encoding: 'base64' })
      return { ...entry, sha: blob.sha }
    }))
  const written = await call('POST', '/git/trees', { base_tree: tree, tree: entries })
  const commit = await call('POST', '/git/commits', { message, tree: written.sha, parents: [parent] })
  await call('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha })
  log('editor.stepDone', { commit: commit.sha.slice(0, 7) })
  return { status: 'done', commit: commit.sha, url: `https://github.com/${repo}/commit/${commit.sha}`, actions: `https://github.com/${repo}/actions` }
}
