import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Playable characters. Mixamo rigs share one skeleton naming, so they share the clips in
// anims-mixamo.glb (Idle/Walk/Run) and anims-dance.glb (Dance, only loaded for the selection preview).
export const ROSTER = [
  { id: 'knight', name: 'Hiệp sĩ', tag: 'Giáp mặt trời', url: '/assets/knight.glb', bytes: 387000, aura: '#6fe7ff' },
  { id: 'street', name: 'Quý ông', tag: 'Mũ chóp, vest nâu, nơ đen', url: '/assets/chars/street.glb', bytes: 325000, mixamo: true, aura: '#ffb347' },
  { id: 'michelle', name: 'Vũ công', tag: 'Nhảy samba cả đêm', url: '/assets/chars/michelle.glb', bytes: 950000, mixamo: true, aura: '#ff5fa2' },
  { id: 'robot', name: 'Robot', tag: 'Biết vẫy tay, biết nhảy', url: '/assets/chars/robot.glb', bytes: 200000, aura: '#ffd23f' },
  { id: 'soldier', name: 'Đặc nhiệm', tag: 'Mũ giáp, kính che mặt', url: '/assets/chars/soldier.glb', bytes: 415000, mixamo: true, yaw: Math.PI, aura: '#7dff9a' },
  { id: 'xbot', name: 'X-Bot', tag: 'Ma-nơ-canh thử chuyển động', url: '/assets/chars/xbot.glb', bytes: 600000, mixamo: true, aura: '#ff6b5a' },
];
export const charById = (id) => ROSTER.find((c) => c.id === id) ?? ROSTER[0];

const HIPS = 'mixamorigHips';

// Mixamo rigs share bone names but not rest orientations (armature roots and bone rolls differ per
// export). Re-express every rotation relative to the rest pose: q' = restDst * restSrc^-1 * q.
// Root motion keeps only its offset from rest, rescaled to the target's hip height.
const _q = new THREE.Quaternion(), _c = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
function retarget(clip, srcRoot, dstRoot) {
  const tracks = [];
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.');
    const bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    const src = srcRoot.getObjectByName(bone), dst = dstRoot.getObjectByName(bone);
    if (!src || !dst) continue;
    if (prop === 'quaternion') {
      _c.copy(src.quaternion).invert().premultiply(dst.quaternion);
      const v = t.values.slice();
      for (let i = 0; i < v.length; i += 4) { _q.fromArray(v, i).premultiply(_c).toArray(v, i); }
      tracks.push(new THREE.QuaternionKeyframeTrack(t.name, t.times, v));
    } else if (prop === 'position' && bone === HIPS) {
      // move the offset from rest through world space: armatures differ in rotation and unit scale
      srcRoot.updateMatrixWorld(true); dstRoot.updateMatrixWorld(true);
      const toW = new THREE.Matrix3().setFromMatrix4(src.parent.matrixWorld);
      const fromW = new THREE.Matrix3().setFromMatrix4(dst.parent.matrixWorld).invert();
      const k = dst.getWorldPosition(_v).y / Math.max(1e-6, src.getWorldPosition(_w).y);
      const v = t.values.slice();
      for (let i = 0; i < v.length; i += 3) {
        _v.fromArray(v, i).sub(src.position).applyMatrix3(toW).multiplyScalar(k).applyMatrix3(fromW).add(dst.position).toArray(v, i);
      }
      tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times, v));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Load (cached) and instantiate a character: a fresh skinned clone, 1.75 m tall, feet at origin, facing +Z,
 * with an AnimationMixer and actions keyed Idle/Walk/Run/Jump/Fly(/Dance/Wave).
 */
export async function createCharacter(def, { loader, cache, dance = false }) {
  cache.chars ??= {};
  cache.chars[def.id] ??= loader.gltf(def.url, def.bytes);
  if (def.mixamo) cache.mixamoAnims ??= loader.gltf('/assets/chars/anims-mixamo.glb', 232000);
  if (dance && def.mixamo) cache.danceAnims ??= loader.gltf('/assets/chars/anims-dance.glb', 472000);
  const [g, mix, dan] = await Promise.all([cache.chars[def.id], def.mixamo ? cache.mixamoAnims : null, dance && def.mixamo ? cache.danceAnims : null]);

  const obj = cloneSkinned(g.scene);
  if (def.yaw) obj.rotation.y = def.yaw; // models authored facing -Z
  obj.updateMatrixWorld(true);
  // precise: skinned bounds from the posed vertices (quantized/Mixamo rigs report huge loose boxes)
  const box = new THREE.Box3().setFromObject(obj, true);
  const s = 1.75 / (box.max.y - box.min.y);
  obj.scale.setScalar(s);
  obj.position.y = -box.min.y * s;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => { if (m) m.envMapIntensity = 2.2; });
  });

  const mixer = new THREE.AnimationMixer(obj);
  const clips = {};
  if (def.mixamo) {
    mix.animations.forEach((c) => { clips[c.name] = retarget(c, mix.scene, g.scene); });
    dan?.animations.forEach((c) => { clips[c.name] = retarget(c, dan.scene, g.scene); });
  } else {
    g.animations.forEach((c) => { clips[c.name.replace(/_.*$/, '')] = c; });
  }
  // rigs without a jump / flight pose borrow the closest motion; the player adds lean + hover on top
  clips.Jump ??= clips.Run;
  clips.Fly ??= clips.Idle;
  const actions = {};
  Object.entries(clips).forEach(([k, c]) => { if (c) actions[k] = mixer.clipAction(c); });
  return { def, object: obj, mixer, actions };
}

/** Add the Dance action to a mixamo character once the dance clips have loaded (selection preview). */
export async function addDance(ch, { loader, cache }) {
  if (ch.actions.Dance) return ch.actions.Dance;
  if (!ch.def.mixamo) return null;
  cache.danceAnims ??= loader.gltf('/assets/chars/anims-dance.glb', 472000);
  const [dan, g] = await Promise.all([cache.danceAnims, cache.chars[ch.def.id]]);
  const clip = dan.animations.find((c) => c.name === 'Dance');
  if (!clip) return null;
  ch.actions.Dance = ch.mixer.clipAction(retarget(clip, dan.scene, g.scene));
  return ch.actions.Dance;
}
