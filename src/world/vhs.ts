import * as THREE from 'three';

export const MAX_FACES = 10;

/**
 * Final image treatment: the whole game looks like a worn 1980s VHS recording.
 * Runs after tone mapping, in display space. Also pixelates faces, like censored tape footage.
 */
export const VhsShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    faces: { value: Array.from({ length: MAX_FACES }, () => new THREE.Vector4()) },
    faceCount: { value: 0 },
    /** 0..1 extra distortion for dramatic moments. */
    glitch: { value: 0 },
    /** Overall strength of the tape look (0 = clean). */
    amount: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    uniform vec4 faces[${MAX_FACES}];
    uniform int faceCount;
    uniform float glitch;
    uniform float amount;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    vec2 barrel(vec2 uv, float k) {
      vec2 c = uv - 0.5;
      return 0.5 + c * (1.0 + k * dot(c, c));
    }

    // Faces are ellipses (xy centre, zw radii, in uv). Inside one, snap to a coarse grid.
    vec2 censor(vec2 uv) {
      for (int i = 0; i < ${MAX_FACES}; i++) {
        if (i >= faceCount) break;
        vec4 f = faces[i];
        vec2 d = (uv - f.xy) / f.zw;
        if (dot(d, d) < 1.0) {
          float block = max(5.0, f.z * resolution.x / 3.2);
          vec2 px = (uv - f.xy) * resolution;
          px = (floor(px / block) + 0.5) * block;
          return f.xy + px / resolution;
        }
      }
      return uv;
    }

    vec3 rgb2yiq(vec3 c) {
      return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
    }
    vec3 yiq2rgb(vec3 c) {
      return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z);
    }

    // The face mosaic is looked up once per pixel; every other tap reuses its offset.
    vec2 shift = vec2(0.0);
    vec3 tap(vec2 uv) { return texture2D(tDiffuse, uv + shift).rgb; }

    void main() {
      float a = amount;
      vec2 uv = barrel(vUv, 0.08 * a);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

      float line = floor(uv.y * resolution.y * 0.5);
      float frame = floor(time * 30.0);
      // Per-line jitter, a rolling tracking band and the head-switching noise at the bottom.
      float jitter = (hash(vec2(line, frame)) - 0.5) * 0.0005 * a;
      // The tracking band only rolls through now and then (about every 25 s) instead of all the time.
      float cycle = fract(time / 25.0);
      float bandY = 1.15 - cycle * 6.0;
      float band = exp(-pow((uv.y - bandY) * 30.0, 2.0)) * step(cycle, 0.25);
      float headSwitch = smoothstep(0.018, 0.0, uv.y) * a;
      float g = glitch;
      uv.x += jitter + band * (hash(vec2(frame, line)) - 0.5) * 0.006 * a + headSwitch * 0.015 * (hash(vec2(line, frame * 1.3)) - 0.2);
      uv.x += g * (hash(vec2(floor(uv.y * 24.0), frame)) - 0.5) * 0.06;

      shift = censor(uv) - uv;
      // Low chroma resolution: luma is sharp, colour smears sideways.
      vec2 px = vec2(1.0 / resolution.x, 0.0);
      vec3 center = rgb2yiq(tap(uv));
      vec3 chroma = vec3(0.0);
      float wsum = 0.0;
      for (int i = -3; i <= 3; i++) {
        float w = 1.0 - abs(float(i)) / 4.0;
        chroma += rgb2yiq(tap(uv + px * float(i) * 1.1 * a - px * 0.8 * a)) * w;
        wsum += w;
      }
      chroma /= wsum;
      vec3 col = yiq2rgb(vec3(center.x, chroma.y, chroma.z));

      // Chromatic aberration towards the edges.
      vec2 off = (uv - 0.5) * 0.0035 * a + vec2(0.0008 * a, 0.0);
      col.r = mix(col.r, tap(uv + off).r, 0.5);
      col.b = mix(col.b, tap(uv - off).b, 0.5);

      // Grade: lifted blacks, cool shadows, warm highlights, a bit washed out.
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, 0.9);
      col = mix(col, col * vec3(0.86, 0.95, 1.12), (1.0 - smoothstep(0.0, 0.45, luma)) * a);
      col = mix(col, col * vec3(1.08, 1.0, 0.9), smoothstep(0.5, 1.0, luma) * a);
      col = col * (1.0 - 0.05 * a) + 0.035 * a;

      // Scanlines, grain and dropouts.
      col *= 1.0 - 0.035 * a * (0.5 + 0.5 * sin(uv.y * resolution.y * 3.14159));
      col += (hash(uv * resolution + time * 60.0) - 0.5) * 0.055 * a;
      // White dropout streaks: rare, and mostly when the tape is disturbed.
      float drop = step(0.99985 - g * 0.01, hash(vec2(line * 0.37, frame)));
      col = mix(col, vec3(0.85), drop * step(0.8, hash(vec2(uv.x * 40.0, frame))) * a);
      col += band * 0.025 * a;
      col = mix(col, vec3(hash(vec2(uv.x * 400.0, frame + line))), headSwitch * 0.3);

      // Vignette.
      vec2 v = vUv - 0.5;
      col *= 1.0 - dot(v, v) * 1.3 * a;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

/** Projects people's faces to screen ellipses for the censor effect. */
export function faceEllipses(
  camera: THREE.PerspectiveCamera,
  heads: THREE.Vector3[],
  out: THREE.Vector4[],
): number {
  let n = 0;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const tmp = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const camPos = camera.getWorldPosition(new THREE.Vector3());
  for (const h of heads) {
    if (n >= out.length) break;
    tmp.copy(h).project(camera);
    if (tmp.z > 1 || tmp.z < -1 || Math.abs(tmp.x) > 1.3 || Math.abs(tmp.y) > 1.3) continue;
    if (h.distanceTo(camPos) < 0.25) continue;
    edge.copy(h).addScaledVector(right, 0.15).project(camera);
    const rx = Math.abs(edge.x - tmp.x) / 2;
    out[n].set((tmp.x + 1) / 2, (tmp.y + 1) / 2, rx, rx * camera.aspect * 1.2);
    n++;
  }
  return n;
}
