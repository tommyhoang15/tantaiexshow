import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// "Đậu" — the venue's original mascot: an egg-shaped bean with two big cartoon eyes,
// a glowing antenna bulb, little nub arms and round feet. ~1.5 m tall.

const shared = {
  white: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }),
  pupil: new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.2 }),
  stem: new THREE.MeshStandardMaterial({ color: '#2a2c33', roughness: 0.6 }),
  cheek: new THREE.MeshStandardMaterial({ color: '#ff8fa3', roughness: 0.8 }),
};

const G = {
  body: new THREE.SphereGeometry(0.42, 24, 18).scale(1, 1.2, 0.95),
  foot: new THREE.SphereGeometry(0.13, 12, 8).scale(1.1, 0.7, 1.4),
  eye: new THREE.SphereGeometry(0.1, 14, 10).scale(1, 1.15, 0.6),
  pupil: new THREE.SphereGeometry(0.052, 10, 8).scale(1, 1.15, 0.5),
  cheek: new THREE.CircleGeometry(0.05, 12),
  stem: new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6),
  bulb: new THREE.SphereGeometry(0.07, 12, 8),
  arm: new THREE.CapsuleGeometry(0.07, 0.16, 3, 8),
};

/**
 * @param {string} color body colour
 * @param {{glow?: string}} [opts]
 * @returns {{g: THREE.Group, group: THREE.Group, body: THREE.Mesh, head: THREE.Group, arms: THREE.Group[], legs: THREE.Mesh[], dispose: () => void}}
 */
export function makeBean(color, { glow = '#ffd166' } = {}) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: glow, toneMapped: false });

  const add = (geo, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  const legs = [-0.15, 0.15].map((x) => add(G.foot, skin, x, 0.09, 0.03));
  const body = add(G.body, skin, 0, 0.62, 0);

  // "head" = face + antenna; bobbed separately for a squash-and-stretch feel
  const head = new THREE.Group();
  head.position.y = 0.62;
  g.add(head);
  [-1, 1].forEach((s) => {
    add(G.eye, shared.white, s * 0.13, 0.2, 0.355, head);
    add(G.pupil, shared.pupil, s * 0.13, 0.19, 0.405, head);
    const c = add(G.cheek, shared.cheek, s * 0.25, 0.06, 0.37, head);
    c.rotation.y = s * 0.55;
    c.castShadow = false;
  });
  add(G.stem, shared.stem, 0, 0.62, 0, head).rotation.z = 0.12;
  add(G.bulb, bulbMat, 0.018, 0.79, 0, head).castShadow = false;

  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.42, 0.72, 0);
    add(G.arm, skin, 0, -0.13, 0, pivot);
    g.add(pivot);
    return pivot;
  });

  return {
    g, group: g, body, head, arms, legs,
    // shared geometries stay cached; only the per-bean materials are freed
    dispose() { skin.dispose(); bulbMat.dispose(); },
  };
}

// One merged, vertex-coloured low-poly bean for the instanced crowd.
// White vertices take the instance colour; dark parts stay dark.
export function crowdBeanGeometry() {
  const parts = [];
  const push = (geo, gray, m) => {
    const p = geo.clone();
    if (m) p.applyMatrix4(m);
    const n = p.attributes.position.count;
    const col = new Float32Array(n * 3).fill(gray);
    p.setAttribute('color', new THREE.BufferAttribute(col, 3));
    delete p.attributes.uv;
    parts.push(p.index ? p.toNonIndexed() : p);
  };
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  push(new THREE.SphereGeometry(0.42, 10, 8).scale(1, 1.2, 0.95), 1, T(0, 0.62, 0));
  [-0.15, 0.15].forEach((x) => push(new THREE.SphereGeometry(0.13, 6, 4).scale(1.1, 0.7, 1.4), 0.55, T(x, 0.09, 0.03)));
  [-0.13, 0.13].forEach((x) => push(new THREE.SphereGeometry(0.075, 6, 4).scale(1, 1.2, 0.5), 0.04, T(x, 0.82, 0.37)));
  push(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), 0.15, T(0, 1.24, 0));
  push(new THREE.SphereGeometry(0.07, 6, 4), 1.4, T(0, 1.41, 0));
  return mergeGeometries(parts);
}
