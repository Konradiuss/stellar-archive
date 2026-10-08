// Traced pixel for pixel from the Syndicate Serpent picture: 50 x 64, one letter per colour.

import { createSprite, setPixel, spriteToDataUri } from './pixelArt'

export const SNAKE_COLORS = {
  K: '#000000',
  r: '#b0120a',
  R: '#dd191d'
}

export const SNAKE_ROWS = [
  '..................................................',
  '.....................KKKKKK.......................',
  '............KKKKKKKKKKKKKKKKKKKKKKK...............',
  '.........KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK...........',
  '........KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK..........',
  '......KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.K........',
  '.....KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.KKKK.....',
  '....KKKKKKKKKKKKKKKKKKKKKKKKKK.KKKKKKKKK.KKKKKK...',
  '....KKKKKKKKKK....KKKKKKKKKKKK..KKRKKKKR.KKKKKKK..',
  '...KKKKKKKrr........KKKKKKKKKKK..KRRKKRR.KKKKKKKK.',
  '...KKKKKKrrr.........KKKKKKKKKK..KKKKKKK.KKKKKKKK.',
  '..KKKKKKrrrr..........KKKKKKKKK...KKKKKK.KKKKKKKK.',
  '..KKKKKKrrr...........KKKKKKKKK...KKKKKK.KKRKKKKR.',
  '..KKKKKrrrr............KKRKKKKR....KKKKK.KKRRKKRR.',
  '..KKKKKrrrr............KKRRKKRR....KKKK...KKKKKKK.',
  '..KKKKKrrrr.............KKKKKKK......R....KKKKKKK.',
  '..KKKKKrrrr.............KKKKKKK......R.....KKKKKK.',
  '..KKKKKKrrrr.............KKKKKK......R.....KKKKKK.',
  '..KKKKKKrrrr.............KKKKKK.....R.......KKKKK.',
  '..KKKKKKKrrrr............KKKKKK.....R........KKK..',
  '..KKKKKKKKrrrr............KKKK.......RR...........',
  '...KKKKKKKKrrrr...................................',
  '...KKKKKKKKKrrrr..................................',
  '....KKKKKKKKKKrrrr................................',
  '....KKKKKKKKKKKKKrrr..............................',
  '.....KKKKKKKKKKKKKKKKK............................',
  '......KKKKKKKKKKKKKKKKKK..........................',
  '.......KKKKKKKKKKKKKKKKKKK........................',
  '........KKKKKKKKKKKKKKKKKKKK......................',
  '..........KKKKKKKKKKKKKKKKKKKKK...................',
  '............KKKKKKKKKKKKKKKKKKKKK.................',
  '..............KKKKKKKKKKKKKKKKKKKKK...............',
  '................KKKKKKKKKKKKKKKKKKKKK.............',
  '..................KKKKKKKKKKKKKKKKKKKKK...........',
  '....................KKKKKKKKKKKKKKKKKKKKK.........',
  '.......................KKKKKKKKKKKKKKKKKKK........',
  '..........................KKKKKKKKKKKKKKKKK.......',
  '............................KKKKKKKKKKKKKKKK......',
  '..............................KKKKKKKKKKKKKKK.....',
  '................................KKKKKKKKKKKKKK....',
  '..................................KKKKKKKKKKKKK...',
  '...................................KKKKKKKKKKKK...',
  '....................................KKKKKKKKKKKK..',
  '.....................................KKKKKKKKKKK..',
  '.....................................KKKKKKKKKKK..',
  '......................................KKKKKKKKKKK.',
  '......................................KKKKKKKKKKK.',
  '.K....................................KKKKKKKKKKK.',
  '.KK...................................KKKKKKKKKKK.',
  '.KK...................................KKKKKKKKKK..',
  '.KKK..................................KKKKKKKKKK..',
  '.KKKK.................................KKKKKKKKKK..',
  '..KKKK...............................KKKKKKKKKKK..',
  '..KKKKK..............................KKKKKKKKKK...',
  '...KKKKK............................KKKKKKKKKKK...',
  '...KKKKKK..........................KKKKKKKKKKK....',
  '....KKKKKKK.......................KKKKKKKKKKK.....',
  '....KKKKKKKK.....................KKKKKKKKKKK......',
  '.....KKKKKKKKK.................KKKKKKKKKKKK.......',
  '......KKKKKKKKKKKK..........KKKKKKKKKKKKKK........',
  '.......KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.........',
  '........KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK..........',
  '.........KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK...........',
  '............KKKKKKKKKKKKKKKKKKKKKKKKK.............'
]

export function snakeSprite() {
  const sprite = createSprite(SNAKE_ROWS[0].length, SNAKE_ROWS.length)
  SNAKE_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = SNAKE_COLORS[row[x]]
      if (color) setPixel(sprite, x, y, color)
    }
  })
  return sprite
}

let uri = null
export function snakeUri() {
  uri ??= spriteToDataUri(snakeSprite())
  return uri
}
