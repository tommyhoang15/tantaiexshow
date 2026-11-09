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
    bindControls(opts.onControl);
  },
  setView(id) { document.querySelectorAll('#views [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === id))); },
  setTour(on) { $('tourBtn')?.setAttribute('aria-pressed', String(on)); },
  setScene(sel) { if ($('sceneSel').value !== sel) $('sceneSel').value = sel; },
  setGlow(on) { $('tGlow').setAttribute('aria-pressed', String(on)); },

  // ---- character selection ----
  onChangeChar: null,
  _sel: null,
  showSelect({ roster, current, onPick, onConfirm }) {
    const list = $('cselList');
    let idx = Math.max(0, roster.findIndex((c) => c.id === current));
    const render = () => {
      const c = roster[idx];
      $('cselNum').textContent = `${String(idx + 1).padStart(2, '0')} / ${String(roster.length).padStart(2, '0')}`;
      $('cselName').textContent = c.name;
      $('cselTag').textContent = c.tag;
      $('charSelect').style.setProperty('--csel-accent', c.aura);
      list.querySelectorAll('[data-char]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.char === c.id)));
    };
    const go = (i) => { idx = (i + roster.length) % roster.length; render(); onPick(roster[idx].id); };
    list.replaceChildren(...roster.map((c, i) => {
      const b = document.createElement('button');
      b.className = 'xbtn xbtn--toggle csel-chip';
      b.dataset.char = c.id;
      b.setAttribute('role', 'radio');
      b.style.setProperty('--chip', c.aura);
      b.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b>`;
      b.append(c.name);
      b.onclick = () => go(i);
      return b;
    }));
    $('cselPrev').onclick = () => go(idx - 1);
    $('cselNext').onclick = () => go(idx + 1);
    $('cselGo').onclick = onConfirm;
    const key = (e) => {
      if ($('charSelect').hidden || !$('realEvent').hidden) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') go(idx - 1);
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') go(idx + 1);
      else if (e.key === 'Enter' && !e.target.closest?.('button')) onConfirm();
    };
    addEventListener('keydown', key);
    this._sel = { key };
    render();
    $('charSelect').hidden = false;
    $('cselGo').focus({ preventScroll: true });
  },
  hideSelect() {
    if (this._sel) removeEventListener('keydown', this._sel.key);
    this._sel = null;
    $('charSelect').hidden = true;
  },
  selectBusy(id, on) {
    $('cselList').querySelector(`[data-char="${id}"]`)?.classList.toggle('is-busy', on);
  },
};
$('changeChar').onclick = () => ui.onChangeChar?.();

// ---------- event control panel: tabs + light / LED / truss controls ----------
// Controls are declared in the markup (data-toggle / data-range / data-select / data-pick / data-reset);
// each one calls onControl('group.key', value). The initial markup state is the "follow the show" default.
const panel = $('evConsole');
const tabs = [...panel.querySelectorAll('[data-tab]')];
function openTab(id) {
  tabs.forEach((t) => { const on = t.dataset.tab === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
  panel.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== id; });
  try { localStorage.setItem('evTab', id); } catch { /* private mode */ }
}
tabs.forEach((t, i) => {
  t.onclick = () => { if (panel.classList.contains('is-min')) toggleFold(false); openTab(t.dataset.tab); };
  t.onkeydown = (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); openTab(n.dataset.tab);
  };
});
openTab((() => { try { return localStorage.getItem('evTab'); } catch { return null; } })() ?? 'cam');

const fmt = (input) => (input.dataset.unit === 'x' ? `${(+input.value).toFixed(2)}×` : `${Math.round(input.value * 100)}%`);
const DEFAULTS = new Map(); // element -> initial value
panel.querySelectorAll('[data-toggle]').forEach((b) => DEFAULTS.set(b, b.getAttribute('aria-pressed')));
panel.querySelectorAll('[data-range], [data-select]').forEach((el) => DEFAULTS.set(el, el.value));
panel.querySelectorAll('[data-pick]').forEach((g) => DEFAULTS.set(g, g.querySelector('[aria-checked="true"]')?.dataset.v ?? ''));
let onControl = () => {};

// a tab shows an amber dot while anything in it differs from "follow the show"
function markModified() {
  panel.querySelectorAll('[data-group]').forEach((pane) => {
    let mod = false;
    pane.querySelectorAll('[data-toggle]').forEach((b) => { if (b.getAttribute('aria-pressed') !== DEFAULTS.get(b)) mod = true; });
    pane.querySelectorAll('[data-range], [data-select]').forEach((el) => { if (el.value !== DEFAULTS.get(el)) mod = true; });
    pane.querySelectorAll('[data-pick]').forEach((g) => { if ((g.querySelector('[aria-checked="true"]')?.dataset.v ?? '') !== DEFAULTS.get(g)) mod = true; });
    panel.querySelector(`[data-tab="${pane.dataset.pane}"]`).classList.toggle('is-mod', mod);
  });
}
const setPick = (g, v) => g.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));

panel.querySelectorAll('[data-toggle]').forEach((b) => {
  b.onclick = () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(v)); onControl(b.dataset.toggle, v); markModified(); };
});
panel.querySelectorAll('[data-range]').forEach((r) => {
  r.oninput = () => { r.nextElementSibling.value = fmt(r); onControl(r.dataset.range, +r.value); markModified(); };
});
panel.querySelectorAll('[data-select]').forEach((sel) => { sel.onchange = () => { onControl(sel.dataset.select, sel.value); markModified(); }; });
panel.querySelectorAll('[data-pick]').forEach((g) => {
  g.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { setPick(g, b.dataset.v); onControl(g.dataset.pick, b.dataset.v); markModified(); }; });
});
function resetGroup(scope) {
  scope.querySelectorAll('[data-toggle]').forEach((b) => { const v = DEFAULTS.get(b); b.setAttribute('aria-pressed', v); onControl(b.dataset.toggle, v === 'true'); });
  scope.querySelectorAll('[data-range]').forEach((r) => { r.value = DEFAULTS.get(r); r.nextElementSibling.value = fmt(r); onControl(r.dataset.range, +r.value); });
  scope.querySelectorAll('[data-select]').forEach((sel) => { sel.value = DEFAULTS.get(sel); onControl(sel.dataset.select, sel.value); });
  scope.querySelectorAll('[data-pick]').forEach((g) => { setPick(g, DEFAULTS.get(g)); onControl(g.dataset.pick, DEFAULTS.get(g)); });
  markModified();
}
panel.querySelectorAll('[data-reset]').forEach((b) => { b.onclick = () => resetGroup(b.closest('[data-pane]')); });
// every visit to the event starts from the show's own programming
function bindControls(fn) { onControl = fn ?? (() => {}); panel.querySelectorAll('[data-group]').forEach(resetGroup); }

// keyboard: 1–5 switch tabs, H folds the panel (ignored while typing or with the video open)
addEventListener('keydown', (e) => {
  if ($('eventUi').hidden || !$('realEvent').hidden || e.target.matches?.('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = +e.key;
  if (n >= 1 && n <= tabs.length) { if (panel.classList.contains('is-min')) toggleFold(false); openTab(tabs[n - 1].dataset.tab); }
  else if (e.key === 'h' || e.key === 'H') toggleFold();
});
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
function toggleFold(force) {
  const c = $('evConsole');
  const min = c.classList.toggle('is-min', force);
  $('evFold').setAttribute('aria-expanded', String(!min));
  $('evFold').textContent = min ? '▴ Điều khiển' : '▾';
}
$('evFold').onclick = () => toggleFold();
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
      cache.crowd ??= loader.gltf('/assets/chars/crowd.glb', 283000);
    });
  } catch (err) {
    console.error(err);
    $('ldText').textContent = 'Không tải được thế giới 3D. Hãy thử tải lại trang.';
  }
})();
