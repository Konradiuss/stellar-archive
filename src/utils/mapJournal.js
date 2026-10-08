// Shown to the author in Special:Map check; every note also goes to the console.

let journal = []
const seen = new Set()
// Set while the editor checks a draft: its notes stay out of the console.
let quiet = false

export function startMapJournal() {
  journal = []
  seen.clear()
}

/**
 * level: 'error' (a part is left out), 'warning' (a default is used) or 'info' (not a problem;
 * kept out of the console). where: e.g. 'stars[3] "Vesper"'. A repeated note is kept once.
 */
export function noteMap(level, where, message) {
  if (!quiet && level !== 'info') (level === 'error' ? console.error : console.warn)(`Map file, ${where}: ${message}`)
  const key = `${level}\n${where}\n${message}`
  if (seen.has(key)) return
  seen.add(key)
  journal.push({ level, where, message })
}

export const warnMap = (where, message) => noteMap('warning', where, message)

const LEVEL_ORDER = ['error', 'warning', 'info']

/** Errors first, info notes last. */
export function mapJournal() {
  return LEVEL_ORDER.flatMap(level => journal.filter(issue => issue.level === level))
}

export const mapProblems = notes => notes.filter(issue => issue.level !== 'info')

/** Runs `run()` with its own silent journal and returns { result, notes }; the site's journal stays. */
export function collectMapNotes(run) {
  const outer = { journal, seen: [...seen], quiet }
  startMapJournal()
  quiet = true
  try {
    const result = run()
    return { result, notes: mapJournal() }
  } finally {
    journal = outer.journal
    seen.clear()
    outer.seen.forEach(key => seen.add(key))
    quiet = outer.quiet
  }
}
