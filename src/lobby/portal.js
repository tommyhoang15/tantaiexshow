import * as THREE from 'three';
import { ADDITIVE, glowTexture } from '../stage/materials.js';

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const frag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uOpen;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.y *= 1.25;
    float r = length(p);
    float a = atan(p.y, p.x);
    float sw = a + r * 4.0 - uTime * 1.6;
    float n = noise(vec2(sw * 2.0, r * 5.0 - uTime * 1.2)) * 0.6 + noise(vec2(sw * 5.0, r * 12.0 - uTime * 2.5)) * 0.4;
    float bands = 0.5 + 0.5 * sin(sw * 6.0 + n * 4.0);
    float edge = smoothstep(1.0, 0.82, r);
    float rim = smoothstep(0.78, 0.98, r) * edge;
    float core = smoothstep(0.55, 0.0, r);
    vec3 col = mix(uA, uB, bands * n);
    col = col * (0.5 + n) + uB * rim * 2.5 + vec3(1.0) * pow(core, 3.0) * 0.6;
    gl_FragColor = vec4(col * edge * uOpen, edge * uOpen);
  }
`;

function labelTexture(title, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = '800 54px Sora, sans-serif';
  g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 12;
  g.fillText(title, 256, 62);
  g.font = '600 26px "Be Vietnam Pro", sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText(sub, 256, 104);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Stone arch + swirling vortex + motes drifting into it + floating label.
export function createPortal({ colorA, colorB, title, sub, frameMat, runeColor }) {
  const g = new THREE.Group();
  const W = 2.6, H = 3.2;
  // frame
  [-1, 1].forEach((s) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, H, 0.7), frameMat);
    p.position.set(s * (W / 2 + 0.27), H / 2, 0);
    g.add(p);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.9), frameMat);
    base.position.set(s * (W / 2 + 0.27), 0.15, 0);
    g.add(base);
  });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 0.27, 0.3, 8, 24, Math.PI), frameMat);
  arch.position.y = H;
  arch.scale.z = 1.15;
  g.add(arch);
  // glowing rune strips
  const runeMat = new THREE.MeshBasicMaterial({ color: runeColor, toneMapped: false });
  [-1, 1].forEach((s) => {
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.02), runeMat);
      r.position.set(s * (W / 2 + 0.27), 0.7 + i * 0.5, 0.36);
      g.add(r);
    }
  });
  const keystone = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), runeMat);
  keystone.position.set(0, H + W / 2 + 0.25, 0.1);
  g.add(keystone);

  // vortex
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(colorA) }, uB: { value: new THREE.Color(colorB) }, uOpen: { value: 1 } },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(W, H + W / 2 - 0.1), mat);
  disc.position.y = (H + W / 2) / 2;
  disc.userData.noCollide = true;
  g.add(disc);

  // motes spiralling in
  const N = 60;
  const pos = new Float32Array(N * 3);
  const seeds = Array.from({ length: N }, () => ({ a: Math.random() * Math.PI * 2, r: 0.6 + Math.random() * 2.2, s: 0.3 + Math.random() * 0.6, y: Math.random() * 3.4 }));
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(pgeo, new THREE.PointsMaterial({ map: glowTexture(), size: 0.18, color: colorB, opacity: 0.9, ...ADDITIVE }));
  motes.userData.noCollide = true;
  g.add(motes);

  // label
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(title, sub), transparent: true, depthWrite: false }));
  label.scale.set(4, 1, 1);
  label.position.y = H + W / 2 + 1.1;
  g.add(label);

  const light = new THREE.PointLight(colorB, 6, 9, 1.6);
  light.position.set(0, 1.8, 1.2);
  g.add(light);

  return {
    group: g,
    width: W,
    update(t) {
      mat.uniforms.uTime.value = t;
      keystone.rotation.y = t * 0.8;
      light.intensity = 5 + Math.sin(t * 3) * 1.2;
      seeds.forEach((s, i) => {
        s.r -= 0.012 * s.s;
        s.a += 0.03 * s.s;
        if (s.r < 0.15) { s.r = 2.4; s.y = Math.random() * 3.4; }
        pos[i * 3] = Math.cos(s.a) * s.r * 0.6;
        pos[i * 3 + 1] = 0.3 + s.y;
        pos[i * 3 + 2] = Math.sin(s.a) * s.r * 0.25 + 0.2;
      });
      pgeo.attributes.position.needsUpdate = true;
    },
  };
}
