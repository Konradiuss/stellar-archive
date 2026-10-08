import { t } from '../i18n'

export const crewList = key => t(key).split(',').map(item => item.trim()).filter(Boolean)

const shuffled = list => {
  const copy = [...list]
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

export function randomCrew(count = 20) {
  const firsts = shuffled(crewList('syndicate.crewFirstNames'))
  const lasts = shuffled(crewList('syndicate.crewSurnames'))
  const posts = shuffled(crewList('syndicate.crewPosts'))
  const places = crewList('syndicate.crewPlaces')
  const size = Math.min(count, firsts.length, lasts.length, posts.length)
  return Array.from({ length: size }, (_, index) => ({
    name: `${firsts[index]} ${lasts[index]}`,
    post: posts[index],
    place: places[Math.floor(Math.random() * places.length)] ?? ''
  }))
}
