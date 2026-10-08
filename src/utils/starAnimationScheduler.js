const subscribers = new Set()
const reported = new WeakSet()
let animationFrameId = null

function scheduleNextFrame() {
  if (
    animationFrameId !== null ||
    subscribers.size === 0 ||
    typeof requestAnimationFrame !== 'function' ||
    (typeof document !== 'undefined' && document.hidden)
  ) {
    return
  }

  animationFrameId = requestAnimationFrame(runFrame)
}

function runFrame(timestamp) {
  animationFrameId = null
  subscribers.forEach(callback => {
    // One broken star must not stop the others.
    try {
      callback(timestamp)
    } catch (error) {
      if (!reported.has(callback)) {
        reported.add(callback)
        console.error('A star animation failed:', error)
      }
    }
  })
  scheduleNextFrame()
}

function handleVisibilityChange() {
  if (document.hidden) {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    return
  }
  scheduleNextFrame()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

export function subscribeStarAnimation(callback) {
  subscribers.add(callback)
  scheduleNextFrame()

  return () => {
    subscribers.delete(callback)
    if (subscribers.size === 0 && animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  }
}
