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
  s.last = ok ? 1 : 0;
  s.streak = ok ? (s.streak || 0) + 1 : 0;
  saveStats();
}
// 'ok' = zuletzt gewusst, 'bad' = zuletzt falsch, 'new' = noch nie gefragt
function status(itemId) {
  const s = stats.items[itemId];
  if (!s) return 'new';
  return (s.last ?? (s.r >= s.w ? 1 : 0)) ? 'ok' : 'bad';
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
const playable = () => content.items.filter((it) => it.locations.some((l) => compById(l.c)));
const label = (it) => (it.count > 1 ? `${it.count}× ${it.name}` : it.name);
const COMP_ORDER = ['G1', 'G3', 'G5', 'G2', 'G4', 'G6', 'Haspel', 'Dach', 'GR'];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

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
function countStatus(items) {
  const n = { ok: 0, bad: 0, new: 0 };
  for (const it of items) n[status(it.id)]++;
  return n;
}

function segBar(n, total, cls = 'segbar') {
  const bar = el('div', cls);
  for (const k of ['ok', 'bad', 'new']) {
    const seg = el('i', `seg ${k}`);
    seg.style.width = '0%';
    seg.dataset.w = total ? (n[k] / total) * 100 : 0;
    bar.appendChild(seg);
  }
  return bar;
}

function animateBars(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll('.seg').forEach((seg) => { seg.style.width = seg.dataset.w + '%'; });
  }));
}

function renderHome() {
  const items = playable();
  const n = countStatus(items);
  const pct = items.length ? Math.round((n.ok / items.length) * 100) : 0;
  $('#prog-pct').textContent = `${pct} %`;
  $('#prog-count').textContent = `${n.ok} von ${items.length} Geräten gewusst`;
  $('#prog-ok').textContent = n.ok;
  $('#prog-bad').textContent = n.bad;
  $('#prog-new').textContent = n.new;
  $('#prog-bar').replaceWith(Object.assign(segBar(n, items.length, 'segbar big'), { id: 'prog-bar' }));
  $('#highscore').textContent = stats.best ? `Highscore Challenge: ${stats.best} Punkte` : '';

  const wrap = $('#comp-progress');
  wrap.replaceChildren();
  const comps = [...content.compartments].sort((a, b) => COMP_ORDER.indexOf(a.id) - COMP_ORDER.indexOf(b.id));
  for (const comp of comps) {
    const list = itemsIn(comp.id);
    if (!list.length) continue;
    const cn = countStatus(list);
    const det = el('details', 'comp-row');
    const sum = el('summary');
    sum.append(el('span', 'comp-id', comp.id), segBar(cn, list.length, 'segbar mini'), el('span', 'comp-frac', `${cn.ok}/${list.length}`));
    det.appendChild(sum);
    const ul = el('ul', 'dot-list');
    const order = { bad: 0, new: 1, ok: 2 };
    for (const it of [...list].sort((a, b) => order[status(a.id)] - order[status(b.id)])) {
      const li = el('li', `st-${status(it.id)}`);
      li.append(el('i'), el('span', '', label(it)));
      ul.appendChild(li);
    }
    det.appendChild(ul);
    wrap.appendChild(det);
  }
  animateBars($('#screen-home'));
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
  // Offene und falsche Geräte kommen öfter dran, sicher gewusste seltener
  const weights = pool.map((it) => {
    const s = stats.items[it.id];
    const st = status(it.id);
    if (st === 'new') return 2;
    if (st === 'bad') return 3 + Math.min(s.w, 3);
    return Math.max(0.25, 1 - (s.streak || 1) * 0.25);
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
  hideSheet();
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
    if (game.phase === 'done') {
      const last = game.mode === 'challenge' && game.round >= CHALLENGE_ROUNDS;
      btn(last ? 'Ergebnis' : 'Weiter →', nextRound, 'primary');
      return;
    }
    for (const [v, label] of [['links', 'Links'], ['heck', 'Heck'], ['rechts', 'Rechts'], ['dach', 'Dach']]) {
      btn(label, () => { game.lastView = v; truck.setView(v); }, 'ghost');
    }
    if (game.mode === 'train' && game.phase === 'compartment') btn('Tipp', () => revealCompartment(true), 'ghost');
    return;
  }

  if (game.mode === 'learn') {
    btn('← Fahrzeug', () => { backToTruck(); setTask('Lernmodus', 'Tippe ein Fach an'); renderControls(); }, 'ghost');
    btn('Alle Geräte', () => {
      drawLearnRects();
      showSheet(compById(game.comp).name, itemsIn(game.comp), (it) => {
        hideSheet();
        toast(label(it));
        drawLearnRects([it]);
        const shape = shapesFor(it, game.comp)[0];
        if (shape) photo.zoomTo(shape);
      });
    }, 'ghost');
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

// ---------- Liste über dem Bild (Lernmodus) ----------
function showSheet(title, items, onPick) {
  $('#sheet-title').textContent = title;
  $('#sheet-list').replaceChildren(...items.map((it) => {
    const li = el('li', `st-${status(it.id)}`);
    li.append(el('i'), el('span', '', label(it)));
    if (onPick) li.addEventListener('click', () => onPick(it));
    return li;
  }));
  $('#sheet').hidden = false;
}
function hideSheet() { $('#sheet').hidden = true; }
$('#sheet-close').addEventListener('click', hideSheet);

function drawLearnRects(selected = []) {
  photo.clearShapes();
  for (const it of itemsIn(game.comp)) {
    for (const s of shapesFor(it, game.comp)) photo.addRect(s, selected.includes(it) ? 'hs sel' : 'hs learn', it.name);
  }
}

// „in G3“, „auf dem Dach“ …
const where = (compId) => compById(compId)?.where || `in ${compId}`;

function sideName(compId) {
  return { links: 'links', rechts: 'rechts', heck: 'am Heck', dach: 'auf dem Dach' }[compById(compId)?.side] || '';
}

function revealCompartment(asHint) {
  const target = game.item.locations[0].c;
  truck.focus(target);
  truck.flash(target, GREEN, 2400);
  if (asHint) {
    game.compTries = Math.max(game.compTries, 2);
    toast(compById(target)?.where ? `Tipp: Es liegt <b>${where(target)}</b>` : `Tipp: Es liegt ${sideName(target)} in <b>${target}</b>`);
  }
}

async function onCompartmentPick(compId) {
  if (!game) return;
  const comp = compById(compId);

  if (game.mode === 'learn') {
    if (comp?.image) return openCompartment(compId);
    const list = itemsIn(compId);
    truck.flash(compId, BLUE, 1500);
    if (!list.length) return toast(`${compId}: noch kein Foto vorhanden`);
    return showSheet(comp.name, list);
  }
  if (game.phase !== 'compartment') return;

  const ok = game.item.locations.some((l) => l.c === compId);
  if (ok) {
    const pts = game.compTries === 0 ? 100 : game.compTries === 1 ? 50 : 0;
    game.score += pts;
    if (pts) toast(`Richtig: ${compId} · +${pts}`, 'ok');
    if (!comp.image) return finishWithoutPhoto(compId, pts);
    game.phase = 'item';
    updateHud();
    return openCompartment(compId);
  }

  game.compTries++;
  vibrate(120);
  truck.flash(compId, RED_FLASH);
  toast(`Nicht ${where(compId)}`, 'bad');
  if (game.compTries === 1) game.mistakes.push({ item: game.item, where: 'Fach' });
  const limit = game.mode === 'challenge' ? 3 : 2;
  if (game.compTries >= limit) {
    setTimeout(() => {
      revealCompartment(false);
      toast(`Es liegt <b>${where(game.item.locations[0].c)}</b> – tippe es an`, 'hint');
    }, 700);
  }
}

// Ziele ohne Foto (Dach, Haspel): Das richtige Ziel zu finden reicht
function finishWithoutPhoto(compId, pts) {
  const secs = (performance.now() - game.roundStart) / 1000;
  const bonus = game.mode === 'challenge' && pts ? Math.max(0, Math.round(100 - secs * 5)) : 0;
  game.score += pts + bonus;
  record(game.item.id, game.compTries === 0);
  truck.flash(compId, GREEN, 1500);
  vibrate(40);
  toast(`Richtig – ${game.item.name} liegt ${where(compId)}${pts + bonus ? ` · +${pts + bonus}` : ''}`, 'ok');
  game.phase = 'done';
  updateHud();
  renderControls();
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
    drawLearnRects();
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
    const hits = itemsIn(game.comp).filter((it) => hitTest(shapesFor(it, game.comp), pt, 0));
    drawLearnRects(hits);
    if (hits.length) showSheet(hits.length > 1 ? 'Hier liegen' : 'Hier liegt', hits);
    else hideSheet();
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
    toast(`Richtig: ${game.item.name}${pts + bonus ? ` · +${pts + bonus}` : ''}`, 'ok');
    game.phase = 'done';
    updateHud();
    renderControls();
    return;
  }

  game.itemTries++;
  vibrate(120);
  photo.addMarker(pt.x, pt.y, 'bad');
  if (game.itemTries === 1) game.mistakes.push({ item: game.item, where: 'Gerät' });
  const names = others.slice(0, 3).map((it) => it.name).join(', ') + (others.length > 3 ? ' …' : '');
  toast(others.length ? `${others.length > 1 ? 'Da liegen' : 'Da liegt'}: <b>${names}</b>` : 'Daneben', 'bad');
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
