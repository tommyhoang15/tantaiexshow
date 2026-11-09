import * as THREE from 'three';
import { stoneBricks, flagstones, woodPlanks, triplanar } from '../core/textures.js';
import { buildCollider, Input, Player } from '../core/player.js';
import { createPortal } from './portal.js';
import { Particles } from '../stage/effects.js';
import { ADDITIVE, glowTexture } from '../stage/materials.js';
import { ROSTER, charById, createCharacter, addDance } from '../core/characters.js';

// Room layout (glTF Y-up; Blender x,y → three x,-z)
// Room A: x -6..6, z -12..0   Room B: x 5.5..18, z 3.5..12
const SPAWN = new THREE.Vector3(0, 0, -3.5);
const PORTALS = [
  { id: 'crystal', pos: new THREE.Vector3(0, 0, -11.05), rotY: 0, colorA: '#0a3cff', colorB: '#6fe7ff', rune: '#7ff3ff', title: 'CRYSTAL RAVE', sub: 'Sự kiện · sân khấu pha lê' },
  { id: 'venue', pos: new THREE.Vector3(12, 0, 11.05), rotY: Math.PI, colorA: '#ff2d55', colorB: '#ffb347', rune: '#ffc56b', title: 'RAP VIỆT ALL-STAR', sub: 'Sơ đồ khán đài 2021' },
];

/**
 * @param {ReturnType<import('../core/engine.js').createEngine>} engine
 * @param {{ loader: any, ui: any, onPortal: (id: string) => void, cache: any }} ctx
 */
export async function createLobby(engine, ctx) {
  const { loader, ui, onPortal, cache } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0d16');
  scene.fog = new THREE.FogExp2('#0a0d16', 0.028);
  scene.environment = engine.env();
  scene.environmentIntensity = 0.35;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

  // ---- assets (cached between visits) ----
  cache.dungeon ??= loader.gltf('/assets/dungeon.glb', 253412);
  cache.torches ??= loader.json('/assets/torches.json');
  let charId = cache.charId ?? (() => { try { return localStorage.getItem('char'); } catch { return null; } })() ?? 'knight';
  charId = charById(charId).id;
  const [dungeonG, firstChar, torches] = await Promise.all([cache.dungeon, createCharacter(charById(charId), { loader, cache }), cache.torches]);

  // ---- materials (procedural, replace Blender's node materials) ----
  const T = cache.lobbyTex ??= { bricks: stoneBricks(), floor: flagstones(), wood: woodPlanks() };
  const M = {
    bricks: triplanar(new THREE.MeshStandardMaterial({ color: '#c3cbd8', roughness: 0.92 }), T.bricks, 0.45),
    floor: triplanar(new THREE.MeshStandardMaterial({ color: '#c7cfdc', roughness: 0.8, metalness: 0.05 }), T.floor, 0.25),
    pillar: triplanar(new THREE.MeshStandardMaterial({ color: '#4b5160', roughness: 0.85 }), T.bricks, 0.9),
    trim: triplanar(new THREE.MeshStandardMaterial({ color: '#6a4a33', roughness: 0.8 }), T.wood, 0.8),
    wood: triplanar(new THREE.MeshStandardMaterial({ color: '#c28a5a', roughness: 0.75 }), T.wood, 0.9),
    darkWood: triplanar(new THREE.MeshStandardMaterial({ color: '#5a3a24', roughness: 0.8 }), T.wood, 0.9),
    gold: new THREE.MeshStandardMaterial({ color: '#d4a63a', metalness: 1, roughness: 0.3, emissive: '#3a2600', emissiveIntensity: 0.4 }),
    iron: new THREE.MeshStandardMaterial({ color: '#2b2f3a', metalness: 0.9, roughness: 0.45 }),
    chest: new THREE.MeshStandardMaterial({ color: '#2a1550', metalness: 0.7, roughness: 0.4 }),
    flame: new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false }),
  };
  const BY_NAME = {
    bricks: M.bricks, stone: M.floor, pillar: M.pillar, 'Material.005': M.trim,
    'Material.001': M.wood, 'Material.002': M.darkWood, 'Material.003': M.darkWood, 'Material.004': M.darkWood,
    'Material.006': M.flame, 'Material.007': M.chest, 'Rough Iron Steel': M.iron, gold: M.gold,
  };
  const dungeon = dungeonG.scene.clone(true);
  dungeon.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => BY_NAME[m.name] ?? m;
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    if (o.material === M.flame) o.userData.noCollide = true;
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });
  scene.add(dungeon);

  // ground outside the dungeon (you can fly over the walls)
  const groundGeo = new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2).translate(6, -0.13, 0);
  const ground = new THREE.Mesh(groundGeo, triplanar(new THREE.MeshStandardMaterial({ color: '#3c4350', roughness: 1 }), T.floor, 0.12));
  scene.add(ground);

  // ---- lighting: moonlight + torches (3 nearest torches get a real light) ----
  scene.add(new THREE.HemisphereLight('#8ea0d8', '#2a1c12', 1.4));
  const moon = new THREE.DirectionalLight('#b5c4ff', 1.3);
  moon.position.set(-10, 20, 8);
  scene.add(moon);
  const torchLights = [0, 1, 2].map(() => { const l = new THREE.PointLight('#ff9a3c', 0, 12, 1.5); scene.add(l); return l; });
  // glow sprites on every flame, flickering on the GPU
  const tPos = new Float32Array(torches.length * 3);
  const tSeed = new Float32Array(torches.length);
  torches.forEach((p, i) => { tPos.set([p[0], p[1] + 0.12, p[2]], i * 3); tSeed[i] = Math.random() * 100; });
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  tGeo.setAttribute('aSeed', new THREE.BufferAttribute(tSeed, 1));
  const tMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: glowTexture() }, uScale: { value: 400 } },
    vertexShader: `attribute float aSeed; uniform float uTime; uniform float uScale; varying float vF;
      void main() { vF = 0.75 + 0.25 * sin(uTime * 9.0 + aSeed) * sin(uTime * 5.3 + aSeed * 2.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 1.1 * vF * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vF;
      void main() { float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(vec3(1.0, 0.62, 0.25) * vF, a * 0.9); }`,
    ...ADDITIVE,
  });
  scene.add(new THREE.Points(tGeo, tMat));
  const torchVec = torches.map((p) => new THREE.Vector3(p[0], p[1], p[2]));

  // ---- portals ----
  const portals = PORTALS.map((def) => {
    const p = createPortal({ colorA: def.colorA, colorB: def.colorB, title: def.title, sub: def.sub, frameMat: M.pillar, runeColor: def.rune });
    p.group.position.copy(def.pos);
    p.group.rotation.y = def.rotY;
    scene.add(p.group);
    return { ...def, ...p };
  });

  // ---- collision + player ----
  const collider = buildCollider([dungeon, ...portals.map((p) => p.group)], [groundGeo]);
  const model = new THREE.Group();
  // soft aura under the character
  const aura = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#6fe7ff', ...ADDITIVE, opacity: 0.5 }));
  aura.position.y = 0.02;
  model.add(aura);

  const input = new Input(engine.renderer.domElement, ui);
  const player = new Player({ model, collider, camera, input, spawn: SPAWN, spawnYaw: Math.PI });
  scene.add(player.root);
  player.onFly = (on) => ui.setFlying(on);

  // ---- character: swap the rigged model inside the player ----
  let ch = null;
  function wear(next) {
    if (ch) { ch.mixer.stopAllAction(); model.remove(ch.object); }
    ch = next;
    model.add(ch.object);
    aura.material.color.set(ch.def.aura);
    player.anim = { mixer: ch.mixer, actions: ch.actions, current: null };
    charId = ch.def.id;
    cache.charId = charId;
    try { localStorage.setItem('char', charId); } catch { /* private mode */ }
  }
  wear(firstChar);

  // ---- character selection: the lobby itself is the showroom ----
  let selecting = !cache.picked;
  let pickToken = 0;
  let orbit = 0;
  async function pick(id) {
    const token = ++pickToken;
    ui.selectBusy(id, true);
    try {
      const next = await createCharacter(charById(id), { loader, cache });
      if (token !== pickToken) return;
      wear(next);
      showcase();
    } finally { ui.selectBusy(id, false); }
  }
  async function showcase() {
    const c = ch;
    const dance = c.actions.Dance ?? c.actions.Wave ?? await addDance(c, { loader, cache }).catch(() => null);
    if (c !== ch || !selecting) return;
    player.playClip(dance ? (c.actions.Dance ? 'Dance' : 'Wave') : 'Idle');
  }
  function setSelecting(on) {
    selecting = on;
    if (on) {
      player.flying = false; ui.setFlying(false);
      player.respawn();
      orbit = 0;
      ui.showSelect({ roster: ROSTER, current: charId, onPick: pick, onConfirm: () => setSelecting(false) });
      showcase();
    } else {
      cache.picked = true;
      ui.hideSelect();
      input.jumpPressed = input.flyToggle = input.act = false;
      player.playClip('Idle');
    }
    ui.showLobby(!on);
  }

  const trail = new Particles(500);
  scene.add(trail.points);

  // ---- UI ----
  ui.onChangeChar = () => setSelecting(true);
  setSelecting(selecting);
  let near = null;
  let entering = false;
  let lightTimer = 0;
  let trailAcc = 0;

  return {
    scene, camera, exposure: 1.25,
    update(dt, t) {
      if (selecting) {
        // turntable: camera circles in front of the character, who dances
        orbit += dt * 0.35;
        const ang = player.facing + Math.sin(orbit) * 0.6;
        const f = player.feet;
        camera.position.set(f.x + Math.sin(ang) * 3.3, f.y + 1.55, f.z + Math.cos(ang) * 3.3);
        camera.lookAt(f.x, f.y + 0.95, f.z);
        player.time += dt;
        player.anim?.mixer.update(dt);
        player.animateBody(dt, false);
      } else player.update(dt);
      tMat.uniforms.uTime.value = t;
      portals.forEach((p) => p.update(t));

      // move the 3 real torch lights to the torches nearest the player
      if ((lightTimer -= dt) <= 0) {
        lightTimer = 0.4;
        const pp = player.root.position;
        const nearest = torchVec.map((v, i) => [v.distanceToSquared(pp), i]).sort((a, b) => a[0] - b[0]).slice(0, 3);
        nearest.forEach(([, i], k) => torchLights[k].position.copy(torchVec[i]).add(new THREE.Vector3(0, 0.2, 0)));
      }
      torchLights.forEach((l, k) => { l.intensity = 16 + Math.sin(t * 11 + k * 3) * 3 + Math.sin(t * 23 + k) * 2; });

      // flight trail
      if (player.flying) {
        trailAcc += dt * 80;
        const f = player.feet;
        for (; trailAcc >= 1; trailAcc--) trail.spawn(f.x + (Math.random() - 0.5) * 0.3, f.y + 0.2, f.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, -0.6, (Math.random() - 0.5) * 0.4, 0.8, 0.5, 5);
      }
      trail.update(dt);

      // portal proximity + walk-through
      const pp = player.root.position;
      near = null;
      for (const p of portals) {
        const local = p.group.worldToLocal(pp.clone());
        const inside = Math.abs(local.x) < p.width / 2 && local.y < 4.5 && local.y > 0;
        if (inside && Math.abs(local.z) < 3.2) near = p;
        if (inside && local.z < 0.25 && local.z > -0.6 && !entering && !selecting) { entering = true; onPortal(p.id); }
      }
      if (selecting) near = null;
      ui.setPrompt(near ? `${near.title} — đi vào cổng hoặc nhấn E` : null);
      if (near && input.act && !entering) { entering = true; onPortal(near.id); }
      input.act = false;
    },
    resize(w, h, dpr) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      tMat.uniforms.uScale.value = h * dpr * 0.5;
      trail.mat.uniforms.uScale.value = h * dpr * 0.9;
    },
    dispose() {
      ch?.mixer.stopAllAction();
      ui.onChangeChar = null;
      ui.hideSelect();
      input.dispose();
      collider.boundsTree = null;
      collider.dispose();
      ui.showLobby(false);
      ui.setPrompt(null);
    },
  };
}
