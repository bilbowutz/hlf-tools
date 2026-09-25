// Stilisiertes 3D-Modell des HLF (Scania-Fahrgestell, Magirus-Aufbau).
// Koordinaten in Metern: +x = Fahrtrichtung, +y = oben, +z = rechte Fahrzeugseite (Beifahrer).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const RED = 0xe0301e;
const WHITE = 0xf1f1f1;
const DARK = 0x1c1f24;
const ALU = 0xc9ccd1;

const BODY = { front: 1.2, rear: -3.35, bottom: 0.45, top: 2.95, halfWidth: 1.25 };
const CAB = { front: 4.0, rear: 1.3, bottom: 0.62, top: 3.0 };
const WHEELS = [{ x: 3.05, r: 0.52 }, { x: -1.0, r: 0.52 }];

// Rollläden: Position entlang der Fahrzeuglänge (x1 vorne, x2 hinten) und Höhe.
const SHUTTERS = [
  { id: 'G1', side: -1, x1: 1.12, x2: -0.02, y1: 0.55, y2: 2.85 },
  { id: 'G3', side: -1, x1: -0.1, x2: -1.9, y1: 1.2, y2: 2.85 },
  { id: 'G5', side: -1, x1: -1.98, x2: -3.2, y1: 0.55, y2: 2.85 },
  { id: 'G2', side: 1, x1: 1.12, x2: -0.02, y1: 0.55, y2: 2.85 },
  { id: 'G4', side: 1, x1: -0.1, x2: -1.9, y1: 1.2, y2: 2.85 },
  { id: 'G6', side: 1, x1: -1.98, x2: -3.2, y1: 0.55, y2: 2.85 },
  { id: 'GR', side: 0, z1: -0.55, z2: 0.95, y1: 1.05, y2: 2.85 },
];

export const VIEWS = {
  dach: { pos: [-1.0, 10.5, -4.5], target: [-0.9, 2.9, 0], span: 3.2 },
  links: { pos: [0.2, 3.2, -10.5], target: [0.2, 1.6, 0], span: 4.5 },
  rechts: { pos: [0.2, 3.2, 10.5], target: [0.2, 1.6, 0], span: 4.5 },
  heck: { pos: [-11.5, 3.4, -0.8], target: [0, 1.6, 0], span: 1.8 },
  start: { pos: [7.5, 4.8, -8.5], target: [0.2, 1.5, 0], span: 4.4 },
};

function shutterTexture(label) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#d4d7dc';
  g.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 16) {
    g.fillStyle = '#b3b7bd'; g.fillRect(0, y + 12, 256, 3);
    g.fillStyle = '#eceef1'; g.fillRect(0, y + 1, 256, 2);
  }
  g.fillStyle = '#9aa0a8';
  g.fillRect(0, 470, 256, 42);
  g.fillStyle = '#2a2e35';
  g.font = 'bold 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(label, 128, 80);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function box(w, h, d, color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.55, metalness: opts.metalness ?? 0.1 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  return m;
}

function at(mesh, x, y, z) { mesh.position.set(x, y, z); return mesh; }

function buildTruck() {
  const truck = new THREE.Group();
  const W = BODY.halfWidth * 2;

  // Aufbau
  const bodyLen = BODY.front - BODY.rear;
  truck.add(at(box(bodyLen, BODY.top - BODY.bottom, W, RED), (BODY.front + BODY.rear) / 2, (BODY.top + BODY.bottom) / 2, 0));
  // Dachkante / Dachkasten
  truck.add(at(box(bodyLen - 0.1, 0.12, W - 0.1, ALU, { metalness: 0.5 }), (BODY.front + BODY.rear) / 2, BODY.top + 0.06, 0));
  // Warnstreifen
  for (const s of [1, -1]) {
    truck.add(at(box(bodyLen, 0.06, 0.02, 0xf4c20d), (BODY.front + BODY.rear) / 2, BODY.top - 0.05, s * (BODY.halfWidth + 0.005)));
  }

  // Fahrerhaus
  const cabLen = CAB.front - CAB.rear;
  const cab = at(box(cabLen, CAB.top - CAB.bottom, W, RED), (CAB.front + CAB.rear) / 2, (CAB.top + CAB.bottom) / 2, 0);
  truck.add(cab);
  truck.add(at(box(0.05, 0.9, W - 0.2, DARK, { roughness: 0.1, metalness: 0.6 }), CAB.front + 0.01, 2.35, 0)); // Frontscheibe
  truck.add(at(box(0.06, 0.55, W - 0.4, 0x2b2f36), CAB.front + 0.01, 1.35, 0)); // Kühlergrill
  truck.add(at(box(0.25, 0.35, W + 0.04, WHITE), CAB.front + 0.02, 0.75, 0)); // Stoßstange
  for (const s of [1, -1]) {
    truck.add(at(box(0.25, 0.14, 0.4, 0xfff6d5, { roughness: 0.2 }), CAB.front + 0.01, 1.0, s * 0.85)); // Scheinwerfer
    truck.add(at(box(cabLen - 1.2, 0.7, 0.02, DARK, { roughness: 0.1, metalness: 0.6 }), CAB.front - 0.75, 2.3, s * (BODY.halfWidth + 0.005))); // Fenster vorne
    truck.add(at(box(0.85, 0.6, 0.02, DARK, { roughness: 0.1, metalness: 0.6 }), CAB.rear + 0.6, 2.35, s * (BODY.halfWidth + 0.005))); // Fenster Mannschaft
    truck.add(at(box(0.08, 0.35, 0.08, 0x111111), CAB.front - 0.2, 2.45, s * (BODY.halfWidth + 0.15))); // Spiegel
    truck.add(at(box(cabLen, 0.05, 0.02, 0xf4c20d), (CAB.front + CAB.rear) / 2, 1.55, s * (BODY.halfWidth + 0.006)));
  }
  // Blaulichter: zwei Gruppen (links/rechts), die im Wettkampf abwechselnd blitzen
  const beacons = [];
  const beacon = (group, w, h, d, x, y, z) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a3a9e, roughness: 0.2, emissive: 0x000000, emissiveIntensity: 3 });
    const m = at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z);
    truck.add(m);
    beacons.push({ group, mat });
  };
  const barW = (W - 0.3) / 2;
  beacon(0, 0.3, 0.12, barW - 0.02, CAB.front - 0.3, CAB.top + 0.07, -barW / 2); // Dachbalken links
  beacon(1, 0.3, 0.12, barW - 0.02, CAB.front - 0.3, CAB.top + 0.07, barW / 2); // Dachbalken rechts
  beacon(0, 0.04, 0.08, 0.22, CAB.front + 0.04, 1.35, -0.55); // Frontblitzer
  beacon(1, 0.04, 0.08, 0.22, CAB.front + 0.04, 1.35, 0.55);
  beacon(0, 0.12, 0.14, 0.14, BODY.rear + 0.02, BODY.top - 0.1, -1.1); // Heck
  beacon(1, 0.12, 0.14, 0.14, BODY.rear + 0.02, BODY.top - 0.1, 1.1);
  // Lichtmast
  truck.add(at(box(0.12, 0.9, 0.12, ALU, { metalness: 0.6 }), CAB.rear - 0.25, CAB.top + 0.45, 0.7));
  truck.add(at(box(0.2, 0.2, 0.55, 0x444a52), CAB.rear - 0.25, CAB.top + 0.95, 0.7));

  // Fahrgestell + Räder
  truck.add(at(box(CAB.front - BODY.rear - 0.4, 0.3, W - 0.6, 0x222222), (CAB.front + BODY.rear) / 2, 0.55, 0));
  const tireGeo = new THREE.CylinderGeometry(1, 1, 0.38, 28);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xbfc3c8, metalness: 0.7, roughness: 0.3 });
  for (const wh of WHEELS) {
    for (const s of [1, -1]) {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.scale.set(wh.r, 1, wh.r);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(wh.x, wh.r, s * (BODY.halfWidth - 0.2));
      truck.add(tire);
      const rim = new THREE.Mesh(tireGeo, rimMat);
      rim.scale.set(wh.r * 0.55, 0.4, wh.r * 0.55);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(wh.x, wh.r, s * (BODY.halfWidth - 0.03));
      truck.add(rim);
    }
  }
  // Radkasten im Aufbau (unter G3/G4 schwarz)
  for (const s of [1, -1]) {
    truck.add(at(box(1.35, 0.72, 0.03, 0x121212), -1.0, BODY.bottom + 0.36, s * (BODY.halfWidth + 0.005)));
  }

  // Heck: Aufstiegsleiter
  const ladderX = BODY.rear - 0.04;
  for (const dz of [-0.95, -0.65]) truck.add(at(box(0.04, 2.6, 0.05, ALU, { metalness: 0.6 }), ladderX, 1.75, dz));
  for (let y = 0.6; y < 3.0; y += 0.3) truck.add(at(box(0.04, 0.03, 0.32, ALU, { metalness: 0.6 }), ladderX, y, -0.8));

  // Weitere antippbare Ziele ohne Rollladen (Schlauchhaspel, Dach)
  const targets = [buildHaspel(truck), buildRoof(truck)];
  return { truck, targets, beacons };
}

// Ziel = Gruppe von Meshes mit gemeinsamem Material zum Aufleuchten + unsichtbare, großzügige Tippfläche
function hitBox(id, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  m.position.set(x, y, z);
  m.userData.compId = id;
  return m;
}

function buildHaspel(truck) {
  const x = BODY.rear - 0.5, z = 0.2, r = 0.45;
  const red = new THREE.MeshStandardMaterial({ color: 0xd8311f, roughness: 0.6, emissive: 0x000000 });
  const bag = new THREE.MeshStandardMaterial({ color: 0x9e1b12, roughness: 0.8, emissive: 0x000000 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.95, 24), bag);
  drum.rotation.x = Math.PI / 2;
  drum.position.set(x, r, z);
  truck.add(drum);
  for (const dz of [-0.52, 0.52]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.05, 8, 28), red);
    wheel.position.set(x, r, z + dz);
    truck.add(wheel);
  }
  // Standrohr obenauf
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 10),
    new THREE.MeshStandardMaterial({ color: ALU, metalness: 0.6, roughness: 0.3, emissive: 0x000000 }));
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(x, r * 1.85, z);
  truck.add(pipe);
  const hit = hitBox('Haspel', 1.1, 1.1, 1.3, x - 0.05, r + 0.05, z);
  truck.add(hit);
  return { id: 'Haspel', materials: [red, bag, pipe.material], hit };
}

function buildLadder(mat, length, width, x, y, z, rungStep = 0.28) {
  const g = new THREE.Group();
  for (const dz of [-width / 2, width / 2]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(length, 0.05, 0.05), mat), 0, 0, dz));
  for (let rx = -length / 2 + 0.12; rx < length / 2; rx += rungStep) {
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, width), mat), rx, 0, 0));
  }
  g.position.set(x, y, z);
  return g;
}

function buildRoof(truck) {
  const mat = new THREE.MeshStandardMaterial({ color: ALU, metalness: 0.6, roughness: 0.35, emissive: 0x000000 });
  const top = BODY.top + 0.14;
  // Schiebleiter (zwei Teile übereinander) links
  truck.add(buildLadder(mat, 4.1, 0.5, -1.05, top, -0.6));
  truck.add(buildLadder(mat, 3.7, 0.42, -1.1, top + 0.08, -0.6));
  // 4-teilige Steckleiter rechts
  for (let i = 0; i < 4; i++) truck.add(buildLadder(mat, 2.7, 0.36, -1.6, top + i * 0.07, 0.45, 0.28));
  const hit = hitBox('Dach', BODY.front - BODY.rear - 0.3, 0.5, BODY.halfWidth * 2 - 0.1, (BODY.front + BODY.rear) / 2, BODY.top + 0.25, 0);
  truck.add(hit);
  return { id: 'Dach', materials: [mat], hit };
}

function buildShutter(def) {
  const width = def.side === 0 ? Math.abs(def.z1 - def.z2) : Math.abs(def.x1 - def.x2);
  const height = def.y2 - def.y1;
  const group = new THREE.Group();

  // Innenraum (dunkel, wird mit dem Foto belegt, sobald es geladen ist)
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: 0x0e1014 }));
  inner.position.set(0, height / 2, -0.04);
  group.add(inner);

  // Rollladen: Ursprung an der Oberkante, damit er beim Öffnen nach oben „einrollt"
  const geo = new THREE.BoxGeometry(width, height, 0.03);
  geo.translate(0, -height / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ map: shutterTexture(def.id), roughness: 0.45, metalness: 0.35, emissive: 0x000000 });
  const shutter = new THREE.Mesh(geo, mat);
  shutter.position.y = height;
  shutter.userData.compId = def.id;
  group.add(shutter);

  if (def.side === 0) {
    group.position.set(BODY.rear - 0.02, def.y1, (def.z1 + def.z2) / 2);
    group.rotation.y = -Math.PI / 2;
  } else {
    group.position.set((def.x1 + def.x2) / 2, def.y1, def.side * (BODY.halfWidth + 0.02));
    group.rotation.y = def.side === 1 ? 0 : Math.PI;
  }
  return { group, shutter, inner, width, height, open: 0, target: 0, flash: null };
}

export function createTruckView(container, { onPick, onLost } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  // iOS entzieht bei Speicherdruck manchmal den Grafikkontext → App baut die Ansicht neu auf
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    onLost?.();
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(6, 10, 4);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  fill.position.set(-6, 5, -6);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 48),
    new THREE.MeshStandardMaterial({ color: 0x7c7f86, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.001;
  scene.add(ground);

  const { truck, targets: extraTargets, beacons } = buildTruck();
  // Blauer Lichtschein aufs Fahrzeug und den Boden, wenn die Blaulichter an sind
  const glow = new THREE.PointLight(0x3a66ff, 0, 12, 1.5);
  glow.position.set(CAB.front - 0.3, CAB.top + 0.6, 0);
  truck.add(glow);
  let sirens = false;
  scene.add(truck);

  // Alles Antippbare: Rollläden + Haspel + Dach
  const shutters = new Map();
  const targets = new Map();
  for (const def of SHUTTERS) {
    const s = buildShutter(def);
    shutters.set(def.id, s);
    truck.add(s.group);
    targets.set(def.id, { materials: [s.shutter.material], pick: s.shutter, flash: null });
  }
  for (const t of extraTargets) targets.set(t.id, { materials: t.materials, pick: t.hit, flash: null });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 26;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minPolarAngle = Math.PI * 0.12;

  // Abstand so wählen, dass `span` Meter links/rechts der Bildmitte sichtbar sind
  function fitDistance(span, base) {
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    return Math.max(base, (span / Math.tan(Math.min(vHalf, hHalf))) * 1.05);
  }

  function flyTo(toPos, toTarget, span) {
    const dir = toPos.clone().sub(toTarget);
    dir.setLength(fitDistance(span, dir.length()));
    return { toPos: toTarget.clone().add(dir), toTarget };
  }

  let flight = null;
  function setView(name, instant = false) {
    const v = VIEWS[name];
    if (!v) return;
    const { toPos, toTarget } = flyTo(new THREE.Vector3(...v.pos), new THREE.Vector3(...v.target), v.span);
    if (instant) {
      camera.position.copy(toPos);
      controls.target.copy(toTarget);
      controls.update();
      return;
    }
    flight = { t: 0, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos, toTarget };
  }

  // Kamera zu einem Fach fliegen lassen
  function focus(id) {
    const def = SHUTTERS.find((d) => d.id === id) || { side: id === 'Haspel' ? 0 : 'dach' };
    let pos, target;
    if (def.side === 'dach') {
      const v = VIEWS.dach;
      flight = { t: 0, fromPos: camera.position.clone(), fromTarget: controls.target.clone(),
        ...flyTo(new THREE.Vector3(...v.pos), new THREE.Vector3(...v.target), v.span) };
      return;
    }
    if (def.side === 0) {
      target = new THREE.Vector3(BODY.rear, 1.8, 0);
      pos = new THREE.Vector3(BODY.rear - 7.5, 2.6, 0.3);
    } else {
      const x = (def.x1 + def.x2) / 2;
      target = new THREE.Vector3(x, 1.7, def.side * BODY.halfWidth);
      pos = new THREE.Vector3(x - 0.6, 2.4, def.side * 7.5);
    }
    const fit = flyTo(pos, target, 1.4);
    flight = { t: 0, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), ...fit };
  }

  // Tippen erkennen (nicht beim Drehen)
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  let enabled = true;
  const active = new Set();
  let multi = false; // Zwei-Finger-Geste (Zoomen) → kein Tipp
  renderer.domElement.addEventListener('pointerdown', (e) => {
    active.add(e.pointerId);
    if (active.size > 1) multi = true;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  const release = (e) => {
    active.delete(e.pointerId);
    if (active.size === 0) setTimeout(() => { multi = false; }, 0);
  };
  renderer.domElement.addEventListener('pointercancel', (e) => { release(e); down = null; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    const wasMulti = multi;
    release(e);
    if (wasMulti) { down = null; return; }
    if (!down || !enabled) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t;
    down = null;
    if (moved > 8 || dt > 600) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...targets.values()].map((t) => t.pick), false);
    if (hits.length && onPick) onPick(hits[0].object.userData.compId);
  });

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Im Hochformat weiter weg, damit das ganze Fahrzeug passt
    camera.fov = w / h < 0.8 ? 50 : 40;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  setView('start', true);

  const clock = new THREE.Clock();
  let running = true;
  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (flight) {
      flight.t = Math.min(1, flight.t + dt * 1.6);
      const k = 1 - Math.pow(1 - flight.t, 3);
      camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
      if (flight.t >= 1) flight = null;
    }
    controls.update();
    const now = performance.now();
    for (const s of shutters.values()) {
      s.open += (s.target - s.open) * Math.min(1, dt * 6);
      s.shutter.scale.y = Math.max(0.04, 1 - s.open * 0.96);
    }
    for (const t of targets.values()) {
      if (!t.flash) continue;
      const on = now < t.flash.until;
      const pulse = 0.35 + 0.35 * Math.sin(now / 90);
      for (const m of t.materials) {
        if (on) m.emissive.setHex(t.flash.color).multiplyScalar(pulse);
        else m.emissive.setHex(0x000000);
      }
      if (!on) t.flash = null;
    }
    // Doppelblitz: erst Gruppe 0 zweimal, dann Gruppe 1 zweimal
    if (sirens) {
      const t = now % 700;
      const on = [t < 70 || (t >= 140 && t < 210), (t >= 350 && t < 420) || (t >= 490 && t < 560)];
      for (const b of beacons) b.mat.emissive.setHex(on[b.group] ? 0x3a6cff : 0x000000);
      glow.intensity = on[0] || on[1] ? 25 : 0;
    }
    renderer.render(scene, camera);
  }
  tick();

  return {
    setView,
    focus,
    setEnabled(v) { enabled = v; },
    setSirens(on) {
      sirens = on;
      if (!on) {
        for (const b of beacons) b.mat.emissive.setHex(0x000000);
        glow.intensity = 0;
      }
    },
    open(id) { const s = shutters.get(id); if (s) s.target = 1; },
    close(id) { const s = shutters.get(id); if (s) s.target = 0; },
    closeAll() { for (const s of shutters.values()) s.target = 0; },
    flash(id, color, ms = 900) { const t = targets.get(id); if (t) t.flash = { color, until: performance.now() + ms }; },
    // Foto hinter dem Rollladen – verkleinert, sonst braucht es unnötig viel Grafikspeicher
    setInterior(id, url) {
      const s = shutters.get(id);
      if (!s) return;
      const img = new Image();
      img.onload = () => {
        if (!running) return;
        const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        s.inner.material.dispose();
        s.inner.material = new THREE.MeshBasicMaterial({ map: tex });
      };
      img.src = url;
    },
    dispose() {
      running = false;
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// Notlösung ohne 3D (kein WebGL): einfache Knöpfe für alle Fächer, gleiche Schnittstelle
export function createFallbackView(container, { onPick } = {}) {
  const groups = [
    ['Links', ['G1', 'G3', 'G5']], ['Rechts', ['G2', 'G4', 'G6']],
    ['Heck', ['Haspel', 'GR']], ['Oben', ['Dach']],
  ];
  const root = document.createElement('div');
  root.className = 'fallback';
  const buttons = new Map();
  let enabled = true;
  for (const [title, ids] of groups) {
    const h = document.createElement('h3');
    h.textContent = title;
    const row = document.createElement('div');
    row.className = 'fallback-row';
    for (const id of ids) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = id;
      b.addEventListener('click', () => enabled && onPick?.(id));
      buttons.set(id, b);
      row.appendChild(b);
    }
    root.append(h, row);
  }
  container.appendChild(root);
  return {
    isFallback: true,
    setView() {}, focus() {}, setSirens() {}, open() {}, close() {}, closeAll() {}, setInterior() {},
    setEnabled(v) { enabled = v; },
    flash(id, color) {
      const b = buttons.get(id);
      if (!b) return;
      b.dataset.flash = color === 0xef4444 ? 'bad' : 'ok';
      setTimeout(() => { delete b.dataset.flash; }, 900);
    },
    dispose() { root.remove(); },
  };
}
