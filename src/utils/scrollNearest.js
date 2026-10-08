// scrollIntoView also scrolls overflow: hidden ancestors: on short phones it moved the whole console.

function scrollingBox(element) {
  for (let box = element?.parentElement; box; box = box.parentElement) {
    const { overflowY } = getComputedStyle(box)
    if ((overflowY === 'auto' || overflowY === 'scroll') && box.scrollHeight > box.clientHeight) return box
  }
  return null
}

export function scrollIntoNearest(element) {
  const box = scrollingBox(element)
  if (!box) return
  const boxRect = box.getBoundingClientRect()
  const rect = element.getBoundingClientRect()
  if (rect.top < boxRect.top) box.scrollTop -= boxRect.top - rect.top
  else if (rect.bottom > boxRect.bottom) box.scrollTop += Math.min(rect.bottom - boxRect.bottom, rect.top - boxRect.top)
}
