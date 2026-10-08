// A stored (uncompressed) ZIP is just headers and a CRC-32 per file, so no library.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// MS-DOS date and time, to two seconds.
function dosTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

/** files: [{ path, text } | { path, bytes }]; names and texts in UTF-8. */
export function zipFiles(files, date = new Date()) {
  const encoder = new TextEncoder()
  const { time, day } = dosTime(date)
  const locals = []
  const centrals = []
  let offset = 0
  for (const { path, text, bytes: raw } of files) {
    const name = encoder.encode(path)
    const data = raw ?? encoder.encode(text)
    const crc = crc32(data)
    // Version 2.0, flag bit 11 (UTF-8 names), method 0 (stored).
    const common = [[20, 2], [0x0800, 2], [0, 2], [time, 2], [day, 2], [crc, 4], [data.length, 4], [data.length, 4], [name.length, 2], [0, 2]]
    const local = bytes([[0x04034b50, 4], ...common], name, data)
    centrals.push(bytes([[0x02014b50, 4], [20, 2], ...common, [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]], name))
    locals.push(local)
    offset += local.length
  }
  const directory = concat(centrals)
  const end = bytes([[0x06054b50, 4], [0, 2], [0, 2], [files.length, 2], [files.length, 2], [directory.length, 4], [offset, 4], [0, 2]])
  return concat([...locals, directory, end])
}

// Little-endian [value, size] fields, then the byte arrays.
function bytes(numbers, ...tails) {
  const head = new Uint8Array(numbers.reduce((sum, [, size]) => sum + size, 0))
  let at = 0
  for (const [value, size] of numbers) {
    for (let index = 0; index < size; index++) head[at++] = (value >>> (8 * index)) & 0xff
  }
  return concat([head, ...tails])
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}
