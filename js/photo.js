// Foto-Ansicht eines offenen Fachs: Pinch-/Rad-Zoom, Verschieben, Tippen mit Koordinaten in Prozent.

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createPhotoView(container, { onTap } = {}) {
  container.classList.add('photo-view');
  const content = document.createElement('div');
  content.className = 'photo-content';
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  content.append(img, svg);
  container.appendChild(content);

  let natW = 1, natH = 1;
  let k = 1, kMin = 1, tx = 0, ty = 0;

  function apply() {
    content.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
  }

  function clamp() {
    const cw = container.clientWidth, ch = container.clientHeight;
    const w = natW * k, h = natH * k;
    tx = w <= cw ? (cw - w) / 2 : Math.min(0, Math.max(cw - w, tx));
    ty = h <= ch ? (ch - h) / 2 : Math.min(0, Math.max(ch - h, ty));
  }

  function fit() {
    const cw = container.clientWidth, ch = container.clientHeight;
    if (!cw || !ch) return;
    kMin = Math.min(cw / natW, ch / natH);
    k = kMin;
    clamp();
    apply();
  }

  function zoomAt(factor, cx, cy) {
    const nk = Math.min(kMin * 6, Math.max(kMin, k * factor));
    tx = cx - ((cx - tx) * nk) / k;
    ty = cy - ((cy - ty) * nk) / k;
    k = nk;
    clamp();
    apply();
  }

  // Zeiger-Handling: 1 Finger = verschieben/tippen, 2 Finger = zoomen
  const pointers = new Map();
  let gesture = null;
  let lastTap = 0;

  function local(e) {
    const r = container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  container.addEventListener('pointerdown', (e) => {
    container.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      const p = local(e);
      gesture = { type: 'pan', start: p, tx, ty, moved: false, t: performance.now() };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), k, moved: true };
    }
  });

  container.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (!gesture) return;
    if (gesture.type === 'pan' && pointers.size === 1) {
      const p = local(e);
      const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
      if (Math.hypot(dx, dy) > 8) gesture.moved = true;
      if (gesture.moved) {
        tx = gesture.tx + dx;
        ty = gesture.ty + dy;
        clamp();
        apply();
      }
    } else if (gesture.type === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const target = gesture.k * (dist / gesture.dist);
      zoomAt(target / k, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  });

  function end(e) {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === 'pan' && !gesture.moved && p && performance.now() - gesture.t < 500) {
      const now = performance.now();
      if (now - lastTap < 300) {
        // Doppeltipp: rein-/rauszoomen
        zoomAt(k > kMin * 1.5 ? kMin / k : 2.5, p.x, p.y);
        lastTap = 0;
      } else {
        lastTap = now;
        const x = ((p.x - tx) / k / natW) * 100;
        const y = ((p.y - ty) / k / natH) * 100;
        if (x >= 0 && x <= 100 && y >= 0 && y <= 100 && onTap) onTap({ x, y });
      }
    }
    if (pointers.size === 0) gesture = null;
    else if (pointers.size === 1) {
      const [q] = [...pointers.values()];
      gesture = { type: 'pan', start: q, tx, ty, moved: true, t: 0 };
    }
  }
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);

  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  const ro = new ResizeObserver(fit);
  ro.observe(container);

  function clearShapes() { svg.replaceChildren(); }

  function addRect([x, y, w, h], cls, label) {
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', 0.8);
    r.setAttribute('vector-effect', 'non-scaling-stroke');
    r.setAttribute('class', cls);
    if (label) {
      const t = document.createElementNS(SVG_NS, 'title');
      t.textContent = label;
      r.appendChild(t);
    }
    svg.appendChild(r);
    return r;
  }

  function addMarker(x, y, cls) {
    // In Bildschirm-Koordinaten, damit der Kreis unabhängig vom Zoom gleich groß bleibt
    const m = document.createElement('div');
    m.className = `photo-marker ${cls}`;
    m.style.left = tx + (x / 100) * natW * k + 'px';
    m.style.top = ty + (y / 100) * natH * k + 'px';
    container.appendChild(m);
    setTimeout(() => m.remove(), 1200);
  }

  return {
    async load(url) {
      clearShapes();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      natW = img.naturalWidth;
      natH = img.naturalHeight;
      content.style.width = natW + 'px';
      content.style.height = natH + 'px';
      fit();
    },
    fit,
    clearShapes,
    addRect,
    addMarker,
    // Auf Hotspot zoomen
    zoomTo([x, y, w, h]) {
      const cw = container.clientWidth, ch = container.clientHeight;
      const pw = (w / 100) * natW, ph = (h / 100) * natH;
      k = Math.max(kMin, Math.min(kMin * 4, Math.min(cw / pw, ch / ph) * 0.5));
      tx = cw / 2 - ((x + w / 2) / 100) * natW * k;
      ty = ch / 2 - ((y + h / 2) / 100) * natH * k;
      clamp();
      content.classList.add('animate');
      apply();
      setTimeout(() => content.classList.remove('animate'), 350);
    },
    destroy() { ro.disconnect(); container.replaceChildren(); },
  };
}

export function hitTest(shapes, { x, y }, pad = 1.5) {
  return shapes.some(([sx, sy, sw, sh]) => x >= sx - pad && x <= sx + sw + pad && y >= sy - pad && y <= sy + sh + pad);
}
