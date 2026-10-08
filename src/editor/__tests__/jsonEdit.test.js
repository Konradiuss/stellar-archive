import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { appendItem, inlineJson, locate, parseSpans, removeItem, removeKey, renameKey, setKey, setValue } from '../jsonEdit'

// The file may have Windows line breaks (a git checkout); the line diffs below count LF lines.
const MAP = readFileSync(new URL('../../../public/map.json', import.meta.url), 'utf8').replaceAll('\r\n', '\n')

function changedLines(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')
  let top = 0
  while (top < a.length && a[top] === b[top]) top++
  let bottom = 0
  while (bottom < a.length - top && a[a.length - 1 - bottom] === b[b.length - 1 - bottom]) bottom++
  return { removed: a.slice(top, a.length - bottom), added: b.slice(top, b.length - bottom) }
}

describe('a JSON text with the places of its values', () => {
  it('knows where each value and key is', () => {
    const text = '{ "a": [1, "x"], "b": { "c": null } }'
    const root = parseSpans(text)
    expect(root.type).toBe('object')
    const [a, b] = root.members
    expect(text.slice(a.keyStart, a.keyEnd)).toBe('"a"')
    expect(text.slice(a.node.start, a.node.end)).toBe('[1, "x"]')
    expect(text.slice(a.node.items[1].start, a.node.items[1].end)).toBe('"x"')
    expect(text.slice(b.node.start, b.node.end)).toBe('{ "c": null }')
    expect(parseSpans('﻿[]').type).toBe('array')
    for (const broken of ['{ "a": 1, }', '{ a: 1 }', '[1 2]', '{"a": 1} x', '"\\q"']) expect(() => parseSpans(broken)).toThrow()
  })

  it('reads the map of the site', () => {
    expect(parseSpans(MAP).members.map(member => member.key)).toEqual(Object.keys(JSON.parse(MAP)))
  })
})

describe('edits that touch only what they change', () => {
  const pretty = '{\n  "name": "Sol",\n  "at": { "x": 1, "y": 2 },\n  "tags": [\n    "a",\n    "b"\n  ]\n}\n'

  it('sets a value in its own style', () => {
    expect(setValue(pretty, ['at'], { x: 5, y: 6 })).toBe('{\n  "name": "Sol",\n  "at": { "x": 5, "y": 6 },\n  "tags": [\n    "a",\n    "b"\n  ]\n}\n')
    expect(setValue(pretty, ['tags', 1], 'ц')).toContain('"a",\n    "ц"\n')
    expect(setValue(pretty, ['tags'], ['z'])).toBe('{\n  "name": "Sol",\n  "at": { "x": 1, "y": 2 },\n  "tags": [\n    "z"\n  ]\n}\n')
  })

  it('adds a key at the end of an object, on a line of its own or on the same line', () => {
    expect(setKey(pretty, [], 'faction', 'concord')).toBe('{\n  "name": "Sol",\n  "at": { "x": 1, "y": 2 },\n  "tags": [\n    "a",\n    "b"\n  ],\n  "faction": "concord"\n}\n')
    expect(setKey(pretty, ['at'], 'z', 3)).toContain('"at": { "x": 1, "y": 2, "z": 3 },')
    expect(setKey(pretty, [], 'name', 'Терра')).toContain('"name": "Терра",')
    expect(setKey('{}', [], 'a', { b: 1 })).toBe('{\n  "a": {\n    "b": 1\n  }\n}')
  })

  it('adds an item in the layout of the others', () => {
    expect(appendItem(pretty, ['tags'], 'c')).toContain('"b",\n    "c"\n  ]')
    expect(appendItem('{ "list": [{ "a": 1 }] }', ['list'], { a: 2, b: [3] })).toBe('{ "list": [{ "a": 1 }, { "a": 2, "b": [3] }] }')
    expect(appendItem('[\n  {\n    "a": 1\n  }\n]', [], { a: 2 })).toBe('[\n  {\n    "a": 1\n  },\n  {\n    "a": 2\n  }\n]')
  })

  it('removes a key or an item with its comma', () => {
    expect(removeKey(pretty, [], 'at')).toBe('{\n  "name": "Sol",\n  "tags": [\n    "a",\n    "b"\n  ]\n}\n')
    expect(removeKey(pretty, [], 'name')).toBe('{\n  "at": { "x": 1, "y": 2 },\n  "tags": [\n    "a",\n    "b"\n  ]\n}\n')
    expect(removeKey(pretty, [], 'nothing')).toBe(pretty)
    expect(removeItem(pretty, ['tags'], 1)).toContain('"tags": [\n    "a"\n  ]')
    expect(removeItem('[1]', [], 0)).toBe('[]')
    for (const text of [removeKey(pretty, ['at'], 'x'), removeItem(pretty, ['tags'], 0)]) expect(() => JSON.parse(text)).not.toThrow()
  })

  it('renames a key where it is', () => {
    expect(renameKey(pretty, [], 'name', 'title')).toBe(pretty.replace('"name"', '"title"'))
    expect(() => renameKey(pretty, [], 'nothing', 'x')).toThrow()
  })

  it('changes in the map of the site only the lines of what it changes', () => {
    const sol = JSON.parse(MAP).stars.findIndex(star => star.id === 'sol')
    const renamed = setValue(MAP, ['stars', sol, 'name'], 'Солнце')
    expect(changedLines(MAP, renamed)).toEqual({ removed: ['      "name": "Sol",'], added: ['      "name": "Солнце",'] })
    const added = appendItem(MAP, ['stars'], { id: 'nova', name: 'Nova', sectorX: 0, sectorY: 0 })
    const { removed, added: lines } = changedLines(MAP, added)
    expect(removed).toEqual([])
    expect(lines).toEqual(['    },', '    {', '      "id": "nova",', '      "name": "Nova",', '      "sectorX": 0,', '      "sectorY": 0'])
    expect(JSON.parse(added).stars.at(-1)).toEqual({ id: 'nova', name: 'Nova', sectorX: 0, sectorY: 0 })
  })

  it('writes one line as people do', () => {
    expect(inlineJson({ a: [1, { b: 'c' }], d: {}, e: [], f: undefined })).toBe('{ "a": [1, { "b": "c" }], "d": {}, "e": [] }')
  })
})

describe('where a note of the map check points', () => {
  const text = '{\n  "stars": [\n    { "id": "a" },\n    { "id": "b" }\n  ],\n  "terminal": { "files": { "MY NOTES.TXT": 1, "A.TXT": 2 } }\n}'
  const at = where => {
    const found = locate(text, where)
    return found && text.slice(found.start, found.end)
  }

  it('finds the part of the text it names, from its key', () => {
    expect(at('stars[1] "b"')).toBe('{ "id": "b" }')
    expect(at('stars[1].id')).toBe('"id": "b"')
    expect(at('terminal.files.MY NOTES.TXT')).toBe('"MY NOTES.TXT": 1')
    expect(at('terminal.syndicate')).toBe('"terminal": { "files": { "MY NOTES.TXT": 1, "A.TXT": 2 } }')
    expect(at('stars[7]')).toBe('"stars": [\n    { "id": "a" },\n    { "id": "b" }\n  ]')
    expect(at('file "lost.txt"')).toBeNull()
    expect(locate('{ broken', 'stars')).toBeNull()
  })
})
