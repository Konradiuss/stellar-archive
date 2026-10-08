// SYSTEM-VIEW on the left, PLANET-DATA over PLANET-VISUAL on the right.

export const SYSTEM_WINDOWS = [
  { id: 'system', file: 'files.systemView' },
  { id: 'data', file: 'files.planetData' },
  { id: 'visual', file: 'files.planetVisual' }
]
const WINDOW_IDS = SYSTEM_WINDOWS.map(window => window.id)

export const DEFAULT_WINDOW_STATE = Object.freeze({ minimized: [], maximized: null })

// Drops unknown ids so a stale stored layout can never break the screen.
export function normalizeWindowState(state) {
  const minimized = Array.isArray(state?.minimized)
    ? WINDOW_IDS.filter(id => state.minimized.includes(id))
    : []
  const maximized = WINDOW_IDS.includes(state?.maximized) ? state.maximized : null
  return { minimized: maximized ? minimized.filter(id => id !== maximized) : minimized, maximized }
}

/**
 * `areas`/`columns`/`rows` feed CSS grid-template; `taskbar`: windows minimized or pushed out
 * by a maximized one; `alone`: the only window left because the other two are minimized.
 */
export function computeWindowLayout(state, { single = false, current = null } = {}) {
  // Narrow screen: one window at a time; the wide-screen window state is left as it is.
  if (single) {
    const shown = WINDOW_IDS.includes(current) ? current : 'system'
    return {
      visible: [shown],
      taskbar: WINDOW_IDS.filter(id => id !== shown),
      maximized: null,
      alone: null,
      gridTemplateAreas: `"${shown}"`,
      gridTemplateColumns: '1fr',
      gridTemplateRows: '1fr'
    }
  }
  const { minimized, maximized } = normalizeWindowState(state)
  const visible = maximized
    ? [maximized]
    : WINDOW_IDS.filter(id => !minimized.includes(id))
  const taskbar = WINDOW_IDS.filter(id => !visible.includes(id))

  const left = visible.includes('system')
  const right = ['data', 'visual'].filter(id => visible.includes(id))

  let areas
  let columns
  let rows
  if (!visible.length) {
    areas = []
    columns = '1fr'
    rows = '1fr'
  } else if (left && right.length) {
    columns = '1fr 1fr'
    if (right.length === 2) {
      areas = ['system data', 'system visual']
      rows = '3fr 2fr'
    } else {
      areas = [`system ${right[0]}`]
      rows = '1fr'
    }
  } else if (left) {
    areas = ['system']
    columns = '1fr'
    rows = '1fr'
  } else {
    columns = '1fr'
    areas = right
    rows = right.length === 2 ? '3fr 2fr' : '1fr'
  }

  return {
    visible,
    taskbar,
    maximized,
    alone: !maximized && visible.length === 1 ? visible[0] : null,
    gridTemplateAreas: areas.map(row => `"${row}"`).join(' ') || 'none',
    gridTemplateColumns: columns,
    gridTemplateRows: rows
  }
}
