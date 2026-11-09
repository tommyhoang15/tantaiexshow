import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { TrussBuilder, V } from './truss.js';
import { M, makeLedMaterial, ADDITIVE, glowTexture } from './materials.js';
import { MovingHead, Par, Blinder, Strobe, Laser, lineArray, subwoofer, wedge, chainHoist } from './fixtures.js';
import { Particles, Confetti, Emitter } from './effects.js';
import { VideoLayer } from './video.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBean } from '../characters.js';
import { STAGES } from '../venue-data.js';

// ------------------------------------------------------------------
// Layout (metres). Main deck: x -18..18, z -40..-28, top at y = 2.2
// ------------------------------------------------------------------
const DECK_Y = 2.2;
const GRID_Y = 15.2;
const TX = 23.8; // roof tower x
const Z_FRONT = -28.6, Z_BACK = -40.6, Z_MID = -36, Z_MID2 = -32.3;
const WALL_Z = -39.4;

export const SCENES = [
  { id: 'fan', label: 'Quạt beam' },
  { id: 'sweep', label: 'Quét sóng' },
  { id: 'ballyhoo', label: 'Ballyhoo' },
  { id: 'strobe', label: 'Strobe' },
  { id: 'warm', label: 'Ballad ấm' },
  { id: 'laser', label: 'Laser' },
  { id: 'climax', label: 'Cao trào' },
];
const AUTO_ORDER = ['fan', 'sweep', 'warm', 'ballyhoo', 'laser', 'strobe', 'climax'];
const PALETTES = {
  fan: ['#ff2d55', '#ff9f0a', '#ffd60a'],
  sweep: ['#0a84ff', '#5e5ce6', '#64d2ff'],
  ballyhoo: ['#bf5af2', '#ff375f', '#0a84ff', '#30d158'],
  strobe: ['#ffffff', '#dfe8ff'],
  warm: ['#ffb347', '#ffd28a', '#ff8c42'],
  laser: ['#30d158', '#64d2ff', '#30d158'],
  climax: ['#ff2d55', '#ffd60a', '#ffffff', '#0a84ff'],
};
const BPM = 128;

const rand = (seed) => { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); };
const lerp = THREE.MathUtils.lerp;

function label(text, y = 0) {
  const el = document.createElement('div');
  el.className = 'label3d';
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.y = y;
  return o;
}

function at(o, x, y, z) { o.position.set(x, y, z); return o; }

function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, g: c.getContext('2d'), tex };
}

function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

// ------------------------------------------------------------------
export function buildStage({ scene, zones, video, videoId, videoStart = 0, ledText, reduceMotion = false }) {
  const AUTO = reduceMotion ? AUTO_ORDER.filter((id) => id !== 'strobe') : AUTO_ORDER;
  const root = new THREE.Group();
  scene.add(root);
  const updaters = [];
  const obstacles = []; // {x, z, w, d} footprints the crowd should avoid

  // ================= STRUCTURE =================
  const truss = new TrussBuilder();
  // Ground-support roof: 4 towers + perimeter + 2 mid trusses
  [[-TX, Z_FRONT], [TX, Z_FRONT], [-TX, Z_BACK], [TX, Z_BACK]].forEach(([x, z]) => truss.tower(x, z, GRID_Y + 0.6));
  truss.box(V(-TX, GRID_Y, Z_FRONT), V(TX, GRID_Y, Z_FRONT), 0.52);
  truss.box(V(-TX, GRID_Y, Z_BACK), V(TX, GRID_Y, Z_BACK), 0.52);
  truss.box(V(-TX, GRID_Y, Z_FRONT), V(-TX, GRID_Y, Z_BACK), 0.52);
  truss.box(V(TX, GRID_Y, Z_FRONT), V(TX, GRID_Y, Z_BACK), 0.52);
  truss.box(V(-TX, GRID_Y, Z_MID), V(TX, GRID_Y, Z_MID), 0.4);
  truss.box(V(-TX, GRID_Y, Z_MID2), V(TX, GRID_Y, Z_MID2), 0.4);
  // tower sleeve blocks + top cross
  [[-TX, Z_FRONT], [TX, Z_FRONT], [-TX, Z_BACK], [TX, Z_BACK]].forEach(([x, z]) => {
    box(0.9, 0.9, 0.9, M.steel, x, GRID_Y, z, root);
    box(0.7, 0.35, 0.7, M.fixture, x, GRID_Y + 0.75, z, root);
  });
  // Upstage vertical light ladders
  const LADDER_X = [-14.2, -9.2, 9.2, 14.2];
  LADDER_X.forEach((x) => truss.ladder(V(x, DECK_Y, -38.4), V(x, GRID_Y - 0.3, -38.4), 0.4, V(0, 0, 1)));
  // IMAG goalposts (left/right)
  [-1, 1].forEach((s) => {
    truss.tower(s * 25.9, -30.6, 14.5, 0.4);
    truss.tower(s * 33.1, -30.6, 14.5, 0.4);
    truss.box(V(s * 25.9, 14.3, -30.6), V(s * 33.1, 14.3, -30.6), 0.4);
  });
  // Delay / light towers in the audience
  const TOWERS = [[-21, 6.2], [21, 6.2], [-27.5, 22], [27.5, 22]];
  TOWERS.forEach(([x, z]) => truss.tower(x, z, 11, 0.4));
  root.add(truss.build());
  obstacles.push(...TOWERS.map(([x, z]) => ({ x, z, w: 2.4, d: 2.4 })));

  // ---- Decks ----
  const deckTop = canvasTex(512, 256);
  {
    const { g } = deckTop;
    g.fillStyle = '#1b1c20'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 2;
    for (let x = 0; x <= 512; x += 512 / 18) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    for (let y = 0; y <= 256; y += 256 / 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    deckTop.tex.needsUpdate = true;
  }
  const deckTopMat = new THREE.MeshStandardMaterial({ map: deckTop.tex, roughness: 0.4, metalness: 0.2 });
  const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(36, DECK_Y, 12), [M.fabric, M.fabric, deckTopMat, M.fabric, M.fabric, M.fabric]);
  mainDeck.position.set(0, DECK_Y / 2, -34);
  mainDeck.receiveShadow = true;
  root.add(mainDeck);
  [-1, 1].forEach((s) => {
    const wing = box(5, DECK_Y - 0.05, 11, M.deck, s * 20.5, (DECK_Y - 0.05) / 2, -34.5, root);
    wing.receiveShadow = true;
    // backstage stairs
    for (let i = 0; i < 8; i++) box(1.4, (DECK_Y / 8) * (i + 1), 0.3, M.deck, s * 16.5, ((DECK_Y / 8) * (i + 1)) / 2, -40.15 - (7 - i) * 0.3, root);
    // handrail
    box(0.04, 0.04, 2.6, M.steel, s * 17.2, DECK_Y + 0.5, -41.3, root).rotation.x = -0.65;
  });
  obstacles.push({ x: 0, z: -34, w: 48, d: 13 });

  // Front fascia LED (scrolling)
  const fascia = canvasTex(1024, 64);
  const fasciaMat = makeLedMaterial(fascia.tex);
  const fasciaMesh = new THREE.Mesh(new THREE.PlaneGeometry(36, DECK_Y - 0.25), fasciaMat);
  fasciaMesh.position.set(0, (DECK_Y - 0.25) / 2 + 0.05, -27.99);
  root.add(fasciaMesh);

  // Lip LED strip + runway + stage B LED edges
  const stripMat = new THREE.MeshBasicMaterial({ color: '#ff2d55', toneMapped: false, fog: false });
  box(36, 0.05, 0.08, stripMat, 0, DECK_Y + 0.02, -28.04, root);

  // Runway (catwalk) and connecting steps
  const RW = STAGES.runway;
  const runway = box(RW.w, RW.h, RW.d, M.deck, RW.x, RW.h / 2, RW.z, root);
  runway.receiveShadow = true;
  box(RW.w, DECK_Y - 0.4, 0.9, M.deck, 0, (DECK_Y - 0.4) / 2, -28.45, root);
  [-1, 1].forEach((s) => box(0.06, 0.05, RW.d, stripMat, s * (RW.w / 2 - 0.03), RW.h + 0.02, RW.z, root));
  // Runway side LED fascia
  [-1, 1].forEach((s) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(RW.d, RW.h - 0.1), fasciaMat);
    p.position.set(s * (RW.w / 2 + 0.01), RW.h / 2, RW.z);
    p.rotation.y = s * Math.PI / 2;
    root.add(p);
  });
  obstacles.push({ x: 0, z: -14, w: 6.5, d: 28 });

  // Stage B: round thrust with LED ring and a hydraulic lift centre
  const SB = STAGES.b;
  const stageB = new THREE.Mesh(new THREE.CylinderGeometry(SB.r, SB.r, SB.h, 48), [M.fabric, deckTopMat, M.deck]);
  stageB.position.set(SB.x, SB.h / 2, SB.z);
  root.add(stageB);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(SB.r - 0.05, 0.05, 6, 64), stripMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(SB.x, SB.h + 0.02, SB.z);
  root.add(ring);
  const liftMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false });
  const lift = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.06, 40), liftMat);
  lift.position.set(SB.x, SB.h + 0.04, SB.z);
  root.add(lift);
  root.add(at(label('Stage B'), SB.x, SB.h + 2.6, SB.z));
  obstacles.push({ x: SB.x, z: SB.z, w: 11, d: 11 });

  // ---- Barricade (mojo) ----
  const bar = new TrussBuilder();
  const barricadeLine = (a, b) => {
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / 1.0));
    for (let i = 0; i < n; i++) {
      const p = a.clone().lerp(b, i / n), q = a.clone().lerp(b, (i + 1) / n);
      bar.bar(V(p.x, 1.15, p.z), V(q.x, 1.15, q.z), 0.03);
      bar.bar(V(p.x, 0.05, p.z), V(p.x, 1.15, p.z), 0.025);
      bar.bar(V(p.x, 0.6, p.z), V(q.x, 0.6, q.z), 0.015);
    }
  };
  const BZ = -26.9;
  barricadeLine(V(-18, 0, BZ), V(-2.8, 0, BZ));
  barricadeLine(V(2.8, 0, BZ), V(18, 0, BZ));
  [-1, 1].forEach((s) => barricadeLine(V(s * 2.8, 0, BZ), V(s * 2.8, 0, -2.3)));
  for (let i = 0; i < 28; i++) {
    const a0 = -Math.PI / 2 - 1.15 + (i / 28) * (Math.PI * 2 - 2.3) + Math.PI;
    const a1 = -Math.PI / 2 - 1.15 + ((i + 1) / 28) * (Math.PI * 2 - 2.3) + Math.PI;
    const r = SB.r + 1.4;
    barricadeLine(V(SB.x + Math.sin(a0) * r, 0, SB.z + Math.cos(a0) * r), V(SB.x + Math.sin(a1) * r, 0, SB.z + Math.cos(a1) * r));
  }
  root.add(bar.build(M.barricade));

  // ---- LED walls ----
  const wall = canvasTex(1024, 352);
  // cabinet seams (0.5 m panels) drawn once, then stamped over each frame
  const seams = document.createElement('canvas');
  seams.width = 1024; seams.height = 352;
  {
    const sg = seams.getContext('2d');
    sg.strokeStyle = 'rgba(0,0,0,0.45)'; sg.lineWidth = 1;
    for (let x = 0; x < 1024; x += 1024 / 68) { sg.beginPath(); sg.moveTo(x, 0); sg.lineTo(x, 352); sg.stroke(); }
    for (let y = 0; y < 352; y += 352 / 23) { sg.beginPath(); sg.moveTo(0, y); sg.lineTo(1024, y); sg.stroke(); }
  }
  const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(34, 11.6), makeLedMaterial(wall.tex));
  wallMesh.position.set(0, DECK_Y + 0.4 + 5.8, WALL_Z);
  root.add(wallMesh);
  box(34.4, 12, 0.3, M.black, 0, wallMesh.position.y, WALL_Z - 0.2, root); // cabinet backs
  for (let x = -16; x <= 16; x += 4) root.add(at(chainHoist(GRID_Y - 14.6 - 0.2), x, 14.6, WALL_Z - 0.2));
  // upstage black drape
  const drape = new THREE.Mesh(new THREE.PlaneGeometry(47, GRID_Y), M.fabric);
  drape.position.set(0, GRID_Y / 2, -41);
  root.add(drape);

  const col = canvasTex(128, 352);
  [-1, 1].forEach((s) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 11.6), makeLedMaterial(col.tex));
    m.position.set(s * 20.5, DECK_Y + 6.2, -39.3);
    root.add(m);
    box(4.2, 11.8, 0.25, M.black, s * 20.5, DECK_Y + 6.2, -39.5, root);
  });

  // Centre video screen (YouTube) + frame
  const holes = [];
  const VID = { w: 16, h: 9 };
  const centre = new THREE.Vector3(0, DECK_Y + 0.7 + VID.h / 2, -38.95);
  box(VID.w + 0.5, VID.h + 0.5, 0.2, M.black, centre.x, centre.y, centre.z - 0.15, root);
  holes.push(video.addScreen({ id: videoId, start: videoStart, w: VID.w, h: VID.h, position: centre }));

  // IMAG side screens (same live feed)
  [-1, 1].forEach((s) => {
    const pos = new THREE.Vector3(s * 29.5, 10.2, -30.3);
    const ry = -s * 0.3;
    const frame = box(8.4, 4.9, 0.25, M.black, pos.x, pos.y, pos.z, root);
    frame.rotation.y = ry;
    frame.translateZ(-0.16);
    holes.push(video.addScreen({ id: videoId, start: videoStart, w: 8, h: 4.5, position: pos.clone(), rotationY: ry, px: 960 }));
    [-3, 3].forEach((dx) => root.add(at(chainHoist(14.3 - 12.7), pos.x + dx, 12.7, pos.z)));
  });
  holes.forEach((h) => root.add(h));

  // ---- PA system ----
  [-1, 1].forEach((s) => {
    const la = lineArray(12);
    la.position.set(s * 20.6, 13.4, -28.25);
    la.rotation.y = -s * 0.12;
    root.add(la);
    const side = lineArray(8, 0.05);
    side.position.set(s * 22.9, 13.4, -29.4);
    side.rotation.y = -s * 0.75;
    root.add(side);
  });
  // ground sub array under the lip (cardioid stacks)
  [-16.2, -12.6, -9, -5.4, 5.4, 9, 12.6, 16.2].forEach((x) => {
    for (let k = 0; k < 2; k++) {
      const sw = subwoofer();
      sw.position.set(x, k * 0.6, -27.55);
      root.add(sw);
    }
  });
  // stage monitors
  [-12, -7, -2.6, 2.6, 7, 12].forEach((x) => {
    const w = wedge();
    w.position.set(x, DECK_Y, -28.9);
    w.rotation.y = Math.PI;
    root.add(w);
  });
  // side-fill stacks on wings
  [-1, 1].forEach((s) => {
    for (let k = 0; k < 3; k++) box(1.0, 0.7, 0.8, M.speaker, s * 18.9, DECK_Y + 0.35 + k * 0.72, -31, root);
  });

  // ---- Backline: drum riser, DJ booth, keys, mic stands ----
  const riser = box(5, 0.6, 3.4, M.deck, 0, DECK_Y + 0.3, -35.6, root);
  riser.receiveShadow = true;
  const riserFace = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.56), fasciaMat);
  riserFace.position.set(0, DECK_Y + 0.3, -33.89);
  root.add(riserFace);
  const kit = new THREE.Group();
  kit.position.set(0, DECK_Y + 0.6, -35.8);
  root.add(kit);
  const shell = new THREE.MeshStandardMaterial({ color: '#7a0f1c', roughness: 0.3, metalness: 0.4 });
  const cymbal = new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: 0.25, metalness: 0.9 });
  const kick = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.45, 20), shell); kick.rotation.x = Math.PI / 2; kick.position.set(0, 0.33, 0.4); kit.add(kick);
  [[-0.35, 0.72, 0.2, 0.15], [0.35, 0.72, 0.2, 0.15], [0.7, 0.45, 0.5, 0.22], [-0.55, 0.55, 0.65, 0.17]].forEach(([x, y, z, r]) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 16), shell); t.position.set(x, y, z); kit.add(t);
  });
  [[-0.8, 1.2, 0.4], [0.9, 1.3, 0.2], [0.2, 1.4, -0.2]].forEach(([x, y, z]) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.01, 20), cymbal); c.position.set(x, y, z); c.rotation.z = 0.15; kit.add(c);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, y, 4), M.steel); stand.position.set(x, y / 2, z); kit.add(stand);
  });
  // DJ booth
  const booth = box(2.6, 1.05, 1.0, M.black, 6.5, DECK_Y + 0.52, -34.6, root);
  const boothFace = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.0), fasciaMat);
  boothFace.position.set(6.5, DECK_Y + 0.52, -34.09);
  root.add(boothFace);
  [-0.8, 0, 0.8].forEach((dx) => box(0.5, 0.08, 0.6, M.fixture, 6.5 + dx, DECK_Y + 1.09, -34.7, root));
  booth.castShadow = true;
  // keyboard rig
  box(1.4, 0.08, 0.4, M.fixture, -6.5, DECK_Y + 0.95, -34.6, root);
  [-0.5, 0.5].forEach((dx) => box(0.04, 0.9, 0.04, M.steel, -6.5 + dx, DECK_Y + 0.45, -34.6, root));
  // mic stands
  [-4, 0, 4].forEach((x) => {
    box(0.025, 1.5, 0.025, M.steel, x, DECK_Y + 0.75, -29.6, root);
    box(0.3, 0.02, 0.3, M.steel, x, DECK_Y + 0.01, -29.6, root);
  });
  // road cases backstage
  for (let i = 0; i < 10; i++) box(1.2, 0.8, 0.6, M.fixture, -12 + (i % 5) * 1.4, 0.4 + Math.floor(i / 5) * 0.8, -42.2, root);

  // ---- FOH (front of house) ----
  const FOH = { x: 0, z: 9.5, w: 7, d: 4.6 };
  box(FOH.w, 0.4, FOH.d, M.deck, FOH.x, 0.2, FOH.z, root);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => box(0.08, 3.2, 0.08, M.steel, FOH.x + sx * (FOH.w / 2 - 0.1), 2, FOH.z + sz * (FOH.d / 2 - 0.1), root));
  box(FOH.w + 0.4, 0.15, FOH.d + 0.4, M.tent, FOH.x, 3.65, FOH.z, root);
  box(3.2, 0.9, 1.0, M.fixture, -1.2, 0.85, FOH.z - 0.6, root); // sound desk
  box(2.0, 0.9, 1.0, M.fixture, 2.0, 0.85, FOH.z - 0.6, root); // lighting desk
  const deskGlow = new THREE.MeshBasicMaterial({ color: '#3a7bff', toneMapped: false });
  box(1.6, 0.02, 0.5, deskGlow, 2.0, 1.31, FOH.z - 0.6, root);
  box(2.6, 0.02, 0.6, new THREE.MeshBasicMaterial({ color: '#2fd66b', toneMapped: false }), -1.2, 1.31, FOH.z - 0.6, root);
  [-1.2, 2.0].forEach((x) => { const f = makeBean('#202020'); f.g.position.set(x, 0.4, FOH.z + 0.3); f.g.rotation.y = Math.PI; root.add(f.g); });
  root.add(at(label('FOH'), FOH.x, 4.6, FOH.z));
  obstacles.push({ x: FOH.x, z: FOH.z, w: FOH.w + 1, d: FOH.d + 1 });

  // ---- Camera jib ----
  const jib = new THREE.Group();
  jib.position.set(20.3, 0, -24.5);
  root.add(jib);
  [0, 2.1, 4.2].forEach((a) => { const leg = box(0.05, 1.8, 0.05, M.steel, Math.sin(a) * 0.5, 0.85, Math.cos(a) * 0.5, jib); leg.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3); });
  box(0.12, 1.6, 0.12, M.steel, 0, 1.9, 0, jib);
  const jibArm = new THREE.Group();
  jibArm.position.y = 2.7;
  jib.add(jibArm);
  box(7.5, 0.12, 0.12, M.steel, -2.5, 0, 0, jibArm);
  box(0.5, 0.5, 0.5, M.fixture, 1.6, 0, 0, jibArm); // counterweight
  const cam = box(0.35, 0.3, 0.5, M.fixture, -6.2, -0.3, 0, jibArm);
  cam.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 10).rotateX(Math.PI / 2).translate(0, 0, 0.35), M.black));
  obstacles.push({ x: 20.3, z: -24.5, w: 3, d: 3 });

  // ================= LIGHTING RIG =================
  const heads = { mid: [], spot: [], wash: [], side: [], floor: [], ladder: [], runway: [], stageB: [], tower: [], follow: [] };
  const add = (group, f, x, y, z) => { f.root.position.set(x, y, z); root.add(f.root); heads[group].push(f); return f; };
  const hangY = GRID_Y - 0.28;

  for (let i = 0; i < 14; i++) add('mid', new MovingHead({ type: 'beam' }), lerp(-20, 20, i / 13), hangY - 0.2, Z_MID);
  for (let i = 0; i < 12; i++) add('spot', new MovingHead({ type: 'spot' }), lerp(-19, 19, i / 11), hangY - 0.2, Z_MID2);
  for (let i = 0; i < 10; i++) add('wash', new MovingHead({ type: 'wash' }), lerp(-19, 19, i / 9), hangY - 0.3, Z_FRONT);
  [-1, 1].forEach((s) => { for (let i = 0; i < 4; i++) add('side', new MovingHead({ type: 'wash' }), s * TX, hangY - 0.3, lerp(-30.5, -39, i / 3)); });
  for (let i = 0; i < 12; i++) add('floor', new MovingHead({ type: 'beam', hang: false }), lerp(-16.5, 16.5, i / 11), DECK_Y, -37.4);
  LADDER_X.forEach((x) => {
    [4.6, 7.6, 10.6, 13.6].forEach((y) => {
      const f = new MovingHead({ type: 'beam' });
      f.root.rotation.x = -Math.PI / 2;
      add('ladder', f, x, y, -38.1);
    });
  });
  [-1, 1].forEach((s) => { for (let i = 0; i < 6; i++) add('runway', new MovingHead({ type: 'beam', hang: false }), s * 3.7, 0, lerp(-25.5, -4.5, i / 5)); });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    add('stageB', new MovingHead({ type: 'beam', hang: false }), SB.x + Math.sin(a) * (SB.r - 0.6), SB.h, SB.z + Math.cos(a) * (SB.r - 0.6));
  }
  // light towers: top platform with 2 beams on top + 1 spot hung below + blinder + delay speakers
  const blinders = [];
  TOWERS.forEach(([x, z]) => {
    box(1.8, 0.1, 1.8, M.steel, x, 11.05, z, root);
    add('tower', new MovingHead({ type: 'tower', hang: false }), x - 0.5, 11.1, z);
    add('tower', new MovingHead({ type: 'tower', hang: false }), x + 0.5, 11.1, z);
    add('spot', new MovingHead({ type: 'spot' }), x, 10.95, z - 0.6);
    const b = new Blinder(2, 1);
    b.root.position.set(x, 10.4, z - 0.95);
    b.root.rotation.y = Math.PI; // face the stage
    root.add(b.root);
    blinders.push(b);
    const d = lineArray(4, 0.03);
    d.position.set(x, 9.9, z + 0.6);
    d.rotation.y = x > 0 ? -0.2 : 0.2;
    root.add(d);
    root.add(at(label('Tháp đèn'), x, 12.8, z));
  });
  // follow spots on the FOH roof
  [-2.6, 2.6].forEach((x) => {
    box(0.9, 0.5, 0.9, M.fixture, x, 3.98, FOH.z + 1.2, root);
    const f = new MovingHead({ type: 'spot', hang: false });
    f.base = 0.45;
    f.speed = 2;
    add('follow', f, x, 4.25, FOH.z + 1.2);
  });

  // PAR row (top of front truss) and blinders hung under it
  const pars = [];
  for (let i = 0; i < 24; i++) {
    const p = new Par({ tilt: 0.55 });
    p.root.position.set(lerp(-22, 22, i / 23), hangY - 0.05, Z_FRONT + 0.45);
    root.add(p.root);
    pars.push(p);
  }
  [-17, -10, -3.5, 3.5, 10, 17].forEach((x) => {
    const b = new Blinder(2, 2);
    b.root.position.set(x, hangY - 0.8, Z_FRONT + 0.3);
    root.add(b.root);
    blinders.push(b);
  });
  // strobes on top of mid truss, facing the audience
  const strobes = [];
  for (let i = 0; i < 10; i++) {
    const st = new Strobe();
    st.root.position.set(lerp(-20, 20, i / 9), GRID_Y + 0.42, Z_MID);
    root.add(st.root);
    strobes.push(st);
  }
  // lasers: upstage floor + front corners
  const lasers = [];
  [[-12.5, DECK_Y + 0.11, -37.0], [-4, DECK_Y + 0.11, -37.0], [4, DECK_Y + 0.11, -37.0], [12.5, DECK_Y + 0.11, -37.0], [-17, DECK_Y + 0.11, -28.5], [17, DECK_Y + 0.11, -28.5]].forEach(([x, y, z]) => {
    const l = new Laser(9, 80);
    l.root.position.set(x, y, z);
    root.add(l.root);
    lasers.push(l);
  });

  // Real lights that actually light the deck, performers and front rows
  const stageLights = [-12, -4, 4, 12].map((x) => {
    const l = new THREE.SpotLight('#ffffff', 0, 40, 0.5, 0.6, 1.2);
    l.position.set(x, GRID_Y - 1, Z_FRONT + 1);
    l.target.position.set(x * 0.6, DECK_Y, -33);
    root.add(l, l.target);
    return l;
  });
  const crowdLight = new THREE.PointLight('#ffffff', 0, 60, 1.5);
  crowdLight.position.set(0, 10, -18);
  root.add(crowdLight);

  // ================= PERFORMERS =================
  const performers = [];
  const rapper = makeBean('#f4f4f4');
  rapper.g.position.set(0, DECK_Y, -30);
  root.add(rapper.g);
  const hype = makeBean('#d43b3b');
  hype.g.position.set(-5, DECK_Y, -31);
  root.add(hype.g);
  const dj = makeBean('#1e1e22');
  dj.g.position.set(6.5, DECK_Y, -35.5);
  root.add(dj.g);
  const drummer = makeBean('#2a2a30');
  drummer.g.position.set(0, DECK_Y + 0.6, -36.6);
  root.add(drummer.g);
  const dancers = [-11, -8, 8, 11].map((x, i) => {
    const d = makeBean(i % 2 ? '#ffd166' : '#111');
    d.g.position.set(x, DECK_Y, -32.5);
    root.add(d.g);
    return d;
  });
  performers.push(rapper, hype, dj, drummer, ...dancers);
  // Rapper path: front stage → runway → stage B → back
  const path = [V(0, DECK_Y, -30), V(-8, DECK_Y, -29.6), V(8, DECK_Y, -29.6), V(0, DECK_Y, -29.5), V(0, RW.h, -20), V(0, RW.h, -6), V(0, SB.h, 2), V(1.5, SB.h, 3), V(-1.5, SB.h, 2.5), V(0, SB.h, 2), V(0, RW.h, -10), V(0, DECK_Y, -30)];
  const pathLen = path.length;

  // ================= EFFECTS =================
  const particles = new Particles(5000);
  root.add(particles.points);
  const confetti = new Confetti(1800);
  root.add(confetti.mesh);
  const flames = [-15, -10, -6, 6, 10, 15].map((x) => new Emitter(particles, V(x, DECK_Y, -28.5), 'flame'));
  flames.forEach((e) => box(0.5, 0.3, 0.5, M.fixture, e.pos.x, DECK_Y + 0.15, e.pos.z, root));
  const co2 = [V(-17.5, DECK_Y, -29), V(17.5, DECK_Y, -29), V(-3.2, SB.h, SB.z), V(3.2, SB.h, SB.z)].map((p) => new Emitter(particles, p, 'co2'));
  const gerbs = [];
  [-1, 1].forEach((s) => { for (let i = 0; i < 5; i++) gerbs.push(new Emitter(particles, V(s * (RW.w / 2 - 0.15), RW.h, lerp(-26, -3, i / 4)), 'gerb')); });
  const emitters = [...flames, ...co2, ...gerbs];
  const confettiOrigins = [-16, -8, 0, 8, 16].map((x) => V(x, hangY - 0.5, Z_FRONT + 0.4));

  // Phone lights in the crowd (twinkle during ballads)
  const phoneZones = zones.filter((z) => z.kind !== 'vip');
  const PHONES = 900;
  const phonePos = new Float32Array(PHONES * 3);
  for (let i = 0; i < PHONES; i++) {
    const z = phoneZones[i % phoneZones.length];
    const lift = z.lift ?? 0;
    phonePos.set([z.rect.x + (Math.random() - 0.5) * z.rect.w, lift + 0.15 + 1.75 + Math.random() * 0.4, z.rect.z + (Math.random() - 0.5) * z.rect.d], i * 3);
  }
  const phoneGeo = new THREE.BufferGeometry();
  phoneGeo.setAttribute('position', new THREE.BufferAttribute(phonePos, 3));
  const phoneMat = new THREE.PointsMaterial({ map: glowTexture(), size: 0.5, color: '#fff6e0', opacity: 0, ...ADDITIVE });
  const phones = new THREE.Points(phoneGeo, phoneMat);
  root.add(phones);

  // ================= LED CONTENT =================
  function drawLed(t, beat, pal, sceneId) {
    // upstage wall
    const g = wall.g, W = 1024, H = 352;
    const c0 = pal[0], c1 = pal[1 % pal.length], c2 = pal[2 % pal.length];
    g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);
    const bf = beat % 1;
    if (sceneId === 'warm') {
      const grd = g.createRadialGradient(W / 2, H * 1.1, 10, W / 2, H * 1.1, W * 0.7);
      grd.addColorStop(0, c1); grd.addColorStop(0.5, c0); grd.addColorStop(1, '#120600');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    } else if (sceneId === 'laser' || sceneId === 'sweep') {
      for (let i = 0; i < 24; i++) {
        const y = ((i * 30 + t * 120) % (H + 60)) - 30;
        g.fillStyle = i % 2 ? c0 : c1;
        g.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(i + t));
        g.fillRect(0, y, W, 6);
      }
      g.globalAlpha = 1;
    } else {
      const bars = 48;
      for (let i = 0; i < bars; i++) {
        const lvl = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.7 + t * 3)) * (0.5 + 0.5 * Math.exp(-bf * 4));
        g.fillStyle = [c0, c1, c2][i % 3];
        const bw = W / bars;
        g.fillRect(i * bw + 2, H - lvl * H, bw - 4, lvl * H);
      }
      if (!reduceMotion && (sceneId === 'strobe' || sceneId === 'climax')) {
        g.fillStyle = `rgba(255,255,255,${Math.exp(-bf * 7) * 0.8})`;
        g.fillRect(0, 0, W, H);
      }
    }
    g.drawImage(seams, 0, 0);
    wall.tex.needsUpdate = true;

    // side columns
    const cg = col.g;
    cg.fillStyle = '#05060a'; cg.fillRect(0, 0, 128, 352);
    for (let i = 0; i < 16; i++) {
      const y = ((i * 24 - t * 90) % 384 + 384) % 384 - 16;
      cg.fillStyle = i % 2 ? c0 : c2;
      cg.beginPath(); cg.moveTo(0, y); cg.lineTo(64, y - 18); cg.lineTo(128, y); cg.lineTo(128, y + 8); cg.lineTo(64, y - 10); cg.lineTo(0, y + 8); cg.fill();
    }
    col.tex.needsUpdate = true;

    // scrolling fascia text
    const fg = fascia.g;
    fg.fillStyle = '#05060a'; fg.fillRect(0, 0, 1024, 64);
    fg.font = '800 40px Sora, sans-serif';
    fg.textBaseline = 'middle';
    const text = `${ledText}   ✦   `;
    const tw = fg.measureText(text).width;
    const off = -((t * 140) % tw);
    fg.fillStyle = c0;
    for (let x = off; x < 1024; x += tw) fg.fillText(text, x, 34);
    fascia.tex.needsUpdate = true;
  }

  // ================= SHOW CONTROLLER =================
  const state = { auto: true, scene: 'fan', haze: true, lastScene: null, lastBeat: -1, master: 1 };
  const tmpV = new THREE.Vector3();
  const C = (hex) => new THREE.Color(hex);

  function fire(kind, now) {
    if (kind === 'flame') flames.forEach((e, i) => e.fire(now + i * 0.04, 0.7));
    if (kind === 'co2') co2.forEach((e) => e.fire(now, 1.4));
    if (kind === 'gerb') gerbs.forEach((e) => e.fire(now, 3));
    if (kind === 'confetti') confetti.burst(confettiOrigins);
  }

  function onEnter(id, now) {
    if (id === 'climax') { fire('confetti', now); fire('co2', now); fire('flame', now); }
    if (id === 'warm') fire('gerb', now);
  }

  let curT = 0;
  let hazeAcc = 0;
  function update(t, dt) {
    curT = t;
    const beat = (t * BPM) / 60;
    const bi = Math.floor(beat);
    const bf = beat - bi;
    const id = state.auto ? AUTO[Math.floor(beat / 32) % AUTO.length] : state.scene;
    if (id !== state.lastScene) { onEnter(id, t); state.lastScene = id; state.scene = id; }
    const pal = PALETTES[id];
    const colorOf = (i, shift = 0) => pal[(i + Math.floor(beat / 4) + shift) % pal.length];
    const pulse = 0.55 + 0.45 * Math.exp(-bf * 5);
    // prefers-reduced-motion: no 8 Hz flashing, just a gentle level
    const strobeOn = reduceMotion ? 0.6 : (Math.floor(beat * 4) % 2 === 0) ? 1 : 0;
    const newBeat = bi !== state.lastBeat;
    state.lastBeat = bi;

    // beat-driven pyro in climax
    if (id === 'climax' && newBeat) {
      if (bi % 8 === 0) fire('flame', t);
      if (bi % 16 === 4) fire('co2', t);
      if (bi % 16 === 8) fire('gerb', t);
    }

    const rapperPos = rapper.g.position;
    const setAll = (arr, fn) => arr.forEach((f, i) => { fn(f, i, arr.length); f.update(dt, state.master); });

    // ---- mid truss beams ----
    setAll(heads.mid, (f, i, n) => {
      const u = i / (n - 1) - 0.5;
      f.color.set(colorOf(i));
      if (id === 'fan') { f.aimAt(tmpV.set(u * 120 * (0.6 + 0.4 * Math.sin(t * 0.5)), 0, 45)); f.dim = pulse; }
      else if (id === 'sweep') { f.aimAt(tmpV.set(45 * Math.sin(t * 1.2 + i * 0.45), 0, 22 + 15 * Math.sin(t * 0.7))); f.dim = 0.9; }
      else if (id === 'ballyhoo') { const s = Math.floor(beat / 2) * 31 + i; f.aimAt(tmpV.set((rand(s) - 0.5) * 100, 0, rand(s + 7) * 60 - 10)); f.dim = 1; }
      else if (id === 'strobe') { f.color.set('#ffffff'); f.aimAt(tmpV.set(u * 50, 0, 5)); f.dim = strobeOn; }
      else if (id === 'warm') { f.aimAt(tmpV.set(SB.x, SB.h, SB.z)); f.dim = 0.55; }
      else if (id === 'laser') { f.aimAt(tmpV.set(u * 60, 0, 30)); f.dim = 0.12; }
      else { f.aimAt(tmpV.set(55 * Math.sin(t * 2.2 + i * 0.5), 0, 20 + 18 * Math.cos(t * 1.4))); f.dim = pulse; }
    });
    // ---- floor beams (upstage) ----
    setAll(heads.floor, (f, i, n) => {
      const u = i / (n - 1) - 0.5;
      f.color.set(colorOf(i, 1));
      if (id === 'fan') { const w = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.6)); f.aimAt(tmpV.set(f.root.position.x + u * 90 * w, 60, -20)); f.dim = pulse; }
      else if (id === 'sweep') { f.aimAt(tmpV.set(40 * Math.sin(t + i * 0.5), 50, 15)); f.dim = 0.9; }
      else if (id === 'ballyhoo') { const s = Math.floor(beat) * 17 + i; f.aimAt(tmpV.set((rand(s) - 0.5) * 120, 40 + rand(s + 3) * 20, (rand(s + 5) - 0.3) * 80)); f.dim = 1; }
      else if (id === 'strobe') { f.color.set('#ffffff'); f.aimAt(tmpV.set(f.root.position.x, 60, -37)); f.dim = 1 - strobeOn; }
      else if (id === 'warm') { f.aimAt(tmpV.set(f.root.position.x * 0.3, 60, -36)); f.dim = 0.25; }
      else if (id === 'laser') { f.dim = 0; }
      else { const out = bi % 2 ? 1 : -1; f.aimAt(tmpV.set(f.root.position.x + u * 80 * out, 55, 10)); f.dim = pulse; }
    });
    // ---- ladder beams ----
    setAll(heads.ladder, (f, i) => {
      const j = i % 4;
      f.color.set(colorOf(i, 2));
      if (id === 'fan') { f.aimAt(tmpV.set(f.root.position.x * 3, 14 + j * 8, 50)); f.dim = pulse; }
      else if (id === 'sweep' || id === 'climax') { f.aimAt(tmpV.set(50 * Math.sin(t * 1.5 + i * 0.3), 8 + 14 * Math.sin(t + i), 40)); f.dim = id === 'climax' ? pulse : 0.85; }
      else if (id === 'ballyhoo') { const s = Math.floor(beat / 2) * 13 + i; f.aimAt(tmpV.set((rand(s) - 0.5) * 100, rand(s + 1) * 40, 40)); f.dim = 1; }
      else if (id === 'strobe') { f.color.set('#ffffff'); f.dim = (bi + j) % 4 === 0 ? 1 : 0; f.aimAt(tmpV.set(f.root.position.x * 2, 10, 40)); }
      else if (id === 'warm') { f.dim = 0; }
      else { f.aimAt(tmpV.set(f.root.position.x * 4, 30, 40)); f.dim = 0.15; }
    });
    // ---- spots: gobos on stage / follow the action ----
    setAll(heads.spot, (f, i) => {
      f.color.set(id === 'warm' ? '#fff1d6' : colorOf(i, 1));
      if (id === 'warm') { const p = i % 3 === 0 ? rapperPos : performers[i % performers.length].g.position; f.aimAt(tmpV.copy(p)); f.dim = 0.8; }
      else if (id === 'climax' || id === 'ballyhoo') { f.aimAt(tmpV.set(40 * Math.sin(t * 1.7 + i), 0, 15 + 15 * Math.cos(t + i))); f.dim = 0.9; }
      else { f.aimAt(tmpV.set(f.root.position.x * 0.7 + 3 * Math.sin(t + i), DECK_Y, -33 + 3 * Math.cos(t * 1.3 + i))); f.dim = 0.7 * pulse; }
    });
    // ---- washes on stage ----
    setAll(heads.wash, (f, i) => {
      f.color.set(id === 'strobe' ? '#9fb6ff' : colorOf(i));
      f.aimAt(tmpV.set(f.root.position.x * 0.7, DECK_Y, -33 + (i % 2) * 2));
      f.dim = id === 'laser' ? 0.25 : 0.75 * pulse;
    });
    setAll(heads.side, (f, i) => {
      f.color.set(colorOf(i, 2));
      f.aimAt(tmpV.set(0, DECK_Y + 1, -33));
      f.dim = id === 'laser' ? 0.15 : 0.6;
    });
    // ---- runway floor beams ----
    setAll(heads.runway, (f, i) => {
      const side = f.root.position.x > 0 ? 1 : -1;
      const z = f.root.position.z;
      f.color.set(colorOf(i));
      if (id === 'fan') { f.aimAt(tmpV.set(side * 30, 45, z)); f.dim = pulse; }
      else if (id === 'sweep') { f.aimAt(tmpV.set(side * 18 + 15 * Math.sin(t * 2 + i * 0.6), 40, z + 10 * Math.sin(t))); f.dim = 0.9; }
      else if (id === 'strobe' || id === 'climax') { f.aimAt(tmpV.set(side * 8, 50, z)); f.dim = (bi % 6) === (i % 6) ? 1 : 0.1; if (id === 'strobe') f.color.set('#ffffff'); }
      else if (id === 'warm') { f.aimAt(tmpV.set(side * 0.5, 50, z)); f.dim = 0.3; }
      else if (id === 'ballyhoo') { const s = Math.floor(beat) * 7 + i; f.aimAt(tmpV.set(side * rand(s) * 40, 30 + rand(s + 2) * 20, z + (rand(s + 4) - 0.5) * 30)); f.dim = 1; }
      else { f.dim = 0; }
    });
    setAll(heads.stageB, (f, i) => {
      f.color.set(colorOf(i));
      if (id === 'warm') { f.aimAt(tmpV.set(SB.x, 40, SB.z)); f.dim = 0.7; }
      else { f.aimAt(tmpV.set(SB.x + 25 * Math.sin(t + i * 1.57), 40, SB.z + 25 * Math.cos(t + i * 1.57))); f.dim = id === 'laser' ? 0 : pulse; }
    });
    setAll(heads.tower, (f, i) => {
      f.color.set(colorOf(i, 3));
      if (id === 'warm') { f.aimAt(tmpV.set(0, 30, -30)); f.dim = 0.35; }
      else if (id === 'laser') { f.dim = 0; }
      else { f.aimAt(tmpV.set(f.root.position.x * 0.5 + 20 * Math.sin(t * 1.3 + i), 45, f.root.position.z - 20 + 20 * Math.cos(t + i))); f.dim = id === 'strobe' ? strobeOn : 0.9 * pulse; }
    });
    setAll(heads.follow, (f) => {
      f.color.set('#fff8ee');
      f.aimAt(tmpV.copy(rapperPos).setY(rapperPos.y + 1));
      f.dim = 1;
    });

    // ---- PARs (chase) ----
    pars.forEach((p, i) => {
      p.color.set(colorOf(i));
      const chase = (Math.floor(beat * 2) % 4) === (i % 4) ? 1 : 0.35;
      p.dim = id === 'warm' ? 0.7 : id === 'laser' ? 0.15 : chase;
      p.update(state.master);
    });
    // ---- blinders ----
    blinders.forEach((b) => {
      const hit = reduceMotion ? 0.25 : Math.exp(-bf * 7);
      b.dim = id === 'strobe' ? hit : id === 'climax' ? (bi % 2 === 0 ? hit : 0) : id === 'fan' && bi % 16 === 0 ? hit : 0;
      b.update(state.master);
    });
    strobes.forEach((s) => {
      s.on = reduceMotion ? 0 : id === 'strobe' ? (Math.random() < 0.3 ? 1 : 0) : id === 'climax' && bi % 4 === 3 ? (Math.random() < 0.5 ? 1 : 0) : 0;
      s.update(state.master);
    });
    lasers.forEach((l, k) => {
      const on = id === 'laser' || id === 'climax';
      l.dim = on ? (id === 'climax' ? pulse : 1) : 0;
      l.color.set(id === 'climax' ? colorOf(k) : k % 2 ? '#30d158' : '#64d2ff');
      l.scan = Math.sin(t * 1.3 + k) * 0.7;
      l.spread = 0.35 + 0.35 * Math.sin(t * 0.7 + k);
      l.tilt = 0.95 + 0.25 * Math.sin(t * 0.5 + k * 0.7);
      l.update(state.master);
    });

    // ---- strips, lift, real lights ----
    stripMat.color.set(colorOf(0)).multiplyScalar(0.6 + 0.8 * pulse);
    liftMat.color.set(colorOf(1)).multiplyScalar(0.4 + 0.6 * pulse);
    stageLights.forEach((l, i) => { l.color.set(id === 'warm' ? '#ffd8a8' : colorOf(i)); l.intensity = (id === 'laser' ? 40 : 160) * pulse; });
    crowdLight.color.set(colorOf(2));
    crowdLight.intensity = (id === 'strobe' ? 300 * strobeOn : 80 * pulse);
    phoneMat.opacity = id === 'warm' ? 0.9 : 0.12;

    // ---- LED content @ ~30fps ----
    if (Math.floor(t * 24) !== Math.floor((t - dt) * 24)) drawLed(t, beat, pal, id);

    // ---- performers ----
    const seg = (t * 0.06) % 1 * (pathLen - 1);
    const si = Math.floor(seg), sf = seg - si;
    const a = path[si], b = path[Math.min(si + 1, pathLen - 1)];
    const prev = rapper.g.position.clone();
    rapper.g.position.lerpVectors(a, b, sf);
    const mv = rapper.g.position.clone().sub(prev);
    const moving = mv.lengthSq() > 1e-6;
    if (moving) rapper.g.rotation.y = Math.atan2(mv.x, mv.z) * 0.3 + (mv.z > 0 ? 0 : 0);
    rapper.arms[1].rotation.x = -1.9 + Math.sin(t * 8) * 0.15; // mic hand
    rapper.arms[0].rotation.x = -0.8 - Math.abs(Math.sin(beat * Math.PI)) * 1.2;
    rapper.g.position.y += Math.abs(Math.sin(beat * Math.PI)) * 0.08;
    hype.g.position.x = -5 + Math.sin(t * 0.4) * 3;
    hype.arms.forEach((ar, k) => (ar.rotation.x = -Math.PI * 0.9 + Math.sin(beat * Math.PI + k) * 0.4));
    hype.g.position.y = DECK_Y + Math.max(0, Math.sin(beat * Math.PI)) * 0.25;
    dj.arms.forEach((ar, k) => (ar.rotation.x = -0.9 + Math.sin(t * 6 + k * 2) * 0.25));
    dj.g.position.y = DECK_Y + Math.abs(Math.sin(beat * Math.PI)) * 0.05;
    drummer.arms.forEach((ar, k) => (ar.rotation.x = -1 + Math.sin(beat * Math.PI * 2 + k * Math.PI) * 0.5));
    dancers.forEach((d, k) => {
      const ph = beat * Math.PI;
      d.g.position.y = DECK_Y + Math.abs(Math.sin(ph)) * 0.15;
      d.arms[0].rotation.z = -0.3 - Math.abs(Math.sin(ph + k)) * 2.2;
      d.arms[1].rotation.z = 0.3 + Math.abs(Math.sin(ph + k + 1)) * 2.2;
      d.g.rotation.y = Math.sin(beat * Math.PI * 0.25) * 0.6;
    });

    // ---- camera jib swing ----
    jibArm.rotation.y = 0.9 + Math.sin(t * 0.25) * 0.6;
    jibArm.rotation.z = Math.sin(t * 0.18) * 0.18;

    // ---- haze & effects ----
    if (state.haze) {
      hazeAcc += dt * 28; // particles per second, independent of frame rate (big soft quads = heavy overdraw)
      for (; hazeAcc >= 1; hazeAcc--) {
        particles.spawn((Math.random() - 0.5) * 50, 1 + Math.random() * 13, -40 + Math.random() * 45, (Math.random() - 0.5) * 0.4, 0.05, 0.3 + Math.random() * 0.3, 9, 14 + Math.random() * 10, 4);
      }
    }
    emitters.forEach((e) => e.update(t, dt));
    particles.update(dt, 1);
    confetti.update(dt);
  }

  // ================= OPTIMISE: bake static meshes =================
  const animated = new Set([
    ...Object.values(heads).flat().map((f) => f.yoke),
    ...lasers.map((l) => l.fan),
    ...performers.map((p) => p.g),
    jibArm, confetti.mesh, particles.points, phones,
  ]);
  freezeStatic(root, animated);

  return {
    obstacles,
    update,
    resize(w, h, dpr = 1) { particles.mat.uniforms.uScale.value = h * dpr * 0.9; },
    setScene(id) { state.auto = id === 'auto'; if (!state.auto) state.scene = id; },
    setHaze(on) { state.haze = on; },
    fire: (kind) => fire(kind, curT),
  };
}

export { VideoLayer };

// Merge every static, single-material mesh into one mesh per material, then stop
// per-frame matrix updates for everything that never moves. Cuts ~1500 draw calls to a few hundred.
function freezeStatic(root, animated) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const victims = [];
  const walk = (o) => {
    if (animated.has(o)) return;
    const m = o.material;
    if (o.isMesh && !o.isInstancedMesh && m && !Array.isArray(m) && !m.isShaderMaterial && m.blending !== THREE.NoBlending
      && o.children.every((c) => c.isMesh)) victims.push(o);
    o.children.forEach(walk);
  };
  walk(root);
  const tmp = new THREE.Matrix4();
  victims.forEach((o) => {
    let geo = o.geometry.clone().applyMatrix4(tmp.multiplyMatrices(inv, o.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.morphAttributes = {};
    const list = buckets.get(o.material) ?? [];
    list.push(geo);
    buckets.set(o.material, list);
  });
  victims.forEach((o) => o.parent?.remove(o));
  buckets.forEach((geos, mat) => {
    const merged = new THREE.Mesh(mergeGeometries(geos), mat);
    merged.receiveShadow = true;
    root.add(merged);
    geos.forEach((g) => g.dispose());
  });
  const freeze = (o) => {
    if (animated.has(o)) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
    o.children.forEach(freeze);
  };
  root.children.forEach(freeze);
}
