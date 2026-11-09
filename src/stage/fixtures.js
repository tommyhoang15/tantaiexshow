import * as THREE from 'three';
import { makeBeam, makeGlow, M } from './materials.js';

const tmp = new THREE.Vector3();
const HEAD_ORIGIN = new THREE.Vector3(0, -0.42, 0); // yoke (-0.14) + head (-0.28) pivot in mount space
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Beam angles per fixture type: [length, lens radius, field angle (deg), falloff, base intensity]
const TYPES = {
  beam: [55, 0.05, 2.2, 1.1, 0.55],
  spot: [38, 0.08, 7, 1.3, 0.28],
  wash: [22, 0.12, 18, 1.6, 0.1],
  tower: [60, 0.05, 2.5, 1.0, 0.5],
};

// Moving-head fixture: base → yoke (pan around Y) → head (tilt around X) → beam along -Y.
// hang=true hangs from a truss; hang=false stands on the floor pointing up.
export class MovingHead {
  // showBody=false: beam + lens glow only, for rigs whose fixture models already exist in the scene
  constructor({ type = 'beam', hang = true, showBody = true } = {}) {
    const [len, r0, deg, falloff, base] = TYPES[type];
    this.type = type;
    this.base = base;
    this.root = new THREE.Group();
    if (!hang) this.root.rotation.x = Math.PI;

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.34), M.fixture);
    body.position.y = -0.07;
    this.root.add(body);
    if (hang) {
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), M.steel);
      clamp.position.y = 0.05;
      this.root.add(clamp);
    }
    this.yoke = new THREE.Group();
    this.yoke.position.y = -0.14;
    this.root.add(this.yoke);
    [-1, 1].forEach((s) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.14), M.fixture);
      arm.position.set(s * 0.19, -0.16, 0);
      this.yoke.add(arm);
    });
    this.head = new THREE.Group();
    this.head.position.y = -0.28;
    this.yoke.add(this.head);
    const headR = type === 'wash' ? 0.17 : 0.13;
    const can = new THREE.Mesh(new THREE.CylinderGeometry(headR, headR * 0.85, 0.36, 16), M.fixture);
    this.head.add(can);
    this.lensMat = new THREE.MeshBasicMaterial({ color: '#000000', toneMapped: false, fog: false });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(headR * 0.85, 20), this.lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.181;
    this.head.add(lens);

    const r1 = r0 + Math.tan(THREE.MathUtils.degToRad(deg / 2)) * len;
    this.beam = makeBeam(len, r0, r1, falloff);
    this.beam.position.y = -0.18;
    this.head.add(this.beam);
    this.glow = makeGlow(type === 'wash' ? 1.6 : 1.1);
    this.glow.position.y = -0.25;
    this.head.add(this.glow);

    if (!showBody) this.root.traverse((o) => { if (o.isMesh && o !== this.beam && o.material !== this.lensMat) o.visible = false; });
    this.pan = 0; this.tilt = 0;
    this.tPan = 0; this.tTilt = 0;
    this.color = new THREE.Color('#ffffff');
    this.dim = 0;
    this.speed = type === 'beam' ? 5 : 3.5;
  }

  // Target point in world space → pan/tilt targets. Mount points never move, so the
  // world→mount inverse is computed once and reused (was a full matrix walk per fixture per frame).
  aimAt(world) {
    if (!this._inv) {
      this.root.updateWorldMatrix(true, false);
      this._inv = this.root.matrixWorld.clone().invert();
    }
    const d = tmp.copy(world).applyMatrix4(this._inv).sub(HEAD_ORIGIN).normalize();
    this.tTilt = Math.acos(THREE.MathUtils.clamp(-d.y, -1, 1));
    this.tPan = Math.atan2(-d.x, -d.z);
  }

  aimDir(pan, tilt) { this.tPan = pan; this.tTilt = tilt; }

  update(dt, master = 1) {
    const k = Math.min(1, dt * this.speed);
    this.pan += wrap(this.tPan - this.pan) * k;
    this.tilt += (this.tTilt - this.tilt) * k;
    this.yoke.rotation.y = this.pan;
    this.head.rotation.x = this.tilt;
    const level = this.dim * master;
    const u = this.beam.material.uniforms;
    u.uColor.value.copy(this.color);
    u.uIntensity.value = level * this.base;
    this.beam.visible = level > 0.01;
    this.lensMat.color.copy(this.color).multiplyScalar(0.4 + level * 2.5);
    this.glow.material.color.copy(this.color);
    this.glow.material.opacity = Math.min(1, level * 1.2);
  }
}

// PAR can: fixed colour wash light hanging from a truss, short soft cone.
export class Par {
  constructor({ tilt = 0.5, len = 14 } = {}) {
    this.root = new THREE.Group();
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 4, 12, Math.PI), M.steel);
    yoke.position.y = -0.08;
    yoke.rotation.z = Math.PI;
    this.root.add(yoke);
    this.head = new THREE.Group();
    this.head.position.y = -0.18;
    this.head.rotation.x = tilt;
    this.root.add(this.head);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 14), M.fixture);
    this.head.add(can);
    this.lensMat = new THREE.MeshBasicMaterial({ color: '#000', toneMapped: false, fog: false });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), this.lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.151;
    this.head.add(lens);
    this.beam = makeBeam(len, 0.12, 2.4, 1.8);
    this.beam.position.y = -0.15;
    this.head.add(this.beam);
    this.glow = makeGlow(1.3);
    this.glow.position.y = -0.2;
    this.head.add(this.glow);
    this.color = new THREE.Color();
    this.dim = 0;
  }
  update(master = 1) {
    const l = this.dim * master;
    this.beam.material.uniforms.uColor.value.copy(this.color);
    this.beam.material.uniforms.uIntensity.value = l * 0.09;
    this.beam.visible = l > 0.01;
    this.lensMat.color.copy(this.color).multiplyScalar(0.3 + l * 2);
    this.glow.material.color.copy(this.color);
    this.glow.material.opacity = Math.min(1, l);
  }
}

// Audience blinder: 2x2 or 4x1 warm tungsten cells that "hit" the crowd.
export class Blinder {
  constructor(cols = 2, rows = 2) {
    this.root = new THREE.Group();
    const w = cols * 0.28, h = rows * 0.28;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.18), M.fixture);
    this.root.add(box);
    this.lensMat = new THREE.MeshBasicMaterial({ color: '#000', toneMapped: false, fog: false });
    this.glows = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = (i - (cols - 1) / 2) * 0.28, y = (j - (rows - 1) / 2) * 0.28;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), this.lensMat);
      lens.position.set(x, y, 0.091);
      this.root.add(lens);
      const g = makeGlow(2.4);
      g.position.set(x, y, 0.2);
      this.root.add(g);
      this.glows.push(g);
    }
    this.dim = 0;
  }
  update(master = 1) {
    const l = this.dim * master;
    this.lensMat.color.setRGB(1, 0.72, 0.38).multiplyScalar(0.15 + l * 3);
    this.glows.forEach((g) => { g.material.color.setRGB(1, 0.75, 0.45); g.material.opacity = l; });
  }
}

// Linear strobe bar.
export class Strobe {
  constructor() {
    this.root = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.18), M.fixture);
    this.root.add(box);
    this.mat = new THREE.MeshBasicMaterial({ color: '#000', toneMapped: false, fog: false });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.12), this.mat);
    face.position.z = 0.091;
    this.root.add(face);
    this.glow = makeGlow(4);
    this.glow.position.z = 0.3;
    this.root.add(this.glow);
    this.on = 0;
  }
  update(master = 1) {
    const l = this.on * master;
    this.mat.color.setScalar(0.08 + l * 4);
    this.glow.material.opacity = l;
  }
}

// RGB laser projector: a fan of thin beams that scans.
export class Laser {
  constructor(count = 9, len = 75) {
    this.root = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.4), M.fixture);
    this.root.add(box);
    this.fan = new THREE.Group();
    this.fan.position.y = 0.12;
    this.root.add(this.fan);
    this.rays = [];
    for (let i = 0; i < count; i++) {
      const ray = makeBeam(len, 0.01, 0.12, 0.6);
      ray.rotation.x = Math.PI; // point up/outward
      const holder = new THREE.Group();
      holder.add(ray);
      this.fan.add(holder);
      this.rays.push({ holder, ray });
    }
    this.color = new THREE.Color('#33ff66');
    this.dim = 0;
    this.spread = 0.8;
    this.tilt = 0.9;
    this.scan = 0;
  }
  update(master = 1) {
    const n = this.rays.length;
    this.fan.rotation.x = this.tilt; // tip the fan from straight up toward the audience (+z)
    this.fan.rotation.y = this.scan;
    this.rays.forEach(({ holder, ray }, i) => {
      holder.rotation.z = (i / (n - 1) - 0.5) * this.spread * 2;
      ray.material.uniforms.uColor.value.copy(this.color);
      ray.material.uniforms.uIntensity.value = this.dim * master * 1.6;
      ray.visible = this.dim * master > 0.01;
    });
  }
}

// Line-array speaker: a curved hang of boxes under a fly bumper.
export function lineArray(boxes = 12, splay = 0.035) {
  const g = new THREE.Group();
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.1, 0.75), M.steel);
  g.add(bumper);
  let parent = g;
  let y = -0.08;
  for (let i = 0; i < boxes; i++) {
    const pivot = new THREE.Group();
    pivot.position.y = y;
    pivot.rotation.x = i === 0 ? 0.04 : splay * (1 + i * 0.12);
    parent.add(pivot);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.36, 0.62), M.speaker);
    cab.position.set(0, -0.18, 0);
    pivot.add(cab);
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 0.3), M.grille);
    grille.position.set(0, -0.18, 0.311);
    pivot.add(grille);
    parent = pivot;
    y = -0.37;
  }
  // chain motors + chains
  [-0.45, 0.45].forEach((x) => {
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), M.fixture);
    motor.position.set(x, 1.1, 0);
    g.add(motor);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), M.steel);
    chain.position.set(x, 0.5, 0);
    g.add(chain);
  });
  return g;
}

export function subwoofer() {
  const g = new THREE.Group();
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.85), M.speaker);
  cab.position.y = 0.3;
  g.add(cab);
  [-0.28, 0.28].forEach((x) => {
    const cone = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), M.grille);
    cone.position.set(x, 0.3, 0.426);
    g.add(cone);
  });
  return g;
}

export function wedge() {
  const g = new THREE.Group();
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.55, 0), new THREE.Vector2(0.42, 0.38), new THREE.Vector2(0, 0.24)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false });
  geo.translate(-0.27, 0, -0.3);
  geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, M.speaker);
  g.add(m);
  return g;
}

export function chainHoist(height = 1.2) {
  const g = new THREE.Group();
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.32, 10), M.fixture);
  motor.position.y = -0.2;
  g.add(motor);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, height, 4), M.steel);
  chain.position.y = height / 2;
  g.add(chain);
  return g;
}

// ---------- Beam that starts exactly at a lens from the design file ----------
// The fixture body already exists in the scene; this adds only the light: a cone whose apex sits on the
// lens centre and pivots around it (moving-head style), plus the lens glow.
const DOWN = new THREE.Vector3(0, -1, 0);
const tmpD = new THREE.Vector3();
export class LensBeam {
  constructor({ type = 'beam', pos, dir = [0, 0, 1] }) {
    const [len, r0, deg, falloff, base] = TYPES[type];
    this.base = base;
    this.root = new THREE.Group();
    this.root.position.set(pos[0], pos[1], pos[2]);
    const r1 = r0 + Math.tan(THREE.MathUtils.degToRad(deg / 2)) * len;
    this.beam = makeBeam(len, r0, r1, falloff);
    this.root.add(this.beam);
    this.glow = makeGlow(type === 'wash' ? 1.4 : 0.9);
    this.root.add(this.glow);
    this.rest = new THREE.Vector3(...dir).normalize();
    this.root.quaternion.setFromUnitVectors(DOWN, this.rest);
    this.target = this.root.quaternion.clone();
    this.color = new THREE.Color('#ffffff');
    this.dim = 0;
    this.speed = type === 'beam' ? 5 : 3.5;
  }
  // moving heads can't aim behind themselves: keep targets in front of the lens
  aimAt(world) {
    tmpD.copy(world).sub(this.root.position).normalize();
    if (tmpD.dot(this.rest) < 0.05) tmpD.addScaledVector(this.rest, 0.05 - tmpD.dot(this.rest)).normalize();
    this.target.setFromUnitVectors(DOWN, tmpD);
  }
  update(dt, master = 1) {
    this.root.quaternion.slerp(this.target, Math.min(1, dt * this.speed));
    const level = this.dim * master;
    const u = this.beam.material.uniforms;
    u.uColor.value.copy(this.color);
    u.uIntensity.value = level * this.base;
    this.beam.visible = level > 0.01;
    this.glow.material.color.copy(this.color);
    this.glow.material.opacity = Math.min(1, level * 1.2);
  }
}
