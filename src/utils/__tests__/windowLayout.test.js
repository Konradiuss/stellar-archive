import { describe, expect, it } from 'vitest'
import { computeWindowLayout, normalizeWindowState } from '../windowLayout'

const layoutOf = (minimized = [], maximized = null) => computeWindowLayout({ minimized, maximized })

describe('computeWindowLayout', () => {
  it('shows SYSTEM-VIEW on the left and the planet windows stacked on the right', () => {
    const layout = layoutOf()
    expect(layout.visible).toEqual(['system', 'data', 'visual'])
    expect(layout.taskbar).toEqual([])
    expect(layout.gridTemplateAreas).toBe('"system data" "system visual"')
    expect(layout.gridTemplateColumns).toBe('1fr 1fr')
    expect(layout.gridTemplateRows).toBe('3fr 2fr')
  })

  it('gives the whole right column to the remaining planet window', () => {
    expect(layoutOf(['data']).gridTemplateAreas).toBe('"system visual"')
    expect(layoutOf(['visual']).gridTemplateAreas).toBe('"system data"')
    expect(layoutOf(['visual']).gridTemplateRows).toBe('1fr')
  })

  it('stretches the right column when SYSTEM-VIEW is minimized', () => {
    const layout = layoutOf(['system'])
    expect(layout.gridTemplateAreas).toBe('"data" "visual"')
    expect(layout.gridTemplateColumns).toBe('1fr')
    expect(layout.taskbar).toEqual(['system'])
  })

  it('stretches SYSTEM-VIEW when both planet windows are minimized', () => {
    const layout = layoutOf(['data', 'visual'])
    expect(layout.visible).toEqual(['system'])
    expect(layout.gridTemplateAreas).toBe('"system"')
  })

  it('shows only the maximized window and moves the others to the taskbar', () => {
    const layout = layoutOf([], 'data')
    expect(layout.visible).toEqual(['data'])
    expect(layout.taskbar).toEqual(['system', 'visual'])
    expect(layout.gridTemplateAreas).toBe('"data"')
    expect(layout.maximized).toBe('data')
  })

  it('leaves an empty grid when every window is minimized', () => {
    const layout = layoutOf(['system', 'data', 'visual'])
    expect(layout.visible).toEqual([])
    expect(layout.gridTemplateAreas).toBe('none')
  })

  it('names the window left alone by the two others minimized, not a maximized one', () => {
    expect(layoutOf().alone).toBeNull()
    expect(layoutOf(['data']).alone).toBeNull()
    expect(layoutOf(['data', 'visual']).alone).toBe('system')
    expect(layoutOf(['system', 'visual']).alone).toBe('data')
    expect(layoutOf([], 'visual').alone).toBeNull()
    expect(layoutOf(['system'], 'data').alone).toBeNull()
    expect(layoutOf(['system', 'data', 'visual']).alone).toBeNull()
  })
})

describe('normalizeWindowState', () => {
  it('drops unknown ids and a maximized window from the minimized list', () => {
    expect(normalizeWindowState({ minimized: ['data', 'nope', 'data'], maximized: 'bogus' }))
      .toEqual({ minimized: ['data'], maximized: null })
    expect(normalizeWindowState({ minimized: ['visual'], maximized: 'visual' }))
      .toEqual({ minimized: [], maximized: 'visual' })
    expect(normalizeWindowState(null)).toEqual({ minimized: [], maximized: null })
  })
})

// Was: a phone split the sector screen into two columns of three small windows.
describe('one window at a time on a narrow screen', () => {
  it('shows the current window alone, the other two in the taskbar to switch to', () => {
    const state = { minimized: ['data'], maximized: 'visual' }
    const layout = computeWindowLayout(state, { single: true, current: 'data' })
    expect(layout.visible).toEqual(['data'])
    expect(layout.taskbar).toEqual(['system', 'visual'])
    expect(layout).toMatchObject({ maximized: null, alone: null, gridTemplateAreas: '"data"', gridTemplateColumns: '1fr', gridTemplateRows: '1fr' })
    expect(state).toEqual({ minimized: ['data'], maximized: 'visual' })
    expect(computeWindowLayout(state, { single: true, current: 'nope' }).visible).toEqual(['system'])
    expect(computeWindowLayout(state, { single: true }).visible).toEqual(['system'])
  })
})
