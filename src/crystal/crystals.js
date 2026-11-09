import * as THREE from 'three';

// ---------- Crystal shader for the imported design meshes ----------
// Faceted look from screen-space derivative normals, height gradient, fresnel rim,
// glints and a light sweep. Works on any geometry (no custom attributes needed).
const vert = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      w = instanceMatrix * w;
    #endif
    w = modelMatrix * w;
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const frag = /* glsl */ `
  uniform vec3 uCol;
  uniform float uDeep;
  uniform float uYMin;
  uniform float uYMax;
  uniform float uPulse;
  uniform float uTime;
  uniform vec3 uSweepCol;
  uniform float uRim;
  uniform sampler2D uDetail;
  uniform float uHasDetail;
  varying vec3 vW;
  void main() {
    // degenerate (zero-area) triangles from mesh simplification give a zero cross product;
    // normalising that is NaN, and bloom would smear NaN into big black blocks
    vec3 c = cross(dFdx(vW), dFdy(vW));
    float cl = length(c);
    vec3 n = cl > 1e-12 ? c / cl : vec3(0.0, 1.0, 0.0);
    vec3 v = normalize(cameraPosition - vW);
    float fres = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 2.2);
    float facet = fract(sin(dot(floor(n * 6.0 + 0.5), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float h = clamp((vW.y - uYMin) / (uYMax - uYMin), 0.0, 1.0);
    vec3 col = mix(uCol * uDeep, uCol * 0.8, clamp(h * 0.7 + facet * 0.5, 0.0, 1.0));
    col += fres * (uCol * 0.9 + 0.08) * uRim;
    vec3 r = reflect(-v, n);
    col += pow(max(dot(r, normalize(vec3(0.3, 1.0, 0.4))), 0.0), 40.0) * 0.8;
    float sweep = smoothstep(0.9, 1.0, sin(vW.y * 0.6 - uTime * 2.5 + vW.x * 0.15) * 0.5 + 0.5);
    col += uSweepCol * sweep * 0.4;
    if (uHasDetail > 0.5) {
      // inner swirl from the design's crystal texture, drifting slowly inside the facets
      vec3 sw = texture2D(uDetail, vW.xy * 0.16 + vec2(vW.z * 0.07, uTime * 0.01) + n.xz * 0.15).rgb;
      col *= 0.7 + 0.6 * sw;
      col += uCol * sw * 0.18;
    }
    col = clamp(col * uPulse, 0.0, 8.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;
export function crystalMaterial(color, { yMin = 0, yMax = 12, deep = 0.08, rim = 1, detail = null } = {}) {
  if (detail) detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  return new THREE.ShaderMaterial({
    uniforms: {
      uDetail: { value: detail }, uHasDetail: { value: detail ? 1 : 0 },
      uCol: { value: new THREE.Color(color) }, uDeep: { value: deep }, uYMin: { value: yMin }, uYMax: { value: yMax },
      uPulse: { value: 1 }, uTime: { value: 0 }, uSweepCol: { value: new THREE.Color('#7fe8ff') }, uRim: { value: rim },
    },
    vertexShader: vert,
    fragmentShader: frag,
  });
}

// ---------- LED content: animated crystal shards (Voronoi) ----------
const ledFrag = /* glsl */ `
  uniform float uTime;
  uniform float uBeat;
  uniform float uFlash;
  uniform float uAspect;
  uniform float uCore;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  varying vec2 vUv;
  vec2 h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  void main() {
    vec2 uv = vUv * vec2(uAspect, 1.0) * 4.0;
    vec2 i = floor(uv), f = fract(uv);
    float md = 8.0, md2 = 8.0; vec2 mo = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = h2(i + g);
      o = 0.5 + 0.45 * sin(uTime * 0.5 + 6.2831 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) { md2 = md; md = d; mo = i + g; } else if (d < md2) md2 = d;
    }
    float edge = smoothstep(0.0, 0.06, sqrt(md2) - sqrt(md));
    float cell = h2(mo).x;
    float sweep = smoothstep(0.82, 1.0, sin((vUv.x * uAspect + vUv.y) * 3.0 - uTime * 1.8 + cell * 2.0) * 0.5 + 0.5);
    vec3 col = mix(uC1, uC2, cell) * (0.25 + 0.75 * cell * cell);
    col += uC3 * sweep * 0.7;
    col = mix(uC3 * 1.1, col, edge);
    vec2 c = (vUv - 0.5) * vec2(uAspect, 1.0);
    float rr = length(c);
    col += uC3 * uCore * (smoothstep(0.45, 0.0, rr) * (0.6 + 0.6 * uBeat) + smoothstep(0.02, 0.0, abs(rr - fract(uTime * 0.5) * 0.9)) * 0.8);
    col *= 0.65 + 0.55 * uBeat;
    col += uFlash;
    gl_FragColor = vec4(clamp(col * 0.75, 0.0, 8.0), 1.0);
  }
`;
export function ledMaterial(aspect, core = 0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uBeat: { value: 0 }, uFlash: { value: 0 }, uAspect: { value: aspect }, uCore: { value: core },
      uC1: { value: new THREE.Color('#06153d') }, uC2: { value: new THREE.Color('#1a5cff') }, uC3: { value: new THREE.Color('#7fe8ff') },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: ledFrag,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

// Planar UVs for LED panels (the export dropped them). Computed from WORLD positions: the source
// panels are local XZ planes, stood up and mirrored by their node transform.
export function planarUV(mesh) {
  const g = mesh.geometry;
  mesh.updateWorldMatrix(true, false);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const W = [];
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld); W.push(v.clone()); min.min(v); max.max(v); }
  const useX = max.x - min.x >= max.z - min.z;
  const uv = new Float32Array(p.count * 2);
  W.forEach((w, i) => {
    uv[i * 2] = useX ? (w.x - min.x) / (max.x - min.x) : (w.z - min.z) / (max.z - min.z);
    uv[i * 2 + 1] = (w.y - min.y) / (max.y - min.y);
  });
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ---------- Animated LED: the design's crystal visuals pushed through 5 motion modes ----------
// 0 drift (slow zoom/rotate + parallax layer)  1 kaleidoscope  2 shatter (cells jump on the beat)
// 3 tunnel (flying through crystal)  4 drift + flying shards. Two modes cross-fade on scene change.
// atlas=1: texture holds two panels side by side (side LEDs); each panel animates independently.
export function ledImageMaterial(texture, { aspect = 1, atlas = 0, rectA = [0, 0, 1, 1], rectB = [0, 0, 1, 1] } = {}) {
  if (texture) { texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; }
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture }, uTime: { value: 0 }, uBeat: { value: 0 }, uFlash: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) }, uAspect: { value: aspect }, uAtlas: { value: atlas },
      uModeA: { value: 0 }, uModeB: { value: 0 }, uMix: { value: 0 }, uShards: { value: 0 },
      uRectA: { value: new THREE.Vector4(...rectA) }, uRectB: { value: new THREE.Vector4(...rectB) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uTime, uBeat, uFlash, uAspect, uAtlas, uModeA, uModeB, uMix, uShards;
      uniform vec3 uTint;
      uniform vec4 uRectA, uRectB; // this screen's part of the LED panorama (u0, v0, u1, v1)
      varying vec2 vUv;
      float panel;
      vec2 mirror2(vec2 x) { return 1.0 - abs(1.0 - mod(x, 2.0)); }
      vec3 img(vec2 uv) {
        uv = mirror2(uv);
        vec4 r = panel > 0.5 ? uRectB : uRectA;
        return texture2D(uMap, r.xy + uv * (r.zw - r.xy)).rgb;
      }
      vec2 h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

      vec3 modeDrift(vec2 uv, float t) {
        vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
        p = rot(t * 0.04 + panel * 1.7) * p / (1.08 + 0.08 * sin(t * 0.3));
        vec3 c = img(p / vec2(uAspect, 1.0) + 0.5 + vec2(t * 0.015, 0.0));
        c += img(uv * 1.7 + vec2(-t * 0.05, t * 0.03)) * 0.35;           // parallax shards layer
        return c;
      }
      vec3 modeKaleido(vec2 uv, float t) {
        vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
        float r = length(p), a = atan(p.y, p.x) + t * 0.25;
        float seg = 6.2831853 / 6.0;
        a = abs(mod(a, seg) - seg * 0.5);
        vec2 q = vec2(cos(a), sin(a)) * r;
        return img(q * (0.9 + 0.15 * sin(t * 0.4)) + vec2(0.5 + t * 0.03, 0.5)) * (1.0 + 0.4 * smoothstep(0.25, 0.0, r));
      }
      vec3 modeShatter(vec2 uv, float t) {
        vec2 g = uv * vec2(uAspect, 1.0) * 3.5;
        vec2 i = floor(g), f = fract(g);
        float md = 8.0, md2 = 8.0; vec2 mo = vec2(0.0);
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y));
          vec2 pt = 0.5 + 0.4 * sin(t * 0.4 + 6.2831 * h2(i + o));
          vec2 r = o + pt - f; float d = dot(r, r);
          if (d < md) { md2 = md; md = d; mo = i + o; } else if (d < md2) md2 = d;
        }
        vec2 hv = h2(mo);
        vec2 jump = (hv - 0.5) * 0.12 * (0.3 + uBeat);                      // each shard kicks on the beat
        vec2 suv = (uv - 0.5) * rot((hv.x - 0.5) * 0.25 * uBeat) + 0.5 + jump;
        float edge = 1.0 - smoothstep(0.0, 0.05, sqrt(md2) - sqrt(md));
        return img(suv) * (0.75 + 0.5 * hv.y) + vec3(0.6, 0.9, 1.0) * edge * (0.6 + uBeat);
      }
      vec3 modeTunnel(vec2 uv, float t) {
        vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
        float r = max(length(p), 0.02), a = atan(p.y, p.x);
        vec2 tuv = vec2(a / 6.2831853 * 2.0 + t * 0.03, 0.35 / r + t * 0.45);
        return img(tuv) * smoothstep(0.0, 0.35, r) * 1.2 + vec3(0.5, 0.85, 1.0) * smoothstep(0.12, 0.0, r) * 0.8;
      }
      vec3 mode(float m, vec2 uv, float t) {
        if (m < 0.5) return modeDrift(uv, t);
        if (m < 1.5) return modeKaleido(uv, t);
        if (m < 2.5) return modeShatter(uv, t);
        if (m < 3.5) return modeTunnel(uv, t);
        return modeDrift(uv, t * 1.6);
      }
      // bright triangular shards flying out from the centre
      vec3 shards(vec2 uv, float t) {
        vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
        vec3 acc = vec3(0.0);
        for (int k = 0; k < 3; k++) {
          float fk = float(k);
          float z = fract(t * 0.18 + fk / 3.0);                             // depth: 0 far → 1 near
          vec2 q = p / (0.25 + z * 1.6) * 3.0;
          vec2 i = floor(q), f = fract(q) - 0.5;
          vec2 hv = h2(i + fk * 17.0);
          if (hv.x > 0.35) continue;
          f = rot(hv.y * 6.2831 + t * (hv.x - 0.2) * 3.0) * f;
          float tri = max(abs(f.x) * 0.866 + f.y * 0.5, -f.y) - 0.18 * (0.5 + hv.y); // triangle SDF
          float line = smoothstep(0.03, 0.0, abs(tri)) + smoothstep(0.0, -0.08, tri) * 0.25;
          acc += vec3(0.65, 0.9, 1.0) * line * z * (1.0 - z) * 4.0;
        }
        return acc;
      }
      void main() {
        vec2 uv = vUv;
        panel = 0.0;
        if (uAtlas > 0.5) { panel = floor(vUv.x * 2.0); uv.x = fract(vUv.x * 2.0); }
        float t = uTime + panel * 13.0;
        vec3 c = mix(mode(uModeA, uv, t), mode(uModeB, uv, t), uMix);
        c += shards(uv, t) * uShards;
        float sweep = smoothstep(0.88, 1.0, sin((uv.x * 2.0 + uv.y) * 3.0 - t * 1.6) * 0.5 + 0.5);
        vec3 col = c * uTint * (0.75 + 0.55 * uBeat) + c * sweep * 0.5 + uFlash;
        gl_FragColor = vec4(clamp(col, 0.0, 8.0), 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

// Side LEDs were merged into one mesh: give each panel its own half of a 2-panel atlas
// (left panel → u 0..0.5, right panel → u 0.5..1), v from bottom to top.
export function sidePanelsUV(mesh) {
  const g = mesh.geometry;
  mesh.updateWorldMatrix(true, false);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const W = [];
  const box = { L: [Infinity, -Infinity], R: [Infinity, -Infinity] };
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    W.push(v.clone());
    const s = v.x < 0 ? 'L' : 'R';
    box[s][0] = Math.min(box[s][0], v.x); box[s][1] = Math.max(box[s][1], v.x);
    yMin = Math.min(yMin, v.y); yMax = Math.max(yMax, v.y);
  }
  const uv = new Float32Array(p.count * 2);
  W.forEach((w, i) => {
    const s = w.x < 0 ? 'L' : 'R';
    const [a, b] = box[s];
    uv[i * 2] = (s === 'L' ? 0 : 0.5) + 0.5 * (w.x - a) / (b - a);
    uv[i * 2 + 1] = (w.y - yMin) / (yMax - yMin);
  });
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
