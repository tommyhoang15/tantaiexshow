import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EVENT, STAGES, ZONES, KIND_LABEL, DANCES, VIDEO } from './venue-data.js';
import { buildStage, VideoLayer, SCENES } from './stage/index.js';
import { makeBean, crowdBeanGeometry } from './characters.js';

const $ = (id) => document.getElementById(id);
const vnd = (n) => n.toLocaleString('vi-VN') + ' đ';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Renderer, scene, camera ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
const MAX_DPR = Math.min(devicePixelRatio, 1.5);
let dpr = MAX_DPR;
renderer.setPixelRatio(dpr);
renderer.setClearColor(0x000000, 0); // transparent so the CSS3D video layer behind can show through
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // static shadows: rendered once after the scene is built
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2';
document.querySelector('.stage-wrap').appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#0b0d12', 110, 220);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 6;
controls.maxDistance = 140;

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight('#7f92ff', '#1a1208', 0.32));
const sun = new THREE.DirectionalLight('#a9b8ff', 0.35);
sun.position.set(30, 60, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60 });
scene.add(sun);

// ---------- Ground ----------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: '#151a24', roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(140, 70, '#262d3b', '#1b202b');
grid.position.y = 0.01;
scene.add(grid);
[ground, grid].forEach((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });

const S = STAGES;
const box = (w, h, d, mat) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
};

// ---------- Zones ----------
const zoneMeshes = [];
const zoneById = {};
const mainFront = new THREE.Vector2(S.main.x, S.main.z + S.main.d / 2);
const bCenter = new THREE.Vector2(S.b.x, S.b.z);

ZONES.forEach((z) => {
  const { x, z: zz, w, d } = z.rect;
  const lift = z.lift ?? 0;
  const h = lift + 0.15;
  const color = new THREE.Color(z.color);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: true, opacity: 0.88, emissive: color, emissiveIntensity: 0.08 });
  const mesh = box(w, h, d, mat);
  mesh.position.set(x, h / 2, zz);
  mesh.userData.zone = z;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  mesh.add(edges);
  scene.add(mesh);
  zoneMeshes.push(mesh);

  const el = document.createElement('div');
  el.className = 'label3d';
  el.innerHTML = `${z.name}<small>${Math.round(z.price / 1000).toLocaleString('vi-VN')}k</small>`;
  const label = new CSS2DObject(el);
  label.position.set(0, h / 2 + 0.6, 0);
  mesh.add(label);

  const c = new THREE.Vector2(x, zz);
  zoneById[z.id] = { data: z, mesh, mat, floorY: h, dMain: c.distanceTo(mainFront), dB: c.distanceTo(bCenter) };
});

const rankBy = (key) => Object.values(zoneById).sort((a, b) => a[key] - b[key]).map((e) => e.data.id);
const rankMain = rankBy('dMain');
const rankB = rankBy('dB');

// ---------- Stage, lighting rig and live video ----------
const videoLayer = new VideoLayer(document.querySelector('.stage-wrap'));
const stage = buildStage({
  scene, zones: ZONES, video: videoLayer, reduceMotion,
  videoId: VIDEO.id, videoStart: VIDEO.start, ledText: EVENT.ledText ?? EVENT.title,
});
const blocked = (x, z) => stage.obstacles.some((o) => Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2);

// ---------- Crowd (instanced beans, bobbing on the GPU) ----------
const crowdData = [];
ZONES.forEach((z) => {
  const n = Math.floor(z.rect.w * z.rect.d * (z.kind === 'stand' ? 0.55 : 0.35));
  for (let i = 0; i < n; i++) {
    const x = z.rect.x + (Math.random() - 0.5) * (z.rect.w - 1);
    const zz = z.rect.z + (Math.random() - 0.5) * (z.rect.d - 1);
    if (!blocked(x, zz)) crowdData.push({ x, z: zz, y: zoneById[z.id].floorY });
  }
});
const crowdTime = { value: 0 };
const crowdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
crowdMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = crowdTime;
  shader.vertexShader = 'attribute vec2 aBob;\nuniform float uTime;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\ntransformed.y += max(0.0, sin(uTime * aBob.y + aBob.x)) * 0.18;'
  );
};
const crowd = new THREE.InstancedMesh(crowdBeanGeometry(), crowdMat, crowdData.length);
const bob = new Float32Array(crowdData.length * 2);
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
crowdData.forEach((p, i) => {
  dummy.position.set(p.x, p.y, p.z);
  // face roughly toward the main stage
  dummy.rotation.y = Math.atan2(S.main.x - p.x, S.main.z - p.z) + (Math.random() - 0.5) * 0.6;
  dummy.scale.setScalar(0.85 + Math.random() * 0.25);
  dummy.updateMatrix();
  crowd.setMatrixAt(i, dummy.matrix);
  crowd.setColorAt(i, tmpColor.setHSL(Math.random(), 0.55, 0.45 + Math.random() * 0.2));
  bob[i * 2] = Math.random() * Math.PI * 2;
  bob[i * 2 + 1] = 3 + Math.random() * 3;
});
crowd.geometry.setAttribute('aBob', new THREE.InstancedBufferAttribute(bob, 2));
crowd.castShadow = true;
crowd.matrixAutoUpdate = false;
crowd.updateMatrix();
scene.add(crowd);

// ---------- Camera views ----------
const VIEWS = {
  overview: { pos: [0, 55, 75], target: [0, 0, -2] },
  top: { pos: [0, 110, 0.1], target: [0, 0, 0] },
  stage: { pos: [0, S.main.h + 4, S.main.z + 4], target: [0, 4, 15] },
  closeup: { pos: [14, 9, -6], target: [0, 7, -36] },
};
let tween = null;
function flyTo(pos, target, dur = 1.1) {
  tween = {
    fromPos: camera.position.clone(), toPos: new THREE.Vector3(...pos),
    fromTarget: controls.target.clone(), toTarget: new THREE.Vector3(...target),
    t: 0, dur: reduceMotion ? 0.01 : dur,
  };
}
function setPressed(view) {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
}
document.querySelectorAll('[data-view]').forEach((b) =>
  b.addEventListener('click', () => {
    const v = VIEWS[b.dataset.view];
    flyTo(v.pos, v.target);
    setPressed(b.dataset.view);
  })
);
camera.position.set(0, 90, 120);
controls.target.set(0, 0, 0);
flyTo(VIEWS.overview.pos, VIEWS.overview.target, 1.8);

$('labelsBtn').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  labelRenderer.domElement.classList.toggle('labels-off', !on);
});

// ---------- Show controls ----------
SCENES.forEach((sc) => $('showScene').add(new Option(sc.label, sc.id)));
$('showScene').addEventListener('change', (e) => stage.setScene(e.target.value));
document.querySelectorAll('[data-fx]').forEach((b) => b.addEventListener('click', () => stage.fire(b.dataset.fx)));
$('hazeBtn').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  stage.setHaze(on);
});
let videoPlaying = true, videoMuted = true;
$('vidPlay').addEventListener('click', (e) => {
  videoPlaying = !videoPlaying;
  videoLayer.command(videoPlaying ? 'playVideo' : 'pauseVideo');
  e.currentTarget.textContent = videoPlaying ? 'Tạm dừng video' : 'Phát video';
});
$('vidSound').addEventListener('click', (e) => {
  videoMuted = !videoMuted;
  // only the centre screen carries sound; IMAG screens stay muted to avoid echo
  videoLayer.commandMain(videoMuted ? 'mute' : 'unMute');
  if (!videoMuted) videoLayer.commandMain('setVolume', [80]);
  e.currentTarget.setAttribute('aria-pressed', String(!videoMuted));
  e.currentTarget.textContent = videoMuted ? 'Bật tiếng' : 'Tắt tiếng';
});

// ---------- Header, legend, form options ----------
$('eventTitle').textContent = EVENT.title;
$('eyebrow').textContent = EVENT.eyebrow;
document.title = `Sơ đồ 3D · ${EVENT.title}`;
[...ZONES].sort((a, b) => b.price - a.price).forEach((z) => {
  const btn = document.createElement('button');
  btn.innerHTML = `<i style="background:${z.color}"></i><span>${z.name}</span><span>${vnd(z.price)}</span>`;
  btn.addEventListener('click', () => selectZone(z.id, true));
  $('legend').appendChild(btn);
});
EVENT.shows.forEach((s) => $('showIn').add(new Option(s.label, s.id)));
ZONES.forEach((z) => $('zoneIn').add(new Option(`${z.name} · ${vnd(z.price)}`, z.id)));
DANCES.forEach((d) => $('danceSel').add(new Option(d.label, d.id)));
const SHIRTS = ['#ff7a3d', '#48dbfb', '#ff5d73', '#1dd1a1', '#feca57', '#a66cff'];
let shirt = SHIRTS[0];
SHIRTS.forEach((c, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.style.background = c;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(i === 0));
  b.setAttribute('aria-label', `Màu ${i + 1}`);
  b.addEventListener('click', () => {
    shirt = c;
    $('shirtIn').querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  });
  $('shirtIn').appendChild(b);
});

// ---------- Picking: hover + select ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;
let selected = null;
let downAt = null;

function pick(ev) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(zoneMeshes, false)[0] ?? null;
}
function paint() {
  Object.values(zoneById).forEach((e) => {
    const id = e.data.id;
    e.mat.emissiveIntensity = id === selected ? 0.55 : id === hovered ? 0.3 : 0.08;
    e.mat.opacity = selected && id !== selected ? 0.5 : 0.88;
  });
}

canvas.addEventListener('pointermove', (ev) => {
  if (ev.pointerType !== 'mouse') return;
  const hit = pick(ev);
  const id = hit?.object.userData.zone.id ?? null;
  if (id !== hovered) { hovered = id; paint(); }
  canvas.style.cursor = id ? 'pointer' : 'grab';
  const tip = $('tip');
  if (id) {
    const z = zoneById[id].data;
    tip.textContent = `${z.name} · ${vnd(z.price)}`;
    tip.style.left = ev.clientX + 'px';
    tip.style.top = ev.clientY + 'px';
    tip.hidden = false;
  } else tip.hidden = true;
});
canvas.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
canvas.addEventListener('pointerup', (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 6) return; // was a drag
  const hit = pick(ev);
  $('hint').style.opacity = 0;
  if (player) {
    if (hit && hit.object.userData.zone.id === player.zoneId) player.walkTo = hit.point.clone();
    return;
  }
  if (hit) selectZone(hit.object.userData.zone.id);
  else clearSelection();
});

function selectZone(id, focus = false) {
  selected = id;
  paint();
  const { data: z } = zoneById[id];
  $('zDot').style.background = z.color;
  $('zKind').textContent = KIND_LABEL[z.kind];
  $('zName').textContent = z.name;
  $('zPrice').textContent = vnd(z.price);
  $('zR1').textContent = `#${rankMain.indexOf(id) + 1} / ${ZONES.length}`;
  $('zR2').textContent = `#${rankB.indexOf(id) + 1} / ${ZONES.length}`;
  $('zonePanel').hidden = false;
  if (focus) {
    const { x, z: zz } = z.rect;
    flyTo([x * 1.3, 30, zz + 32], [x, 0, zz]);
    setPressed(null);
  }
}
function clearSelection() {
  selected = null;
  paint();
  $('zonePanel').hidden = true;
}
$('closePanel').addEventListener('click', clearSelection);
$('povBtn').addEventListener('click', () => {
  const e = zoneById[selected];
  const { x, z } = e.data.rect;
  flyTo([x, e.floorY + 1.7, z], [S.b.x * 0.3 + S.main.x * 0.7, S.main.h + 4, S.main.z]);
  setPressed(null);
});
$('joinHere').addEventListener('click', () => openJoin(selected));
$('joinOpen').addEventListener('click', () => openJoin(selected));
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('joinForm').hidden) closeJoin(); else clearSelection(); } });

// ---------- Join as avatar ----------
function openJoin(zoneId) {
  if (zoneId) $('zoneIn').value = zoneId;
  $('joinForm').hidden = false;
  $('nameIn').focus();
}
function closeJoin() { $('joinForm').hidden = true; $('joinErr').hidden = true; }
$('joinCancel').addEventListener('click', closeJoin);
$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('nameIn').value.trim();
  if (!name) { $('joinErr').hidden = false; $('nameIn').focus(); return; }
  closeJoin();
  spawnPlayer(name, $('zoneIn').value, $('showIn').value);
});

let player = null;
function spawnPlayer(name, zoneId, showId) {
  if (player) removePlayer();
  clearSelection();
  const e = zoneById[zoneId];
  const av = makeBean(shirt);
  av.group.position.set(e.data.rect.x, e.floorY, e.data.rect.z);
  scene.add(av.group);

  const tag = document.createElement('div');
  tag.className = 'nametag';
  tag.textContent = name;
  const tagObj = new CSS2DObject(tag);
  tagObj.position.set(0, 1.85, 0);
  av.group.add(tagObj);

  player = { ...av, name, zoneId, showId, dance: 'idle', walkTo: null, bubble: null, keys: new Set() };
  $('pName').textContent = name;
  $('pZone').textContent = `${e.data.name} · ${EVENT.shows.find((s) => s.id === showId).label}`;
  $('danceSel').value = 'idle';
  $('playbar').hidden = false;
  $('joinOpen').hidden = true;
  $('legend').hidden = true;
  $('hint').style.opacity = 0;
  const p = av.group.position;
  flyTo([p.x, p.y + 6, p.z + 10], [p.x, p.y + 1.5, p.z]);
  setPressed(null);
}
function removePlayer() {
  player.group.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); });
  scene.remove(player.group);
  player.dispose(); // free per-avatar materials (previously leaked on every join/leave)
  player = null;
  $('playbar').hidden = true;
  $('joinOpen').hidden = false;
  $('legend').hidden = false;
}
$('leaveBtn').addEventListener('click', () => {
  removePlayer();
  flyTo(VIEWS.overview.pos, VIEWS.overview.target);
  setPressed('overview');
});
$('danceSel').addEventListener('change', (e) => { if (player) player.dance = e.target.value; });
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('chatIn').value.trim();
  if (!text || !player) return;
  $('chatIn').value = '';
  if (player.bubble) { player.bubble.element.remove(); player.group.remove(player.bubble); }
  const el = document.createElement('div');
  el.className = 'bubble';
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.position.set(0, 2.3, 0);
  player.group.add(obj);
  player.bubble = obj;
  setTimeout(() => {
    if (player?.bubble === obj) { el.remove(); player.group.remove(obj); player.bubble = null; }
  }, 5000);
});

const MOVE_KEYS = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
addEventListener('keydown', (e) => {
  if (!player || e.target.matches('input, select')) return;
  const k = e.key.toLowerCase();
  if (MOVE_KEYS[k]) { player.keys.add(k); player.walkTo = null; e.preventDefault(); }
});
addEventListener('keyup', (e) => player?.keys.delete(e.key.toLowerCase()));

const camFwd = new THREE.Vector3();
const camRight = new THREE.Vector3();
const move = new THREE.Vector3();
const before = new THREE.Vector3();
function updatePlayer(dt, t) {
  if (!player) return;
  const g = player.group;
  const rect = zoneById[player.zoneId].data.rect;
  move.set(0, 0, 0);
  if (player.keys.size) {
    camera.getWorldDirection(camFwd); camFwd.y = 0; camFwd.normalize();
    camRight.crossVectors(camFwd, camera.up).normalize();
    player.keys.forEach((k) => {
      const [mx, mz] = MOVE_KEYS[k];
      move.addScaledVector(camRight, mx).addScaledVector(camFwd, -mz);
    });
  } else if (player.walkTo) {
    move.set(player.walkTo.x - g.position.x, 0, player.walkTo.z - g.position.z);
    if (move.length() < 0.1) { player.walkTo = null; move.set(0, 0, 0); }
  }
  const walking = move.lengthSq() > 0;
  if (walking) {
    move.normalize().multiplyScalar(4 * dt);
    before.copy(g.position);
    g.position.x = THREE.MathUtils.clamp(g.position.x + move.x, rect.x - rect.w / 2 + 0.4, rect.x + rect.w / 2 - 0.4);
    g.position.z = THREE.MathUtils.clamp(g.position.z + move.z, rect.z - rect.d / 2 + 0.4, rect.z + rect.d / 2 - 0.4);
    g.rotation.y = Math.atan2(move.x, move.z);
    // camera follows
    before.subVectors(g.position, before); // = delta
    camera.position.add(before);
    controls.target.add(before);
  } else {
    // face the stage when standing
    const face = Math.atan2(S.main.x - g.position.x, S.main.z - g.position.z);
    g.rotation.y += (face - g.rotation.y) * Math.min(1, dt * 3);
  }

  // animation
  const base = zoneById[player.zoneId].floorY;
  const [la, ra] = player.arms;
  let y = base, armL = 0, armR = 0, spin = 0;
  if (walking) {
    const s = Math.sin(t * 10);
    armL = s * 0.6; armR = -s * 0.6;
    player.legs[0].rotation.x = s * 0.5; player.legs[1].rotation.x = -s * 0.5;
  } else {
    player.legs.forEach((l) => (l.rotation.x = 0));
    switch (player.dance) {
      case 'bounce': y += Math.abs(Math.sin(t * 6)) * 0.2; armL = armR = Math.sin(t * 6) * 0.4; break;
      case 'wave': armR = Math.PI * 0.85 + Math.sin(t * 8) * 0.3; break;
      case 'spin': spin = t * 4; armL = armR = Math.PI / 2; break;
      case 'jump': y += Math.max(0, Math.sin(t * 5)) * 0.6; armL = armR = Math.PI * 0.9; break;
    }
  }
  la.rotation.z = -armL * 0.2; la.rotation.x = -armL;
  ra.rotation.z = armR * 0.2; ra.rotation.x = -armR;
  if (player.dance === 'wave' && !walking) { ra.rotation.x = 0; ra.rotation.z = armR; }
  g.position.y = y;
  if (spin) g.rotation.y = spin;
}

// ---------- Resize & loop ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  videoLayer.setSize(w, h);
  stage.resize(w, h, dpr);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
renderer.shadowMap.needsUpdate = true;

// Adaptive resolution: drop the pixel ratio when frames run slow, restore it when there's headroom.
// Uses real wall-clock frame times and ignores stalls (hidden tab, throttled pane, GC pauses)
// so a background tab doesn't wrongly downgrade quality.
let qAcc = 0, qFrames = 0, qLast = 0, qWarm = 0;
function adaptQuality() {
  const now = performance.now();
  const ft = now - qLast;
  qLast = now;
  if (document.hidden || ft > 120 || ft <= 0) return;
  if ((qWarm += ft) < 3000) return; // let shaders compile / videos load first
  qAcc += ft; qFrames++;
  if (qAcc < 2000) return;
  const fps = (qFrames * 1000) / qAcc;
  qAcc = 0; qFrames = 0;
  const next = fps < 45 ? Math.max(0.6, dpr - 0.2) : fps > 57 ? Math.min(MAX_DPR, dpr + 0.1) : dpr;
  if (Math.abs(next - dpr) > 0.01) setDpr(next);
}
function setDpr(v) {
  dpr = v;
  renderer.setPixelRatio(dpr);
  stage.resize(innerWidth, innerHeight, dpr);
}
document.addEventListener('visibilitychange', () => { qAcc = 0; qFrames = 0; qWarm = 0; });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  frame(clock.elapsedTime, dt);
});

let simT = 0;
let benching = false;
function frame(t, dt) {

  if (tween) {
    tween.t += dt / tween.dur;
    const k = tween.t >= 1 ? 1 : 1 - Math.pow(1 - tween.t, 3);
    camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
    if (tween.t >= 1) tween = null;
  }

  const p0 = performance.now();
  stage.update(t, dt);
  const p1 = performance.now();
  crowdTime.value = reduceMotion ? 0 : t;
  if (!benching) adaptQuality();
  updatePlayer(dt, t);

  controls.update();
  const p2 = performance.now();
  renderer.render(scene, camera);
  const p3 = performance.now();
  videoLayer.render(camera);
  labelRenderer.render(scene, camera);
  if (import.meta.env.DEV) {
    // dev-only profiling: window.__perf in the console
    const pf = (window.__perf ??= { update: 0, render: 0, css: 0, n: 0 });
    pf.update += p1 - p0; pf.render += p3 - p2; pf.css += performance.now() - p3; pf.n++;
    pf.calls = renderer.info.render.calls; pf.tris = renderer.info.render.triangles; pf.dpr = dpr;
  }
}

if (import.meta.env.DEV) {
  // window.__bench(120): run N frames synchronously, wait for the GPU after each (gl.finish),
  // so timings include GPU work even when the tab isn't being painted.
  window.__bench = (n = 120, ratio) => {
    if (ratio) setDpr(ratio);
    benching = true;
    const gl = renderer.getContext();
    window.__perf = { update: 0, render: 0, css: 0, n: 0 };
    const start = performance.now();
    for (let i = 0; i < n; i++) { simT += 1 / 60; frame(clock.elapsedTime + simT, 1 / 60); gl.finish(); }
    const ms = (performance.now() - start) / n;
    benching = false;
    const p = window.__perf;
    return { msPerFrame: +ms.toFixed(2), estFps: +(1000 / ms).toFixed(1), update: +(p.update / n).toFixed(2), render: +(p.render / n).toFixed(2), css: +(p.css / n).toFixed(2), calls: p.calls, tris: p.tris, dpr: p.dpr };
  };
}
