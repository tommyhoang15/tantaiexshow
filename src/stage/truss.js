import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Collects every tube of every truss, then draws them all as one InstancedMesh.
export class TrussBuilder {
  constructor() {
    this.bars = [];
    this.plates = [];
  }

  bar(a, b, r) {
    this.bars.push([a.clone(), b.clone(), r]);
  }

  // Square box truss (default 40 cm) from p0 to p1: 4 chords + zig-zag lacing on each face.
  box(p0, p1, size = 0.4, step = 0.5) {
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length();
    dir.normalize();
    const ref = Math.abs(dir.y) > 0.9 ? X : UP;
    const u = new THREE.Vector3().crossVectors(dir, ref).normalize();
    const v = new THREE.Vector3().crossVectors(u, dir).normalize();
    const h = size / 2;
    const corners = [[h, h], [-h, h], [-h, -h], [h, -h]].map(([a, b]) => u.clone().multiplyScalar(a).addScaledVector(v, b));
    corners.forEach((c) => this.bar(p0.clone().add(c), p1.clone().add(c), 0.025));
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const q0 = p0.clone().addScaledVector(dir, (len * i) / n);
      const q1 = p0.clone().addScaledVector(dir, (len * (i + 1)) / n);
      for (let f = 0; f < 4; f++) {
        const c0 = corners[f], c1 = corners[(f + 1) % 4];
        if ((i + f) % 2 === 0) this.bar(q0.clone().add(c0), q1.clone().add(c1), 0.011);
        else this.bar(q0.clone().add(c1), q1.clone().add(c0), 0.011);
      }
    }
    [p0, p1].forEach((p) => {
      for (let f = 0; f < 4; f++) this.bar(p.clone().add(corners[f]), p.clone().add(corners[(f + 1) % 4]), 0.016);
    });
  }

  // Flat "ladder" truss (2 chords + rungs + diagonals), used for vertical light ladders.
  ladder(p0, p1, width = 0.4, normal = V(0, 0, 1), step = 0.5) {
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length();
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, normal).normalize().multiplyScalar(width / 2);
    const a0 = p0.clone().add(side), b0 = p0.clone().sub(side);
    this.bar(a0, p1.clone().add(side), 0.025);
    this.bar(b0, p1.clone().sub(side), 0.025);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const q = p0.clone().addScaledVector(dir, (len * i) / n);
      this.bar(q.clone().add(side), q.clone().sub(side), 0.013);
      if (i < n) {
        const q1 = p0.clone().addScaledVector(dir, (len * (i + 1)) / n);
        this.bar(i % 2 ? q.clone().add(side) : q.clone().sub(side), i % 2 ? q1.clone().sub(side) : q1.clone().add(side), 0.011);
      }
    }
  }

  // Ground-support tower: vertical box truss + base plate + outriggers.
  tower(x, z, h, size = 0.52, outriggers = true) {
    this.box(V(x, 0.15, z), V(x, h, z), size, 0.55);
    this.plates.push({ x, z, s: size * 3.2 });
    if (outriggers) {
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => {
        this.bar(V(x + sx * size * 0.4, 1.6, z + sz * size * 0.4), V(x + sx * 1.6, 0.05, z + sz * 1.6), 0.03);
      });
    }
  }

  build(mat = new THREE.MeshStandardMaterial({ color: '#c4c8cf', metalness: 0.6, roughness: 0.35 })) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    const mesh = new THREE.InstancedMesh(geo, mat, this.bars.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), d = new THREE.Vector3();
    this.bars.forEach(([a, b, r], i) => {
      d.subVectors(b, a);
      const len = d.length();
      q.setFromUnitVectors(UP, d.normalize());
      p.addVectors(a, b).multiplyScalar(0.5);
      s.set(r, len, r);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    const group = new THREE.Group();
    group.add(mesh);
    const plateMat = new THREE.MeshStandardMaterial({ color: '#3a3d44', metalness: 0.5, roughness: 0.6 });
    this.plates.forEach(({ x, z, s: ps }) => {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(ps, 0.12, ps), plateMat);
      pl.position.set(x, 0.06, z);
      group.add(pl);
    });
    group.userData.count = this.bars.length;
    return group;
  }
}
