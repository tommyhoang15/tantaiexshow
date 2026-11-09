import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LensBeam } from '../stage/fixtures.js';
import { Particles, Confetti, Emitter } from '../stage/effects.js';
import { ADDITIVE, glowTexture } from '../stage/materials.js';
import { crystalMaterial, ledImageMaterial, planarUV, sidePanelsUV } from './crystals.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { dressTiger } from './tigerFx.js';
import { triplanar } from '../core/textures.js';

// The stage geometry is the client's design file (/assets/stage.glb), in its own coordinates:
// stage faces +Z, centre LED at z≈32.6, deck top y≈2, thrust/lift around z≈62, crowd z 54..111.
const BPM = 126;
export const CRYSTAL_SCENES = [
  { id: 'fan', label: 'Quạt beam' },
  { id: 'crystal', label: 'Pha lê' },
  { id: 'sweep', label: 'Quét sóng' },
  { id: 'amber', label: 'Hổ phách' },
  { id: 'laser', label: 'Tối giản' },
  { id: 'strobe', label: 'Strobe' },
  { id: 'inferno', label: 'Rực đỏ' },
  { id: 'climax', label: 'Cao trào' },
];
const AUTO = ['fan', 'crystal', 'sweep', 'amber', 'inferno', 'laser', 'strobe', 'climax'];
const PAL = {
  fan: ['#bfe9ff', '#5fa8ff', '#ffffff'],
  crystal: ['#1d5cff', '#7fe8ff', '#3b7dff'],
  sweep: ['#7fe8ff', '#ffffff', '#3b7dff'],
  amber: ['#ff9a1f', '#ffd28a', '#5fa8ff'],
  laser: ['#3b7dff', '#7fe8ff'],
  strobe: ['#ffffff'],
  inferno: ['#ff1e1e', '#ff4a1a', '#ff0040'],
  climax: ['#ffffff', '#7fe8ff', '#ff9a1f', '#1d5cff'],
};
export const VIEWS = {
  overview: { label: 'Toàn cảnh', pos: [0, 30, 135], target: [0, 6, 48] },
  foh: { label: 'Khán đài', pos: [0, 5, 98], target: [0, 9, 36] },
  front: { label: 'Sát sân khấu', pos: [7, 3.2, 58], target: [0, 8, 35] },
  tiger: { label: 'Tượng hổ', pos: [0, 7.5, 50], target: [0, 7.5, 34] },
  stage: { label: 'Từ sân khấu', pos: [0, 4.8, 45], target: [0, 3, 110] },
  tower: { label: 'Tháp pha lê', pos: [-20.4, 12, 76], target: [3, 7, 36] },
  side: { label: 'Bên hông', pos: [-48, 12, 64], target: [0, 7, 40] },
  top: { label: 'Từ trên cao', pos: [0, 100, 78], target: [0, 0, 58] },
};
const TOUR = ['overview', 'foh', 'tower', 'front', 'tiger', 'side', 'stage', 'top'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = (seed) => { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export async function createCrystal(engine, { ui, onExit, loader, cache }) {
  const renderer = engine.renderer;
  cache.stage ??= loader.gltf('/assets/stage.glb', 2700000);
  cache.stageData ??= loader.json('/assets/stage.json');
  // LED visuals taken from the design renders (replace the .webp files to change what the screens show)
  const texLoader = new THREE.TextureLoader();
  const loadTex = (url) => new Promise((res) => texLoader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null)));
  // textures from the design project's tex folder (compressed to WebP)
  // own cache key: the lobby already uses cache.tex for its procedural textures
  cache.eventTex ??= Promise.all(['led-map', 'ice', 'concrete', 'plate', 'crystal-swirl'].map((n) => loadTex(`/assets/tex/${n}.webp`)));
  const [gltf, data, [ledMap, iceTex, concreteTex, plateTex, swirlTex]] = await Promise.all([cache.stage, cache.stageData, cache.eventTex]);
  [iceTex, concreteTex, plateTex].forEach((t) => { if (t) t.wrapS = t.wrapT = THREE.RepeatWrapping; });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#02040b');
  scene.fog = new THREE.Fog('#02040b', 110, 280);
  scene.environment = engine.env();
  scene.environmentIntensity = 0.3;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 3;
  controls.maxDistance = 220;
  const disposers = [() => controls.dispose()];

  scene.add(new THREE.HemisphereLight('#3a5cff', '#05060a', 0.5));
  const key = new THREE.DirectionalLight('#9fc4ff', 0.35);
  key.position.set(10, 40, 90);
  scene.add(key);

  // ---------- the design file + materials by class ----------
  const stage = gltf.scene.clone(true);
  const LED = [];
  const M = {
    crystal_blue: crystalMaterial('#1d5cff', { yMin: 0, yMax: 12, detail: swirlTex }),
    crystal_amber: crystalMaterial('#ff9a1f', { yMin: 0, yMax: 12, deep: 0.12, detail: swirlTex }),
    facet: crystalMaterial('#cfdcff', { yMin: 0, yMax: 5, deep: 0.35, rim: 0.6, detail: swirlTex }),
    crystal_ice: crystalMaterial('#7fb2ff', { yMin: 1, yMax: 7, deep: 0.15, rim: 1.1, detail: swirlTex }),
    tiger: crystalMaterial('#123a9c', { yMin: 1, yMax: 13, deep: 0.05, rim: 0.85, detail: swirlTex }), // deep navy body; the neon edges carry the look
    neon: new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8f6ff').multiplyScalar(1.6), toneMapped: false }),
    logo: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.3), toneMapped: false }),
    ice: triplanar(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#1f5fd6', emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.2 }), iceTex, 0.2),
    floor: triplanar(new THREE.MeshStandardMaterial({ color: '#4a505c', roughness: 0.55, metalness: 0.25 }), concreteTex, 0.05),
    stage: triplanar(new THREE.MeshStandardMaterial({ color: '#3a404c', roughness: 0.4, metalness: 0.6 }), plateTex, 0.9),
  };
  const crystalMats = [M.crystal_blue, M.crystal_amber, M.facet, M.crystal_ice, M.tiger];
  let tigerMesh = null;
  scene.add(stage);
  stage.updateMatrixWorld(true);
  // quantization/simplification can leave zero-length normals; lit materials would turn them into NaN
  // (and bloom spreads NaN into black blocks), so rebuild normals wherever that happened
  const fixNormals = (g) => {
    if (!g.attributes.normal) g.computeVertexNormals(); // some exported parts carry no normals at all
    const n = g.attributes.normal;
    // vertices that only belong to zero-area triangles keep a zero normal even after recomputing:
    // point them up so normalize() never sees a zero vector
    let changed = false;
    for (let i = 0; i < n.count; i++) {
      if (n.getX(i) * n.getX(i) + n.getY(i) * n.getY(i) + n.getZ(i) * n.getZ(i) < 1e-8) { n.setXYZ(i, 0, 1, 0); changed = true; }
    }
    if (changed) n.needsUpdate = true;
  };
  // the LED map is one panorama across all three screens: find their combined extent in world space
  const ledBox = new THREE.Box3();
  stage.traverse((o) => { if (o.isMesh && /^led_/.test(o.material?.name)) ledBox.expandByObject(o); });
  const rectOf = (x0, x1, y0, y1) => [(x0 - ledBox.min.x) / (ledBox.max.x - ledBox.min.x), (y0 - ledBox.min.y) / (ledBox.max.y - ledBox.min.y),
    (x1 - ledBox.min.x) / (ledBox.max.x - ledBox.min.x), (y1 - ledBox.min.y) / (ledBox.max.y - ledBox.min.y)];
  const sideBox = (o, sign) => { // world extent of the left (sign<0) or right panel of the merged side-LED mesh
    const b = new THREE.Box3(); const v = new THREE.Vector3(); const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (Math.sign(v.x) === sign) b.expandByPoint(v); }
    return b;
  };
  stage.traverse((o) => {
    if (!o.isMesh) return;
    fixNormals(o.geometry);
    const name = o.material?.name;
    if (name === 'led_center' || name === 'led_side') {
      if (name === 'led_center') planarUV(o); else sidePanelsUV(o);
      if (name === 'led_center') {
        const b = new THREE.Box3().setFromObject(o);
        o.material = ledImageMaterial(ledMap, { aspect: 20 / 9, rectA: rectOf(b.min.x, b.max.x, b.min.y, b.max.y) });
      } else {
        const L = sideBox(o, -1), R = sideBox(o, 1);
        o.material = ledImageMaterial(ledMap, { aspect: 10 / 12, atlas: 1, rectA: rectOf(L.min.x, L.max.x, L.min.y, L.max.y), rectB: rectOf(R.min.x, R.max.x, R.min.y, R.max.y) });
      }
      LED.push(o.material);
    } else if (M[name]) { if (name === 'tiger') tigerMesh = o; o.material = M[name]; }
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });

  const tigerFx = tigerMesh ? dressTiger(tigerMesh, scene) : null;

  // ---------- lighting rig: only the fixtures placed in the design, lit from their exact lenses ----------
  const F = data.fixtures;
  const heads = { top: [], ledTop: [], ladderCentre: [], ladderSide: [], sideTop: [], par: [] };
  const TYPE = { top: 'beam', ledTop: 'spot', ladderCentre: 'beam', ladderSide: 'beam', sideTop: 'wash' };
  F.heads.forEach((h) => { const f = new LensBeam({ type: TYPE[h.g], pos: h.p, dir: h.d }); scene.add(f.root); heads[h.g].push(f); });
  F.pars.forEach((h) => { const f = new LensBeam({ type: 'wash', pos: h.p, dir: h.d }); scene.add(f.root); heads.par.push(f); });
  // blinders: every cell glows at its own position
  const blinderCells = F.blinders.flat().map((c) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffc27a', opacity: 0, ...ADDITIVE }));
    s.position.set(c[0], c[1], c[2] + 0.05);
    s.scale.setScalar(0.9);
    scene.add(s);
    return s;
  });
  // VL3015 linear LED battens: an emitting strip + pixel glows along each bar (no beams)
  const BAR_PIX = 12;
  const barPos = new Float32Array(F.bars.length * BAR_PIX * 3);
  const barCol = new Float32Array(F.bars.length * BAR_PIX * 3);
  const barMat = new THREE.MeshBasicMaterial({ color: '#7fe8ff', toneMapped: false });
  F.bars.forEach((b, i) => {
    const A = V(...b.a), B = V(...b.b);
    const len = A.distanceTo(B);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.12), barMat);
    strip.position.copy(A).add(B).multiplyScalar(0.5);
    strip.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x);
    scene.add(strip);
    for (let k = 0; k < BAR_PIX; k++) { const q = A.clone().lerp(B, (k + 0.5) / BAR_PIX); barPos.set([q.x, q.y + 0.05, q.z], (i * BAR_PIX + k) * 3); }
  });
  const barGeo = new THREE.BufferGeometry();
  barGeo.setAttribute('position', new THREE.BufferAttribute(barPos, 3));
  barGeo.setAttribute('color', new THREE.BufferAttribute(barCol, 3));
  scene.add(new THREE.Points(barGeo, new THREE.PointsMaterial({ map: glowTexture(), size: 0.45, vertexColors: true, ...ADDITIVE })));

  // ---------- crowd at the design's 2,500 positions (light instanced silhouettes) ----------
  const parts = [
    new THREE.CapsuleGeometry(0.22, 0.85, 2, 6).translate(0, 0.65, 0),
    new THREE.SphereGeometry(0.16, 8, 6).translate(0, 1.42, 0),
    new THREE.CapsuleGeometry(0.06, 0.5, 2, 4).rotateZ(-0.35).translate(0.26, 1.55, 0),
  ].map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; });
  const crowdTime = { value: 0 };
  const crowdMat = new THREE.MeshStandardMaterial({ color: '#141824', roughness: 0.6, metalness: 0.3 });
  crowdMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = crowdTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nfloat ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;\ntransformed.y += max(0.0, sin(uTime * 8.2 + ph)) * 0.14;');
  };
  const crowd = new THREE.InstancedMesh(mergeGeometries(parts), crowdMat, data.crowd.length);
  const dmy = new THREE.Object3D();
  const phones = [];
  data.crowd.forEach(([x, z], i) => {
    dmy.position.set(x, 0, z);
    dmy.rotation.y = Math.atan2(-x, 36 - z) + (rnd(i * 3) - 0.5) * 0.5; // face the centre LED
    dmy.scale.setScalar(0.92 + rnd(i * 7) * 0.18);
    dmy.updateMatrix();
    crowd.setMatrixAt(i, dmy.matrix);
    if (rnd(i * 11) < 0.45) { const h = V(0.36, 1.82, 0.05).applyMatrix4(dmy.matrix); phones.push(h.x, h.y, h.z); }
  });
  scene.add(crowd);
  const phoneGeo = new THREE.BufferGeometry();
  phoneGeo.setAttribute('position', new THREE.Float32BufferAttribute(phones, 3));
  const phoneMat = new THREE.PointsMaterial({ map: glowTexture(), size: 0.42, color: '#dff4ff', ...ADDITIVE });
  const phonePts = new THREE.Points(phoneGeo, phoneMat);
  scene.add(phonePts);

  // ---------- effects at the design's machine positions ----------
  const particles = new Particles(3500);
  scene.add(particles.points);
  const confetti = new Confetti(1400);
  scene.add(confetti.mesh);
  // CO2 only from the effect machines placed in the design
  const co2 = F.fx.map((p) => new Emitter(particles, V(p[0], p[1], p[2]), 'co2'));
  // flame jets from the same machines (the real show fired fire + CO2 from the stage front)
  const flames = F.fx.map((p) => new Emitter(particles, V(p[0], p[1], p[2] + 0.2), 'flame'));
  const emitters = [...co2, ...flames];
  const confettiFrom = [-12, -4, 4, 12].map((x) => V(x, 17.5, 40));

  // ---------- post ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Safety net before bloom: any NaN/Inf pixel (degenerate geometry in the source file) becomes black
  // instead of being blurred by bloom into big black blocks while orbiting.
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = c; }',
  }));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let glow = !matchMedia('(max-width: 720px)').matches;
  engine.onQuality = (ratio) => { if (ratio < 0.7 && glow) { glow = false; ui.setGlow(false); } };
  disposers.push(() => { composer.dispose(); engine.onQuality = null; });

  // ---------- camera ----------
  let tween = null;
  let tour = false, tourIdx = 0, tourT = 0;
  function fly(id, dur = 1.6) {
    const v = VIEWS[id];
    tween = { from: camera.position.clone(), to: V(...v.pos), fromT: controls.target.clone(), toT: V(...v.target), t: 0, dur: reduceMotion ? 0.01 : dur };
    ui.setView(id);
  }
  camera.position.set(0, 6, 150);
  controls.target.set(0, 6, 48);
  fly('overview', 2.2);
  const stopTour = () => { if (tour) { tour = false; ui.setTour(false); } };
  renderer.domElement.addEventListener('pointerdown', stopTour);
  disposers.push(() => renderer.domElement.removeEventListener('pointerdown', stopTour));

  // ---------- show ----------
  const state = { auto: true, scene: 'fan', last: null, lastBeat: -1, haze: true };
  // fan→drift, crystal→kaleidoscope, sweep→tunnel, amber→drift, laser/strobe→shatter, climax→tunnel+shards
  const LED_MODE = { fan: 4, crystal: 1, sweep: 3, amber: 0, inferno: 2, laser: 2, strobe: 2, climax: 3 };
  const ledFade = { from: 4, to: 4, mix: 1 };
  const tv = new THREE.Vector3();
  let hazeAcc = 0, curT = 0;
  function fire(kind, now) {
    if (kind === 'co2') co2.forEach((e, i) => e.fire(now + i * 0.03, 1.2));
    if (kind === 'flame') flames.forEach((e, i) => e.fire(now + i * 0.08, 0.9));
    if (kind === 'confetti') confetti.burst(confettiFrom);
  }

  function show(t, dt) {
    const beat = (t * BPM) / 60;
    const bi = Math.floor(beat), bf = beat - bi;
    const order = reduceMotion ? AUTO.filter((s) => s !== 'strobe') : AUTO;
    const id = state.auto ? order[Math.floor(beat / 24) % order.length] : state.scene;
    if (id !== state.last) {
      state.last = id; state.scene = id; ui.setScene(state.auto ? 'auto' : id);
      if (id === 'climax') { fire('confetti', t); fire('co2', t); }
    }
    const newBeat = bi !== state.lastBeat; state.lastBeat = bi;
    if (id === 'climax' && newBeat && bi % 8 === 0) fire('co2', t);
    if (id === 'climax' && newBeat && bi % 8 === 4) fire('flame', t);
    if (id === 'inferno' && newBeat && bi % 4 === 0) fire('flame', t);
    const pal = PAL[id];
    const col = (i, k = 0) => pal[(i + k + Math.floor(beat / 4)) % pal.length];
    const pulse = 0.55 + 0.45 * Math.exp(-bf * 5);
    const strobe = reduceMotion ? 0.6 : Math.floor(beat * 4) % 2 ? 0 : 1;
    const each = (arr, fn) => arr.forEach((f, i) => { fn(f, i, arr.length); f.update(dt); });

    // top rows: the signature fan into the sky over the audience (+Z)
    const fan = (f, i, n, spreadMul = 1) => {
      const u = i / Math.max(1, n - 1) - 0.5;
      f.color.set(col(i));
      if (id === 'fan' || id === 'crystal') { const w = id === 'fan' ? 0.7 + 0.3 * Math.sin(t * 0.5) : 0.35; f.aimAt(tv.set(u * 170 * w * spreadMul, 95, 32 + 70 * (0.4 + 0.2 * Math.sin(t * 0.3)))); f.dim = id === 'fan' ? pulse : 0.6; }
      else if (id === 'sweep') { f.aimAt(tv.set(75 * Math.sin(t * 1.1 + i * 0.35), 85, 95)); f.dim = 0.9; }
      else if (id === 'amber') { f.color.set(i % 3 ? '#ff9a1f' : '#ffd28a'); f.aimAt(tv.set(u * 70, 95, 60)); f.dim = 0.8 * pulse; }
      else if (id === 'strobe') { f.color.set('#ffffff'); f.aimAt(tv.set(u * 130, 85, 80)); f.dim = strobe; }
      else if (id === 'laser') f.dim = 0.08;
      else { const out = bi % 2 ? 1 : 0.3; f.aimAt(tv.set(u * 180 * out, 90, 85)); f.dim = pulse; }
    };
    each(heads.top, (f, i, n) => fan(f, i, n));
    each(heads.ledTop, (f, i, n) => { const u = i / (n - 1) - 0.5; f.color.set(col(i, 1)); f.aimAt(tv.set(u * 60 + 10 * Math.sin(t + i), 40, 90)); f.dim = id === 'laser' ? 0.1 : 0.7 * pulse; });
    each(heads.ladderCentre, (f, i) => {
      f.color.set(col(i, 2));
      const s = f.root.position.x > 0 ? 1 : -1;
      if (id === 'crystal' || id === 'laser') { f.dim = 0; return; }
      f.aimAt(tv.set(f.root.position.x + s * (20 + 25 * Math.sin(t * 1.2 + i)), 25 + (i % 6) * 6, 100));
      f.dim = id === 'strobe' ? strobe : pulse;
    });
    each(heads.ladderSide, (f, i) => {
      f.color.set(col(i, 1));
      const s = f.root.position.x > 0 ? 1 : -1;
      if (id === 'laser') { f.dim = 0; return; }
      if (id === 'sweep' || id === 'climax') f.aimAt(tv.set(s * 40 + 40 * Math.sin(t * 1.4 + i * 0.3), 20 + (i % 6) * 8, 95));
      else f.aimAt(tv.set(f.root.position.x * 3, 30 + (i % 6) * 8, 110));
      f.dim = id === 'strobe' ? ((bi + i) % 4 === 0 ? 1 : 0) : 0.85 * pulse;
    });
    each(heads.sideTop, (f, i) => { f.color.set(id === 'amber' ? '#ffb347' : col(i)); f.aimAt(tv.set(f.root.position.x * 0.5, 2, 50)); f.dim = 0.6 * pulse; });
    each(heads.par, (f, i) => { f.color.set(id === 'amber' ? '#ffb347' : col(i, 3)); f.aimAt(tv.set(f.root.position.x * 0.6, 2, 46)); f.dim = id === 'laser' ? 0.2 : 0.65 * pulse; });
    blinderCells.forEach((c) => { c.material.opacity = reduceMotion ? 0.15 : id === 'strobe' || (id === 'climax' && bi % 2 === 0) ? Math.exp(-bf * 7) : id === 'fan' && bi % 16 === 0 ? Math.exp(-bf * 7) : 0; });
    // LED battens: colour chase running along every bar
    const cA = new THREE.Color(col(0)), cB = new THREE.Color(col(1));
    for (let i = 0; i < F.bars.length; i++) for (let k = 0; k < BAR_PIX; k++) {
      const w = 0.5 + 0.5 * Math.sin(k * 0.9 - t * 6 + i * 0.7);
      const c = cA.clone().lerp(cB, w).multiplyScalar(id === 'strobe' ? strobe * 0.8 : 0.15 + 0.45 * w * pulse);
      barCol.set([c.r, c.g, c.b], (i * BAR_PIX + k) * 3);
    }
    barGeo.attributes.color.needsUpdate = true;
    barMat.color.copy(cA).multiplyScalar(0.45 + 0.35 * pulse);

    // LED motion mode per scene, cross-faded over ~1.2 s
    const wantMode = LED_MODE[id] ?? 0;
    if (wantMode !== ledFade.to) { ledFade.from = ledFade.mix >= 1 ? ledFade.to : ledFade.from; ledFade.to = wantMode; ledFade.mix = 0; }
    ledFade.mix = Math.min(1, ledFade.mix + dt / 1.2);
    const shardAmt = id === 'climax' ? 1 : id === 'sweep' || id === 'fan' ? 0.6 : id === 'strobe' ? 0.8 : 0.25;
    LED.forEach((m) => {
      m.uniforms.uModeA.value = ledFade.from; m.uniforms.uModeB.value = ledFade.to; m.uniforms.uMix.value = ledFade.mix;
      m.uniforms.uShards.value += (shardAmt - m.uniforms.uShards.value) * Math.min(1, dt * 2);
      m.uniforms.uTime.value = t; m.uniforms.uBeat.value = Math.exp(-bf * 4);
      // white flash only in Strobe; in Climax CO2 + bloom already carry the hit, a flash would blow the frame out
      m.uniforms.uFlash.value = !reduceMotion && id === 'strobe' ? Math.exp(-bf * 9) * 0.3 : 0;
      m.uniforms.uTint.value.set(id === 'amber' ? '#ffb070' : id === 'inferno' ? '#ff5a5a' : id === 'laser' ? '#8fb0ff' : '#ffffff');
    });
    crystalMats.forEach((m) => {
      m.uniforms.uTime.value = t;
      m.uniforms.uPulse.value = id === 'crystal' ? 0.85 + 0.35 * Math.sin(t * 2) : 0.8 + 0.3 * pulse;
      m.uniforms.uSweepCol.value.set(id === 'amber' ? '#ffb347' : '#7fe8ff');
    });
    M.neon.color.set('#d8f6ff').multiplyScalar(1.0 + 0.8 * pulse);
    tigerFx?.update(t, pulse, id === 'inferno' ? '#7fe8ff' : id === 'amber' ? '#ffe2b0' : '#d6f3ff', id === 'crystal' ? 0.5 : id === 'climax' || id === 'inferno' ? 1.6 : 1);
    phoneMat.opacity = id === 'crystal' || id === 'amber' ? 1 : 0.55;

    if (state.haze) { hazeAcc += dt * 18; for (; hazeAcc >= 1; hazeAcc--) particles.spawn((Math.random() - 0.5) * 50, 1 + Math.random() * 14, 30 + Math.random() * 40, (Math.random() - 0.5) * 0.4, 0.05, 0.4, 9, 18 + Math.random() * 10, 4); }
    emitters.forEach((e) => e.update(t, dt));
    particles.update(dt, 0.3);
    confetti.update(dt);
    crowdTime.value = reduceMotion ? 0 : t;
  }

  ui.showEvent(true, {
    views: VIEWS, scenes: CRYSTAL_SCENES, glow,
    onView: (id) => { stopTour(); fly(id); },
    onTour: () => { tour = !tour; ui.setTour(tour); if (tour) { tourIdx = 0; tourT = 0; fly(TOUR[0], 2.5); } },
    onScene: (id) => { state.auto = id === 'auto'; if (!state.auto) state.scene = id; },
    onFx: (k) => fire(k, curT),
    onHaze: (on) => { state.haze = on; },
    onCrowd: (on) => { crowd.visible = on; phonePts.visible = on; },
    onGlow: (on) => { glow = on; },
    onExit,
  });

  return {
    scene, camera, exposure: 1.0,
    update(dt, t) {
      curT = t;
      if (tween) {
        tween.t += dt / tween.dur;
        const k = tween.t >= 1 ? 1 : 1 - Math.pow(1 - tween.t, 3);
        camera.position.lerpVectors(tween.from, tween.to, k);
        controls.target.lerpVectors(tween.fromT, tween.toT, k);
        if (tween.t >= 1) tween = null;
      } else if (tour) {
        tourT += dt;
        const off = camera.position.clone().sub(controls.target);
        off.applyAxisAngle(V(0, 1, 0), dt * 0.06);
        camera.position.copy(controls.target).add(off);
        if (tourT > 7) { tourT = 0; tourIdx = (tourIdx + 1) % TOUR.length; fly(TOUR[tourIdx], 3); }
      }
      controls.enabled = !tween;
      controls.update();
      show(t, dt);
    },
    render() { if (glow) composer.render(); else renderer.render(scene, camera); },
    resize(w, h, dpr) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      tigerFx?.resize(w, h);
      particles.mat.uniforms.uScale.value = h * dpr * 0.9;
    },
    dispose() { disposers.forEach((d) => d()); ui.showEvent(false); },
  };
}
