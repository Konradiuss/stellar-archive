// GitHub Pages caches files for 10 min (max-age=600), index.html too, so a build hash
// in the URL would not help. Revalidate each time: an unchanged file is a cheap 304.

export function freshFetch(url, options = {}) {
  return fetch(url, { cache: 'no-cache', ...options })
}
