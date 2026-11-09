import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- Collision world ----------
// Bakes every collidable mesh (instanced or not) into one position-only geometry + BVH.
export function buildCollider(objects, extra = []) {
  const geos = [];
  const m = new THREE.Matrix4();
  const push = (geo, matrix) => {
    // meshopt-quantized models store positions as normalized Int16 (often interleaved):
    // read them back through getX/Y/Z into plain Float32 so every piece merges cleanly
    const src = geo.attributes.position;
    const arr = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) arr.set([src.getX(i), src.getY(i), src.getZ(i)], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    if (geo.index) g.setIndex(geo.index.clone());
    g.applyMatrix4(matrix);
    geos.push(g.index ? g.toNonIndexed() : g);
  };
  objects.forEach((root) => root.traverse((o) => {
    if (!o.isMesh || o.userData.noCollide) return;
    o.updateWorldMatrix(true, false);
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); push(o.geometry, m.clone().premultiply(o.matrixWorld)); }
    } else push(o.geometry, o.matrixWorld);
  }));
  extra.forEach((g) => push(g, new THREE.Matrix4()));
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  merged.boundsTree = new MeshBVH(merged);
  return merged;
}

// ---------- Input ----------
export class Input {
  constructor(canvas, ui) {
    this.keys = new Set();
    this.move = new THREE.Vector2(); // x = strafe, y = forward (-1..1)
    this.look = new THREE.Vector2(); // accumulated drag delta (px)
    this.zoom = 0;
    this.jumpPressed = false;
    this.flyToggle = false;
    this.up = false;
    this.down = false;
    this.run = false;
    this.act = false;
    this._lastSpace = 0;
    this._on = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); this._on.push([t, ev, fn, opt]); };

    on(window, 'keydown', (e) => {
      if (e.target.matches?.('input, select, textarea')) return;
      const k = e.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      if (k === 'Space') {
        const now = performance.now();
        if (now - this._lastSpace < 280) this.flyToggle = true; // double-tap Space toggles flight
        else this.jumpPressed = true;
        this._lastSpace = now;
      }
      if (k === 'KeyF') this.flyToggle = true;
      if (k === 'KeyE' || k === 'Enter') this.act = true;
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());

    // drag to orbit the camera (mouse anywhere / touch on the right side)
    let drag = null;
    on(canvas, 'pointerdown', (e) => {
      if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.4) return; // left side = joystick zone
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    on(canvas, 'pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      this.look.x += e.clientX - drag.x;
      this.look.y += e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    on(canvas, 'pointerup', end);
    on(canvas, 'pointercancel', end);
    on(canvas, 'wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    // on-screen joystick + buttons (touch)
    if (ui?.stick) {
      const base = ui.stick, knob = base.firstElementChild;
      let sid = null, cx = 0, cy = 0;
      on(base, 'pointerdown', (e) => {
        sid = e.pointerId; base.setPointerCapture(sid);
        const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        e.preventDefault();
      });
      on(base, 'pointermove', (e) => {
        if (e.pointerId !== sid) return;
        const max = 46;
        let dx = e.clientX - cx, dy = e.clientY - cy;
        const l = Math.hypot(dx, dy);
        if (l > max) { dx = (dx / l) * max; dy = (dy / l) * max; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.move.set(dx / max, -dy / max);
        this.run = l > max * 0.95;
      });
      const stop = () => { sid = null; knob.style.transform = ''; this.move.set(0, 0); this.run = false; };
      on(base, 'pointerup', stop);
      on(base, 'pointercancel', stop);
    }
    const hold = (el, prop) => {
      if (!el) return;
      on(el, 'pointerdown', (e) => { this[prop] = true; e.preventDefault(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => on(el, ev, () => { this[prop] = false; }));
    };
    if (ui?.jump) on(ui.jump, 'pointerdown', (e) => { this.jumpPressed = true; e.preventDefault(); });
    if (ui?.fly) on(ui.fly, 'click', () => { this.flyToggle = true; });
    hold(ui?.up, 'touchUp');
    hold(ui?.down, 'touchDown');
  }

  // Keyboard state merged with the joystick each frame
  axes() {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const v = new THREE.Vector2(x + this.move.x, y + this.move.y);
    if (v.lengthSq() > 1) v.normalize();
    return v;
  }
  get running() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.run; }
  get ascending() { return this.keys.has('Space') || this.touchUp; }
  get descending() { return this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.keys.has('KeyQ') || this.touchDown; }

  dispose() { this._on.forEach(([t, ev, fn, opt]) => t.removeEventListener(ev, fn, opt)); }
}

// ---------- Third-person character controller ----------
const tmpBox = new THREE.Box3();
const tmpSeg = new THREE.Line3();
const tmpV = new THREE.Vector3();
const triPt = new THREE.Vector3();
const capPt = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const camRight = new THREE.Vector3();
const CAM_PROBES = [[0, 0], [0.28, 0], [-0.28, 0], [0, 0.22], [0, -0.22]];

export class Player {
  /**
   * @param {THREE.Object3D} model visual, feet at its origin, facing +Z
   * @param {THREE.BufferGeometry} collider geometry with boundsTree
   */
  constructor({ model, collider, camera, input, spawn, spawnYaw = 0, anim = null }) {
    this.anim = anim; // { mixer, actions: { Idle, Walk, Run, Jump, Fly } } from the rigged model
    this.radius = 0.32;
    this.height = 1.75;
    this.segment = new THREE.Line3(new THREE.Vector3(), new THREE.Vector3(0, -(this.height - 2 * this.radius), 0));
    this.root = new THREE.Group();
    this.visual = new THREE.Group(); // procedural animation happens on this node
    this.visual.add(model);
    this.root.add(this.visual);
    this.collider = collider;
    this.camera = camera;
    this.input = input;
    this.vel = new THREE.Vector3();
    this.onGround = false;
    this.flying = false;
    this.facing = spawnYaw;
    this.camYaw = spawnYaw + Math.PI;
    this.camPitch = 0.32;
    this.camDist = 5.5;
    this.camDistNow = 5.5;
    this.spawn = spawn.clone();
    this.spawnYaw = spawnYaw;
    this.speedNow = 0;
    this.land = 0;
    this.time = 0;
    this.respawn();
    this.ray = new THREE.Ray();
  }

  get feet() { return tmpV.copy(this.root.position).setY(this.root.position.y - (this.height - this.radius)); }

  respawn() {
    this.root.position.copy(this.spawn).add(new THREE.Vector3(0, this.height - this.radius, 0));
    this.vel.set(0, 0, 0);
    this.facing = this.spawnYaw;
    this.camYaw = this.spawnYaw + Math.PI;
  }

  update(dt) {
    const inp = this.input;
    this.time += dt;
    // camera orbit from drag / zoom
    this.camYaw -= inp.look.x * 0.005;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + inp.look.y * 0.004, -0.35, 1.25);
    inp.look.set(0, 0);
    this.camDist = THREE.MathUtils.clamp(this.camDist + inp.zoom * 0.6, 2.2, 12);
    inp.zoom = 0;

    if (inp.flyToggle) { this.flying = !this.flying; inp.flyToggle = false; this.vel.y = this.flying ? 2 : 0; this.onFly?.(this.flying); }

    // desired horizontal motion relative to the camera
    const ax = inp.axes();
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3().crossVectors(fwd, UP);
    const wish = new THREE.Vector3().addScaledVector(fwd, ax.y).addScaledVector(right, ax.x);
    const speed = this.flying ? (inp.running ? 16 : 9) : inp.running ? 7.5 : 4.2;
    const moving = wish.lengthSq() > 0.001;
    if (moving) {
      const target = Math.atan2(wish.x, wish.z);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 12);
    }
    this.speedNow += ((moving ? speed * Math.min(1, wish.length()) : 0) - this.speedNow) * Math.min(1, dt * 10);

    if (this.flying) {
      const vy = (inp.ascending ? 1 : 0) - (inp.descending ? 1 : 0);
      this.vel.y += (vy * 7 - this.vel.y) * Math.min(1, dt * 6);
    } else {
      if (inp.jumpPressed && this.onGround) { this.vel.y = 8.5; this.onGround = false; this.squash = 1; }
      this.vel.y += this.onGround ? 0 : -24 * dt;
    }
    inp.jumpPressed = false;

    // integrate in sub-steps for stable collisions
    const steps = 4;
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      const p = this.root.position;
      p.addScaledVector(this.vel, sdt);
      if (moving) p.addScaledVector(wish.clone().normalize(), this.speedNow * sdt);
      if (this.flying) p.y = Math.min(p.y, 14);
      this.collide(sdt);
    }
    if (this.root.position.y < -20) this.respawn();

    this.animate(dt, moving);
    this.updateCamera(dt);
  }

  collide(dt) {
    const bvh = this.collider.boundsTree;
    tmpSeg.copy(this.segment);
    tmpSeg.start.add(this.root.position);
    tmpSeg.end.add(this.root.position);
    tmpBox.makeEmpty().expandByPoint(tmpSeg.start).expandByPoint(tmpSeg.end);
    tmpBox.min.addScalar(-this.radius); tmpBox.max.addScalar(this.radius);
    const r = this.radius;
    bvh.shapecast({
      intersectsBounds: (box) => box.intersectsBox(tmpBox),
      intersectsTriangle: (tri) => {
        const dist = tri.closestPointToSegment(tmpSeg, triPt, capPt);
        if (dist < r) {
          const depth = r - dist;
          const dir = capPt.sub(triPt).normalize();
          tmpSeg.start.addScaledVector(dir, depth);
          tmpSeg.end.addScaledVector(dir, depth);
        }
      },
    });
    const delta = tmpV.subVectors(tmpSeg.start, this.root.position);
    const wasGround = this.onGround;
    this.onGround = delta.y > Math.abs(dt * this.vel.y * 0.25) || (delta.y > 0 && this.vel.y <= 0);
    const offset = Math.max(0, delta.length() - 1e-5);
    delta.normalize().multiplyScalar(offset);
    this.root.position.add(delta);
    if (this.onGround && !this.flying) {
      if (!wasGround && this.vel.y < -6) this.land = 1; // landing squash
      this.vel.set(0, 0, 0);
    } else if (offset > 0) this.vel.addScaledVector(delta, -delta.dot(this.vel) / Math.max(1e-6, delta.lengthSq()));
  }

  // Skeletal clips drive the limbs; small procedural touches (lean, hover, landing squash) sit on top.
  playClip(name, timeScale = 1) {
    const a = this.anim;
    if (!a) return;
    const next = a.actions[name];
    if (!next) return;
    next.timeScale = timeScale;
    if (a.current === next) return;
    next.reset().setEffectiveWeight(1).fadeIn(name === 'Jump' ? 0.12 : 0.22).play();
    a.current?.fadeOut(name === 'Jump' ? 0.12 : 0.22);
    a.current = next;
  }

  animate(dt, moving) {
    if (this.anim) {
      const sp = this.speedNow;
      if (this.flying) this.playClip('Fly');
      else if (!this.onGround && Math.abs(this.vel.y) > 1.5) this.playClip('Jump');
      // match stride to ground speed so the feet don't skate
      else if (moving && sp > 5.2) this.playClip('Run', sp / 7.5);
      else if (moving && sp > 0.4) this.playClip('Walk', Math.max(0.6, sp / 4.2));
      else this.playClip('Idle');
      this.anim.mixer.update(dt);
    }
    this.animateBody(dt, moving);
  }

  animateBody(dt, moving) {
    const rigged = !!this.anim;
    const v = this.visual;
    const t = this.time;
    const sp = this.speedNow;
    v.rotation.set(0, 0, 0);
    v.position.set(0, -(this.height - this.radius), 0);
    v.scale.set(1, 1, 1);
    this.root.rotation.y = this.facing;
    if (this.flying) {
      v.position.y += Math.sin(t * 2.4) * 0.12;
      v.rotation.x = 0.12 + Math.min(0.45, sp * 0.03);
      v.rotation.z = Math.sin(t * 1.3) * 0.06;
    } else if (!this.onGround) {
      const s = THREE.MathUtils.clamp(this.vel.y / 8.5, -1, 1) * (rigged ? 0.5 : 1);
      v.scale.set(1 - s * 0.06, 1 + s * 0.1, 1 - s * 0.06);
      v.rotation.x = sp * 0.02;
    } else if (moving) {
      if (!rigged) {
        const f = sp > 6 ? 11 : 8.5;
        v.position.y += Math.abs(Math.sin(t * f)) * (0.05 + sp * 0.008);
        v.rotation.z = Math.sin(t * f) * 0.05;
      }
      v.rotation.x = sp * (rigged ? 0.008 : 0.018);
    } else if (!rigged) {
      v.scale.y = 1 + Math.sin(t * 1.8) * 0.008; // breathing
    }
    if (this.land > 0) {
      v.scale.y *= 1 - this.land * 0.14;
      v.scale.x *= 1 + this.land * 0.08;
      v.scale.z *= 1 + this.land * 0.08;
      this.land = Math.max(0, this.land - dt * 5);
    }
  }

  updateCamera(dt) {
    const target = tmpV.copy(this.root.position).add(new THREE.Vector3(0, 0.35, 0));
    const dir = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch)
    );
    // pull the camera in front of walls: 5 rays (centre + a small cross the size of the near plane's
    // footprint) so the lens never pokes into a wall edge or a door arch
    const right = camRight.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    let want = this.camDist;
    for (const [ox, oy] of CAM_PROBES) {
      this.ray.origin.copy(target).addScaledVector(right, ox).y += oy;
      this.ray.direction.copy(dir);
      const hit = this.collider.boundsTree.raycastFirst(this.ray, THREE.DoubleSide);
      if (hit && hit.distance - 0.35 < want) want = hit.distance - 0.35;
    }
    want = Math.max(0.35, want);
    // snap in instantly (never show the inside of a wall), ease back out
    this.camDistNow = want < this.camDistNow ? want : this.camDistNow + (want - this.camDistNow) * Math.min(1, dt * 4);
    this.camera.position.copy(target).addScaledVector(dir, this.camDistNow);
    this.camera.lookAt(target);
  }
}
