// scr/world/locations/warehouse.js — Склад в стиле Rust (красный стальной ангар)
// ============================================================================
//  ПОДКЛЮЧЕНИЕ В main.js (3 шага):
//
//  1) Импорт и создание (рядом с газовыми заправками):
//       import { createWarehouse } from './scr/world/locations/warehouse.js';
//       const warehouse = createWarehouse({ seed: 7 });
//       warehouse.place(-110, 60, getGroundHeight, 0);        // x, z, функция высоты, поворот (рад)
//       scene.add(warehouse.group);
//       warehouse.group.traverse(o => { if (o.isMesh) { o.userData.isWarehouse = true; colliders.push(o); } });
//       registerCull(warehouse.group, 220, 'warehouse');
//
//  2) В animate(), в блоке `if (!inBuggy) { ... }` после газовых заправок:
//       {
//         const feet = new THREE.Vector3(camera.position.x, camera.position.y - 1.7, camera.position.z);
//         const res = warehouse.resolveAll(feet, 0.35, 1.8, 0.6, player.velocity.y);
//         camera.position.x = feet.x; camera.position.z = feet.z;
//         if (res.grounded && res.ground !== null) {
//           camera.position.y = res.ground + 1.7; player.velocity.y = 0; player.isOnGround = true;
//         }
//       }
//
//  3) (необязательно) warehouse.update(delta) в animate();
//     warehouse.showColliders(true) — показать зелёные рамки коллайдеров (для проверки).
//
//  Лазить можно: по ящикам, поддонам, ступенькам из ящиков (на контейнеры и стеллажи),
//  по лестнице на балкон офиса. Шаг автоподъёма = 0.6 м (все ступени ниже).
// ============================================================================
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

const merge = BGU.mergeGeometries || BGU.mergeBufferGeometries;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function rngFrom(seed) {
  let a = (seed | 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
//  КОЛЛИЗИИ (локальные координаты склада): круг игрока против AABB
// ============================================================
export function resolveBoxes(boxes, px, pz, fy, r, h, step, vy) {
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (const b of boxes) {
      if (fy + step >= b.maxY) continue;      // можно встать сверху — стеной не считаем
      if (fy + h <= b.minY) continue;         // бокс над головой
      const cx = clamp(px, b.minX, b.maxX), cz = clamp(pz, b.minZ, b.maxZ);
      const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; px += dx * k; pz += dz * k; }
      else {
        const l = px - b.minX, rt = b.maxX - px, bk = pz - b.minZ, fr = b.maxZ - pz;
        const m = Math.min(l, rt, bk, fr);
        if (m === l) px = b.minX - r; else if (m === rt) px = b.maxX + r;
        else if (m === bk) pz = b.minZ - r; else pz = b.maxZ + r;
      }
      moved = true;
    }
    if (!moved) break;
  }
  let ground = null;
  if (vy <= 0.5) {
    for (const b of boxes) {
      if (fy < b.maxY - step - 0.001 || fy > b.maxY + 0.15) continue;
      const cx = clamp(px, b.minX, b.maxX), cz = clamp(pz, b.minZ, b.maxZ);
      const dx = px - cx, dz = pz - cz, rr = r * 0.9;
      if (dx * dx + dz * dz > rr * rr) continue;
      if (ground === null || b.maxY > ground) ground = b.maxY;
    }
  }
  return { x: px, z: pz, ground };
}

// ============================================================
//  ТЕКСТУРЫ (canvas, процедурные)
// ============================================================
const cv = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h); return c;
};
const mkTex = (c) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
function blotches(x, w, h, rnd, n, color, a, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = color.replace('A', (a * (0.5 + rnd() * 0.5)).toFixed(3));
    x.beginPath(); x.arc(rnd() * w, rnd() * h, rmin + rnd() * (rmax - rmin), 0, TAU); x.fill();
  }
}
function corrugated(x, w, h, step, dark, light) {
  for (let px = 0; px < w; px += step) {
    const g = x.createLinearGradient(px, 0, px + step, 0);
    g.addColorStop(0, dark); g.addColorStop(0.5, light); g.addColorStop(1, dark);
    x.fillStyle = g; x.fillRect(px, 0, step, h);
  }
}

function makeTextures() {
  const rnd = rngFrom(12345);
  const T = {};
  T.concrete = mkTex(cv(512, 512, (x, w, h) => {
    x.fillStyle = '#8d8f8b'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '40,40,40' : '200,200,195'},${0.05 + rnd() * 0.1})`; x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3); }
    blotches(x, w, h, rnd, 14, 'rgba(30,30,28,A)', 0.14, 20, 70);
    blotches(x, w, h, rnd, 6, 'rgba(70,95,45,A)', 0.2, 10, 40);
    x.strokeStyle = 'rgba(35,36,34,0.9)'; x.lineWidth = 3;
    for (const p of [0, 170, 340]) {       // швы плит (неровные)
      x.beginPath(); x.moveTo(p + rnd() * 6, 0);
      for (let y = 0; y <= h; y += 64) x.lineTo(p + rnd() * 10, y); x.stroke();
      x.beginPath(); x.moveTo(0, p + rnd() * 6);
      for (let xx = 0; xx <= w; xx += 64) x.lineTo(xx, p + rnd() * 10); x.stroke();
    }
    x.lineWidth = 1.2;
    for (let i = 0; i < 16; i++) {
      x.strokeStyle = `rgba(40,40,38,${0.4 + rnd() * 0.4})`; x.beginPath();
      let px = rnd() * w, py = rnd() * h; x.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += (rnd() - 0.5) * 50; py += (rnd() - 0.5) * 50; x.lineTo(px, py); } x.stroke();
    }
  }));
  T.redMetal = mkTex(cv(256, 256, (x, w, h) => {
    x.fillStyle = '#962a23'; x.fillRect(0, 0, w, h);
    blotches(x, w, h, rnd, 70, 'rgba(110,55,25,A)', 0.4, 4, 22);
    blotches(x, w, h, rnd, 30, 'rgba(190,190,185,A)', 0.2, 2, 8);
    for (let i = 0; i < 50; i++) { x.fillStyle = `rgba(30,10,8,${rnd() * 0.25})`; x.fillRect(rnd() * w, 0, 1 + rnd() * 2, h); }
  }));
  T.roof = mkTex(cv(256, 256, (x, w, h) => {
    corrugated(x, w, h, 16, '#6e1f1a', '#a53128');
    blotches(x, w, h, rnd, 80, 'rgba(105,60,30,A)', 0.45, 4, 26);
    blotches(x, w, h, rnd, 40, 'rgba(185,188,188,A)', 0.25, 2, 12);
  }));
  T.green = mkTex(cv(256, 256, (x, w, h) => {
    x.fillStyle = '#44614a'; x.fillRect(0, 0, w, h);
    for (let px = 0; px < w; px += 32) { x.fillStyle = 'rgba(15,30,20,0.55)'; x.fillRect(px, 0, 2, h); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(px + 3, 0, 3, h); }
    blotches(x, w, h, rnd, 30, 'rgba(190,175,140,A)', 0.3, 3, 18);
    const g = x.createLinearGradient(0, h * 0.6, 0, h); g.addColorStop(0, 'rgba(40,30,20,0)'); g.addColorStop(1, 'rgba(40,30,20,0.55)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }));
  T.crate = mkTex(cv(256, 256, (x, w, h) => {
    x.fillStyle = '#b39d6b'; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) { x.fillStyle = 'rgba(60,45,20,0.6)'; x.fillRect(0, y, w, 3); }
    for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(90,70,35,${0.1 + rnd() * 0.2})`; x.beginPath(); const y = rnd() * h; x.moveTo(0, y); x.lineTo(w, y + (rnd() - 0.5) * 6); x.stroke(); }
    x.fillStyle = 'rgba(95,80,50,0.9)'; x.fillRect(14, 0, 20, h); x.fillRect(w - 34, 0, 20, h);
    x.fillStyle = 'rgba(30,25,15,0.9)'; for (let y = 16; y < h; y += 64) { x.fillRect(22, y, 4, 4); x.fillRect(w - 26, y, 4, 4); }
    blotches(x, w, h, rnd, 14, 'rgba(50,40,25,A)', 0.2, 6, 24);
  }));
  T.pallet = mkTex(cv(256, 256, (x, w, h) => {
    x.fillStyle = '#85694a'; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 50) { x.fillStyle = 'rgba(25,15,8,0.7)'; x.fillRect(0, y, w, 4); }
    for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(40,25,10,${0.15 + rnd() * 0.25})`; x.beginPath(); const y = rnd() * h; x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
  }));
  T.rustFence = mkTex(cv(256, 256, (x, w, h) => {
    corrugated(x, w, h, 16, '#7a3f22', '#b4693a');
    blotches(x, w, h, rnd, 40, 'rgba(205,200,188,A)', 0.55, 6, 30);
    blotches(x, w, h, rnd, 50, 'rgba(60,30,15,A)', 0.4, 4, 20);
  }));
  const cont = (base, d, l) => mkTex(cv(256, 256, (x, w, h) => {
    corrugated(x, w, h, 16, d, l);
    blotches(x, w, h, rnd, 40, 'rgba(110,60,30,A)', 0.4, 3, 20);
    for (let i = 0; i < 20; i++) { x.fillStyle = `rgba(20,15,10,${rnd() * 0.3})`; x.fillRect(rnd() * w, 0, 2, h); }
  }));
  T.contG = cont('#3e6a48', '#2a4a33', '#4c7e57');
  T.contR = cont('#8e2e25', '#5f1d17', '#a63a2f');
  T.wood = mkTex(cv(256, 256, (x, w, h) => {
    x.fillStyle = '#7b5d3a'; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 42) { x.fillStyle = 'rgba(20,12,6,0.7)'; x.fillRect(0, y, w, 3); }
    for (let i = 0; i < 80; i++) { x.strokeStyle = `rgba(40,25,10,${0.1 + rnd() * 0.25})`; x.beginPath(); const y = rnd() * h; x.moveTo(0, y); x.lineTo(w, y + (rnd() - 0.5) * 4); x.stroke(); }
  }));
  T.sign = mkTex(cv(512, 160, (x, w, h) => {
    x.fillStyle = '#b5532a'; x.fillRect(0, 0, w, h);
    blotches(x, w, h, rnd, 40, 'rgba(60,30,15,A)', 0.4, 4, 24);
    x.fillStyle = '#16120f'; x.font = 'bold 84px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('СКЛАД №3', w / 2, h / 2 + 4);
    x.strokeStyle = '#16120f'; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, h - 12);
  }));
  return T;
}

// ============================================================
//  Построитель: боксы копятся по материалам и сливаются в один меш
// ============================================================
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s1 = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

function boxGeo(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
  }
  return g;
}

class Builder {
  constructor() { this.parts = new Map(); this.solids = []; }
  push(g, mat) { if (!this.parts.has(mat)) this.parts.set(mat, []); this.parts.get(mat).push(g); }
  place(g, x, y, z, rx = 0, ry = 0, rz = 0) {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s1); g.applyMatrix4(_m);
  }
  // бокс по центру (x,y,z). o.solid — добавить коллайдер (только для ry = 0 или PI/2)
  box(mat, w, h, d, x, y, z, o = {}) {
    const g = boxGeo(w, h, d, o.tile || 2);
    this.place(g, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0);
    this.push(g, mat);
    if (o.solid) this.solidC(x, y, z, w, h, d, o.ry || 0);
    return g;
  }
  cyl(mat, rt, rb, h, seg, x, y, z, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    this.place(g, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0); this.push(g, mat); return g;
  }
  torus(mat, R, r, x, y, z, o = {}) {
    const g = new THREE.TorusGeometry(R, r, 8, 16);
    this.place(g, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0); this.push(g, mat); return g;
  }
  sphere(mat, r, x, y, z) { const g = new THREE.SphereGeometry(r, 8, 6); this.place(g, x, y, z); this.push(g, mat); }
  solidC(x, y, z, w, h, d, ry = 0) {
    if (Math.abs(Math.sin(ry)) > 0.99) { const t = w; w = d; d = t; }
    this.solids.push({ minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  solidR(minX, maxX, minY, maxY, minZ, maxZ) { this.solids.push({ minX, maxX, minY, maxY, minZ, maxZ }); }
}

// ============================================================
//  СКЛАД
// ============================================================
export function createWarehouse(opts = {}) {
  const rng = rngFrom(opts.seed ?? 1);
  const rn = (a, b) => a + rng() * (b - a);
  const T = makeTextures();
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0.05 }, o));
  const M = {
    concrete: std({ map: T.concrete }), red: std({ map: T.redMetal, metalness: 0.25, roughness: 0.75 }),
    roof: std({ map: T.roof, metalness: 0.2, roughness: 0.8, side: THREE.DoubleSide }),
    green: std({ map: T.green }), crate: std({ map: T.crate }),
    crateD: std({ map: T.crate, color: 0xb9a78a }), pallet: std({ map: T.pallet }),
    fence: std({ map: T.rustFence, metalness: 0.2, side: THREE.DoubleSide }),
    contG: std({ map: T.contG, metalness: 0.2 }), contR: std({ map: T.contR, metalness: 0.2 }),
    wood: std({ map: T.wood }), sign: std({ map: T.sign }),
    steel: std({ color: 0x4a4d50, metalness: 0.5, roughness: 0.6 }),
    rackBlue: std({ color: 0x2f4f6a, metalness: 0.4, roughness: 0.6 }),
    rackOrange: std({ color: 0xb8651f, metalness: 0.4, roughness: 0.6 }),
    glass: std({ color: 0x1c2a33, metalness: 0.6, roughness: 0.25 }),
    tire: std({ color: 0x151515, roughness: 1 }), dark: std({ color: 0x1b1b1b }),
    fork: std({ color: 0xc9c6b8, metalness: 0.2, roughness: 0.8 }), forkDark: std({ color: 0x3a3a38, metalness: 0.3 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xfff1c0 }),
    bRed: std({ color: 0x9c2a24, metalness: 0.4 }), bBlue: std({ color: 0x2b4c78, metalness: 0.4 }),
    bYel: std({ color: 0xbf9a26, metalness: 0.4 }), bGreen: std({ color: 0x3a6a3d, metalness: 0.4 }),
    grass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
  };
  const b = new Builder();
  const L = 30, W = 20, HE = 6, HR = 8.6;

  // ---------- бетонная плита (с «фундаментом» вниз, чтобы скрыть неровность земли) ----------
  b.box(M.concrete, 38, 3, 30, 0, -1.5, 0, { tile: 6, solid: true });

  // ---------- стальной каркас ----------
  const rafA = Math.atan2(HR - HE, W / 2);
  const rafL = Math.hypot(W / 2, HR - HE);
  const xs = [-15, -9, -3, 3, 9, 15];
  for (const x of xs) {
    for (const s of [-1, 1]) {
      b.box(M.red, 0.4, HE, 0.4, x, HE / 2, s * 10, { solid: true, tile: 2 });
      b.box(M.steel, 0.7, 0.12, 0.7, x, 0.06, s * 10);
      b.box(M.red, 0.3, 0.4, rafL, x, (HE + HR) / 2 + 0.1, s * W / 4, { rx: s * rafA });
      const sl = Math.hypot(5, HR - HE - 0.2);
      b.box(M.red, 0.14, 0.18, sl, x, HE + 0.1 + (HR - HE - 0.2) / 2, s * 2.5, { rx: s * Math.atan2(HR - HE - 0.2, 5) });
    }
    b.box(M.red, 0.2, 0.3, W, x, HE, 0);
    b.box(M.red, 0.18, HR - HE, 0.18, x, (HE + HR) / 2, 0);
  }
  for (const z of [-9, -6.5, -4, -1.5, 1.5, 4, 6.5, 9]) {
    const y = HE + (HR - HE) * (1 - Math.abs(z) / 10) + 0.28;
    b.box(M.steel, L + 1.5, 0.1, 0.16, 0, y, z);
  }
  b.box(M.red, L + 2, 0.16, 0.5, 0, HR + 0.28, 0);

  // ---------- крыша (часть листов «сорвана», как в Rust) ----------
  const sheetLen = rafL + 0.7;
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
    if (rng() < 0.16) continue;
    const x = -14 + i * 4;
    b.box(M.roof, 4.02, 0.05, sheetLen, x + rn(-0.03, 0.03), (HE + HR) / 2 + 0.38, s * (W / 4 + 0.15),
      { rx: s * rafA, rz: rn(-0.015, 0.015), tile: 4 });
  }

  // ---------- стены (зелёные панели, часть сломана) ----------
  for (let i = 0; i < 12; i++) {                         // задняя (z = -10), ворота справа
    const cx = -13.75 + i * 2.5; if (i >= 10) continue;
    const h = rn(3.0, 3.7);
    b.box(M.green, 2.45, h, 0.14, cx, h / 2, -10.0, { solid: true, tile: 2.5 });
  }
  for (let i = 0; i < 8; i++) {                          // правая (x = +15), проём посередине
    if (i === 4 || i === 5) continue;
    const cz = -8.75 + i * 2.5, h = rn(2.8, 3.6);
    b.box(M.green, 0.14, h, 2.45, 15.0, h / 2, cz, { solid: true, tile: 2.5 });
  }

  // ---------- офис с балконом + лестница ----------
  const OX0 = -14.6, OX1 = -6.9, OZ0 = -9.8, OZ1 = -3.9, OH = 2.76;
  b.box(M.green, OX1 - OX0 - 0.2, OH - 0.12, OZ1 - OZ0 - 0.2, (OX0 + OX1) / 2, (OH - 0.12) / 2, (OZ0 + OZ1) / 2, { tile: 2.5 });
  b.box(M.wood, OX1 - OX0, 0.12, OZ1 - OZ0, (OX0 + OX1) / 2, OH - 0.06, (OZ0 + OZ1) / 2, { tile: 2 });
  b.solidR(OX0, OX1, 0, OH, OZ0, OZ1);
  b.box(M.dark, 1.0, 2.0, 0.06, -8.3, 1.0, OZ1 - 0.06);                 // дверь
  b.box(M.glass, 1.5, 0.9, 0.06, -13.4, 1.6, OZ1 - 0.06);               // окна
  b.box(M.glass, 1.5, 0.9, 0.06, -10.6, 1.6, OZ1 - 0.06);
  b.box(M.wood, 1.7, 0.1, 0.12, -13.4, 1.1, OZ1 - 0.04); b.box(M.wood, 1.7, 0.1, 0.12, -10.6, 1.1, OZ1 - 0.04);
  b.box(M.sign, 2.6, 0.8, 0.05, -11.0, 2.35, OZ1 - 0.04 + 0.03, { tile: 2.6 });
  // перила балкона (с проходом у лестницы x∈[-12.5,-11.1])
  const RH = 1.0, ry0 = OH;
  const rail = (x0, x1, z0, z1) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.max(0.1, x1 - x0), d = Math.max(0.1, z1 - z0);
    b.box(M.wood, w, 0.07, d, cx, ry0 + 0.9, cz); b.box(M.wood, w, 0.07, d, cx, ry0 + 0.5, cz);
    b.solidR(cx - w / 2, cx + w / 2, ry0, ry0 + RH, cz - d / 2, cz + d / 2);
  };
  rail(OX0, -12.6, OZ1 - 0.05, OZ1); rail(-11.0, OX1, OZ1 - 0.05, OZ1);
  rail(OX0, OX1, OZ0, OZ0 + 0.05); rail(OX0, OX0 + 0.05, OZ0, OZ1); rail(OX1 - 0.05, OX1, OZ0, OZ1);
  for (let i = 0; i <= 6; i++) b.box(M.wood, 0.12, RH, 0.12, OX0 + 0.06 + i * ((OX1 - OX0 - 0.12) / 6), ry0 + RH / 2, OZ1 - 0.04);
  for (const x of [OX0 + 0.06, OX1 - 0.06]) b.box(M.wood, 0.12, RH, 0.12, x, ry0 + RH / 2, OZ0 + 0.06);
  // лестница: 5 ступеней по 0.552 м, идёт от земли к краю балкона (вдоль -Z)
  const stairsZ = (xc, wd, zEdge, dir, n, h, d, mat) => {
    for (let i = 0; i < n; i++) {
      const top = (i + 1) * h, len = (n - i) * d;
      const cz = zEdge + dir * len / 2;
      b.box(mat, wd, top, len, xc, top / 2, cz, { tile: 1.5, solid: true });
    }
  };
  stairsZ(-11.8, 1.4, OZ1, +1, 5, OH / 5, 0.55, M.wood);
  for (const x of [-12.55, -11.05]) b.box(M.wood, 0.08, 1.0, 0.08, x, 0.5 + 0.0, OZ1 + 2.75 - 0.04);

  // ---------- стеллажи ----------
  function crate(x, y, z, w, h, d, solid = true) {
    b.box(rng() < 0.3 ? M.crateD : M.crate, w, h, d, x, y + h / 2, z, { solid, tile: 1.1 });
  }
  function rackBay(cx, cz, tall = true) {
    const w = 3.0, d = 1.3;
    const levels = tall ? [0.3, 1.75, 3.2] : [0.3, 3.4];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.rackBlue, 0.1, 4.6, 0.1, cx + sx * (w / 2 - 0.05), 2.3, cz + sz * (d / 2 - 0.05));
    for (const y of levels) {
      for (const sz of [-1, 1]) b.box(M.rackOrange, w, 0.12, 0.08, cx, y, cz + sz * (d / 2 - 0.04));
      b.box(M.wood, w - 0.1, 0.05, d - 0.1, cx, y + 0.085, cz, { tile: 1.5 });
    }
    for (const [lvl, cnt] of (tall ? [[0.41, 3], [1.86, 3], [3.31, 2]] : [[0.41, 3], [3.51, 2]])) {
      for (let k = 0; k < cnt; k++) {
        if (lvl > 3 && rng() < 0.4) continue;
        const h = lvl > 3 ? rn(0.7, 0.95) : rn(1.0, 1.25);
        const x = cx + (k - (cnt - 1) / 2) * 0.98;
        crate(x, lvl, cz + rn(-0.04, 0.04), 0.92, h, 1.05);
      }
    }
  }
  for (const x of [-4.5, -1.5, 1.5, 4.5]) rackBay(x, -9.0);
  for (const x of [-3.5, -0.5, 2.5]) rackBay(x, -3.4, false);   // низкий ряд: верх нижнего яруса проходим
  // ступени из ящиков на низкий ряд стеллажей (верх ящиков ≈ 1.5 м, над головой пусто до 3.4 м)
  const stairsX = (xEdge, dir, zc, wd, n, h, d, mat) => {
    for (let i = 0; i < n; i++) {
      const top = (i + 1) * h, len = (n - i) * d;
      b.box(mat, len, top, wd, xEdge + dir * len / 2, top / 2, zc, { tile: 1.1, solid: true });
    }
  };
  stairsX(4.0, +1, -3.4, 1.3, 3, 0.5, 1.0, M.crateD);

  // ---------- поддоны ----------
  const palletParts = (x, y, z, ry) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    const put = (lx, ly, lz, w, h, d) => b.box(M.pallet, w, h, d, x + lx * c + lz * s, y + ly, z - lx * s + lz * c, { ry, tile: 1.2 });
    for (let i = 0; i < 5; i++) put(0, 0.135, -0.43 + i * 0.215, 1.2, 0.03, 0.14);
    for (const lz of [-0.42, 0, 0.42]) put(0, 0.075, lz, 1.2, 0.09, 0.1);
    for (let i = 0; i < 3; i++) put(-0.5 + i * 0.5, 0.015, 0, 0.14, 0.03, 1.0);
  };
  // высокая стопка поддонов (как на фото)
  for (let i = 0; i < 14; i++) palletParts(12 + rn(-0.04, 0.04), i * 0.15, -3 + rn(-0.04, 0.04), rn(-0.03, 0.03));
  b.solidR(11.4, 12.6, 0, 2.1, -3.5, -2.5);
  // одиночные поддоны на полу и с ящиками
  for (const [x, z, ry] of [[-6.5, 6.5, 0.2], [2, -0.5, 0], [-4.5, 3.0, Math.PI / 2]]) {
    palletParts(x, 0, z, 0); b.solidC(x, 0.075, z, 1.2, 0.15, 1.0, 0);
  }

  // ---------- кучи ящиков ----------
  function pile(cx, cz, nx, nz, levels) {
    for (let l = 0; l < levels; l++) {
      const ax = Math.max(1, nx - l), az = Math.max(1, nz - l);
      for (let i = 0; i < ax; i++) for (let k = 0; k < az; k++) {
        if (l > 0 && rng() < 0.15) continue;
        const sz = rn(0.92, 1.05);
        crate(cx + (i - (ax - 1) / 2) * 1.04 + rn(-0.02, 0.02), l * 1.0, cz + (k - (az - 1) / 2) * 1.04, sz, sz, sz);
      }
    }
  }
  pile(-8.0, -0.8, 2, 1, 2); pile(-9.5, 2.5, 1, 1, 1); pile(-12.5, 5.5, 2, 2, 2);
  pile(0.5, 2.0, 1, 1, 3); pile(3.5, 8.0, 2, 2, 2); pile(-3.5, 8.0, 2, 1, 1);
  pile(10.0, -6.5, 2, 2, 2); pile(13.0, 8.5, 1, 2, 1);

  // ---------- контейнеры (+ ступени из ящиков наверх) ----------
  b.box(M.contG, 6.0, 2.6, 2.4, 10.5, 1.3, 5.5, { solid: true, tile: 2.6 });
  stairsX(7.5, -1, 5.5, 1.4, 5, 0.52, 0.9, M.crate);
  b.box(M.contR, 6.0, 2.6, 2.4, -6.0, 1.3, 12.8, { solid: true, tile: 2.6 });
  stairsX(-3.0, +1, 12.8, 1.4, 5, 0.52, 0.9, M.crateD);
  for (const [cx, cz] of [[10.5, 5.5], [-6.0, 12.8]]) for (const s of [-1, 1]) b.box(M.steel, 0.12, 2.5, 0.08, cx + s * 3.0, 1.3, cz + 1.22);

  // ---------- погрузчик ----------
  {
    const fx = -2.0, fz = 3.0;
    b.box(M.fork, 1.2, 0.75, 2.0, fx, 0.62, fz, { solid: true });
    b.box(M.forkDark, 1.2, 0.8, 0.5, fx, 0.7, fz + 1.05);
    b.box(M.forkDark, 0.5, 0.15, 0.5, fx, 1.07, fz + 0.15);
    for (const sx of [-1, 1]) for (const sz of [-0.75, 0.75]) b.cyl(M.tire, 0.33, 0.33, 0.26, 12, fx + sx * 0.6, 0.33, fz + sz, { rz: Math.PI / 2 });
    for (const sx of [-1, 1]) for (const sz of [-0.2, 0.55]) b.box(M.forkDark, 0.07, 1.15, 0.07, fx + sx * 0.52, 1.6, fz + sz);
    b.box(M.fork, 1.18, 0.07, 0.95, fx, 2.2, fz + 0.18);
    b.solidR(fx - 0.59, fx + 0.59, 2.15, 2.25, fz - 0.3, fz + 0.66);
    for (const sx of [-1, 1]) b.box(M.forkDark, 0.09, 2.3, 0.1, fx + sx * 0.4, 1.35, fz - 1.15);
    b.box(M.forkDark, 0.9, 0.12, 0.1, fx, 2.2, fz - 1.15); b.box(M.forkDark, 0.9, 0.12, 0.1, fx, 0.9, fz - 1.15);
    b.solidR(fx - 0.45, fx + 0.45, 0, 2.4, fz - 1.22, fz - 1.08);
    for (const sx of [-1, 1]) b.box(M.forkDark, 0.12, 0.05, 1.1, fx + sx * 0.3, 0.1, fz - 1.75);
  }

  // ---------- бочки, шины ----------
  function barrel(x, z, mat) {
    b.cyl(mat, 0.29, 0.29, 0.88, 12, x, 0.44, z); b.cyl(M.dark, 0.3, 0.3, 0.04, 12, x, 0.86, z); b.cyl(M.dark, 0.3, 0.3, 0.04, 12, x, 0.44, z);
    b.solidC(x, 0.44, z, 0.5, 0.88, 0.5);
  }
  [[13.2, -7.5, M.bRed], [13.9, -7.0, M.bBlue], [13.4, -6.2, M.bYel], [12.6, -6.9, M.bRed], [14.0, -5.9, M.bGreen],
   [-13.5, 3.0, M.bBlue], [-13.0, 3.7, M.bRed], [-13.9, 3.9, M.bYel]].forEach(([x, z, m]) => barrel(x, z, m));
  for (let i = 0; i < 3; i++) b.torus(M.tire, 0.33, 0.13, -13.8, 0.13 + i * 0.26, 8.0, { rx: Math.PI / 2 });
  b.solidC(-13.8, 0.39, 8.0, 0.9, 0.78, 0.9);
  b.torus(M.tire, 0.33, 0.13, -12.7, 0.13, 8.4, { rx: Math.PI / 2 }); b.solidC(-12.7, 0.13, 8.4, 0.9, 0.26, 0.9);

  // ---------- заборы из гофры (передние углы) ----------
  function fence(x0, x1, z) {
    const n = Math.round((x1 - x0) / 3.2);
    for (let i = 0; i <= n; i++) b.box(M.wood, 0.2, 2.9, 0.2, x0 + i * (x1 - x0) / n, 1.45, z);
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * w;
      b.box(M.fence, w - 0.05, 1.3, 0.06, cx, 0.75, z + 0.12, { rz: rn(-0.02, 0.02), tile: 3 });
      b.box(M.fence, w - 0.05, 1.1, 0.06, cx, 2.0, z - 0.12, { rz: rn(-0.03, 0.03), tile: 3 });
      b.box(M.wood, w - 0.1, 0.12, 0.08, cx, 1.45, z + 0.18);
    }
    b.solidR(x0 - 0.1, x1 + 0.1, 0, 2.9, z - 0.2, z + 0.2);
  }
  fence(-14.5, -8.5, 10.7); fence(9.5, 14.5, 10.7);

  // ---------- ДОП. ДЕКОР: расставляется по свободным местам (проходы к лестницам не трогаем) ----------
  const reserved = [
    [-13.2, -10.2, -4.3, 1.4],   // подход к лестнице на балкон
    [1.0, 8.4, 3.8, 7.4],        // ступени на зелёный контейнер
    [-3.6, 2.4, 11.0, 14.8],     // ступени на красный контейнер
    [3.4, 8.6, -4.7, -2.1],      // ступени на низкий стеллаж
    [10.2, 15.5, -12, -6.5],     // задние ворота
    [12.5, 19, -0.5, 5.5],       // проём в правой стене
    [-6.2, 6.2, -9.8, -8.2],     // ряд стеллажей A
    [-5.2, 4.2, -4.1, -2.7],     // ряд стеллажей B
    [-7.0, 0.0, -6.9, -5.3],     // верстак
  ];
  const free = (w, d, m = 0.6) => {
    for (let t = 0; t < 80; t++) {
      const x = rn(-17, 17), z = rn(-13, 13);
      const x0 = x - w / 2 - m, x1 = x + w / 2 + m, z0 = z - d / 2 - m, z1 = z + d / 2 + m;
      if (b.solids.some((q) => q.minY > -1 && q.maxY > 0.05 && x1 > q.minX && x0 < q.maxX && z1 > q.minZ && z0 < q.maxZ)) continue;
      if (reserved.some((r) => x1 > r[0] && x0 < r[1] && z1 > r[2] && z0 < r[3])) continue;
      return [x, z];
    }
    return null;
  };
  // ещё кучи ящиков
  for (let i = 0; i < 12; i++) {
    const nx = 1 + Math.floor(rng() * 2), nz = 1 + Math.floor(rng() * 2), lv = 1 + Math.floor(rng() * 3);
    const p = free(nx * 1.1, nz * 1.1, 0.5); if (p) pile(p[0], p[1], nx, nz, lv);
  }
  // группы бочек
  for (let i = 0; i < 5; i++) {
    const p = free(1.6, 1.6, 0.4); if (!p) continue;
    const mats = [M.bRed, M.bBlue, M.bYel, M.bGreen];
    for (let k = 0, n = 3 + Math.floor(rng() * 3); k < n; k++) barrel(p[0] + (k % 2) * 0.62 + rn(-0.04, 0.04), p[1] + Math.floor(k / 2) * 0.62 + rn(-0.04, 0.04), mats[Math.floor(rng() * 4)]);
  }
  // кабельные катушки
  for (let i = 0; i < 3; i++) {
    const p = free(1.3, 1.0, 0.5); if (!p) continue;
    const [x, z] = p;
    for (const dx of [-0.38, 0.38]) b.cyl(M.wood, 0.62, 0.62, 0.07, 14, x + dx, 0.62, z, { rz: Math.PI / 2 });
    b.cyl(M.dark, 0.22, 0.22, 0.7, 10, x, 0.62, z, { rz: Math.PI / 2 }); b.cyl(M.steel, 0.5, 0.5, 0.66, 14, x, 0.62, z, { rz: Math.PI / 2 });
    b.solidC(x, 0.62, z, 0.95, 1.24, 1.24);
  }
  // мешки (пирамидка)
  const sack = std({ color: 0xb4a275, roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const p = free(1.6, 0.9, 0.4); if (!p) continue;
    for (let l = 0; l < 3; l++) for (let k = 0; k < 3 - l; k++) {
      const x = p[0] + (k - (2 - l) / 2) * 0.62, y = 0.13 + l * 0.26;
      b.box(sack, 0.6, 0.26, 0.4, x, y, p[1], { ry: rn(-0.08, 0.08) }); b.solidC(x, y, p[1], 0.6, 0.26, 0.4);
    }
  }
  // газовые баллоны и канистры
  for (let i = 0; i < 4; i++) {
    const p = free(1.0, 1.0, 0.3); if (!p) continue;
    for (let k = 0; k < 3; k++) { const x = p[0] + k * 0.3, z = p[1] + rn(-0.1, 0.1); b.cyl(M.bRed, 0.12, 0.12, 1.0, 10, x, 0.5, z); b.cyl(M.steel, 0.05, 0.05, 0.1, 6, x, 1.05, z); }
    b.solidC(p[0] + 0.3, 0.5, p[1], 0.84, 1.0, 0.3);
    b.box(M.bGreen, 0.35, 0.45, 0.16, p[0] + 1.0, 0.225, p[1] + 0.3, { ry: rn(-0.5, 0.5) });
  }
  // верстак у офиса
  b.box(M.wood, 2.2, 0.08, 0.9, -3.5, 0.9, -6.1, { tile: 1.5 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.steel, 0.08, 0.86, 0.08, -3.5 + sx * 1.02, 0.43, -6.1 + sz * 0.38);
  b.box(M.wood, 2.1, 0.06, 0.8, -3.5, 0.3, -6.1); b.box(M.bRed, 0.5, 0.26, 0.3, -3.0, 1.07, -6.1); b.box(M.steel, 0.2, 0.2, 0.14, -4.2, 1.04, -6.0);
  b.solidR(-4.6, -2.4, 0, 0.94, -6.55, -5.65);
  // стойки-ограничители с жёлто-чёрными полосами у задних ворот
  for (let i = 0; i < 5; i++) {
    const x = 11.0 + i * 0.9, z = -8.8;
    b.cyl(M.bYel, 0.09, 0.09, 1.0, 8, x, 0.5, z); b.cyl(M.dark, 0.095, 0.095, 0.14, 8, x, 0.62, z); b.cyl(M.dark, 0.095, 0.095, 0.14, 8, x, 0.9, z);
    b.solidC(x, 0.5, z, 0.18, 1.0, 0.18);
  }
  // цепи с крюками под фермами
  for (const [x, z] of [[-9, -2], [-3, -6], [3, 1.5], [9, -4], [9, 7]]) {
    b.box(M.dark, 0.04, 1.8, 0.04, x, 5.05, z); b.box(M.steel, 0.22, 0.05, 0.05, x, 4.12, z); b.box(M.steel, 0.05, 0.25, 0.05, x + 0.1, 3.98, z);
  }
  // упавшие листы кровли и мусор на полу (без коллизий — ниже шага)
  for (let i = 0; i < 4; i++) {
    const p = free(3, 1.5, 0.3); if (!p) continue;
    b.box(M.roof, 3.6, 0.04, 1.8, p[0], 0.06, p[1], { ry: rng() * TAU, rx: rn(-0.05, 0.05), rz: rn(-0.05, 0.05), tile: 3 });
  }
  for (let i = 0; i < 70; i++) {
    const x = rn(-17, 17), z = rn(-13, 13); const q = b.solids.some((s) => s.minY > -1 && s.maxY > 0.05 && x > s.minX - 0.1 && x < s.maxX + 0.1 && z > s.minZ - 0.1 && z < s.maxZ + 0.1);
    if (q) continue;
    const k = rng();
    if (k < 0.45) b.box(M.wood, rn(0.5, 1.4), 0.05, 0.1, x, 0.03, z, { ry: rng() * TAU, rz: rn(-0.08, 0.08) });
    else if (k < 0.8) b.box(M.crateD, rn(0.2, 0.45), 0.12, rn(0.2, 0.4), x, 0.06, z, { ry: rng() * TAU });
    else b.box(M.tire, rn(0.8, 1.6), 0.012, rn(0.6, 1.2), x, 0.008, z, { ry: rng() * TAU });
  }

  // ---------- лампы под крышей ----------
  const lampPos = [[-9, -5], [-3, 5], [3, -5], [9, 5], [3, 5], [-9, 5]];
  for (const [x, z] of lampPos) {
    b.box(M.dark, 0.02, 0.5, 0.02, x, 5.75, z);
    b.cyl(M.dark, 0.1, 0.38, 0.26, 10, x, 5.38, z); b.sphere(M.bulb, 0.09, x, 5.2, z);
  }

  // ---------- столб ЛЭП снаружи ----------
  b.box(M.wood, 0.32, 9.5, 0.32, -20.5, 4.75, -6, { tile: 2 });
  b.box(M.wood, 2.4, 0.16, 0.16, -20.5, 8.8, -6); b.box(M.wood, 2.0, 0.14, 0.14, -20.5, 7.9, -6);
  for (const dx of [-1.0, 0, 1.0]) b.cyl(M.glass, 0.05, 0.05, 0.16, 6, -20.5 + dx, 8.98, -6);

  // ---------- сорняки в трещинах плит ----------
  const gp = [], gc = [];
  for (let i = 0; i < 110; i++) {
    const x = rn(-18, 18), z = rn(-14, 14);
    if (b.solids.some((s) => s.maxY > 0.2 && x > s.minX - 0.4 && x < s.maxX + 0.4 && z > s.minZ - 0.4 && z < s.maxZ + 0.4)) continue;
    const n = 4 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const a = rng() * TAU, ox = x + Math.cos(a) * rn(0, 0.15), oz = z + Math.sin(a) * rn(0, 0.15);
      const h = rn(0.25, 0.6), wd = 0.05, lean = rn(0.05, 0.2), la = rng() * TAU;
      const tx = ox + Math.cos(la) * lean, tz = oz + Math.sin(la) * lean;
      const px = -Math.sin(a) * wd, pz = Math.cos(a) * wd;
      gp.push(ox - px, 0.02, oz - pz, ox + px, 0.02, oz + pz, tx, h, tz);
      const g1 = rn(0.25, 0.45);
      gc.push(0.08, 0.2, 0.05, 0.08, 0.2, 0.05, 0.3, g1 + 0.2, 0.1);
    }
  }
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  grassGeo.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
  grassGeo.computeVertexNormals();

  // ============================================================
  //  Сборка: слить боксы по материалам
  // ============================================================
  const group = new THREE.Group(); group.name = 'Warehouse';
  for (const [mat, geos] of b.parts) {
    const g = merge(geos, false);
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    geos.forEach((q) => q.dispose());
  }
  const grass = new THREE.Mesh(grassGeo, M.grass); grass.receiveShadow = true; group.add(grass);
  group.userData.isWarehouse = true;

  // ---------- необязательные лампы-светильники ----------
  const lights = [];
  if (opts.lightIntensity) {
    for (const [x, z] of [[-3, 3], [6, -3]]) {
      const l = new THREE.PointLight(0xffe2b0, opts.lightIntensity, 24, 2);
      l.position.set(x, 5.2, z); group.add(l); lights.push(l);
    }
  }

  // ---------- места для лута (локальные координаты, на верхах ящиков/балконе) ----------
  const lootSpots = [[-11, OH, -7], [-9, OH, -6], [-4.5, 1.9, -9], [1.5, 1.9, -9], [-1.5, 1.9, -3.4], [10.5, 2.6, 5.5], [-6, 2.6, 12.8], [12, 2.1, -3]]
    .map(([x, y, z]) => ({ x, y, z }));

  // ---------- API ----------
  const solids = b.solids;
  let t = 0;
  const api = {
    group, solids, lootSpots, size: { x: 38, z: 30 },
    update(dt) { t += dt; for (let i = 0; i < lights.length; i++) lights[i].intensity = opts.lightIntensity * (0.92 + 0.08 * Math.sin(t * (7 + i * 3) + i)); },
    // feet — позиция ног игрока (мир), модифицируется по x/z. Возвращает {grounded, ground (мировая высота)}
    resolveAll(feet, radius = 0.35, height = 1.8, step = 0.6, vy = 0) {
      const g = group, c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
      const dx = feet.x - g.position.x, dz = feet.z - g.position.z;
      if (Math.abs(dx) > 30 || Math.abs(dz) > 30) return { grounded: false, ground: null };
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const r = resolveBoxes(solids, lx, lz, feet.y - g.position.y, radius, height, step, vy);
      feet.x = g.position.x + r.x * c + r.z * s;
      feet.z = g.position.z - r.x * s + r.z * c;
      return { grounded: r.ground !== null, ground: r.ground === null ? null : r.ground + g.position.y };
    },
    // поставить склад на землю: плита ложится по самой высокой точке под ней
    place(x, z, getGroundHeight, yaw = 0) {
      let hi = -1e9, lo = 1e9;
      for (let i = -3; i <= 3; i++) for (let k = -3; k <= 3; k++) {
        const lx = i * 6, lz = k * 4.8;
        const h = getGroundHeight(x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
        hi = Math.max(hi, h); lo = Math.min(lo, h);
      }
      group.position.set(x, hi + 0.04, z); group.rotation.y = yaw;
      if (hi - lo > 1.2) console.warn(`[Warehouse] перепад земли ${(hi - lo).toFixed(2)} м — лучше выбрать место ровнее (края плиты будут высокими ступенями)`);
      return group.position.y;
    },
    showColliders(on = true) {
      if (!api._dbg) {
        const pos = [];
        for (const s of solids) {
          const P = [[s.minX, s.minY, s.minZ], [s.maxX, s.minY, s.minZ], [s.maxX, s.minY, s.maxZ], [s.minX, s.minY, s.maxZ],
                     [s.minX, s.maxY, s.minZ], [s.maxX, s.maxY, s.minZ], [s.maxX, s.maxY, s.maxZ], [s.minX, s.maxY, s.maxZ]];
          for (const [a, c] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]) pos.push(...P[a], ...P[c]);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        api._dbg = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x00ff66, depthTest: false }));
        api._dbg.renderOrder = 999; group.add(api._dbg);
      }
      api._dbg.visible = on;
    },
  };
  return api;
}