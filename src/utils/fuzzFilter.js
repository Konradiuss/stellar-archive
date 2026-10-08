// After vue-bits FuzzyText: each row of pixels shifts by its own random amount. Strength comes from
// a map sprite's red channel in world space, as in Pixi's DisplacementFilter. WebGL only.

import { Filter, GlProgram, Matrix, UniformGroup } from 'pixi.js'

// Pixi's filter vertex shader plus the coordinate in the map sprite.
const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vMapCoord;

uniform highp vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uMapMatrix;

void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vMapCoord = (uMapMatrix * vec3(vTextureCoord, 1.0)).xy;
}
`

const fragment = `
in vec2 vTextureCoord;
in vec2 vMapCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uMapTexture;
// highp as in the vertex shader: the precisions must match.
uniform highp vec4 uInputSize;
uniform highp float uTime;
uniform float uIntensity;
uniform float uRange;
uniform float uFps;

highp float random(highp vec2 point) {
  return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void) {
  float amount = texture(uMapTexture, vMapCoord).r;
  highp float row = floor(vTextureCoord.y * uInputSize.y);
  highp float frame = floor(uTime * uFps);
  // As in FuzzyText: intensity * (random - 0.5) * range pixels, rounded so a
  // calm place (amount 0) does not move at all.
  float shift = floor(amount * uIntensity * (random(vec2(row, mod(frame, 997.0))) - 0.5) * uRange + 0.5);
  finalColor = texture(uTexture, vTextureCoord - vec2(shift * uInputSize.z, 0.0));
}
`

class FuzzFilter extends Filter {
  constructor({ intensity, range, fps, map }) {
    const source = map.texture.source
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: 'fuzz-filter' }),
      resources: {
        fuzzUniforms: new UniformGroup({
          uMapMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
          uTime: { value: 0, type: 'f32' },
          uIntensity: { value: intensity, type: 'f32' },
          uRange: { value: range, type: 'f32' },
          uFps: { value: fps, type: 'f32' }
        }),
        uMapTexture: source,
        uMapSampler: source.style
      },
      // Shifted rows must not be cut at the edges of the layer.
      padding: Math.ceil(intensity * range / 2) + 1
    })
    this.map = map
    map.renderable = false
  }

  apply(filterManager, input, output, clearMode) {
    filterManager.calculateSpriteMatrix(this.resources.fuzzUniforms.uniforms.uMapMatrix, this.map)
    this.resources.uMapTexture = this.map.texture.source
    filterManager.applyFilter(this, input, output, clearMode)
  }
}

/** intensity 0.18 with range 30 is about ±3 px; map: sprite whose red channel sets the jitter strength. */
export function createFuzzFilter({ intensity = 0.18, range = 30, fps = 30, map }) {
  return new FuzzFilter({ intensity, range, fps, map })
}

export function setFuzzTime(filter, seconds) {
  filter.resources.fuzzUniforms.uniforms.uTime = seconds
}
