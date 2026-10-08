//   "terminal": {
//     "script": "terminal.txt",                  the script it types (data/dosScript.js)
//     "files": { "NOTES.TXT": "notes.txt" },     files of C:\ for TYPE
//     "syndicate": false                         no SYNDICATE.EXE in C:\
//   }
// Every part is optional.

import { DOS_SCRIPT, parseDosScript, textLines } from '../data/dosScript'
import { warnMap } from './mapJournal'
import { isObject } from './guards'

const FILE_NAME = /^[^\s\\/:*?"<>|]+$/

export const DEFAULT_TERMINAL = Object.freeze({ script: DOS_SCRIPT, files: new Map(), syndicate: true })

/** → { script: path | null, files: [[NAME, path]], syndicate }; `note(level, where, message)` gets the problems. */
export function checkTerminal(raw, note) {
  const checked = { script: null, files: [], syndicate: true }
  if (raw == null) return checked
  if (!isObject(raw)) {
    note('warning', 'terminal', 'Must be an object { "script": "terminal.txt", "files": { … }, "syndicate": true }: the built-in terminal is used.')
    return checked
  }
  if (raw.script != null) {
    if (typeof raw.script === 'string' && raw.script.trim()) checked.script = raw.script.trim()
    else note('warning', 'terminal.script', 'Must be the path of a text file, such as "terminal.txt": the built-in script is used.')
  }
  if (raw.files != null) {
    if (!isObject(raw.files)) {
      note('warning', 'terminal.files', 'Must be an object { "NOTES.TXT": "notes.txt" }: the terminal has no files of the map.')
    } else {
      for (const [name, path] of Object.entries(raw.files)) {
        const where = `terminal.files.${name}`
        if (!FILE_NAME.test(name)) note('warning', where, 'A file name of DOS has no spaces and none of \\ / : * ? " < > |: left out.')
        else if (typeof path !== 'string' || !path.trim()) note('warning', where, 'Must be the path of a text file, such as "notes.txt": left out.')
        else checked.files.push([name.toUpperCase(), path.trim()])
      }
    }
  }
  if (raw.syndicate != null) {
    if (typeof raw.syndicate === 'boolean') checked.syndicate = raw.syndicate
    else note('warning', 'terminal.syndicate', 'Must be true or false, without quotes: SYNDICATE.EXE stays.')
  }
  return checked
}

/** → { script: lines, files: Map NAME → lines, syndicate }; files load relative to `baseUrl`. */
export async function prepareTerminal(checked = checkTerminal(null), { baseUrl, fetchText }) {
  const load = async (path, instead) => {
    try {
      return await fetchText(new URL(path, baseUrl).href)
    } catch (error) {
      warnMap(`file "${path}"`, `Cannot be loaded (${error?.message ?? error}): ${instead}`)
      return null
    }
  }
  const [script, ...texts] = await Promise.all([
    checked.script ? load(checked.script, 'the built-in script of the terminal is used.') : null,
    ...checked.files.map(([name, path]) => load(path, `${name} is left out of the terminal.`))
  ])
  const files = new Map()
  checked.files.forEach(([name], index) => {
    if (texts[index] != null) files.set(name, textLines(texts[index]))
  })
  return { script: script == null ? DOS_SCRIPT : parseDosScript(script), files, syndicate: checked.syndicate }
}
