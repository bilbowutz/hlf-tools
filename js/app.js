import { loadMeta, deriveKey, fetchContent, fetchImageUrl, rememberKey, recallKey, forgetKey } from './crypto.js';
import { createTruckView } from './truck.js';
import { createPhotoView, hitTest } from './photo.js';

const $ = (sel) => document.querySelector(sel);
const CHALLENGE_ROUNDS = 10;
const GREEN = 0x22c55e, RED_FLASH = 0xef4444, BLUE = 0x3b82f6;

// ---------- Statistik ----------
const STATS_KEY = 'hlf.stats';
function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { items: {}, best: 0 }; }
  catch { return { items: {}, best: 0 }; }
}
function saveStats() { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch {} }
let stats = loadStats();
function record(itemId, ok) {
  const s = (stats.items[itemId] ||= { r: 0, w: 0 });
  ok ? s.r++ : s.w++;
  saveStats();
}

// ---------- Zustand ----------
let key = null;
let content = null;
const imageUrls = new Map();
let truck = null;
let photo = null;
let game = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

let toastTimer;
function toast(html, type = '') {
  const el = $('#toast');
  el.innerHTML = html;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

const compById = (id) => content.compartments.find((c) => c.id === id);
const itemsIn = (compId) => content.items.filter((it) => it.locations.some((l) => l.c === compId));
const playable = () => content.items.filter((it) => it.locations.some((l) => compById(l.c)?.image));

async function imageUrl(compId) {
  const comp = compById(compId);
  if (!comp?.image) return null;
  if (!imageUrls.has(comp.image)) imageUrls.set(comp.image, fetchImageUrl(key, comp.image));
  return imageUrls.get(comp.image);
}

// ---------- Login ----------
async function unlock(k) {
  content = await fetchContent(k);
  key = k;
  $('#vehicle-name').textContent = content.vehicle.name;
  $('#vehicle-sub').textContent = content.vehicle.subtitle || '';
  renderHome();
  showScreen('screen-home');
  // Fotos im Hintergrund entschlüsseln (auch als Textur im 3D-Modell)
  for (const c of content.compartments) imageUrl(c.id)?.catch(() => {});
}

$('#lock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('#password').value;
  const btn = $('#lock-form button');
  btn.disabled = true;
  btn.textContent = 'Prüfe …';
  $('#lock-error').textContent = '';
  try {
    const meta = await loadMeta();
    const k = await deriveKey(pw, meta);
    await unlock(k);
    await rememberKey(k);
  } catch (err) {
    console.error(err);
    $('#lock-error').textContent = navigator.onLine ? 'Falsches Passwort.' : 'Keine Verbindung – bitte einmal online anmelden.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entsperren';
  }
});

$('#logout').addEventListener('click', () => {
  forgetKey();
  key = null;
  content = null;
  imageUrls.clear();
  $('#password').value = '';
  showScreen('screen-lock');
});

$('#reset-stats').addEventListener('click', () => {
  if (!confirm('Deine Statistik und den Highscore löschen?')) return;
  stats = { items: {}, best: 0 };
  saveStats();
  renderHome();
});

// ---------- Startseite ----------
function renderHome() {
  const items = playable();
  const totals = Object.values(stats.items).reduce((a, s) => ({ r: a.r + s.r, w: a.w + s.w }), { r: 0, w: 0 });
  const rate = totals.r + totals.w ? Math.round((totals.r / (totals.r + totals.w)) * 100) + ' %' : '–';
  $('#stat-items').textContent = items.length;
  $('#stat-rate').textContent = rate;
  $('#stat-best').textContent = stats.best || '–';

  const hard = items
    .map((it) => ({ it, s: stats.items[it.id] }))
    .filter((x) => x.s && x.s.w > 0)
    .sort((a, b) => (b.s.w - b.s.r) - (a.s.w - a.s.r))
    .slice(0, 5);
  const list = $('#hard-list');
  list.replaceChildren(...hard.map(({ it, s }) => {
    const li = document.createElement('li');
    li.innerHTML = `<span></span><small>${s.w}× falsch</small>`;
    li.firstChild.textContent = it.name;
    return li;
  }));
  $('#hard-box').hidden = hard.length === 0;
}

document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.mode)));

// ---------- Spiel ----------
function ensureViews() {
  if (!truck) {
    truck = createTruckView($('#truck'), { onPick: onCompartmentPick });
    for (const c of content.compartments) imageUrl(c.id)?.then((url) => url && truck.setInterior(c.id, url)).catch(() => {});
  }
  if (!photo) photo = createPhotoView($('#photo'), { onTap: onPhotoTap });
}

function pickItem() {
  const recent = game.recent;
  const pool = playable().filter((it) => !recent.includes(it.id));
  const weights = pool.map((it) => {
    const s = stats.items[it.id] || { r: 0, w: 0 };
    return Math.max(0.3, 1 + s.w * 1.5 - s.r * 0.4);
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

function startGame(mode) {
  game = { mode, round: 0, score: 0, recent: [], mistakes: [], startedAt: performance.now() };
  document.body.dataset.mode = mode;
  showScreen('screen-game');
  ensureViews();
  $('#mode-label').textContent = { train: 'Training', challenge: 'Challenge', learn: 'Lernmodus' }[mode];
  if (mode === 'learn') {
    setTask('Lernmodus', 'Tippe ein Fach an');
    backToTruck();
    renderControls();
    updateHud();
  } else {
    nextRound();
  }
}

function setTask(label, name) {
  $('#task-label').textContent = label;
  $('#task-name').textContent = name;
}

function updateHud() {
  const hud = $('#hud');
  if (game.mode === 'challenge') hud.textContent = `${Math.min(game.round, CHALLENGE_ROUNDS)}/${CHALLENGE_ROUNDS} · ${game.score} P`;
  else if (game.mode === 'train') hud.textContent = `${game.score} P`;
  else hud.textContent = '';
}

function nextRound() {
  if (game.mode === 'challenge' && game.round >= CHALLENGE_ROUNDS) return showResult();
  game.round++;
  const item = pickItem();
  game.recent = [item.id, ...game.recent].slice(0, 6);
  game.item = item;
  game.phase = 'compartment';
  game.compTries = 0;
  game.itemTries = 0;
  game.roundStart = performance.now();
  game.comp = null;
  setTask('Wo liegt …', item.name);
  backToTruck();
  renderControls();
  updateHud();
}

function backToTruck() {
  $('#photo').classList.add('hidden');
  $('#truck').classList.remove('hidden');
  truck.closeAll();
  truck.setEnabled(true);
  truck.setView(game?.mode === 'learn' ? 'start' : (game?.lastView || 'start'));
}

function renderControls() {
  const bar = $('#controls');
  bar.replaceChildren();
  const btn = (label, fn, cls = '') => {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', fn);
    bar.appendChild(b);
    return b;
  };
  const inPhoto = !$('#photo').classList.contains('hidden');

  if (!inPhoto) {
    for (const [v, label] of [['links', 'Links'], ['heck', 'Heck'], ['rechts', 'Rechts']]) {
      btn(label, () => { game.lastView = v; truck.setView(v); }, 'ghost');
    }
    if (game.mode === 'train' && game.phase === 'compartment') btn('Tipp', () => revealCompartment(true), 'ghost');
    return;
  }

  if (game.mode === 'learn') {
    btn('← Fahrzeug', () => { backToTruck(); setTask('Lernmodus', 'Tippe ein Fach an'); renderControls(); }, 'ghost');
    return;
  }
  if (game.phase === 'item') {
    btn('← Fahrzeug', () => { game.phase = 'compartment'; backToTruck(); renderControls(); }, 'ghost');
    if (game.mode === 'train') btn('Tipp', () => revealItem(true), 'ghost');
  } else if (game.phase === 'done') {
    const last = game.mode === 'challenge' && game.round >= CHALLENGE_ROUNDS;
    btn(last ? 'Ergebnis' : 'Weiter →', nextRound, 'primary');
  }
}

function sideName(compId) {
  return { links: 'links', rechts: 'rechts', heck: 'am Heck' }[compById(compId)?.side] || '';
}

function revealCompartment(asHint) {
  const target = game.item.locations[0].c;
  truck.focus(target);
  truck.flash(target, GREEN, 2400);
  if (asHint) {
    game.compTries = Math.max(game.compTries, 2);
    toast(`Tipp: Es liegt ${sideName(target)} in <b>${target}</b>`);
  }
}

async function onCompartmentPick(compId) {
  if (!game) return;
  const comp = compById(compId);

  if (game.mode === 'learn') {
    if (!comp?.image) return toast(`${compId}: noch kein Foto vorhanden`);
    return openCompartment(compId);
  }
  if (game.phase !== 'compartment') return;

  const ok = game.item.locations.some((l) => l.c === compId);
  if (ok) {
    const pts = game.compTries === 0 ? 100 : game.compTries === 1 ? 50 : 0;
    game.score += pts;
    if (pts) toast(`Richtig: ${compId} · +${pts}`, 'ok');
    game.phase = 'item';
    updateHud();
    return openCompartment(compId);
  }

  game.compTries++;
  vibrate(120);
  truck.flash(compId, RED_FLASH);
  toast(`Nicht in ${compId}`, 'bad');
  if (game.compTries === 1) game.mistakes.push({ item: game.item, where: 'Fach' });
  const limit = game.mode === 'challenge' ? 3 : 2;
  if (game.compTries >= limit) {
    setTimeout(() => {
      revealCompartment(false);
      toast(`Es liegt in <b>${game.item.locations[0].c}</b> – tippe es an`, 'hint');
    }, 700);
  }
}

async function openCompartment(compId) {
  game.comp = compId;
  truck.setEnabled(false);
  truck.focus(compId);
  truck.open(compId);
  const url = await imageUrl(compId);
  await new Promise((r) => setTimeout(r, 650));
  await photo.load(url);
  $('#truck').classList.add('hidden');
  $('#photo').classList.remove('hidden');
  photo.fit();

  if (game.mode === 'learn') {
    const items = itemsIn(compId);
    setTask(compById(compId).name, `${items.length} Geräte – tippe drauf`);
    for (const it of items) {
      for (const s of it.locations.find((l) => l.c === compId).shapes) photo.addRect(s, 'hs learn', it.name);
    }
  } else {
    setTask(`In ${compId} – tippe auf`, game.item.name);
  }
  renderControls();
}

function shapesFor(item, compId) {
  return item.locations.find((l) => l.c === compId)?.shapes || [];
}

function revealItem(asHint) {
  const shapes = shapesFor(game.item, game.comp);
  photo.clearShapes();
  for (const s of shapes) photo.addRect(s, asHint ? 'hs hint' : 'hs reveal');
  if (shapes[0]) photo.zoomTo(shapes[0]);
  if (asHint) game.itemTries = Math.max(game.itemTries, 2);
}

function onPhotoTap(pt) {
  if (!game) return;
  const others = itemsIn(game.comp).filter((it) => it !== game.item && hitTest(shapesFor(it, game.comp), pt, 0));

  if (game.mode === 'learn') {
    const hit = itemsIn(game.comp).find((it) => hitTest(shapesFor(it, game.comp), pt, 0));
    if (hit) toast(hit.name, 'ok');
    return;
  }
  if (game.phase !== 'item') return;

  if (hitTest(shapesFor(game.item, game.comp), pt)) {
    const pts = game.itemTries === 0 ? 100 : game.itemTries === 1 ? 50 : 0;
    const secs = (performance.now() - game.roundStart) / 1000;
    const bonus = game.mode === 'challenge' && pts ? Math.max(0, Math.round(100 - secs * 5)) : 0;
    game.score += pts + bonus;
    record(game.item.id, game.compTries === 0 && game.itemTries === 0);
    photo.clearShapes();
    for (const s of shapesFor(game.item, game.comp)) photo.addRect(s, 'hs ok');
    photo.addMarker(pt.x, pt.y, 'ok');
    vibrate(40);
    toast(`✔ ${game.item.name}${pts + bonus ? ` · +${pts + bonus}` : ''}`, 'ok');
    game.phase = 'done';
    updateHud();
    renderControls();
    return;
  }

  game.itemTries++;
  vibrate(120);
  photo.addMarker(pt.x, pt.y, 'bad');
  if (game.itemTries === 1) game.mistakes.push({ item: game.item, where: 'Gerät' });
  toast(others.length ? `Das ist: <b>${others[0].name}</b>` : 'Daneben', 'bad');
  if (game.itemTries >= 3) {
    record(game.item.id, false);
    revealItem(false);
    toast(`Hier liegt: <b>${game.item.name}</b>`, 'hint');
    game.phase = 'done';
    renderControls();
  } else if (game.mode === 'train' && game.itemTries === 2) {
    revealItem(true);
  }
}

function showResult() {
  const secs = Math.round((performance.now() - game.startedAt) / 1000);
  const isBest = game.score > (stats.best || 0);
  if (isBest) { stats.best = game.score; saveStats(); }
  $('#result-score').textContent = game.score;
  $('#result-meta').textContent = `${CHALLENGE_ROUNDS} Geräte in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} min${isBest ? ' · Neuer Highscore!' : ''}`;
  const seen = new Set();
  const mistakes = game.mistakes.filter((m) => !seen.has(m.item.id) && seen.add(m.item.id));
  $('#result-mistakes').replaceChildren(...mistakes.map((m) => {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><small></small>';
    li.firstChild.textContent = m.item.name;
    li.lastChild.textContent = m.item.locations.map((l) => l.c).join(' / ');
    return li;
  }));
  $('#result-mistakes-box').hidden = mistakes.length === 0;
  showScreen('screen-result');
}

$('#game-back').addEventListener('click', () => {
  game = null;
  renderHome();
  showScreen('screen-home');
});
$('#result-again').addEventListener('click', () => startGame('challenge'));
$('#result-home').addEventListener('click', () => { renderHome(); showScreen('screen-home'); });

// ---------- Start ----------
(async () => {
  try {
    const k = await recallKey();
    if (k) { await unlock(k); return; }
  } catch (err) {
    console.warn('Gespeicherter Schlüssel ungültig', err);
    forgetKey();
  }
  showScreen('screen-lock');
})();

// Für automatische Tests
window.hlfDebug = { get game() { return game; }, pick: (id) => onCompartmentPick(id) };

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
