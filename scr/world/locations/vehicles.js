// scr/world/locations/vehicles.js — две точки-машины в стиле checkblock
import * as THREE from 'three';
import { createBarrel, createBreakableBarrel } from '../boch.js';
const H = Math.PI / 2, TAU = Math.PI * 2;
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let _rust;
function rustTex() {
  if (_rust) return _rust;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
  const blot = (n, col, r0, r1, am) => { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(${col},${Math.random() * am})`; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, r0 + Math.random() * (r1 - r0), 0, TAU); x.fill(); } };
  blot(30, '150,72,28', 14, 46, 0.38); blot(240, '120,60,24', 2, 16, 0.3); blot(160, '60,40,25', 3, 18, 0.12);
  for (let i = 0; i < 50; i++) { x.fillStyle = `rgba(110,55,20,${0.1 + Math.random() * 0.25})`; x.fillRect(Math.random() * 256, Math.random() * 200, 1 + Math.random() * 3, 15 + Math.random() * 60); }
  x.strokeStyle = 'rgba(255,255,255,.35)';
  for (let i = 0; i < 40; i++) { const a = Math.random() * 256, b = Math.random() * 256; x.beginPath(); x.moveTo(a, b); x.lineTo(a + Math.random() * 30 - 15, b + Math.random() * 30 - 15); x.stroke(); }
  _rust = new THREE.CanvasTexture(c); _rust.wrapS = _rust.wrapT = THREE.RepeatWrapping;
  if (THREE.SRGBColorSpace) _rust.colorSpace = THREE.SRGBColorSpace;
  return _rust;
}
const mk = (c, r = 0.7, m = 0.2, tex = true) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, map: tex ? rustTex() : null });
const glassMat = () => new THREE.MeshStandardMaterial({ color: 0x8fb2bb, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
const at = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
const bx = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r1, r2, h, m, seg = 16) => {
  if (!isFinite(r1) || r1 <= 0) r1 = 0.01;
  if (!isFinite(r2) || r2 <= 0) r2 = 0.01;
  if (!isFinite(h) || h <= 0) h = 0.01;
  if (!isFinite(seg) || seg < 3) seg = 8;
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
};
function rbox(w, h, d, r, m) {
  const bv = Math.min(r, d * 0.25, w * 0.25, h * 0.25), W = w - 2 * bv, Hh = h - 2 * bv, rr = Math.max(0.002, r - bv);
  const x = -W / 2, y = -Hh / 2, s = new THREE.Shape();
  s.moveTo(x + rr, y); s.lineTo(x + W - rr, y); s.quadraticCurveTo(x + W, y, x + W, y + rr);
  s.lineTo(x + W, y + Hh - rr); s.quadraticCurveTo(x + W, y + Hh, x + W - rr, y + Hh);
  s.lineTo(x + rr, y + Hh); s.quadraticCurveTo(x, y + Hh, x, y + Hh - rr);
  s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * bv, bevelEnabled: true, bevelSize: bv, bevelThickness: bv, bevelSegments: 2, curveSegments: 5 });
  g.translate(0, 0, -(d - 2 * bv) / 2); return new THREE.Mesh(g, m);
}
function extShape(s, t, m) {
  const bv = Math.min(0.01, t * 0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: t - 2 * bv, bevelEnabled: true, bevelSize: bv, bevelThickness: bv, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -(t - 2 * bv) / 2); g.rotateY(-H); return new THREE.Mesh(g, m);
}
function poly(pts, t, m, hole) {
  const s = new THREE.Shape(); pts.forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v))); s.closePath();
  if (hole) { const h = new THREE.Path(); hole.forEach(([u, v], i) => (i ? h.lineTo(u, v) : h.moveTo(u, v))); h.closePath(); s.holes.push(h); }
  return extShape(s, t, m);
}
function sidePanel(z0, z1, y0, y1, arches, t, m) {
  const s = new THREE.Shape(); s.moveTo(z0, y0);
  for (const [az, ar] of arches) { s.lineTo(az - ar, y0); s.absarc(az, y0, ar, Math.PI, 0, true); }
  s.lineTo(z1, y0); s.lineTo(z1, y1); s.lineTo(z0, y1); s.closePath(); return extShape(s, t, m);
}
const _up = new THREE.Vector3(0, 1, 0);
function strut(p, a, b, t, m) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), o = new THREE.Mesh(new THREE.BoxGeometry(t, d.length(), t), m);
  o.position.copy(A).add(B).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(_up, d.normalize()); p.add(o); return o;
}
function arch(len, r, m) {
  const g = new THREE.CylinderGeometry(r, r, len, 22, 1, true, 0, Math.PI); g.rotateZ(H);
  const mt = m.clone(); mt.side = THREE.DoubleSide; return new THREE.Mesh(g, mt);
}
function mud(rn, rad, col = 0x3a2c1e, op = 0.8) {
  const geo = new THREE.CircleGeometry(1, 28), p = geo.attributes.position;
  for (let i = 1; i < p.count; i++) { const k = rn(0.75, 1.1); p.setXY(i, p.getX(i) * k, p.getY(i) * k); }
  const o = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 1, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  o.rotation.x = -H; o.scale.set(rad, rad, 1); return o;
}
function makeRig() {
  const parts = {}, rig = {
    parts, names: [],
    hinge(name, parent, pos, axis, ang) {
      const g = new THREE.Group(); g.position.set(...pos); g.userData.part = name; parent.add(g);
      parts[name] = { g, axis, ang, cur: 0, target: 0 }; rig.names.push(name); return g;
    },
    open(n) { if (parts[n]) parts[n].target = 1; }, close(n) { if (parts[n]) parts[n].target = 0; },
    toggle(n) { const p = parts[n]; if (p) p.target = p.target ? 0 : 1; },
    isOpen(n) { return !!parts[n] && parts[n].target === 1; },
    update(dt) {
      for (const p of Object.values(parts)) {
        if (p.cur === p.target) continue;
        p.cur += (p.target - p.cur) * Math.min(1, dt * 7);
        if (Math.abs(p.target - p.cur) < 0.002) p.cur = p.target;
        p.g.rotation[p.axis] = p.cur * p.ang;
      }
    },
    partOf(o) { while (o) { if (o.userData && o.userData.part) return o.userData.part; o = o.parent; } return null; },
  };
  return rig;
}
const bb = (x0, y0, z0, x1, y1, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
function attachCollision(rig, group, statics, dyn) {
  const inv = new THREE.Matrix4(), mw = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Vector3();
  let dbg = null, sig = '';
  const all = () => (dyn ? statics.concat(dyn()) : statics);
  rig.boxes = statics; rig.getBoxes = all;
  rig.resolve = (pos, radius = 0.35, height = 1.8, stepUp = 0.6) => {
    group.updateWorldMatrix(true, false); mw.copy(group.matrixWorld); inv.copy(mw).invert();
    p.copy(pos).applyMatrix4(inv);
    const boxes = all(); let support = null;
    for (let it = 0; it < 3; it++) {
      support = null;
      for (const b of boxes) {
        const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
        const dx = p.x - Math.min(Math.max(p.x, x0), x1), dz = p.z - Math.min(Math.max(p.z, z0), z1), d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (y1 <= p.y + stepUp) { if (support === null || y1 > support) support = y1; }
        else if (p.y + height > y0 && p.y < y1) {
          if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (radius - d) / d; p.x += dx * k; p.z += dz * k; }
          else {
            const l = p.x - x0, r = x1 - p.x, f = p.z - z0, k2 = z1 - p.z, m = Math.min(l, r, f, k2);
            if (m === l) p.x = x0 - radius; else if (m === r) p.x = x1 + radius; else if (m === f) p.z = z0 - radius; else p.z = z1 + radius;
          }
        }
      }
    }
    let ground = null, grounded = false;
    if (support !== null) { if (p.y < support) p.y = support; grounded = p.y - support < 0.03; q.set(p.x, support, p.z).applyMatrix4(mw); ground = q.y; }
    pos.copy(p.applyMatrix4(mw)); return { ground, grounded };
  };
  const refresh = () => {
    if (!dbg || !dbg.visible) return;
    const bs = all(), sg = JSON.stringify(bs); if (sg === sig) return; sig = sg;
    while (dbg.children.length) { const c = dbg.children.pop(); c.geometry.dispose(); }
    const lm = new THREE.LineBasicMaterial({ color: 0x00ff66, depthTest: false });
    for (const b of bs) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])), lm);
      l.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2); l.renderOrder = 999; dbg.add(l);
    }
  };
  rig.showColliders = (on = true) => { if (!dbg) { dbg = new THREE.Group(); group.add(dbg); } dbg.visible = on; sig = ''; refresh(); };
  const base = rig.update; rig.update = (dt) => { base(dt); refresh(); };
}
const _wg = {}; let _wm;
function wheel(r, w, flat) {
  if (!isFinite(r) || r <= 0) r = 0.33;
  if (!isFinite(w) || w <= 0) w = 0.2;
  _wm = _wm || { tire: mk(0x1b1b1c, 0.95, 0, false), steel: mk(0x6f7478, 0.5, 0.6), dark: mk(0x101112, 0.8, 0.3, false) };
  const key = r + '_' + w;
  if (!_wg[key]) _wg[key] = new THREE.LatheGeometry([[0.62, -0.5], [0.9, -0.5], [0.98, -0.38], [1, -0.25], [1, 0.25], [0.98, 0.38], [0.9, 0.5], [0.62, 0.5]].map(([a, b]) => new THREE.Vector2(a * r, b * w)), 30);
  const g = new THREE.Group(), tg = new THREE.Group(), rim = new THREE.Group(); g.add(tg, rim);
  const tire = new THREE.Mesh(_wg[key], _wm.tire); tire.rotation.z = H; tg.add(tire);
  const n = Math.round(r * 44), tr = new THREE.InstancedMesh(new THREE.BoxGeometry(w * 0.72, 0.035 + r * 0.04, r * 0.17), _wm.tire, n), d = new THREE.Object3D();
  for (let i = 0; i < n; i++) { const a = i / n * TAU; d.position.set(0, Math.cos(a) * (r + 0.004), Math.sin(a) * (r + 0.004)); d.rotation.set(a, 0, 0); d.updateMatrix(); tr.setMatrixAt(i, d.matrix); }
  tr.frustumCulled = false; tg.add(tr);
  at(rim, cyl(r * 0.6, r * 0.6, w * 0.7, _wm.steel, 24), 0, 0, 0).rotation.z = H;
  at(rim, cyl(r * 0.2, r * 0.2, 0.05, _wm.steel, 14), w * 0.4, 0, 0).rotation.z = H;
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; at(rim, cyl(r * 0.07, r * 0.07, 0.02, _wm.dark, 10), w * 0.36, Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4).rotation.z = H; }
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + 0.2; at(rim, cyl(0.017, 0.017, 0.03, _wm.dark, 6), w * 0.42, Math.cos(a) * r * 0.28, Math.sin(a) * r * 0.28).rotation.z = H; }
  if (flat) { tg.scale.set(1, 0.72, 1.12); rim.position.y = -r * 0.05; }
  return g;
}
function hub(r) {
  const g = new THREE.Group(), disc = mk(0x6a4a34, 0.6, 0.7), dk = mk(0x2a2b2d, 0.6, 0.6, false);
  at(g, cyl(r * 0.62, r * 0.62, 0.035, disc, 24), 0, 0, 0).rotation.z = H;
  at(g, cyl(r * 0.2, r * 0.2, 0.1, dk, 12), 0.04, 0, 0).rotation.z = H;
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; at(g, cyl(0.014, 0.014, 0.07, dk, 6), 0.05, Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3).rotation.z = H; }
  at(g, rbox(0.06, r * 0.5, 0.1, 0.01, mk(0x7a3a22, 0.6, 0.5)), -0.03, r * 0.35, 0);
  return g;
}
const BARREL_COLORS = [0xa8321f, 0x2f5f8f, 0xb89a26, 0x3f6a3a, 0x6b6e70];
function toolbox(rig, name, parent, x, y, z, yaw) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; parent.add(g);
  const red = mk(0xb0261f, 0.45, 0.4), dark = mk(0x1f2123, 0.5, 0.6, false), steel = mk(0x9aa0a4, 0.35, 0.85, false), chrome = mk(0xc4c8cc, 0.3, 0.8, false);
  at(g, rbox(0.56, 0.24, 0.3, 0.02, red), 0, 0.12, 0);
  at(g, rbox(0.52, 0.04, 0.02, 0.004, red), 0, 0.26, 0.14); at(g, rbox(0.52, 0.04, 0.02, 0.004, red), 0, 0.26, -0.14);
  at(g, rbox(0.02, 0.04, 0.26, 0.004, red), 0.27, 0.26, 0); at(g, rbox(0.02, 0.04, 0.26, 0.004, red), -0.27, 0.26, 0);
  at(g, bx(0.5, 0.01, 0.26, dark), 0, 0.243, 0);
  at(g, rbox(0.3, 0.012, 0.035, 0.004, steel), -0.05, 0.255, 0.04).rotation.y = 0.15;
  at(g, cyl(0.02, 0.02, 0.012, steel, 10), -0.2, 0.255, 0.05);
  at(g, cyl(0.012, 0.012, 0.2, mk(0x8a5a2a, 0.8, 0, false), 8), 0.12, 0.256, -0.04).rotation.z = H;
  at(g, rbox(0.07, 0.05, 0.05, 0.008, steel), 0.24, 0.265, -0.04);
  for (const s of [-1, 1]) at(g, rbox(0.05, 0.07, 0.025, 0.006, chrome), s * 0.18, 0.2, 0.155);
  const lid = rig.hinge(name, g, [0, 0.28, -0.15], 'x', -1.3);
  at(lid, rbox(0.56, 0.05, 0.3, 0.02, red), 0, 0.0, 0.15);
  at(lid, new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), dark), 0, 0.03, 0.15);
  at(lid, rbox(0.12, 0.012, 0.06, 0.004, mk(0xe8e0c8, 0.7, 0, false)), 0.15, 0.027, 0.2);
  return g;
}
function pcb(w, h, rn) {
  const g = new THREE.Group(), gold = mk(0xc9a227, 0.35, 0.9, false), blk = mk(0x111214, 0.5, 0.3, false), cap = mk(0x2a4a8a, 0.5, 0.3, false);
  at(g, rbox(w, h, 0.012, 0.003, mk(0x1f6b3a, 0.5, 0.2, false)), 0, 0, 0);
  for (let i = 0; i < 7; i++) at(g, rbox(rn(0.03, 0.09), rn(0.03, 0.07), 0.012, 0.002, blk), rn(-w / 2 + 0.06, w / 2 - 0.06), rn(-h / 2 + 0.05, h / 2 - 0.05), 0.012);
  for (let i = 0; i < 12; i++) { const t = at(g, bx(rn(0.05, 0.16), 0.004, 0.002, gold), rn(-w / 2 + 0.08, w / 2 - 0.08), rn(-h / 2 + 0.04, h / 2 - 0.04), 0.0066); t.rotation.z = R2(rn) ? H : 0; }
  for (let i = 0; i < 4; i++) at(g, cyl(0.012, 0.012, 0.03, cap, 8), rn(-w / 2 + 0.05, w / 2 - 0.05), rn(-h / 2 + 0.04, h / 2 - 0.04), 0.02).rotation.x = H;
  for (let i = 0; i < 8; i++) at(g, bx(0.012, 0.018, 0.004, gold), -w / 2 + 0.04 + i * (w - 0.08) / 7, -h / 2 + 0.014, 0.008);
  return g;
}
const R2 = (rn) => rn(0, 1) < 0.5;
function crate(rn) {
  const g = new THREE.Group(), wood = mk(0x7a5a38, 0.9), band = mk(0x2a2c2e, 0.5, 0.7), dk = mk(0x3b2a18, 0.9, 0, false);
  at(g, rbox(0.72, 0.42, 0.52, 0.01, wood), 0, 0.21, 0);
  for (const y of [0.1, 0.2, 0.3]) { at(g, bx(0.73, 0.008, 0.53, dk), 0, y, 0); }
  for (const s of [-1, 1]) at(g, rbox(0.05, 0.44, 0.54, 0.008, band), s * 0.24, 0.21, 0);
  at(g, rbox(0.76, 0.04, 0.56, 0.01, wood), 0, 0.44, 0);
  at(g, rbox(0.1, 0.07, 0.03, 0.006, mk(0xd9a524, 0.35, 0.8, false)), 0, 0.36, 0.265);
  at(g, new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 10, Math.PI), band), -0.34, 0.3, 0).rotation.y = H;
  g.rotation.y = rn(-0.15, 0.15); return g;
}
function jerrycan(col) {
  const g = new THREE.Group(), m = mk(col, 0.6, 0.3), dk = mk(0x1c1d1f, 0.6, 0.3, false);
  at(g, rbox(0.34, 0.44, 0.15, 0.025, m), 0, 0.22, 0);
  at(g, rbox(0.12, 0.05, 0.1, 0.01, m), -0.07, 0.46, 0); at(g, cyl(0.025, 0.025, 0.07, dk, 8), 0.1, 0.5, 0);
  for (const a of [0.9, -0.9]) at(g, bx(0.4, 0.012, 0.01, mk(0x000000, 0.8, 0, false)), 0, 0.22, 0.078).rotation.z = a;
  return g;
}
function lampAt(p, x, y, z, rad, mat, facing = 1) {
  at(p, cyl(rad * 1.05, rad * 0.85, 0.06, mk(0x2a2b2d, 0.5, 0.6, false), 20), x, y, z - facing * 0.02).rotation.x = H;
  at(p, cyl(rad * 0.9, rad * 0.9, 0.02, mat, 20), x, y, z + facing * 0.03).rotation.x = H;
  at(p, new THREE.Mesh(new THREE.TorusGeometry(rad, rad * 0.12, 8, 24), mk(0xb8bcc0, 0.3, 0.85, false)), x, y, z + facing * 0.035);
}

// ✅ НОВАЯ ФУНКЦИЯ: создание хитбоксов сидений для любой машины
function createSeatHitboxes(group, seatDefs) {
  const seats = seatDefs.map(s => ({ ...s, occupied: null }));
  const seatHitboxes = [];
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  for (const s of seats) {
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.7), hitMat);
    hb.position.copy(s.pos);
    hb.userData.seatId = s.id;
    hb.userData.isBuggySeat = true;
    hb.userData.vehicleGroup = group;
    group.add(hb);
    seatHitboxes.push(hb);
    // Добавляем в коллайдеры для raycast
  }
  return {
    seats,
    seatHitboxes,
    getSeat(id) { return seats.find(s => s.id === id) || null; },
    getSeatTransform(id) {
      const s = seats.find(x => x.id === id);
      if (!s) return null;
      group.updateWorldMatrix(true, false);
      const world = s.pos.clone();
      group.localToWorld(world);
      return { position: world, yaw: s.yaw };
    },
    sit(id, riderId) {
      const s = seats.find(x => x.id === id);
      if (s && !s.occupied) { s.occupied = riderId; return s; }
      return null;
    },
    standUp(id) {
      const s = seats.find(x => x.id === id);
      if (s) s.occupied = null;
    }
  };
}

/* ============================================================ ГРУЗОВИК ============================================================ */
export function createTruck(opts = {}) {
  const seed = opts.seed ?? (Math.random() * 1e9 | 0), R = rng(seed), rn = (a, b) => a + R() * (b - a);
  const group = new THREE.Group(), rig = makeRig();
  const col = opts.color ?? [0x55623e, 0xa8601f, 0x4f6575][R() * 3 | 0];
  const paint = mk(col, 0.55, 0.35), dark = mk(0x1d1f21, 0.7, 0.5), steel = mk(0x6b6f72, 0.5, 0.6), trim = mk(0x17181a, 0.8, 0.2, false), glass = glassMat(), chrome = mk(0xb8bcc0, 0.3, 0.85, false);
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a8, emissiveIntensity: 0.12, roughness: 0.2 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0xff8a00, emissiveIntensity: 0.3 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a1410, emissive: 0x500806, emissiveIntensity: 0.4 });
  if (opts.pad !== false) { const p = mud(rn, 6.5, 0x4a3b2a, 0.5); p.position.y = 0.003; group.add(p); }
  for (const s of [-1, 1]) {
    at(group, rbox(0.15, 0.22, 7.0, 0.02, dark), s * 0.75, 1.0, -0.1);
    at(group, cyl(0.3, 0.3, 1.3, mk(0x6a5a40, 0.6, 0.5), 18), s * 0.95, 0.85, 0.5).rotation.x = H;
    at(group, rbox(0.12, 0.06, 1.3, 0.01, steel), s * 0.95, 1.12, 0.5);
  }
  for (const z of [2.0, 0.3, -1.6, -3.0]) at(group, rbox(1.6, 0.1, 0.1, 0.01, dark), 0, 1.0, z);
  for (const z of [2.5, -1.2, -2.5]) {
    at(group, cyl(0.075, 0.075, 2.1, dark, 12), 0, 0.55, z).rotation.z = H;
    at(group, new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), mk(0x2a2b2d, 0.6, 0.6)), 0, 0.55, z);
    for (const s of [-1, 1]) at(group, rbox(0.1, 0.05, 1.0, 0.01, steel), s * 0.75, 0.9, z);
  }
  const addWheel = (x, z, flip) => { const w = wheel(0.55, 0.32, false); w.position.set(x, 0.55, z); if (flip) w.rotation.y = Math.PI; group.add(w); };
  for (const s of [-1, 1]) { addWheel(s * 1.0, 2.5, s < 0); for (const z of [-1.2, -2.5]) { addWheel(s * 1.2, z, s < 0); addWheel(s * 0.84, z, s < 0); } }
  { const sp = wheel(0.55, 0.32, false); sp.rotation.y = H; sp.position.set(0, 0.75, -3.35); group.add(sp); }
  at(group, rbox(2.2, 0.1, 1.5, 0.02, trim), 0, 1.32, 1.55);
  at(group, rbox(2.2, 1.7, 0.1, 0.03, paint), 0, 2.15, 0.85);
  at(group, rbox(2.34, 0.1, 1.7, 0.04, paint), 0, 3.03, 1.55);
  at(group, rbox(2.34, 0.06, 0.4, 0.02, paint), 0, 3.03, 2.5);
  at(group, rbox(2.2, 0.86, 0.1, 0.03, paint), 0, 1.8, 2.3);
  for (const s of [-1, 1]) {
    const gl = at(group, bx(1.0, 0.7, 0.03, glass), s * 0.55, 2.6, 2.3); gl.rotation.x = -0.14;
    for (const z of [0.86, 2.3]) at(group, rbox(0.1, 1.7, 0.1, 0.02, paint), s * 1.1, 2.15, z);
    at(group, rbox(0.12, 0.12, 1.5, 0.02, paint), s * 1.1, 1.36, 1.55); at(group, rbox(0.1, 0.1, 1.5, 0.02, paint), s * 1.1, 2.99, 1.55);
    at(group, rbox(0.3, 0.05, 0.45, 0.01, steel), s * 1.22, 1.0, 1.55); at(group, rbox(0.3, 0.05, 0.45, 0.01, steel), s * 1.22, 0.62, 1.55);
    for (let i = 0; i < 3; i++) at(group, new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), amber), s * 0.75 + (i - 1) * 0.0, 3.0, 2.72).position.x = s * (0.15 + i * 0.4);
  }
  at(group, rbox(0.1, 0.72, 0.1, 0.02, paint), 0, 2.6, 2.3);
  const seat = (x) => {
    at(group, rbox(0.7, 0.2, 0.6, 0.05, mk(0x4a3f33, 0.9, 0)), x, 1.55, 1.45);
    const b = at(group, rbox(0.66, 0.85, 0.2, 0.06, mk(0x4a3f33, 0.9, 0)), x, 2.0, 1.1); b.rotation.x = -0.12;
    at(group, rbox(0.3, 0.2, 0.12, 0.04, mk(0x3d342b, 0.9, 0)), x, 2.55, 1.0);
  };
  seat(-0.5); seat(0.5);
  at(group, rbox(2.0, 0.34, 0.4, 0.04, trim), 0, 2.05, 2.1);
  for (const [x, r] of [[-0.62, 0.07], [-0.4, 0.05], [-0.8, 0.05]]) at(group, cyl(r, r, 0.03, mk(0x0b0c0d, 0.4, 0.3, false), 14), x, 2.2, 1.9).rotation.x = -H;
  const col1 = at(group, cyl(0.03, 0.03, 0.45, dark, 8), -0.5, 1.9, 1.95); col1.rotation.x = -0.8;
  const sw = new THREE.Group(); sw.position.set(-0.5, 2.1, 1.75); sw.rotation.x = 0.85; group.add(sw);
  sw.add(new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 28), trim));
  at(sw, bx(0.46, 0.03, 0.03, trim)); at(sw, bx(0.03, 0.24, 0.03, trim), 0, -0.12, 0);
  at(group, cyl(0.015, 0.015, 0.4, steel, 6), 0, 1.58, 1.8).rotation.x = 0.3; at(group, new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), trim), 0, 1.78, 1.72);
  for (const x of [-0.12, 0.12]) at(group, bx(0.07, 0.07, 0.07, mk(0xdddddd, 0.5, 0, false)), x, 2.62, 2.15);
  at(group, bx(0.01, 0.2, 0.01, trim), -0.12, 2.72, 2.15); at(group, bx(0.01, 0.2, 0.01, trim), 0.12, 2.72, 2.15);
  const cabDoor = (name, sx) => {
    const h = rig.hinge(name, group, [sx * 1.1, 2.15, 2.25], 'y', -sx * 1.25);
    at(h, rbox(0.07, 0.78, 1.3, 0.02, paint), 0, -0.41, -0.65);
    at(h, rbox(0.07, 0.07, 1.3, 0.015, paint), 0, 0.78, -0.65);
    for (const z of [-0.04, -1.26]) at(h, rbox(0.07, 0.85, 0.07, 0.015, paint), 0, 0.36, z);
    at(h, bx(0.015, 0.72, 1.16, glass), 0, 0.4, -0.65);
    at(h, rbox(0.02, 0.7, 1.2, 0.01, mk(0x2e2a26, 0.9, 0, false)), -sx * 0.045, -0.42, -0.65);
    at(h, rbox(0.06, 0.05, 0.22, 0.015, chrome), sx * 0.06, -0.12, -1.08);
    at(h, cyl(0.012, 0.012, 0.3, steel, 6), sx * 0.2, 0.45, -0.06).rotation.z = H;
    at(h, rbox(0.06, 0.42, 0.2, 0.02, trim), sx * 0.4, 0.42, -0.06);
  };
  cabDoor('doorL', -1); cabDoor('doorR', 1);
  for (const s of [-1, 1]) {
    at(group, arch(0.5, 0.68, paint), s * 1.0, 0.55, 2.5);
    at(group, rbox(0.5, 0.06, 1.1, 0.02, paint), s * 1.0, 1.25, 3.0);
    at(group, rbox(0.06, 0.5, 1.1, 0.02, paint), s * 0.93, 1.5, 2.85);
    for (const z of [-1.2, -2.5]) at(group, arch(0.9, 0.7, paint), s * 1.02, 0.55, z);
    at(group, rbox(0.3, 0.45, 0.04, 0.01, trim), s * 1.2, 0.5, -3.0);
    lampAt(group, s * 0.72, 1.35, 3.46, 0.13, lamp);
    at(group, rbox(0.14, 0.1, 0.05, 0.01, amber), s * 0.98, 1.35, 3.47);
    at(group, rbox(0.2, 0.12, 0.05, 0.01, tail), s * 1.05, 1.35, -3.77);
  }
  at(group, rbox(2.0, 0.5, 0.25, 0.03, trim), 0, 1.35, 3.35);
  at(group, rbox(2.3, 0.26, 0.32, 0.04, mk(0x4a4c4e, 0.6, 0.5)), 0, 0.92, 3.5);
  for (const s of [-1, 1]) at(group, new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12), steel), s * 0.8, 0.92, 3.68);
  at(group, rbox(0.45, 0.12, 0.02, 0.01, mk(0xe8d98a, 0.7, 0, false)), 0, 0.92, -3.78);
  const hood = rig.hinge('hood', group, [0, 2.25, 2.37], 'x', -1.05);
  at(hood, rbox(1.9, 0.07, 1.05, 0.03, paint), 0, 0, 0.525);
  at(hood, rbox(0.8, 0.04, 0.9, 0.02, paint), 0, 0.045, 0.5);
  at(hood, rbox(1.9, 0.7, 0.07, 0.03, paint), 0, -0.35, 1.04);
  for (let i = 0; i < 7; i++) at(hood, rbox(1.6, 0.035, 0.03, 0.01, trim), 0, -0.12 - i * 0.08, 1.085);
  at(hood, rbox(0.34, 0.12, 0.02, 0.01, mk(0xd9a524, 0.35, 0.8, false)), 0, -0.1, 1.09);
  for (const s of [-1, 1]) at(hood, rbox(0.05, 0.5, 1.0, 0.015, paint), s * 0.93, -0.25, 0.5);
  at(hood, rbox(1.6, 0.04, 0.05, 0.01, dark), 0, -0.04, 0.4);
  const eng = mk(0x3a3d40, 0.7, 0.6);
  at(group, rbox(0.9, 0.6, 0.85, 0.04, eng), 0, 1.75, 2.85);
  for (const s of [-1, 1]) at(group, rbox(0.3, 0.1, 0.8, 0.02, mk(0x7a2a1c, 0.6, 0.4)), s * 0.24, 2.1, 2.85);
  at(group, cyl(0.17, 0.17, 0.5, mk(0x5a5e50, 0.7, 0.4), 18), 0.58, 2.0, 2.7);
  at(group, cyl(0.1, 0.1, 0.35, dark, 12), 0.35, 2.2, 3.1).rotation.z = H;
  at(group, rbox(1.5, 0.85, 0.08, 0.02, dark), 0, 1.8, 3.28);
  for (let i = 0; i < 13; i++) at(group, bx(0.012, 0.8, 0.05, steel), -0.7 + i * 0.117, 1.8, 3.24);
  for (let k = 0; k < 5; k++) at(group, bx(0.03, 0.55, 0.012, dark), 0, 1.8, 3.2).rotation.z = k / 5 * Math.PI;
  at(group, rbox(0.4, 0.26, 0.26, 0.02, mk(0x2b2f33, 0.6, 0.3)), -0.62, 1.6, 2.55);
  for (const [x, c] of [[-0.74, 0xaa1a1a], [-0.5, 0x222222]]) at(group, cyl(0.025, 0.025, 0.05, mk(c, 0.5, 0.3, false), 8), x, 1.76, 2.55);
  for (const [x, y, z, rz] of [[0.2, 1.95, 3.15, 0], [-0.3, 2.0, 3.12, 1]]) { const hs = at(group, new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 16, Math.PI), mk(0x151617, 0.9, 0, false)), x, y, z); hs.rotation.z = rz ? Math.PI : 0; }
  at(group, cyl(0.12, 0.12, 0.04, steel, 14), -0.3, 1.9, 2.4).rotation.x = H;
  at(group, rbox(2.3, 0.1, 4.4, 0.02, dark), 0, 1.2, -1.5);
  for (const s of [-1, 1]) {
    at(group, rbox(0.1, 0.15, 4.4, 0.02, dark), s * 0.7, 1.1, -1.5);
    at(group, rbox(0.1, 0.95, 4.4, 0.02, paint), s * 1.15, 1.725, -1.5);
    at(group, rbox(0.18, 0.07, 4.4, 0.02, steel), s * 1.15, 2.2, -1.5);
    for (let i = 0; i < 6; i++) at(group, rbox(0.14, 0.95, 0.08, 0.02, mk(col, 0.6, 0.4)), s * 1.2, 1.725, -3.5 + i * 0.85);
  }
  at(group, rbox(2.4, 1.5, 0.1, 0.03, paint), 0, 2.0, 0.7);
  for (let i = 0; i < 3; i++) at(group, rbox(2.3, 0.1, 0.14, 0.02, mk(col, 0.6, 0.4)), 0, 1.5 + i * 0.5, 0.78);
  const gate = rig.hinge('tailgate', group, [0, 1.3, -3.72], 'x', -1.45);
  at(gate, rbox(2.3, 0.9, 0.07, 0.02, paint), 0, 0.45, 0);
  for (const x of [-0.7, 0, 0.7]) at(gate, rbox(0.08, 0.88, 0.09, 0.02, mk(col, 0.6, 0.4)), x, 0.45, 0.03);
  at(gate, rbox(2.34, 0.06, 0.1, 0.02, steel), 0, 0.9, 0);
  const cols = BARREL_COLORS.slice().sort(() => R() - 0.5);
  const b1 = createBreakableBarrel(cols[0]);
  b1.position.set(-0.72, 1.25, -0.35);
  b1.rotation.y = rn(0, Math.PI * 2);
  group.add(b1);
  const b2 = createBreakableBarrel(cols[1]);
  b2.position.set(0.15, 1.25, -0.5);
  b2.rotation.y = rn(0, Math.PI * 2);
  group.add(b2);
  const b3 = createBreakableBarrel(cols[2]);
  b3.position.y = -0.44;
  const lay3 = new THREE.Group(); lay3.add(b3); lay3.rotation.z = Math.PI / 2; lay3.position.y = 0.29;
  const h3 = new THREE.Group(); h3.add(lay3); h3.rotation.y = rn(-0.2, 0.2); h3.position.set(0.05, 1.25, -1.6);
  group.add(h3);
  const b4 = createBreakableBarrel(cols[3]);
  b4.position.y = -0.44;
  const lay4 = new THREE.Group(); lay4.add(b4); lay4.rotation.z = Math.PI / 2; lay4.position.y = 0.29;
  const h4 = new THREE.Group(); h4.add(lay4); h4.rotation.y = Math.PI / 2 + rn(-0.15, 0.15); h4.position.set(0.74, 1.25, -2.25);
  group.add(h4);
  // ✅ УБРАНО: инструментальные ящики (toolbox0, toolbox1) в кузове грузовика —
  //    пользователь счёл их декорацией. Теперь кузов пустой.
  // ✅ УБРАНО: jerrycan (канистры) на баке грузовика — тоже декорация.
  // for (const [i, z] of [[0, 0.45], [1, 0.0]]) { const j = jerrycan(i ? 0xa8321f : 0x6a7a45); j.position.set(-1.25, 0.95, z - 0.2); j.rotation.y = H; j.scale.setScalar(0.9); group.add(j); }
  at(group, rbox(0.06, 0.06, 0.5, 0.01, steel), -1.2, 0.93, 0.0);
  at(group, cyl(0.07, 0.07, 1.8, mk(0x5a4a3e, 0.5, 0.7), 12), 1.28, 2.2, 0.62);
  at(group, cyl(0.09, 0.07, 0.08, steel, 12), 1.28, 3.12, 0.62);
  at(group, new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12), steel), 1.28, 1.85, 0.62).rotation.x = H;
  at(group, cyl(0.008, 0.004, 1.4, trim, 5), -1.05, 3.5, 0.9).rotation.z = 0.12;
  at(group, rbox(0.25, 0.04, 0.35, 0.01, steel), 0, 3.12, 1.1);
  const head = (on) => { lamp.emissiveIntensity = on ? 2.2 : 0.12; tail.emissiveIntensity = on ? 1.2 : 0.4; };
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const tops = [
    { kind: 'bed', x: 0, z: -1.5, hx: 1.06, hz: 2.1, y: 1.25 },
    { kind: 'roof', x: 0, z: 1.55, hx: 1.1, hz: 0.8, y: 3.08 }
  ];
  const solids = [
    { x: 0, z: 0.5, hx: 0.95, hz: 3.5, bottom: 0.3, top: 1.05 },
    { x: 0, z: 1.55, hx: 1.12, hz: 0.82, bottom: 1.3, top: 3.08 },
    { x: -1.15, z: -1.5, hx: 0.09, hz: 2.2, bottom: 1.25, top: 2.25 },
    { x: 1.15, z: -1.5, hx: 0.09, hz: 2.2, bottom: 1.25, top: 2.25 },
    { x: 0, z: 0.7, hx: 1.15, hz: 0.09, bottom: 1.25, top: 2.75 },
    { x: 0, z: -3.72, hx: 1.15, hz: 0.08, bottom: 1.25, top: 2.2, requireClosed: 'tailgate' }
  ];

  // ✅ НОВОЕ: хитбоксы сидений для грузовика
  const seatData = createSeatHitboxes(group, [
    { id: 'driver', pos: new THREE.Vector3(-0.5, 1.75, 1.45), yaw: 0, isDriver: true },
    { id: 'passenger', pos: new THREE.Vector3(0.5, 1.75, 1.45), yaw: 0, isDriver: false },
  ]);

  // ✅ НОВОЕ: attachCollision с реальными AABB-боксами из массива solids.
  //    Раньше у грузовика были определены solids/tops, но main.js их НЕ использовал —
  //    player.js проверял коллизию как «точка + радиус 1.5м», и грузовик ощущался
  //    как один большой куб (нельзя было подойти вплотную, нельзя было залезть).
  //    Теперь rig получает метод resolve(pos, radius, height, stepUp) — proper AABB
  //    с проверкой Y-диапазона и step-up. main.js вызывает его в animate loop.
  const statics = solids.map(s => bb(
    s.x - s.hx, s.bottom, s.z - s.hz,
    s.x + s.hx, s.top,   s.z + s.hz
  ));
  attachCollision(rig, group, statics);

  return Object.assign(rig, seatData, {
    group, seed, colliders: [-3, -1.5, 0, 1.5, 3].map((z) => ({ x: 0, z, r: 1.3 })),
    tops, solids, isTruck: true,
    setHeadlights: head,
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      if (group.parent) group.parent.remove(group);
    },
  });
}

/* ============================================================ СЛОМАННАЯ ЛЕГКОВУШКА ============================================================ */
export function createWreckCar(opts = {}) {
  const seed = opts.seed ?? (Math.random() * 1e9 | 0), R = rng(seed), rn = (a, b) => a + R() * (b - a);
  const group = new THREE.Group(), shell = new THREE.Group(), rig = makeRig(); group.add(shell);
  const col = opts.color ?? [0x4b6f86, 0x7a2f2a, 0x5f6b4a, 0x8a8a80][R() * 4 | 0];
  const paint = mk(col, 0.5, 0.4), trim = mk(0x17181a, 0.7, 0.3, false), steel = mk(0x6b6f72, 0.5, 0.6), chrome = mk(0xaeb2b6, 0.3, 0.85), glass = glassMat();
  const seatM = mk(0x6a5846, 0.9, 0), dark = mk(0x202224, 0.7, 0.5);
  const lamp = new THREE.MeshStandardMaterial({ color: 0xe9e2c0, emissive: 0xffe9a8, emissiveIntensity: 0.1, roughness: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a1410, emissive: 0x500806, emissiveIntensity: 0.3 });
  const miss = opts.missing ?? ['FL', 'FR', 'RL', 'RR'][R() * 4 | 0];
  if (opts.pad !== false) { const p = mud(rn, 4.2, 0x4a3b2a, 0.5); p.position.y = 0.003; group.add(p); const o = mud(rn, 0.7, 0x120e0a, 0.75); o.position.set(rn(-0.5, 0.5), 0.006, rn(-1, 1)); group.add(o); }
  const WX = 0.78, WZ = 1.55, WR = 0.33, corners = { FL: [-1, 1], FR: [1, 1], RL: [-1, -1], RR: [1, -1] };
  for (const [k, [sx, sz]] of Object.entries(corners)) {
    if (k === miss) continue;
    const w = wheel(WR, 0.2, true); w.position.set(sx * WX, WR * 0.72, sz * WZ); if (sx < 0) w.rotation.y = Math.PI; group.add(w);
  }
  const [msx, msz] = corners[miss]; shell.position.y = -0.07; shell.rotation.z = -msx * 0.05; shell.rotation.x = msz * 0.028;
  const hb = hub(WR); hb.position.set(msx * WX, WR - 0.06, msz * WZ); if (msx < 0) hb.rotation.y = Math.PI; shell.add(hb);
  at(shell, rbox(1.5, 0.16, 4.4, 0.02, trim), 0, 0.3, 0);
  for (const z of [WZ, -WZ]) at(shell, cyl(0.05, 0.05, 1.5, dark, 10), 0, WR, z).rotation.z = H;
  at(shell, cyl(0.06, 0.06, 3.2, mk(0x5a4a3e, 0.5, 0.6), 10), 0.3, 0.22, -0.2).rotation.x = H;
  at(shell, rbox(0.7, 0.12, 0.45, 0.02, mk(0x4a4c4e, 0.6, 0.5)), -0.4, 0.2, -1.6);
  at(shell, rbox(1.64, 0.05, 2.2, 0.01, mk(0x3a342c, 0.95, 0)), 0, 0.42, 0);
  at(shell, rbox(1.6, 0.05, 1.35, 0.01, dark), 0, 0.38, 1.72);
  at(shell, rbox(1.6, 0.05, 1.35, 0.01, mk(0x3a3a38, 0.9, 0.2)), 0, 0.5, -1.72);
  for (const s of [-1, 1]) {
    at(shell, sidePanel(1.05, 2.4, 0.33, 0.98, [[WZ, 0.4]], 0.05, paint), s * 0.86, 0, 0);
    at(shell, sidePanel(-2.4, -1.05, 0.33, 0.98, [[-WZ, 0.4]], 0.05, paint), s * 0.86, 0, 0);
    at(shell, rbox(0.12, 0.14, 2.1, 0.02, mk(0x5a3a28, 0.7, 0.4)), s * 0.84, 0.4, 0);
    strut(shell, [s * 0.82, 0.98, 1.05], [s * 0.78, 1.5, 0.57], 0.07, paint);
    strut(shell, [s * 0.82, 0.98, -1.05], [s * 0.78, 1.5, -0.65], 0.07, paint);
    at(shell, rbox(0.06, 0.5, 0.07, 0.01, paint), s * 0.85, 1.22, 0.035);
    at(shell, rbox(0.06, 0.05, 1.25, 0.01, paint), s * 0.79, 1.5, -0.04);
  }
  at(shell, rbox(1.62, 0.05, 1.25, 0.02, paint), 0, 1.52, -0.04);
  at(shell, bx(1.5, 0.01, 1.1, mk(0x6a6150, 0.95, 0, false)), 0, 1.49, -0.04);
  const ws = at(shell, bx(1.55, 0.68, 0.012, glass), 0, 1.24, 0.81); ws.rotation.x = -0.785;
  const rw = at(shell, bx(1.5, 0.61, 0.012, glass), 0, 1.24, -0.86); rw.rotation.x = 0.72;
  { const cp = [], cx = 0.35, cy = 0, pts = []; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, L = rn(0.15, 0.5); pts.push(new THREE.Vector3(cx, cy, 0), new THREE.Vector3(cx + Math.cos(a) * L, cy + Math.sin(a) * L * 0.8, 0)); }
    const cr = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1a2428, transparent: true, opacity: 0.7 })); cr.position.z = 0.008; ws.add(cr); }
  at(shell, rbox(1.7, 0.5, 0.08, 0.03, paint), 0, 0.7, 2.4);
  at(shell, rbox(1.0, 0.22, 0.03, 0.01, trim), 0, 0.72, 2.45);
  for (let i = 0; i < 4; i++) at(shell, bx(0.98, 0.012, 0.02, chrome), 0, 0.64 + i * 0.05, 2.47);
  lampAt(shell, 0.62, 0.78, 2.45, 0.1, lamp);
  at(shell, cyl(0.1, 0.1, 0.05, trim, 14), -0.62, 0.78, 2.45).rotation.x = H;
  for (let i = 0; i < 4; i++) at(shell, new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.06, 4), glass), -0.62 + rn(-0.07, 0.07), 0.78 + rn(-0.07, 0.07), 2.5).rotation.x = H;
  at(shell, rbox(1.85, 0.16, 0.14, 0.03, mk(0x8a8f92, 0.4, 0.7)), 0, 0.4, 2.46).rotation.z = 0.02;
  at(shell, rbox(1.7, 0.5, 0.06, 0.03, paint), 0, 0.7, -2.4);
  for (const s of [-1, 1]) at(shell, rbox(0.28, 0.15, 0.04, 0.01, tail), s * 0.65, 0.82, -2.44);
  at(shell, bx(0.42, 0.12, 0.01, mk(0xe0d48a, 0.7, 0, false)), 0, 0.62, -2.44);
  const rb = at(shell, rbox(1.85, 0.16, 0.14, 0.03, mk(0x8a8f92, 0.4, 0.7)), 0, 0.4, -2.46); rb.rotation.set(0.0, 0.0, -0.07); rb.position.y = 0.36;
  const hood = rig.hinge('hood', shell, [0, 0.98, 1.05], 'x', -1.15);
  at(hood, rbox(1.7, 0.05, 1.35, 0.02, paint), 0, 0, 0.675); at(hood, rbox(0.6, 0.03, 1.2, 0.015, paint), 0, 0.035, 0.65);
  at(hood, rbox(1.5, 0.02, 1.15, 0.01, trim), 0, -0.04, 0.65);
  at(shell, rbox(1.62, 0.55, 0.05, 0.01, dark), 0, 0.72, 1.1);
  const p1 = pcb(0.5, 0.32, rn); p1.position.set(-0.35, 0.8, 1.14); p1.rotation.set(0, 0.1, 0.05); shell.add(p1);
  const p2 = pcb(0.42, 0.28, rn); p2.position.set(0.38, 0.72, 1.14); p2.rotation.set(0, -0.12, -0.08); shell.add(p2);
  const p3 = pcb(0.36, 0.24, rn); p3.position.set(0.1, 0.62, 1.6); p3.rotation.set(-1.1, 0.4, 0.3); shell.add(p3);
  at(shell, rbox(0.7, 0.45, 0.6, 0.03, mk(0x3a3d40, 0.7, 0.6)), 0, 0.62, 1.75);
  at(shell, rbox(0.55, 0.08, 0.5, 0.02, mk(0x7a2a1c, 0.6, 0.4)), 0, 0.9, 1.75);
  at(shell, cyl(0.08, 0.08, 0.55, mk(0x5a5e50, 0.7, 0.4), 12), 0, 0.98, 1.75).rotation.z = H;
  at(shell, rbox(0.28, 0.2, 0.18, 0.02, mk(0x2b2f33, 0.6, 0.3)), -0.58, 0.58, 1.5);
  for (const [x, c] of [[-0.66, 0xaa1a1a], [-0.5, 0x222222]]) at(shell, cyl(0.02, 0.02, 0.04, mk(c, 0.5, 0.3, false), 8), x, 0.7, 1.5);
  at(shell, rbox(1.3, 0.5, 0.06, 0.02, dark), 0, 0.65, 2.28);
  for (let i = 0; i < 10; i++) at(shell, bx(0.012, 0.46, 0.04, steel), -0.58 + i * 0.129, 0.65, 2.25);
  at(shell, new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 18, Math.PI * 1.4), mk(0x151617, 0.9, 0, false)), 0.35, 0.8, 2.1);
  { const cv = new THREE.CatmullRomCurve3([[-0.5, 0.7, 1.52], [-0.35, 0.95, 1.7], [-0.1, 0.85, 1.9], [0.4, 0.9, 1.4]].map((q) => new THREE.Vector3(...q)));
    at(shell, new THREE.Mesh(new THREE.TubeGeometry(cv, 20, 0.008, 6), mk(0xb02a1f, 0.7, 0, false))); }
  const trunk = rig.hinge('trunk', shell, [0, 0.98, -1.05], 'x', 1.15);
  at(trunk, rbox(1.7, 0.05, 1.3, 0.02, paint), 0, 0, -0.65); at(trunk, rbox(1.5, 0.02, 1.1, 0.01, trim), 0, -0.04, -0.65);
  at(trunk, rbox(0.3, 0.05, 0.04, 0.01, chrome), 0, 0.03, -1.22);
  at(shell, rbox(1.6, 0.4, 0.05, 0.01, dark), 0, 0.78, -1.02);
  // ✅ УБРАНО: ящик (crate) в багажнике легковушки — был декорацией.
  at(shell, rbox(0.3, 0.05, 0.08, 0.01, steel), -0.5, 0.55, -2.1).rotation.y = 0.5;
  const doorDefs = [['doorFL', -1, 1.05, 0], ['doorFR', 1, 1.05, 0], ['doorRL', -1, 0.03, 1], ['doorRR', 1, 0.03, 1]];
  for (const [name, sx, hz, rear] of doorDefs) {
    const h = rig.hinge(name, shell, [sx * 0.86, 0, hz], 'y', -sx * (rear ? 1.0 : 1.2));
    const outer = rear ? [[0, 0.45], [-1.07, 0.45], [-1.07, 1.0], [-0.65, 1.46], [0, 1.46]] : [[0, 0.45], [-1.0, 0.45], [-1.0, 1.46], [-0.48, 1.46], [0, 0.98]];
    const hole = rear ? [[-0.07, 1.02], [-0.98, 1.02], [-0.62, 1.4], [-0.07, 1.4]] : [[-0.08, 1.02], [-0.94, 1.02], [-0.94, 1.4], [-0.52, 1.4]];
    at(h, poly(outer, 0.06, paint, hole));
    if (R() > 0.3) at(h, poly(hole, 0.012, glass));
    const len = rear ? 1.05 : 0.97;
    at(h, rbox(0.03, 0.46, len, 0.01, mk(0x4a4034, 0.9, 0, false)), -sx * 0.045, 0.72, -len / 2);
    at(h, rbox(0.04, 0.035, 0.14, 0.01, chrome), sx * 0.045, 0.98, -len + 0.15);
    if (!rear) { at(h, rbox(0.04, 0.04, 0.12, 0.01, steel), sx * 0.06, 1.03, -0.06); at(h, rbox(0.05, 0.14, 0.1, 0.015, trim), sx * 0.12, 1.08, -0.06); }
  }
  for (const x of [-0.42, 0.42]) {
    at(shell, rbox(0.5, 0.15, 0.52, 0.04, seatM), x, 0.57, 0.35);
    at(shell, rbox(0.5, 0.6, 0.12, 0.04, seatM), x, 0.92, 0.08).rotation.x = -0.2;
    at(shell, rbox(0.24, 0.18, 0.08, 0.03, seatM), x, 1.28, 0.0);
  }
  at(shell, rbox(1.3, 0.15, 0.55, 0.04, seatM), 0, 0.57, -0.55);
  at(shell, rbox(1.45, 0.55, 0.1, 0.04, seatM), 0, 0.92, -0.86).rotation.x = -0.15;
  at(shell, rbox(1.64, 0.28, 0.32, 0.04, trim), 0, 0.88, 0.85);
  at(shell, cyl(0.07, 0.07, 0.03, mk(0x0b0c0d, 0.4, 0.3, false), 14), -0.42, 1.0, 0.7).rotation.x = -H;
  at(shell, rbox(0.2, 0.2, 0.4, 0.03, trim), 0, 0.58, 0.3);
  at(shell, cyl(0.012, 0.012, 0.25, steel, 6), 0, 0.78, 0.3).rotation.x = 0.3;
  at(shell, cyl(0.02, 0.02, 0.4, dark, 8), -0.42, 0.95, 0.68).rotation.x = -0.9;
  const sw = new THREE.Group(); sw.position.set(-0.42, 1.08, 0.52); sw.rotation.x = 0.5; shell.add(sw);
  sw.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 24), trim)); at(sw, bx(0.32, 0.025, 0.025, trim)); at(sw, bx(0.025, 0.17, 0.025, trim), 0, -0.085, 0);
  at(shell, rbox(0.18, 0.05, 0.03, 0.01, trim), 0, 1.44, 0.6);
  const head = (on) => { lamp.emissiveIntensity = on ? 2 : 0.1; tail.emissiveIntensity = on ? 1.2 : 0.3; };
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const tops = [
    { kind: 'roof', x: 0, z: -0.04, hx: 0.75, hz: 0.62, y: 1.55 },
  ];
  const solids = [
    { x: 0, z: 0, hx: 0.86, hz: 2.4, bottom: 0.3, top: 1.0 },
  ];

  // ✅ НОВОЕ: хитбоксы сидений для легковушки
  const seatData = createSeatHitboxes(group, [
    { id: 'driver', pos: new THREE.Vector3(-0.42, 0.95, 0.35), yaw: 0, isDriver: true },
    { id: 'passenger', pos: new THREE.Vector3(0.42, 0.95, 0.35), yaw: 0, isDriver: false },
  ]);

  // ✅ НОВОЕ: attachCollision с реальными AABB из массива solids (как в createTruck).
  //    Даёт rig.resolve(pos, radius, height, stepUp) для proper AABB-коллизии
  //    с проверкой Y-диапазона и step-up — можно подойти вплотную и залезть.
  //    shell — это дочерняя группа с повёрнутым/наклонённым кузовом легковушки,
  //    но solids заданы в координатах shell (как и остальные at(shell, ...)).
  //    Поэтому attachCollision вызывается для shell, не для group.
  const statics = solids.map(s => bb(
    s.x - s.hx, s.bottom, s.z - s.hz,
    s.x + s.hx, s.top,   s.z + s.hz
  ));
  attachCollision(rig, shell, statics);

  return Object.assign(rig, seatData, {
    group, seed, missingWheel: miss, colliders: [-1.5, 0, 1.5].map((z) => ({ x: 0, z, r: 1.0 })),
    tops, solids, isTruck: false,
    setHeadlights: head, dispose() { group.traverse((o) => { o.geometry && o.geometry.dispose(); }); group.parent && group.parent.remove(group); },
  });
}

export const kit = {
  rbox, at, bx, cyl, mk, glassMat, poly, extShape, strut, arch, mud,
  rustTex, rng, makeRig, attachCollision, bb,
  BARREL_COLORS, toolbox, crate, jerrycan, lampAt, pcb, wheel, H, TAU
};
