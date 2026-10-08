// "seed": "earth" (and the other names) gives a hand-made surface; the map's `size` and `ring` still apply.
// surface.type: 'map' (a real world map) | 'bands' (gas giants, Venus)
//   | 'terrain' (the usual generator with a fixed seed; optional polar caps and craters).
// `spot` (bands and terrain): an oval of its own palette, e.g. a storm or a plain.
// `palettes`: [base colour, dark colour] pairs keyed by surface part.

import { EARTH_MAP } from './earthMap'

export const PLANET_PRESETS = Object.freeze({
  mercury: {
    names: ['mercury'],
    title: 'Mercury',
    seed: 1609,
    config: { landColor: 0x8c8479, waterColor: 0x3a3632, waterAmount: 0, waterType: 'water' },
    surface: {
      type: 'terrain',
      craters: { count: 46, minRadius: 0.05, maxRadius: 0.2 },
      palettes: {
        landLow: [0x6e675e, 0x2e2a26],
        landMid: [0x8c8479, 0x3e3a34],
        landHigh: [0xaaa294, 0x565048],
        craterFloor: [0x5e5850, 0x26231f],
        craterRim: [0xbdb5a6, 0x5e584e]
      }
    }
  },

  venus: {
    names: ['venus'],
    title: 'Venus',
    seed: 1761,
    config: { landColor: 0xe0c080, waterColor: 0xc89a50, waterAmount: 0, waterType: 'acid' },
    surface: {
      type: 'bands',
      turbulence: 0.22,
      stretch: 3,
      bands: [
        [-0.7, 'haze'],
        [-0.35, 'cloudA'],
        [-0.1, 'cloudB'],
        [0.15, 'cloudA'],
        [0.45, 'cloudB'],
        [0.75, 'cloudA'],
        [1, 'haze']
      ],
      palettes: {
        cloudA: [0xf0dcaa, 0x8e7442],
        cloudB: [0xdcbc7c, 0x7e6230],
        haze: [0xc8b490, 0x6a5a3e]
      }
    }
  },

  earth: {
    names: ['earth', 'terra'],
    title: 'Earth',
    seed: 1969,
    config: { landColor: 0x3c7d33, waterColor: 0x1d4f9c, waterAmount: 0.71, waterType: 'water' },
    surface: {
      type: 'map',
      map: EARTH_MAP,
      legend: { '.': 'ocean', g: 'forest', m: 'steppe', d: 'desert', '#': 'ice' },
      clouds: { threshold: 0.34, scale: 2.6 },
      palettes: {
        ocean: [0x1d4f9c, 0x0a1f4c],
        coast: [0x2f73bd, 0x143c78],
        forest: [0x3c7d33, 0x173e17],
        steppe: [0x8a7f4e, 0x3e3820],
        desert: [0xd9b877, 0x7a5c30],
        ice: [0xf0f4ff, 0x8a96b0],
        cloud: [0xffffff, 0xaab4c4]
      }
    }
  },

  moon: {
    names: ['moon', 'luna'],
    title: 'Moon',
    seed: 1972,
    config: { landColor: 0x9a9a9a, waterColor: 0x4a4a4a, waterAmount: 0, waterType: 'water' },
    surface: {
      type: 'terrain',
      craters: { count: 38, minRadius: 0.05, maxRadius: 0.24 },
      palettes: {
        landLow: [0x5c5c60, 0x242428],
        landMid: [0x9a9a9a, 0x404044],
        landHigh: [0xbdbdbd, 0x5a5a5e],
        craterFloor: [0x7a7a7e, 0x303034],
        craterRim: [0xd4d4d4, 0x66666a]
      }
    }
  },

  mars: {
    names: ['mars'],
    title: 'Mars',
    seed: 1976,
    config: { landColor: 0xb5532c, waterColor: 0x5a2a18, waterAmount: 0, waterType: 'water' },
    surface: {
      type: 'terrain',
      polarCaps: { north: 0.88, south: 0.9 },
      craters: { count: 14, minRadius: 0.04, maxRadius: 0.1 },
      palettes: {
        landLow: [0x7a3a22, 0x351608],
        landMid: [0xb5532c, 0x552210],
        landHigh: [0xd98a56, 0x7a4022],
        craterFloor: [0x8e4426, 0x3c1a0c],
        craterRim: [0xe0a070, 0x7e4a2a],
        ice: [0xf4f0ea, 0x9a8e84]
      }
    }
  },

  phobos: {
    names: ['phobos'],
    title: 'Phobos',
    seed: 1877,
    config: { landColor: 0x5e544a, waterColor: 0x2c2722, waterAmount: 0, waterType: 'water' },
    surface: {
      type: 'terrain',
      craters: { count: 30, minRadius: 0.04, maxRadius: 0.3 },
      palettes: {
        landLow: [0x3e3832, 0x181512],
        landMid: [0x5e544a, 0x26221e],
        landHigh: [0x7a6e62, 0x34302a],
        craterFloor: [0x4a423a, 0x1c1916],
        craterRim: [0x8a7e70, 0x3c362e]
      }
    }
  },

  deimos: {
    names: ['deimos'],
    title: 'Deimos',
    seed: 1878,
    config: { landColor: 0x8a7d70, waterColor: 0x3c362e, waterAmount: 0, waterType: 'water' },
    surface: {
      type: 'terrain',
      craters: { count: 8, minRadius: 0.03, maxRadius: 0.08 },
      palettes: {
        landLow: [0x6a6056, 0x2c2824],
        landMid: [0x8a7d70, 0x3c362e],
        landHigh: [0xa89a8a, 0x4e463c],
        craterFloor: [0x786c60, 0x322c26],
        craterRim: [0xb4a696, 0x544c42]
      }
    }
  },

  jupiter: {
    names: ['jupiter'],
    title: 'Jupiter',
    seed: 1610,
    config: { landColor: 0xd8b890, waterColor: 0xb07a4e, waterAmount: 0, waterType: 'water' },
    surface: {
      type: 'bands',
      turbulence: 0.05,
      stretch: 6,
      bands: [
        [-0.84, 'polar'],
        [-0.62, 'belt'],
        [-0.46, 'zone'],
        [-0.26, 'belt'],
        [-0.08, 'zone'],
        [0.08, 'equator'],
        [0.3, 'belt'],
        [0.5, 'zone'],
        [0.64, 'belt'],
        [0.84, 'zone'],
        [1, 'polar']
      ],
      spot: { latitude: -0.36, longitude: 0.9, width: 0.36, height: 0.085, palette: 'spot' },
      palettes: {
        zone: [0xece0c4, 0x8e8266],
        belt: [0xb07a4e, 0x55341c],
        equator: [0xd8b890, 0x7c6040],
        polar: [0x9a8c7c, 0x443c34],
        spot: [0xc8553a, 0x642014]
      }
    }
  },

  saturn: {
    names: ['saturn'],
    title: 'Saturn',
    seed: 1655,
    config: {
      landColor: 0xe0cc98,
      waterColor: 0xc8b07a,
      waterAmount: 0,
      waterType: 'water',
      ring: { size: 'large', color: 0xd9c9a0 }
    },
    surface: {
      type: 'bands',
      turbulence: 0.03,
      stretch: 6,
      bands: [
        [-0.8, 'polar'],
        [-0.5, 'belt'],
        [-0.2, 'zone'],
        [0.2, 'equator'],
        [0.5, 'zone'],
        [0.8, 'belt'],
        [1, 'polar']
      ],
      palettes: {
        zone: [0xe6d6a6, 0x8a7a50],
        belt: [0xcdb57e, 0x6e5e36],
        equator: [0xf0e2b8, 0x948660],
        polar: [0xa8a88a, 0x505040]
      }
    }
  },

  uranus: {
    names: ['uranus'],
    title: 'Uranus',
    seed: 1781,
    config: {
      landColor: 0xa8dde0,
      waterColor: 0x7fc0c8,
      waterAmount: 0,
      waterType: 'water',
      ring: { size: 'thin', color: 0x5a6870 }
    },
    surface: {
      type: 'bands',
      turbulence: 0.02,
      stretch: 4,
      bands: [
        [-0.6, 'zone'],
        [0.2, 'belt'],
        [0.6, 'zone'],
        [1, 'polar']
      ],
      palettes: {
        zone: [0xa8dde0, 0x4a7a80],
        belt: [0x9cd2da, 0x426e76],
        polar: [0xc8eeee, 0x5e8a8c]
      }
    }
  },

  neptune: {
    names: ['neptune'],
    title: 'Neptune',
    seed: 1846,
    config: { landColor: 0x3a5bd0, waterColor: 0x14246a, waterAmount: 0, waterType: 'water' },
    surface: {
      type: 'bands',
      turbulence: 0.14,
      stretch: 5,
      bands: [
        [-0.8, 'polar'],
        [-0.5, 'deep'],
        [-0.18, 'zone'],
        [-0.12, 'cloud'],
        [0.3, 'deep'],
        [0.36, 'cloud'],
        [0.75, 'zone'],
        [1, 'polar']
      ],
      spot: { latitude: -0.37, longitude: 0.6, width: 0.4, height: 0.1, palette: 'spot' },
      palettes: {
        deep: [0x3a5bd0, 0x14246a],
        zone: [0x4f74e0, 0x1c3080],
        polar: [0x2f48a8, 0x101c50],
        cloud: [0xe8f0ff, 0x7a8ab8],
        spot: [0x1a2560, 0x080c28]
      }
    }
  },

  pluto: {
    names: ['pluto'],
    title: 'Pluto',
    seed: 1930,
    config: { landColor: 0xb08060, waterColor: 0x4a3020, waterAmount: 0, waterType: 'water' },
    surface: {
      type: 'terrain',
      craters: { count: 10, minRadius: 0.03, maxRadius: 0.08 },
      spot: { latitude: 0.3, longitude: 0.3, width: 0.55, height: 0.32, palette: 'heart' },
      palettes: {
        landLow: [0x6a3a28, 0x2a140c],
        landMid: [0xb08060, 0x4a3020],
        landHigh: [0xd8c0a0, 0x6a5a48],
        craterFloor: [0x8a6a50, 0x3a2a1e],
        craterRim: [0xe0ccb0, 0x6e604e],
        heart: [0xf4ead8, 0x8a8070]
      }
    }
  }
})

const PRESETS_BY_NAME = new Map(
  Object.entries(PLANET_PRESETS).flatMap(([id, preset]) => preset.names.map(name => [name, { id, ...preset }]))
)

export function findPlanetPreset(seed) {
  if (typeof seed !== 'string') return null
  return PRESETS_BY_NAME.get(seed.trim().toLowerCase()) ?? null
}
