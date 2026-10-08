// The text is laid out in CSS columns one page wide; the panel shows one column at a time.

export function pageHeight(available, lineHeight) {
  if (!(lineHeight > 0)) return Math.max(0, available)
  return Math.max(lineHeight, Math.floor(available / lineHeight) * lineHeight)
}

export function pageCount(scrollWidth, step, gap = 0) {
  if (!(step > 0)) return 1
  // n columns take n * step - gap; rounding of a few pixels must not add a page.
  return Math.max(1, Math.round((scrollWidth + gap) / step))
}

export function pageAt(offsetLeft, step) {
  if (!(step > 0)) return 0
  return Math.max(0, Math.floor(offsetLeft / step))
}

/** { top, size } as fractions of the track. */
export function pageThumb(page, pages) {
  const count = Math.max(1, pages)
  const index = Math.min(Math.max(0, page), count - 1)
  return { top: index / count, size: 1 / count }
}
