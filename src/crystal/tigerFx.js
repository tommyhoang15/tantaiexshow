import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { glowTexture, ADDITIVE } from '../stage/materials.js';

// Dress the tiger sculpture from the design file like the renders:
// glowing white-cyan neon along every facet edge, orange-red neon on the paws/claws,
// and two burning red eyes found by ray-casting onto the face.
const WHITE = new THREE.Color('#d6f3ff').multiplyScalar(1.7);
const ORANGE = new THREE.Color('#ff5a14').multiplyScalar(3.4);
const RED = new THREE.Color('#ff2040').multiplyScalar(3.6);

export function dressTiger(mesh, scene) {
  mesh.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(mesh);
  const cx = (box.min.x + box.max.x) / 2;
  const headBottom = box.min.y + (box.max.y - box.min.y) * 0.62; // head = top ~38% of the sculpture

  // ---------- neon facet edges (fat lines so they read as tubes, then bloom) ----------
  const edges = new THREE.EdgesGeometry(mesh.geometry, 30);
  const p = edges.attributes.position;
  const pos = new Float32Array(p.count * 3);
  const col = new Float32Array(p.count * 3);
  const nSeg = p.count / 2;
  const segS = new Float32Array(nSeg);    // position along the sculpture: drives the running-light wave
  const segKind = new Uint8Array(nSeg);   // 0 white body line, 1 orange paw, 2 red claw
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 2) {
    a.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(p, i + 1).applyMatrix4(mesh.matrixWorld);
    const my = (a.y + b.y) / 2, mx = Math.abs((a.x + b.x) / 2 - cx), mz = (a.z + b.z) / 2;
    // paws/forearms reach forward on both sides below the head: orange; their front tips (claws) red-orange
    const paw = my < headBottom - 0.6 && mx > 1.6;
    const claw = paw && mz > box.max.z - 1.2;
    const c = claw ? RED : paw ? ORANGE : WHITE;
    // run up from the paws to the crown, fanning out from the centre line like pixel-mapped LED tape
    segS[i / 2] = (my - box.min.y) * 0.9 + mx * 0.55 + (box.max.z - mz) * 0.25;
    segKind[i / 2] = claw ? 2 : paw ? 1 : 0;
    pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 3);
    col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 3);
  }
  edges.dispose();
  const lg = new LineSegmentsGeometry();
  lg.setPositions(pos);
  lg.setColors(col);
  const lineMat = new LineMaterial({ vertexColors: true, linewidth: 2.0, worldUnits: false, toneMapped: false });
  const lines = new LineSegments2(lg, lineMat);
  lines.computeLineDistances();
  scene.add(lines);

  // ---------- eyes ----------
  const rc = new THREE.Raycaster();
  const eyes = new THREE.Group();
  const eyeMat = new THREE.MeshBasicMaterial({ color: RED.clone(), toneMapped: false, side: THREE.DoubleSide });
  const glows = [];
  const headH = box.max.y - headBottom;
  const eyeY = headBottom + headH * 0.55;
  [-1, 1].forEach((s) => {
    const ex = cx + s * 0.95;
    rc.set(new THREE.Vector3(ex, eyeY, box.max.z + 20), new THREE.Vector3(0, 0, -1));
    const hit = rc.intersectObject(mesh)[0];
    if (!hit) return;
    const n = hit.face ? hit.face.normal.clone().transformDirection(mesh.matrixWorld) : new THREE.Vector3(0, 0, 1);
    if (n.z < 0) n.negate();
    // angled, slit-like eye: a stretched diamond tilted down toward the nose
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.3, 4), eyeMat);
    eye.position.copy(hit.point).addScaledVector(n, 0.06);
    eye.lookAt(eye.position.clone().add(n));
    eye.rotateZ(Math.PI / 4 + s * 0.35);
    eye.scale.set(2.3, 1.0, 1);
    eyes.add(eye);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff3048', ...ADDITIVE }));
    glow.position.copy(hit.point).addScaledVector(n, 0.25);
    glow.scale.setScalar(2.8);
    eyes.add(glow);
    glows.push(glow);
  });
  scene.add(eyes);

  const colorBuf = lg.attributes.instanceColorStart.data; // interleaved start/end colours (6 floats per segment)
  const arr = colorBuf.array;
  const tint = new THREE.Color();
  const tc = new THREE.Color();
  return {
    lines,
    eyes,
    /**
     * @param {number} t time
     * @param {number} pulse 0..1 beat envelope
     * @param {string} bodyHex colour of the white body lines for the current scene
     * @param {number} speed chase speed (0 = static glow)
     */
    update(t, pulse, bodyHex = '#d6f3ff', speed = 1) {
      eyeMat.color.copy(RED).multiplyScalar(0.8 + 0.5 * pulse);
      glows.forEach((g) => { g.material.opacity = 0.85 + 0.15 * pulse; g.scale.setScalar(2.6 + 1.0 * pulse); });
      tint.set(bodyHex);
      for (let k = 0; k < nSeg; k++) {
        // two running bands + a beat flash: LED tape chasing along the tiger's lines
        const ph = segS[k] * 1.3 - t * 5 * speed;
        const band = Math.pow(0.5 + 0.5 * Math.sin(ph), 8) + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(ph * 0.5 + 1.7), 12);
        const lvl = 0.28 + 1.5 * band + 0.35 * pulse;
        const kind = segKind[k];
        if (kind === 0) tc.copy(tint).multiplyScalar(1.7 * lvl);
        else if (kind === 1) tc.copy(ORANGE).multiplyScalar(0.45 + 0.7 * band + 0.3 * pulse);
        else tc.copy(RED).multiplyScalar(0.5 + 0.6 * band + 0.3 * pulse);
        const o = k * 6;
        arr[o] = arr[o + 3] = tc.r; arr[o + 1] = arr[o + 4] = tc.g; arr[o + 2] = arr[o + 5] = tc.b;
      }
      colorBuf.needsUpdate = true;
    },
    resize(w, h) { lineMat.resolution.set(w, h); },
  };
}
