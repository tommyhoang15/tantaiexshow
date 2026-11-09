import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// One renderer for the whole immersive site. Scenes ("worlds") are swapped in and out:
// each world is { scene, camera, update(dt, t), render?(), resize?(w, h, dpr), dispose() }.
export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: devicePixelRatio < 2, // high-DPI screens don't need MSAA
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const MAX_DPR = Math.min(devicePixelRatio, 1.75);
  let dpr = MAX_DPR;
  renderer.setPixelRatio(dpr);

  const fade = document.getElementById('fade');
  const clock = new THREE.Clock();
  let world = null;
  let busy = false;

  function size() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    world?.resize?.(w, h, dpr);
  }
  addEventListener('resize', size);
  size();

  // ---- adaptive resolution (ignores stalls / hidden tabs) ----
  let qAcc = 0, qFrames = 0, qLast = 0, qWarm = 0;
  function adapt() {
    const now = performance.now();
    const ft = now - qLast;
    qLast = now;
    if (document.hidden || ft > 120 || ft <= 0 || busy) return;
    if ((qWarm += ft) < 2500) return;
    qAcc += ft; qFrames++;
    if (qAcc < 1500) return;
    const fps = (qFrames * 1000) / qAcc;
    qAcc = 0; qFrames = 0;
    const next = fps < 48 ? Math.max(0.6, dpr - 0.2) : fps > 58 ? Math.min(MAX_DPR, dpr + 0.1) : dpr;
    if (Math.abs(next - dpr) > 0.01) {
      dpr = next;
      renderer.setPixelRatio(dpr);
      size();
      engine.onQuality?.(dpr / MAX_DPR);
    }
  }
  const resetAdapt = () => { qAcc = 0; qFrames = 0; qWarm = 0; };
  document.addEventListener('visibilitychange', resetAdapt);

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!world || engine.paused) return; // paused while the real-event video is open
    world.update(dt, clock.elapsedTime);
    if (world.render) world.render();
    else renderer.render(world.scene, world.camera);
    adapt();
  });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Neutral studio reflections generated on the GPU (no HDR download) so metals don't render black
  let envTex = null;
  const env = () => {
    if (!envTex) {
      const pm = new THREE.PMREMGenerator(renderer);
      envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    return envTex;
  };

  const engine = {
    renderer,
    env,
    get dpr() { return dpr; },
    get maxDpr() { return MAX_DPR; },
    get world() { return world; },
    onQuality: null,
    paused: false,
    // Fade out → build the next world → dispose the old one → fade in.
    async go(factory, { color = '#000' } = {}) {
      if (busy) return;
      busy = true;
      fade.style.background = color;
      fade.classList.add('on');
      await wait(450);
      const old = world;
      world = null;
      try {
        if (old) { old.dispose(); disposeScene(old.scene); }
        world = await factory(engine);
        renderer.toneMappingExposure = world.exposure ?? 1;
        size();
        renderer.compile(world.scene, world.camera); // compile shaders before revealing
        resetAdapt();
      } catch (err) {
        // never leave the visitor on a black screen: report and let the caller fall back
        console.error('World failed to load', err);
        world = null;
        throw err;
      } finally {
        fade.classList.remove('on');
        busy = false;
      }
    },
  };
  if (import.meta.env.DEV) window.__engine = engine; // dev-only inspection hook
  return engine;
}

export function disposeScene(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => {
      for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
      if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture) v.dispose(); }
      m.dispose();
    });
  });
}
