// src/3d/checkblock.js — точка интереса «чекблок»
// 1 случайный предмет-декорация (стиралка / холодильник / ЭЛТ-телевизор на паллете), 2–3 бочки (одна лежит, разлив),
// мусор: доски, ветки, грязь, банки, картон, покрышка, кирпичи.
//   const cb = createCheckBlock({ seed: 123, item: 'washer' /* необяз.: 'washer'|'fridge'|'tv' */, pad: true });
//   cb.group.position.set(x, terrainY, z); scene.add(cb.group);
//   cb.colliders — круги {x,z,r} в локальных координатах (для коллизий), cb.item — какой предмет выпал.
import * as THREE from 'three';
import { createBarrel } from '../boch.js'; // ✅ ДОБАВЛЕН ИМПОРТ

const H = Math.PI / 2, TAU = Math.PI * 2;
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- общая текстура грязи/потёков (множится на цвет материала) ----------
let _dirt;
function dirtTex() {
  if (_dirt) return _dirt;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(${60 + Math.random() * 50 | 0},${40 + Math.random() * 30 | 0},20,${Math.random() * 0.13})`;
    x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 14, 0, TAU); x.fill();
  }
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(80,45,15,${0.08 + Math.random() * 0.15})`; x.fillRect(Math.random() * 128, 0, 1 + Math.random() * 3, 20 + Math.random() * 100); }
  _dirt = new THREE.CanvasTexture(c); _dirt.wrapS = _dirt.wrapT = THREE.RepeatWrapping;
  if (THREE.SRGBColorSpace) _dirt.colorSpace = THREE.SRGBColorSpace;
  return _dirt;
}
const mk = (c, r = 0.8, m = 0, map = true) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, map: map ? dirtTex() : null });

// ---------- геометрические помощники ----------
const at = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
const cyl = (r1, r2, h, m, seg = 16) => {
  if (!isFinite(r1) || r1 <= 0) r1 = 0.01;
  if (!isFinite(r2) || r2 <= 0) r2 = 0.01;
  if (!isFinite(h) || h <= 0) h = 0.01;
  if (!isFinite(seg) || seg < 3) seg = 8;
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
};
function rbox(w, h, d, r, m) { // скруглённый параллелепипед (скос кромок)
  const bv = Math.min(r, d * 0.25, w * 0.25, h * 0.25), W = w - 2 * bv, Hh = h - 2 * bv, rr = Math.max(0.002, r - bv);
  const x = -W / 2, y = -Hh / 2, s = new THREE.Shape();
  s.moveTo(x + rr, y); s.lineTo(x + W - rr, y); s.quadraticCurveTo(x + W, y, x + W, y + rr);
  s.lineTo(x + W, y + Hh - rr); s.quadraticCurveTo(x + W, y + Hh, x + W - rr, y + Hh);
  s.lineTo(x + rr, y + Hh); s.quadraticCurveTo(x, y + Hh, x, y + Hh - rr);
  s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * bv, bevelEnabled: true, bevelSize: bv, bevelThickness: bv, bevelSegments: 2, curveSegments: 5 });
  g.translate(0, 0, -(d - 2 * bv) / 2); return new THREE.Mesh(g, m);
}
const _up = new THREE.Vector3(0, 1, 0);
function seg(p, a, b, r1, r2, m) { // конический сегмент между точками (ветки)
  const d = b.clone().sub(a), o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, d.length(), 7), m);
  o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(_up, d.normalize()); p.add(o);
}

// ====================== ПРЕДМЕТЫ ======================
function washer(rn) {
  const g = new THREE.Group(), white = mk(0xd8dad4, 0.5, 0.12), gray = mk(0x7d8185, 0.45, 0.6), light = mk(0xb9bcb8, 0.5, 0.2), dark = mk(0x17191c, 0.7, 0.1, false);
  const glass = new THREE.MeshStandardMaterial({ color: 0x2c4a5c, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.5 });
  const lcd = new THREE.MeshStandardMaterial({ color: 0x0b2a1a, emissive: 0x1fa060, emissiveIntensity: 0.6 });
  at(g, rbox(0.6, 0.84, 0.6, 0.035, white), 0, 0.46, 0);
  at(g, rbox(0.62, 0.03, 0.62, 0.015, gray), 0, 0.895, 0);
  at(g, rbox(0.56, 0.13, 0.03, 0.012, light), 0, 0.77, 0.305);
  at(g, cyl(0.036, 0.04, 0.03, gray), -0.2, 0.77, 0.33).rotation.x = H;
  at(g, new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.028, 0.004), dark), -0.2, 0.785, 0.347);
  for (let i = 0; i < 3; i++) at(g, cyl(0.014, 0.014, 0.012, dark), -0.07 + i * 0.045, 0.76, 0.322).rotation.x = H;
  at(g, rbox(0.1, 0.04, 0.012, 0.005, lcd), 0.12, 0.77, 0.322);
  at(g, rbox(0.11, 0.075, 0.012, 0.006, dark), 0.22, 0.77, 0.322);
  // отверстие и барабан
  at(g, cyl(0.2, 0.2, 0.08, dark, 28), 0, 0.4, 0.3).rotation.x = H;
  at(g, cyl(0.17, 0.17, 0.02, gray, 28), 0, 0.4, 0.26).rotation.x = H;
  // дверца на петле (приоткрыта)
  const door = new THREE.Group(); door.position.set(-0.24, 0.4, 0.315); door.rotation.y = -rn(0.15, 1.25); g.add(door);
  at(door, new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.034, 12, 32), gray), 0.24, 0, 0);
  const dome = at(door, new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 12, 0, TAU, 0, H), glass), 0.24, 0, -0.005);
  dome.rotation.x = H; dome.scale.set(1, 0.55, 1);
  at(door, new THREE.Mesh(new THREE.TorusGeometry(0.188, 0.012, 8, 28), light), 0.24, 0, -0.01);
  at(door, rbox(0.03, 0.09, 0.04, 0.012, gray), 0.47, 0, 0.03);
  for (const s of [-1, 1]) at(door, cyl(0.012, 0.012, 0.05, gray, 8), 0, s * 0.1, 0);
  for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) at(g, cyl(0.025, 0.03, 0.03, dark, 10), x, 0.015, z);
  g.rotation.z = rn(-0.03, 0.03);
  return { g, r: 0.45 };
}

function fridge(rn) {
  const g = new THREE.Group(), body = mk(0x9ec7b5, 0.45, 0.15), chrome = mk(0xcfd3d6, 0.25, 0.8), dark = mk(0x15181b, 0.8, 0, false), shelf = mk(0xc9cfd1, 0.4, 0.3);
  at(g, rbox(0.7, 1.66, 0.68, 0.045, body), 0, 0.88, 0);
  at(g, rbox(0.66, 0.06, 0.02, 0.01, dark), 0, 1.2, 0.345);                // щель между дверцами
  at(g, rbox(0.68, 0.5, 0.05, 0.025, body), 0, 1.44, 0.35);                // морозилка
  at(g, cyl(0.011, 0.011, 0.26, chrome, 8), 0.28, 1.36, 0.4);
  for (const y of [1.27, 1.47]) at(g, cyl(0.008, 0.008, 0.05, chrome, 8), 0.28, 1.36, 0.38).rotation.x = H;
  at(g, rbox(0.1, 0.03, 0.01, 0.005, mk(0xd9a524, 0.3, 0.7)), -0.2, 1.6, 0.378);   // шильдик
  // нижняя дверь — приоткрыта, внутри полки
  at(g, rbox(0.62, 1.0, 0.02, 0.01, dark), 0, 0.64, 0.335);
  for (let i = 0; i < 4; i++) at(g, rbox(0.58, 0.015, 0.05, 0.005, shelf), 0, 0.28 + i * 0.26, 0.345);
  const door = new THREE.Group(); door.position.set(-0.345, 0.64, 0.355); door.rotation.y = -rn(0.35, 1.0); g.add(door);
  at(door, rbox(0.68, 1.06, 0.055, 0.025, body), 0.345, 0, 0);
  at(door, cyl(0.011, 0.011, 0.5, chrome, 8), 0.6, 0.15, 0.05);
  for (const y of [-0.05, 0.35]) at(door, cyl(0.008, 0.008, 0.05, chrome, 8), 0.6, y, 0.035).rotation.x = H;
  for (let i = 0; i < 3; i++) at(door, rbox(0.56, 0.012, 0.05, 0.005, shelf), 0.345, -0.3 + i * 0.28, -0.045);
  for (const [x, z] of [[-0.28, -0.26], [0.28, -0.26], [-0.28, 0.26], [0.28, 0.26]]) at(g, cyl(0.03, 0.035, 0.04, dark, 10), x, 0.02, z);
  g.rotation.z = rn(-0.02, 0.02);
  return { g, r: 0.5 };
}

function tv(rn) {
  const g = new THREE.Group(), wood = mk(0x5a3a22, 0.6, 0.05), black = mk(0x131415, 0.5, 0.2, false), plank = mk(0x7a5a38, 0.85);
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b3b3b, roughness: 0.12, metalness: 0.35, emissive: 0x06201f });
  // паллета
  for (let i = -1; i <= 1; i++) at(g, rbox(0.09, 0.09, 0.9, 0.01, plank), i * 0.45, 0.045, 0);
  for (let i = 0; i < 5; i++) at(g, rbox(1.0, 0.02, 0.15, 0.005, plank), 0, 0.1, -0.36 + i * 0.18);
  const y0 = 0.11, t = new THREE.Group(); t.position.y = y0; t.rotation.y = rn(-0.5, 0.5); g.add(t);
  at(t, rbox(0.64, 0.52, 0.5, 0.035, wood), 0, 0.26, 0);
  at(t, rbox(0.54, 0.43, 0.04, 0.02, black), -0.04, 0.27, 0.25);
  const scr = at(t, new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glass), -0.04, 0.27, 0.235); scr.scale.set(0.235, 0.18, 0.07);
  at(t, rbox(0.1, 0.38, 0.02, 0.008, black), 0.26, 0.27, 0.255);                  // панель справа
  for (const y of [0.4, 0.3]) at(t, cyl(0.026, 0.028, 0.03, mk(0xc9c5b8, 0.4, 0.4), 14), 0.26, y, 0.275).rotation.x = H;
  for (let i = 0; i < 5; i++) at(t, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.01), mk(0x2a2a2a, 0.9, 0, false)), 0.26, 0.2 - i * 0.025, 0.268);
  // антенна «рожки»
  at(t, new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 8, 0, TAU, 0, H), black), 0, 0.52, 0);
  for (const s of [-1, 1]) { const r = at(t, cyl(0.004, 0.003, 0.55, mk(0xb8bcc0, 0.3, 0.9, false), 6), s * 0.17, 0.78, 0); r.rotation.z = -s * 0.6; at(t, new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), black), s * 0.34, 1.02, 0); }
  g.rotation.y = rn(0, TAU);
  return { g, r: 0.55 };
}
const ITEMS = { washer, fridge, tv };

// ====================== БОЧКИ ======================
const BARREL_COLORS = [0xa8321f, 0x2f5f8f, 0xb89a26, 0x3f6a3a, 0x6b6e70];

// ====================== МУСОР ======================
function mud(rn, rad, col = 0x3a2c1e, op = 0.85) {
  const geo = new THREE.CircleGeometry(1, 24), p = geo.attributes.position;
  for (let i = 1; i < p.count; i++) { const k = rn(0.7, 1.15); p.setXY(i, p.getX(i) * k, p.getY(i) * k); }
  const o = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 1, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  o.rotation.x = -H; o.scale.set(rad * rn(0.8, 1.2), rad * rn(0.8, 1.2), 1); return o;
}
function plank(rn) {
  const g = new THREE.Group(), L = rn(0.5, 1.3), W = rn(0.09, 0.16), c = [0x7a5a38, 0x8a6a44, 0x6a4c2e, 0x5e4a36][rn(0, 4) | 0];
  at(g, rbox(L, 0.025, W, 0.006, mk(c, 0.9)), 0, 0.0125, 0);
  for (const s of [-1, 1]) if (rn(0, 1) < 0.6) at(g, cyl(0.007, 0.007, 0.012, mk(0x333333, 0.5, 0.8, false), 6), s * (L / 2 - 0.05), 0.03, 0);
  return g;
}
function branch(rn) {
  const g = new THREE.Group(), m = mk(0x4e3a28, 0.95);
  let p = new THREE.Vector3(), d = new THREE.Vector3(1, 0, rn(-0.2, 0.2)).normalize(), r = 0.022;
  for (let i = 0; i < 3; i++) {
    const q = p.clone().addScaledVector(d, rn(0.25, 0.45)); seg(g, p, q, r, r * 0.7, m);
    if (i > 0 && rn(0, 1) < 0.85) seg(g, q, q.clone().add(new THREE.Vector3(rn(0.05, 0.15), rn(0.02, 0.1), rn(-0.18, 0.18))), r * 0.5, r * 0.2, m);
    p = q; r *= 0.7; d.y += rn(-0.1, 0.15); d.z += rn(-0.3, 0.3); d.normalize();
  }
  g.position.y = 0.02; return g;
}
function can(rn) {
  const g = new THREE.Group(), c = [0xb0b4b8, 0xa83a2a, 0x2f5f8f, 0x8a8d90][rn(0, 4) | 0];
  at(g, cyl(0.033, 0.033, 0.11, mk(c, 0.35, 0.8, false), 12), 0, 0, 0); at(g, cyl(0.03, 0.03, 0.012, mk(0x888b8e, 0.3, 0.9, false), 12), 0, 0.056, 0);
  g.rotation.z = H + rn(-0.2, 0.2); g.position.y = 0.033; return g;
}
function cardboard(rn) {
  const g = new THREE.Group(), m = mk(0xb08a58, 0.95);
  at(g, rbox(0.5, 0.3, 0.4, 0.008, m), 0, 0.15, 0);
  at(g, rbox(0.5, 0.012, 0.2, 0.004, m), 0, 0.31, 0.2).rotation.x = -0.7;
  at(g, rbox(0.5, 0.012, 0.2, 0.004, m), 0, 0.31, -0.2).rotation.x = 0.9;
  g.rotation.set(rn(-0.12, 0.12), 0, rn(-0.12, 0.12)); return g;
}
function tire() {
  const g = new THREE.Group(), t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 14, 28), mk(0x1c1c1e, 0.95, 0, false));
  t.rotation.x = H; t.position.y = 0.11; g.add(t); at(g, cyl(0.2, 0.2, 0.05, mk(0x6a6d70, 0.5, 0.6, false), 20), 0, 0.09, 0); return g;
}
function brick(rn) {
  const o = rbox(0.2, 0.065, 0.1, 0.006, mk(0x8a4a38 + (rn(0, 1) * 0x101010 | 0), 0.95));
  o.position.y = 0.033; o.rotation.set(rn(-0.2, 0.2), rn(0, TAU), rn(-0.2, 0.2)); return o;
}

// ====================== СБОРКА ТОЧКИ ======================
export function createCheckBlock(opts = {}) {
  const seed = opts.seed ?? (Math.random() * 1e9 | 0), R = rng(seed), rn = (a, b) => a + R() * (b - a);
  const group = new THREE.Group(), colliders = [];
  const name = opts.item && ITEMS[opts.item] ? opts.item : Object.keys(ITEMS)[R() * 3 | 0];

  if (opts.pad !== false) { const pad = mud(rn, 4.2, 0x4a3b2a, 0.55); pad.position.y = 0.003; group.add(pad); }

  // главный предмет
  const it = ITEMS[name](rn); it.g.rotation.y += rn(0, TAU); group.add(it.g); colliders.push({ x: 0, z: 0, r: it.r });

  // бочки: одна лежит (с разливом), остальные стоят
  const nb = R() < 0.5 ? 2 : 3, a0 = rn(0, TAU), cols = BARREL_COLORS.slice().sort(() => R() - 0.5);
  for (let i = 0; i < nb; i++) {
    const a = a0 + i * rn(0.7, 1.1), d = rn(1.2, 2.0) + i * 0.15, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const b = createBarrel(cols[i], i === 2 || (i === 1 && R() < 0.3));
    if (i === 0) {
      b.position.y = -0.44; const lay = new THREE.Group(); lay.add(b); lay.rotation.z = H; lay.position.y = 0.29;
      const holder = new THREE.Group(); holder.add(lay); holder.rotation.y = rn(0, TAU); holder.position.set(x, 0, z);
      const spill = mud(rn, 0.55, 0x15110c, 0.8); spill.position.set(-0.75, 0.006, 0); holder.add(spill);
      group.add(holder); colliders.push({ x, z, r: 0.5 });
    } else { b.position.set(x, 0, z); b.rotation.y = rn(0, TAU); group.add(b); colliders.push({ x, z, r: 0.3 }); }
  }

  // мусор
  const scatter = (o, rMin, rMax, y = 0) => { const a = rn(0, TAU), d = rn(rMin, rMax); o.position.x += Math.cos(a) * d; o.position.z += Math.sin(a) * d; o.position.y += y; o.rotation.y += rn(0, TAU); group.add(o); return o; };
  for (let i = 0; i < 3; i++) { const m = mud(rn, rn(0.5, 1.1)); m.position.y = 0.005 + i * 0.001; scatter(m, 0.5, 3.2); }
  for (let i = 0, n = 5 + (R() * 4 | 0); i < n; i++) { const p = scatter(plank(rn), 0.8, 3.4); p.rotation.z = rn(-0.1, 0.1); }
  const pile = new THREE.Group(); pile.position.set(rn(-2.5, 2.5), 0, rn(-2.5, 2.5)); // стопка досок
  for (let i = 0; i < 3; i++) { const p = plank(rn); p.position.y = i * 0.026; p.rotation.y = rn(-0.5, 0.5); pile.add(p); }
  group.add(pile);
  for (let i = 0, n = 4 + (R() * 3 | 0); i < n; i++) scatter(branch(rn), 0.8, 3.6);
  for (let i = 0, n = 2 + (R() * 3 | 0); i < n; i++) scatter(can(rn), 0.7, 3.0);
  for (let i = 0; i < 5; i++) scatter(brick(rn), 0.9, 3.0);
  scatter(cardboard(rn), 1.6, 2.8);
  if (R() < 0.6) { const t = scatter(tire(), 1.8, 3.0); colliders.push({ x: t.position.x, z: t.position.z, r: 0.4 }); }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return {
    group, colliders, item: name, seed,
    dispose() { group.traverse((o) => { o.geometry && o.geometry.dispose(); }); group.parent && group.parent.remove(group); },
  };
}
