export const DEFAULT_ORBIT_SPEED = 0.001

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// Radians per frame at 60 fps (the ticker multiplies it by deltaTime).
export function getOrbitSpeed(planet) {
  return finiteNumber(planet?.speed) ?? DEFAULT_ORBIT_SPEED
}

export function getInitialOrbitAngle(planet) {
  const degrees = finiteNumber(planet?.angle)
  return degrees === null ? 0 : degrees * Math.PI / 180
}

// 1 = closest to the star. Equal radii keep the data order; unknown radii go last.
export function getOrbitNumbers(planets = []) {
  const order = planets
    .map((planet, index) => ({ index, radius: finiteNumber(planet?.orbitRadius) ?? Infinity }))
    .sort((left, right) => left.radius - right.radius || left.index - right.index)
  const numbers = new Array(planets.length)
  order.forEach((entry, position) => { numbers[entry.index] = position + 1 })
  return numbers
}

const ROMAN_DIGITS = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]

export function toRoman(number) {
  if (!Number.isInteger(number) || number < 1 || number > 39) return String(number)
  let rest = number
  let result = ''
  for (const [value, digits] of ROMAN_DIGITS) {
    while (rest >= value) {
      result += digits
      rest -= value
    }
  }
  return result
}

export function plural(count, [one, other]) {
  return Math.abs(count) === 1 ? one : other
}
