import './app.css';
import { createEngine } from './core/engine.js';
import { createLoader } from './core/loader.js';
import { createLobby } from './lobby/lobby.js';

const $ = (id) => document.getElementById(id);
const engine = createEngine($('c'));
const loader = createLoader((p) => { $('ldBar').style.width = `${Math.round(p * 100)}%`; });
const cache = {};

// ---------- UI controller shared by the worlds ----------
const ui = {
  stick: $('stick'), jump: $('bJump'), fly: $('bFly'), up: $('bUp'), down: $('bDown'),
  showLobby(on) { $('lobbyUi').hidden = !on; },
  setFlying(on) { $('flyBadge').hidden = !on; $('bUp').hidden = !on; $('bDown').hidden = !on; $('bFly').textContent = on ? 'Đi bộ' : 'Bay'; },
  setPrompt(text) { const p = $('prompt'); p.hidden = !text; if (text && p.textContent !== text) p.textContent = text; },

  showEvent(on, opts) {
    $('eventUi').hidden = !on;
    if (!on) return;
    const views = $('views');
    views.replaceChildren();
    Object.entries(opts.views).forEach(([id, v]) => {
      const b = document.createElement('button');
      b.className = 'xbtn xbtn--toggle'; b.dataset.view = id; b.textContent = v.label; b.setAttribute('aria-pressed', 'false');
      b.onclick = () => opts.onView(id);
      views.appendChild(b);
    });
    const tourBtn = document.createElement('button');
    tourBtn.className = 'xbtn xbtn--toggle'; tourBtn.id = 'tourBtn'; tourBtn.textContent = '◎ Camera tự bay'; tourBtn.setAttribute('aria-pressed', 'false');
    tourBtn.onclick = opts.onTour;
    views.appendChild(tourBtn);
    const sel = $('sceneSel');
    sel.length = 1;
    opts.scenes.forEach((s) => sel.add(new Option(s.label, s.id)));
    sel.value = 'auto';
    sel.onchange = () => opts.onScene(sel.value);
    document.querySelectorAll('[data-fx]').forEach((b) => { b.onclick = () => opts.onFx(b.dataset.fx); });
    const toggle = (id, fn) => { const b = $(id); b.onclick = () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(v)); fn(v); }; };
    toggle('tHaze', opts.onHaze);
    toggle('tCrowd', opts.onCrowd);
    toggle('tGlow', opts.onGlow);
    $('tGlow').setAttribute('aria-pressed', String(opts.glow));
    $('exitBtn').onclick = opts.onExit;
  },
  setView(id) { document.querySelectorAll('#views [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === id))); },
  setTour(on) { $('tourBtn')?.setAttribute('aria-pressed', String(on)); },
  setScene(sel) { if ($('sceneSel').value !== sel) $('sceneSel').value = sel; },
  setGlow(on) { $('tGlow').setAttribute('aria-pressed', String(on)); },
};
$('helpClose').onclick = () => { $('help').hidden = true; };

// ---------- "Sự kiện thực tế": the real show (official YouTube player) ----------
const REAL_YT = () => `https://www.youtube.com/embed/4Nao6jByPPE?autoplay=1&rel=0&playsinline=1&origin=${encodeURIComponent(location.origin)}`;
let realLastFocus = null;
function showReal() {
  const f = document.createElement('iframe');
  f.src = REAL_YT();
  f.title = 'Tiger Crystal Rave Vũng Tàu – YouTube';
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.allowFullscreen = true;
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  $('realFrame').replaceChildren(f);
}
function openReal() {
  realLastFocus = document.activeElement;
  $('realEvent').hidden = false;
  engine.paused = true; // free the GPU for the video
  showReal();
  $('realClose').focus();
}
function closeReal() {
  $('realEvent').hidden = true;
  $('realFrame').replaceChildren(); // stops playback
  engine.paused = false;
  realLastFocus?.focus?.();
}
document.querySelectorAll('[data-real-open]').forEach((b) => { b.onclick = openReal; });
$('realClose').onclick = closeReal;
// collapse the event console to a single handle
$('evFold').onclick = () => {
  const c = $('evConsole');
  const min = c.classList.toggle('is-min');
  $('evFold').setAttribute('aria-expanded', String(!min));
  $('evFold').textContent = min ? '▴ Điều khiển' : '▾';
};
$('realEvent').addEventListener('click', (e) => { if (e.target === $('realEvent')) closeReal(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('realEvent').hidden) closeReal(); });

// ---------- worlds ----------
const loadCrystal = () => import('./crystal/crystal.js'); // separate chunk, prefetched when idle

function goLobby() {
  history.replaceState(null, '', location.pathname);
  return engine.go((e) => createLobby(e, { loader, ui, cache, onPortal }));
}
async function goCrystal() {
  history.replaceState(null, '', '#crystal');
  try {
    const { createCrystal } = await loadCrystal();
    await engine.go((e) => createCrystal(e, { ui, onExit: goLobby, loader, cache }), { color: '#bfefff' });
  } catch {
    // event failed (network, GPU…): go back to the lobby instead of a frozen screen
    return goLobby();
  }
}
function onPortal(id) {
  if (id === 'crystal') goCrystal();
  else engine.go(async () => { location.href = '/venue.html'; return new Promise(() => {}); }, { color: '#ff9a5a' });
}

(async () => {
  try {
    if (location.hash === '#crystal') await goCrystal();
    else await goLobby();
    $('loading').classList.add('done');
    // warm the event chunk in the background so the portal opens instantly
    (window.requestIdleCallback ?? setTimeout)(() => {
      loadCrystal();
      // the stage design file (~2.6 MB) downloads + decodes in the background while you explore the lobby
      cache.stage ??= loader.gltf('/assets/stage.glb', 2700000);
      cache.stageData ??= loader.json('/assets/stage.json');
    });
  } catch (err) {
    console.error(err);
    $('ldText').textContent = 'Không tải được thế giới 3D. Hãy thử tải lại trang.';
  }
})();
