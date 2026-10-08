import { describe, expect, it, vi } from 'vitest'
import { rebuildOnContextRestore } from '../webglContext'

// Was: the labels of the galaxy map and of the system came back empty with a restored WebGL context.
describe('a WebGL context that comes back', () => {
  it('builds the scene again each time, and not on the loss', () => {
    const canvas = new EventTarget()
    const rebuild = vi.fn()
    rebuildOnContextRestore(canvas, rebuild)
    canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(rebuild).not.toHaveBeenCalled()
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(rebuild).toHaveBeenCalledTimes(2)
  })

  it('stops after the unsubscribe', () => {
    const canvas = new EventTarget()
    const rebuild = vi.fn()
    rebuildOnContextRestore(canvas, rebuild)()
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(rebuild).not.toHaveBeenCalled()
  })
})
