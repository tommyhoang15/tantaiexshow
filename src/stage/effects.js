import * as THREE from 'three';
import { ADDITIVE, glowTexture } from './materials.js';

// ---------- Particle system for flames, CO2 jets, sparks (gerbs) and haze ----------
const pVert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const pFrag = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor, t.a * vAlpha);
  }
`;

export class Particles {
  constructor(max = 4000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.kind = new Uint8Array(max);
    this.seed = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture() }, uScale: { value: 400 } },
      vertexShader: pVert,
      fragmentShader: pFrag,
      ...ADDITIVE,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
    this.geo = geo;
  }

  // kind: 1 flame, 2 co2, 3 spark, 4 haze, 5 trail
  spawn(x, y, z, vx, vy, vz, life, size, kind) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.kind[i] = kind;
    this.seed[i] = Math.random();
  }

  update(dt, hazeLevel = 1) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const k = this.kind[i];
      if (!k) continue;
      this.life[i] += dt;
      const r = this.life[i] / this.maxLife[i];
      if (r >= 1) { this.kind[i] = 0; this.alpha[i] = 0; this.dirty = true; continue; }
      alive++;
      const j = i * 3;
      if (k === 3) this.vel[j + 1] -= 9.8 * dt; // sparks fall
      if (k === 1) { this.vel[j] *= 0.97; this.vel[j + 2] *= 0.97; }
      if (k === 2) { this.vel[j] *= 0.95; this.vel[j + 1] *= 0.95; this.vel[j + 2] *= 0.95; }
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (k === 1) {
        // white-yellow core → orange → deep red, growing and fading
        const c = r < 0.25 ? [1, 0.95, 0.6] : r < 0.6 ? [1, 0.55, 0.12] : [0.8, 0.18, 0.05];
        this.col.set(c, j);
        this.size[i] += dt * 6;
        this.alpha[i] = (1 - r) * 0.9;
      } else if (k === 2) {
        this.col.set([0.85, 0.9, 1], j);
        this.size[i] += dt * 9;
        this.alpha[i] = (1 - r) * 0.12; // CO2: lighter so bloom doesn't blow it out
      } else if (k === 3) {
        this.col.set([1, 0.85, 0.5], j);
        this.alpha[i] = 1 - r;
      } else if (k === 5) { // flight trail
        this.col.set([0.45, 0.85, 1], j);
        this.size[i] *= 0.97;
        this.alpha[i] = (1 - r) * 0.8;
      } else if (k === 4) {
        this.col.set([0.55, 0.6, 0.7], j);
        this.alpha[i] = Math.sin(r * Math.PI) * 0.09 * hazeLevel;
      }
    }
    if (!alive && !this.dirty) return; // nothing to upload
    this.dirty = alive > 0;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

// ---------- Confetti cannon ----------
export class Confetti {
  constructor(count = 1800) {
    this.count = count;
    const geo = new THREE.PlaneGeometry(0.09, 0.05);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    const palette = ['#ffd166', '#ff5d73', '#48dbfb', '#ffffff', '#a66cff', '#ff9f43'].map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, palette[i % palette.length]);
    this.p = Array.from({ length: count }, () => ({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0 }));
    this.dummy = new THREE.Object3D();
    this.hideAll();
  }
  hideAll() {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.count; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  burst(origins) {
    this.active = true;
    this.p.forEach((p, i) => {
      const o = origins[i % origins.length];
      p.alive = true;
      p.life = 0;
      p.pos.copy(o);
      p.vel.set((Math.random() - 0.5) * 14, 6 + Math.random() * 10, 6 + Math.random() * 22);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    });
  }
  update(dt) {
    if (!this.active) return;
    let any = false;
    this.p.forEach((p, i) => {
      if (!p.alive) return;
      any = true;
      p.life += dt;
      p.vel.y -= 9.8 * dt;
      p.vel.multiplyScalar(p.vel.y < 0 ? 0.9 : 0.985); // air drag → flutter down
      if (p.vel.y < -1.2) p.vel.y = -1.2;
      p.vel.x += Math.sin(p.life * 3 + i) * dt * 2;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.spin.x * dt; p.rot.y += p.spin.y * dt; p.rot.z += p.spin.z * dt;
      if (p.pos.y < 0.05) { p.pos.y = 0.05; p.vel.set(0, 0, 0); p.spin.set(0, 0, 0); }
      if (p.life > 14) p.alive = false;
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.copy(p.rot);
      this.dummy.scale.setScalar(p.alive ? 1 : 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.active = any;
  }
}

// ---------- Emitters (pyro devices placed on stage) ----------
const RATE = { flame: 520, co2: 420, gerb: 650 }; // particles per second

export class Emitter {
  constructor(particles, pos, kind) {
    this.ps = particles;
    this.pos = pos;
    this.kind = kind; // 'flame' | 'co2' | 'gerb'
    this.from = 0;
    this.until = 0;
    this.acc = 0;
  }
  fire(now, duration) { this.from = now; this.until = Math.max(this.until, now + duration); }
  update(now, dt) {
    if (now > this.until || now < this.from) return;
    this.acc += RATE[this.kind] * dt; // frame-rate independent
    const { x, y, z } = this.pos;
    const r = (s) => (Math.random() - 0.5) * s;
    for (; this.acc >= 1; this.acc--) {
      if (this.kind === 'flame') this.ps.spawn(x + r(0.3), y + 0.2, z + r(0.3), r(1.2), 9 + Math.random() * 4, r(1.2), 0.7 + Math.random() * 0.4, 1.2, 1);
      else if (this.kind === 'co2') this.ps.spawn(x + r(0.2), y + 0.2, z + r(0.2), r(2), 16 + Math.random() * 5, r(2), 1.4, 1, 2);
      else this.ps.spawn(x, y + 0.1, z, r(2.5), 7 + Math.random() * 3, r(2.5), 1.2, 0.22, 3);
    }
  }
}
