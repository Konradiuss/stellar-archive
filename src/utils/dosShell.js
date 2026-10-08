import { DOS_SCRIPT } from '../data/dosScript'
import { language, t } from '../i18n'

const text = value => ({ type: 'text', text: value })
const norm = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
// 'C:\\SYSTEM>' -> 'C:\\SYSTEM'; the root keeps its backslash: 'C:\\'.
const dirOf = prompt => prompt.replace(/>$/, '')
const promptOf = dir => `${dir}>`
const programName = word => word.replace(/\.(exe|com|bat)$/, '')
const number = value => value.toLocaleString(language())

export const SECRET_PROGRAM = 'SYNDICATE.EXE'
const FREE_BYTES = 524288000

// The files of C:\ every station has: { name: size or text }.
const SYSTEM_FILES = {
  'AUTOEXEC.BAT': ['@ECHO OFF', 'PROMPT $P$G', 'PATH C:\\SYSTEM;C:\\WINDOWS\\SYSTEM32', 'LOADHIGH C:\\SYSTEM\\NETSTAT.EXE /Q', 'C:\\SYSTEM\\SYSTEMCHECK.EXE'],
  'COMMAND.COM': 54645,
  'CONFIG.SYS': ['DEVICE=C:\\SYSTEM\\HIMEM.SYS', 'DOS=HIGH,UMB', 'FILES=40', 'BUFFERS=25', 'SHELL=C:\\COMMAND.COM /P']
}
// The sizes DIR has always shown for them.
const SIZES = { 'AUTOEXEC.BAT': 412, 'CONFIG.SYS': 286, 'README.TXT': 1337, [SECRET_PROGRAM]: 666666 }

const HELP_TOPICS = [
  ['CD', 'dos.helpCd'],
  ['CLS', 'dos.helpCls'],
  ['DIR', 'dos.helpDir'],
  ['ECHO', 'dos.helpEcho'],
  ['EXIT', 'dos.helpExit'],
  ['HELP', 'dos.helpHelp'],
  ['MEM', 'dos.helpMem'],
  ['NETSTAT', 'dos.helpNetstat'],
  ['PING', 'dos.helpPing'],
  ['TELNET', 'dos.helpTelnet'],
  ['TYPE', 'dos.helpType'],
  ['VER', 'dos.helpVer'],
  ['C: D: E:', 'dos.helpDrive']
]

function helpLines(topic) {
  if (topic) {
    const found = HELP_TOPICS.find(([name]) => name.toLowerCase().split(' ').includes(topic))
    return found ? [text(`${found[0]}: ${t(found[1])}`)] : [text(t('dos.noHelp', { command: topic.toUpperCase() }))]
  }
  return [
    text(t('dos.helpIntro')),
    ...HELP_TOPICS.map(([name, key]) => text(`${name.padEnd(10)}${t(key)}`)),
    text(''),
    text(t('dos.helpPrograms'))
  ]
}

/** From the script: each command's output, DIR listings, visited dirs, the system name (first line), the volume of C. */
function readScript(script) {
  const outputs = new Map()
  const programs = new Map()
  const listings = new Map()
  const dirs = new Set(['C:\\'])
  let volume = null
  // Uppercase: a script may write 'c:\Users>', and the visitor's 'cd \users' must find it.
  const dirKey = path => dirOf(path).toUpperCase()
  script.forEach((line, index) => {
    if (line.path) {
      const parts = dirKey(line.path).replace(/\\$/, '').split('\\')
      for (let depth = 1; depth <= parts.length; depth++) {
        dirs.add(depth === 1 ? `${parts[0]}\\` : parts.slice(0, depth).join('\\'))
      }
    }
    if (line.type !== 'prompt' || !line.command) return
    const lines = []
    for (let next = index + 1; next < script.length && script[next].type !== 'prompt'; next++) {
      const { type, text: value, spinner } = script[next]
      lines.push(spinner ? { type, text: value, spinner } : { type, text: value })
    }
    const command = norm(line.command)
    const word = command.split(' ')[0]
    if (word === 'cd' || /^[a-z]:$/.test(word)) return
    if (word === 'dir') {
      const dir = dirKey(line.path)
      if (!listings.has(dir)) listings.set(dir, lines)
      const named = lines.findIndex(output => output.text.toUpperCase().includes(dir))
      if (volume === null && /^c:/i.test(dir) && named > 0) volume = lines.slice(0, named).map(output => output.text).filter(Boolean)
      return
    }
    if (!outputs.has(command)) outputs.set(command, lines)
    if (!programs.has(programName(word))) programs.set(programName(word), lines)
  })
  const system = script.find(line => line.type === 'text' && line.text.trim())?.text ?? ''
  return { outputs, programs, listings, dirs, system, volume: volume ?? [] }
}

const pad = name => name.padEnd(13)
const counts = (files, bytes, dirs) => [
  text(`      ${t('dos.fileCount', { count: files, bytes: number(bytes) })}`),
  text(`      ${t('dos.dirCount', { count: dirs, bytes: number(FREE_BYTES) })}`)
]
const sizeOf = lines => new TextEncoder().encode(lines.join('\r\n')).length

/** In DIR order: { name, size, lines? }. */
function rootFiles(files, syndicate) {
  const all = new Map(Object.entries(SYSTEM_FILES).map(([name, value]) => [name, Array.isArray(value) ? { lines: value } : { size: value }]))
  if (syndicate) {
    all.set('README.TXT', { lines: t('dos.readme', { file: SECRET_PROGRAM }).split('\n') })
    all.set(SECRET_PROGRAM, {})
  }
  // The map's own wins over a built-in file of the same name.
  for (const [name, lines] of files) all.set(name.toUpperCase(), { lines, own: true })
  return [...all].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, file]) => ({
    name,
    size: file.own ? sizeOf(file.lines) : (SIZES[name] ?? file.size ?? sizeOf(file.lines)),
    lines: file.lines
  }))
}

function rootListing(dirs, files, volume) {
  const children = [...dirs]
    .filter(dir => /^C:\\[^\\]+$/.test(dir))
    .map(dir => dir.slice(3))
    .sort()
  const entries = [...children.map(name => `[${name}]`), ...files.map(file => file.name)]
  const rows = []
  for (let at = 0; at < entries.length; at += 5) rows.push(text(entries.slice(at, at + 5).map(pad).join('').trimEnd()))
  const bytes = files.reduce((sum, file) => sum + file.size, 0)
  return [
    text(''),
    ...(volume.length ? [...volume.map(text), text('')] : []),
    text(t('dos.directoryOf', { dir: 'C:\\' })),
    text(''),
    ...rows,
    ...counts(files.length, bytes, children.length),
    text('')
  ]
}

function plainListing(dir, dirs) {
  const inside = dir.endsWith('\\') ? dir : `${dir}\\`
  const children = [...dirs].filter(other => other.startsWith(inside) && !other.slice(inside.length).includes('\\') && other !== dir)
  const names = ['[.]', '[..]', ...children.map(child => `[${child.slice(inside.length)}]`)]
  return [
    text(''),
    text(t('dos.directoryOf', { dir })),
    text(''),
    text(names.map(pad).join('').trimEnd()),
    ...counts(0, 0, children.length),
    text('')
  ]
}

// cd: an absolute ('\\SYSTEM'), relative ('SYSTEM', '..') or drive path ('D:\\SENSORS').
function resolveDir(current, target) {
  let drive = current.slice(0, 2)
  let parts = current.slice(3).split('\\').filter(Boolean)
  let path = target.replace(/\//g, '\\')
  const withDrive = path.match(/^([a-z]:)(.*)$/i)
  if (withDrive) {
    drive = withDrive[1].toUpperCase()
    path = withDrive[2] || '\\'
    if (!path.startsWith('\\')) parts = []
  }
  if (path.startsWith('\\')) parts = []
  for (const part of path.split('\\').filter(Boolean)) {
    if (part === '..') parts.pop()
    else if (part !== '.') parts.push(part.toUpperCase())
  }
  return parts.length ? `${drive}\\${parts.join('\\')}` : `${drive}\\`
}

/**
 * → { prompt, setPrompt(prompt), run(input) }. `files`: Map NAME → lines.
 * run returns { lines: [{ type: 'text'|'loading', text, spinner? }], action: null | 'cls' | 'exit' | 'syndicate' }.
 */
export function createDosShell({ script = DOS_SCRIPT, files = new Map(), syndicate = true } = {}) {
  const { outputs, programs, listings, dirs, system, volume } = readScript(script)
  let dir = 'C:\\'
  const driveDirs = new Map([...dirs].map(each => [each.slice(0, 2), `${each.slice(0, 2)}\\`]))

  const result = (lines, action = null) => ({ lines, action })
  // beep: the terminal plays the "badCommand" sound.
  const fail = lines => ({ ...result(lines), beep: true })

  function changeDir(target) {
    const next = resolveDir(dir, target)
    if (!dirs.has(next)) return fail([text(t('dos.badDirectory'))])
    dir = next
    driveDirs.set(dir.slice(0, 2), dir)
    return result([])
  }

  function run(input) {
    const command = norm(input)
    if (!command) return result([])
    const [word, ...rest] = command.split(' ')
    const argument = rest.join(' ')
    const raw = String(input).trim().replace(/\s+/g, ' ')

    if (syndicate && /^(c:\\)?syndicate(\.exe)?$/.test(command)) {
      return result([text(''), text(t('dos.runLoading', { file: SECRET_PROGRAM })), text(t('dos.runBypass')), text(t('dos.runGranted'))], 'syndicate')
    }
    if (word === 'help' || command === '/?') return result(helpLines(argument))
    if (word === 'cls') return result([], 'cls')
    if (word === 'exit') return result([], 'exit')
    if (word === 'ver') return result([text(''), text(system), text('')])
    if (word === 'echo') return result([text(argument ? raw.slice(5) : t('dos.echoOn'))])
    if (/^[a-z]:$/.test(command)) {
      const drive = command.toUpperCase()
      if (!driveDirs.has(drive)) return fail([text(t('dos.badDrive'))])
      dir = driveDirs.get(drive)
      return result([])
    }
    if (word === 'cd' || word === 'chdir' || /^cd[\\.]/.test(word)) {
      const target = word.startsWith('cd') && word.length > 2 && word !== 'chdir' ? `${word.slice(2)}${argument ? ` ${argument}` : ''}` : argument
      if (!target) return result([text(dir)])
      return changeDir(target)
    }
    if (word === 'dir') {
      if (dir === 'C:\\') return result(rootListing(dirs, rootFiles(files, syndicate), volume))
      return result(listings.get(dir) ?? plainListing(dir, dirs))
    }
    if (word === 'type') {
      if (!argument) return fail([text(t('dos.noParameter'))])
      const path = resolveDir(dir, argument)
      const file = path.startsWith('C:\\') && rootFiles(files, syndicate).find(each => each.lines && `C:\\${each.name}` === path)
      if (file) return result([text(''), ...file.lines.map(text), text('')])
      if (outputs.has(command)) return result(outputs.get(command))
      return fail([text(t('dos.noFile', { file: argument.toUpperCase() }))])
    }
    if (outputs.has(command)) return result(outputs.get(command))
    if (word === 'ping' && argument) return fail([text(''), text(t('dos.noHost', { host: argument.toUpperCase() })), text('')])
    if (word === 'telnet' && argument) return fail([text(t('dos.noConnection', { host: argument.toUpperCase() }))])
    if (programs.has(programName(word))) return result(programs.get(programName(word)))
    return fail([text(t('dos.badCommand'))])
  }

  return {
    get prompt() {
      return promptOf(dir)
    },
    setPrompt(prompt) {
      const next = dirOf(String(prompt ?? ''))
      if (!dirs.has(next)) return
      dir = next
      driveDirs.set(dir.slice(0, 2), dir)
    },
    run
  }
}
