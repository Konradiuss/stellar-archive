// A script, line by line: `C:\SYSTEM>dir /w` a command at its prompt, `~Checking` a line that loads with a spinner,
// anything else a line of output (in the directory of the next prompt).

import BUILT_IN_SCRIPT from './terminal.txt?raw'

const PROMPT = /^([A-Za-z]:\\[^>]*>)(\S.*)$/
const FIRST_PATH = 'C:\\>'

export function textLines(source) {
  let text = String(source ?? '')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const lines = text.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  return lines
}

// → [{ command, text, type: 'text' | 'prompt' | 'loading', path, spinner? }]
export function parseDosScript(source) {
  const lines = textLines(source).map(row => {
    const prompt = row.match(PROMPT)
    if (prompt) return { command: prompt[2], text: prompt[1], type: 'prompt', path: prompt[1] }
    if (row.startsWith('~')) return { command: '', text: row.slice(1), type: 'loading', spinner: true, path: null }
    return { command: '', text: row, type: 'text', path: null }
  })
  let path = lines.findLast(line => line.type === 'prompt')?.path ?? FIRST_PATH
  for (let index = lines.length - 1; index >= 0; index--) {
    if (lines[index].type === 'prompt') path = lines[index].path
    else lines[index].path = path
  }
  return lines
}

export const DOS_SCRIPT = parseDosScript(BUILT_IN_SCRIPT)
