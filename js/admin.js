import { loadMeta, deriveKey, encrypt, fetchContent, fetchImageUrl, recallKey } from './crypto.js';

const $ = (sel) => document.querySelector(sel);
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_EDGE = 2000;

let key = null;
let content = null;
let compId = null;
let itemId = null;
let selectedRect = null; // Index im shapes-Array des gewählten Geräts
const imageUrls = new Map();
const pendingImages = new Map(); // imageId -> verschlüsselte Bytes
let contentDirty = false;

// ---------- Login ----------
async function start(k) {
  try {
    content = await fetchContent(k);
  } catch (err) {
    // Beim allerersten Einrichten gibt es noch keine Daten
    if (!confirm('Keine lesbaren Daten gefunden (falsches Passwort?). Mit leerer Liste starten?')) throw err;
    content = { version: 1, vehicle: { name: 'HLF', subtitle: '' }, compartments: [], items: [] };
  }
  key = k;
  $('#admin-lock').classList.remove('active');
  $('#admin-main').classList.add('active');
  compId = content.compartments[0]?.id || null;
  renderAll();
}

$('#admin-lock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#admin-error').textContent = '';
  try {
    const k = await deriveKey($('#admin-password').value, await loadMeta());
    await start(k);
  } catch (err) {
    console.error(err);
    $('#admin-error').textContent = 'Anmeldung fehlgeschlagen.';
  }
});

recallKey().then((k) => k && start(k)).catch(() => {});

// ---------- Helfer ----------
const comp = () => content.compartments.find((c) => c.id === compId);
const item = () => content.items.find((i) => i.id === itemId);
const loc = (it, c = compId) => it?.locations.find((l) => l.c === c);
const round1 = (n) => Math.round(n * 10) / 10;

function slug(name) {
  const base = name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'geraet';
  let id = base, n = 2;
  while (content.items.some((i) => i.id === id)) id = `${base}-${n++}`;
  return id;
}

function markDirty() {
  contentDirty = true;
  updateDirty();
}

function updateDirty() {
  const parts = [];
  if (contentDirty) parts.push('Beladeliste (content.enc)');
  for (const id of pendingImages.keys()) parts.push(`Foto ${id}.enc`);
  $('#dirty').textContent = parts.length ? `Geändert: ${parts.join(', ')}` : 'Keine Änderungen.';
}

async function imageUrl(c) {
  if (!c?.image) return null;
  if (!imageUrls.has(c.image)) imageUrls.set(c.image, fetchImageUrl(key, c.image).catch(() => null));
  return imageUrls.get(c.image);
}

// ---------- Rendering ----------
function renderAll() {
  renderCompSelect();
  renderItems();
  renderEditor();
  updateDirty();
}

function renderCompSelect() {
  const sel = $('#comp-select');
  sel.replaceChildren(...content.compartments.map((c) => new Option(`${c.id} – ${c.name}`, c.id, false, c.id === compId)));
}

function renderItems() {
  const list = $('#item-list');
  const items = content.items.filter((i) => loc(i));
  list.replaceChildren(...items.map((it) => {
    const li = document.createElement('li');
    const n = loc(it).shapes.length;
    li.className = (it.id === itemId ? 'active ' : '') + (n ? '' : 'empty');
    li.innerHTML = '<span></span><small></small>';
    li.firstChild.textContent = it.name;
    li.lastChild.textContent = n ? `${n} ▭` : 'kein Bereich';
    li.addEventListener('click', () => selectItem(it.id));
    return li;
  }));

  const ex = $('#item-existing');
  const others = content.items.filter((i) => !loc(i)).sort((a, b) => a.name.localeCompare(b.name));
  ex.replaceChildren(new Option('+ vorhandenes Gerät …', ''), ...others.map((i) => new Option(i.name, i.id)));

  const it = item();
  $('#item-edit').hidden = !it || !loc(it);
  if (it && loc(it)) {
    $('#item-name').value = it.name;
    $('#item-where').textContent = `Liegt in: ${it.locations.map((l) => l.c).join(', ')}`;
    $('#rect-delete').disabled = selectedRect === null;
  }
}

async function renderEditor() {
  const ed = $('#editor');
  const c = comp();
  const url = await imageUrl(c);
  if (!url) {
    ed.innerHTML = `<p class="muted">${c ? 'Kein Foto für dieses Fach – „Foto ersetzen“ nutzen.' : 'Erst ein Fach anlegen.'}</p>`;
    return;
  }
  let img = ed.querySelector('img');
  let svg = ed.querySelector('svg');
  if (!img) {
    ed.replaceChildren();
    img = document.createElement('img');
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    ed.append(img, svg);
    attachDrawing(svg);
  }
  if (img.getAttribute('src') !== url) img.src = url;
  drawRects(svg);
}

function drawRects(svg = $('#editor svg')) {
  if (!svg) return;
  svg.replaceChildren();
  for (const it of content.items) {
    const l = loc(it);
    if (!l) continue;
    l.shapes.forEach(([x, y, w, h], idx) => {
      const r = document.createElementNS(SVG_NS, 'rect');
      Object.entries({ x, y, width: w, height: h }).forEach(([k, v]) => r.setAttribute(k, v));
      const mine = it.id === itemId;
      r.setAttribute('class', mine && idx === selectedRect ? 'selected' : mine ? 'mine' : '');
      const t = document.createElementNS(SVG_NS, 'title');
      t.textContent = it.name;
      r.appendChild(t);
      r.dataset.item = it.id;
      r.dataset.idx = idx;
      svg.appendChild(r);
    });
  }
}

function selectItem(id, rectIdx = null) {
  itemId = id;
  selectedRect = rectIdx;
  renderItems();
  drawRects();
}

// ---------- Zeichnen ----------
function attachDrawing(svg) {
  let draft = null;
  const pt = (e) => {
    const r = svg.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    const p = pt(e);
    draft = { start: p, el: null, target: e.target };
  });
  svg.addEventListener('pointermove', (e) => {
    if (!draft) return;
    const p = pt(e);
    const x = Math.min(p.x, draft.start.x), y = Math.min(p.y, draft.start.y);
    const w = Math.abs(p.x - draft.start.x), h = Math.abs(p.y - draft.start.y);
    if (!draft.el && w + h < 1.5) return;
    if (!draft.el) {
      draft.el = document.createElementNS(SVG_NS, 'rect');
      draft.el.setAttribute('class', 'draft');
      svg.appendChild(draft.el);
    }
    Object.entries({ x, y, width: w, height: h }).forEach(([k, v]) => draft.el.setAttribute(k, v));
    draft.rect = [x, y, w, h].map(round1);
  });
  svg.addEventListener('pointerup', () => {
    if (!draft) return;
    const d = draft;
    draft = null;
    if (d.rect) {
      d.el.remove();
      const it = item();
      if (!it || !loc(it)) {
        alert('Erst links ein Gerät auswählen oder neu anlegen.');
        return;
      }
      if (d.rect[2] < 1 || d.rect[3] < 1) return;
      loc(it).shapes.push(d.rect);
      markDirty();
      selectItem(it.id, loc(it).shapes.length - 1);
    } else if (d.target instanceof SVGRectElement && d.target.dataset.item) {
      selectItem(d.target.dataset.item, Number(d.target.dataset.idx));
    }
  });
}

// ---------- Aktionen ----------
$('#comp-select').addEventListener('change', (e) => {
  compId = e.target.value;
  itemId = null;
  selectedRect = null;
  renderItems();
  renderEditor();
});

$('#comp-add').addEventListener('click', () => {
  const id = prompt('Kürzel des Fachs (z. B. G7, GR, Dach):')?.trim().toUpperCase();
  if (!id) return;
  if (content.compartments.some((c) => c.id === id)) return alert('Gibt es schon.');
  const name = prompt('Name des Fachs:', `Geräteraum ${id.replace(/^G/, '')}`) || id;
  const side = prompt('Seite (links / rechts / heck / dach):', 'links') || '';
  content.compartments.push({ id, name, side, image: null });
  compId = id;
  markDirty();
  renderAll();
});

$('#photo-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  const c = comp();
  if (!file || !c) return;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const imageId = c.image || c.id.toLowerCase();
  if (c.image !== imageId) { c.image = imageId; markDirty(); }
  pendingImages.set(imageId, await encrypt(key, bytes));
  imageUrls.set(imageId, Promise.resolve(URL.createObjectURL(blob)));
  const hasShapes = content.items.some((i) => loc(i)?.shapes.length);
  if (hasShapes) alert('Foto ersetzt. Bitte prüfen, ob die Rechtecke noch passen.');
  updateDirty();
  renderEditor();
});

$('#item-new').addEventListener('click', () => {
  if (!comp()) return alert('Erst ein Fach anlegen.');
  const name = prompt('Name des Geräts:')?.trim();
  if (!name) return;
  const it = { id: slug(name), name, locations: [{ c: compId, shapes: [] }] };
  content.items.push(it);
  markDirty();
  selectItem(it.id);
});

$('#item-existing').addEventListener('change', (e) => {
  const it = content.items.find((i) => i.id === e.target.value);
  if (!it) return;
  it.locations.push({ c: compId, shapes: [] });
  markDirty();
  selectItem(it.id);
});

$('#item-name').addEventListener('change', (e) => {
  const it = item();
  if (!it || !e.target.value.trim()) return;
  it.name = e.target.value.trim();
  markDirty();
  renderItems();
  drawRects();
});

$('#rect-delete').addEventListener('click', () => {
  const l = loc(item());
  if (!l || selectedRect === null) return;
  l.shapes.splice(selectedRect, 1);
  markDirty();
  selectItem(itemId, null);
});

$('#item-remove').addEventListener('click', () => {
  const it = item();
  if (!it) return;
  const alsoElsewhere = it.locations.length > 1;
  if (!confirm(alsoElsewhere ? `„${it.name}“ aus ${compId} entfernen?` : `„${it.name}“ komplett löschen?`)) return;
  it.locations = it.locations.filter((l) => l.c !== compId);
  if (!it.locations.length) content.items = content.items.filter((i) => i !== it);
  markDirty();
  selectItem(null);
});

function download(name, data, type = 'application/octet-stream') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$('#download').addEventListener('click', async () => {
  if (!contentDirty && !pendingImages.size) return alert('Keine Änderungen.');
  if (contentDirty) {
    download('content.enc', await encrypt(key, new TextEncoder().encode(JSON.stringify(content))));
  }
  for (const [id, bytes] of pendingImages) {
    await new Promise((r) => setTimeout(r, 400)); // Browser blocken sonst Mehrfach-Downloads
    download(`${id}.enc`, bytes);
  }
  alert('Heruntergeladen. Jetzt auf GitHub hochladen:\n• content.enc → Ordner data/\n• Fotos (*.enc) → Ordner data/img/');
  contentDirty = false;
  pendingImages.clear();
  updateDirty();
});

$('#json-export').addEventListener('click', () => {
  if (!confirm('Das Backup ist NICHT verschlüsselt – nicht ins Repo hochladen! Fortfahren?')) return;
  download('hlf-beladung.json', JSON.stringify(content, null, 2), 'application/json');
});

$('#json-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.items) || !Array.isArray(data.compartments)) throw new Error('Format');
    content = data;
    compId = content.compartments[0]?.id || null;
    itemId = null;
    markDirty();
    renderAll();
  } catch {
    alert('Datei konnte nicht gelesen werden.');
  }
});

window.addEventListener('beforeunload', (e) => {
  if (contentDirty || pendingImages.size) e.preventDefault();
});
