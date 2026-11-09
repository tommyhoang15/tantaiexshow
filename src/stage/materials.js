import * as THREE from 'three';

// Additive light that adds colour but leaves the framebuffer alpha alone, so beams
// also glow on top of the transparent "hole" where the YouTube video shows through.
export const ADDITIVE = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};

const beamVert = /* glsl */ `
  uniform float uLen;
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vAlong = clamp(-position.y / uLen, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const beamFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uFalloff;
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
    float fade = pow(1.0 - vAlong, uFalloff);
    float core = 1.0 + 2.5 * pow(1.0 - vAlong, 12.0);
    gl_FragColor = vec4(uColor * uIntensity * edge * fade * core * 1.7, 1.0); // x1.7 compensates single-sided
  }
`;

// Volumetric-looking light cone; tip at the origin, extends along -Y.
export function makeBeam(length, rTop, rBottom, falloff = 1.4) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, length, 14, 1, true);
  geo.translate(0, -length / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#ffffff') },
      uIntensity: { value: 0 },
      uLen: { value: length },
      uFalloff: { value: falloff },
    },
    vertexShader: beamVert,
    fragmentShader: beamFrag,
    // Back faces only: half the fill cost of DoubleSide, and still visible from inside the cone
    side: THREE.BackSide,
    ...ADDITIVE,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 10;
  return mesh;
}

let glowTex;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.15, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function makeGlow(size = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffffff', opacity: 0, fog: false, ...ADDITIVE }));
  s.scale.setScalar(size);
  s.renderOrder = 11;
  return s;
}

export const M = {
  black: new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.8, metalness: 0.2 }),
  fixture: new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: 0.5, metalness: 0.5 }),
  speaker: new THREE.MeshStandardMaterial({ color: '#16171b', roughness: 0.9 }),
  grille: new THREE.MeshStandardMaterial({ color: '#25272d', roughness: 1, metalness: 0.3 }),
  deck: new THREE.MeshStandardMaterial({ color: '#1d1e22', roughness: 0.55, metalness: 0.15 }),
  steel: new THREE.MeshStandardMaterial({ color: '#8a8f98', roughness: 0.4, metalness: 0.7 }),
  fabric: new THREE.MeshStandardMaterial({ color: '#0c0c0e', roughness: 1 }),
  barricade: new THREE.MeshStandardMaterial({ color: '#7c828c', roughness: 0.45, metalness: 0.6 }),
  tent: new THREE.MeshStandardMaterial({ color: '#202228', roughness: 0.9 }),
};

export function makeLedMaterial(texture) {
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false });
}
