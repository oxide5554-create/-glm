// scr/world/terrain.js — Ландшафт v2
import * as THREE from 'three';
import { createSeededRandom, WORLD_SEED } from './seededRandom.js';

const TAU = Math.PI * 2;

export function getGroundHeight(x, z) {
  const base = Math.sin(x * 0.05) * 0.3 + Math.cos(z * 0.07) * 0.3;
  const hills = Math.sin(x * 0.02 + z * 0.03) * 0.8 + Math.cos(x * 0.015 - z * 0.025) * 0.6;
  const medium = Math.sin(x * 0.08) * Math.cos(z * 0.06) * 0.35;
  const detail = Math.sin(x * 0.25 + z * 0.15) * 0.08 + Math.cos(x * 0.18 - z * 0.22) * 0.06;
  return base + hills + medium + detail;
}

function hash2(x, z) { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function h3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vn(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  return mix(mix(mix(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), mix(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
    mix(mix(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), mix(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}
function fbm(x, y, z, o = 4) { let a = 0.5, f = 1, s = 0; for (let i = 0; i < o; i++) { s += a * vn(x * f, y * f, z * f); f *= 2.03; a *= 0.5; } return s / (1 - Math.pow(0.5, o)); }

const mkTex = (c, rep) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (rep) t.repeat.set(rep[0], rep[1]); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; return t; };
const cnv = (W, H, draw) => { const c = document.createElement('canvas'); c.width = W; c.height = H; draw(c.getContext('2d'), W, H); return c; };
function wrapAt(W, H, x, y, m, cb) { for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) { const X = x + dx, Y = y + dy; if (X > -m && X < W + m && Y > -m && Y < H + m) cb(X, Y); } }
const rr = (a, b) => a + Math.random() * (b - a);

function grassGroundCanvas() {
  return cnv(512, 512, (x, S) => {
    x.fillStyle = '#3f6a2e'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 150; i++) { const px = rr(0, S), py = rr(0, S), r = rr(14, 60), dark = Math.random() < 0.5; wrapAt(S, S, px, py, r, (X, Y) => { const g = x.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, dark ? 'rgba(20,50,18,.30)' : 'rgba(130,160,60,.24)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(X, Y, r, 0, TAU); x.fill(); }); }
    for (let i = 0; i < 3200; i++) { const px = rr(0, S), py = rr(0, S), h = rr(5, 15), lean = rr(-4, 4); x.strokeStyle = `rgba(${30 + Math.random() * 70 | 0},${80 + Math.random() * 90 | 0},${15 + Math.random() * 40 | 0},${0.25 + Math.random() * 0.4})`; x.lineWidth = 0.8 + Math.random() * 1.3; wrapAt(S, S, px, py, 20, (X, Y) => { x.beginPath(); x.moveTo(X, Y); x.lineTo(X + lean, Y - h); x.stroke(); }); }
    for (let i = 0; i < 130; i++) { const px = rr(0, S), py = rr(0, S); x.fillStyle = `rgba(${60 + Math.random() * 40 | 0},${120 + Math.random() * 50 | 0},50,.7)`; wrapAt(S, S, px, py, 8, (X, Y) => { for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(X + Math.cos(k * 2.1) * 3, Y + Math.sin(k * 2.1) * 3, 2.6, 0, TAU); x.fill(); } }); }
    for (let i = 0; i < 100; i++) { const px = rr(0, S), py = rr(0, S); x.fillStyle = `rgba(${110 + Math.random() * 40 | 0},${80 + Math.random() * 30 | 0},40,.7)`; wrapAt(S, S, px, py, 8, (X, Y) => { x.beginPath(); x.ellipse(X, Y, rr(2, 5), rr(1, 2.5), rr(0, 3), 0, TAU); x.fill(); }); }
    for (let i = 0; i < 45; i++) { const px = rr(0, S), py = rr(0, S); x.fillStyle = Math.random() < 0.5 ? 'rgba(240,240,230,.85)' : 'rgba(230,200,70,.85)'; wrapAt(S, S, px, py, 4, (X, Y) => { x.beginPath(); x.arc(X, Y, 1.5, 0, TAU); x.fill(); }); }
  });
}

function dirtCanvas(withRuts) {
  return cnv(512, 512, (x, S) => {
    x.fillStyle = '#6b4e35'; x.fillRect(0, 0, S, S);
    const img = x.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 38; img.data[i] += n; img.data[i + 1] += n * 0.8; img.data[i + 2] += n * 0.6; }
    x.putImageData(img, 0, 0);
    for (let i = 0; i < 90; i++) { const px = rr(0, S), py = rr(0, S), r = rr(14, 55), dark = Math.random() < 0.55; wrapAt(S, S, px, py, r, (X, Y) => { const g = x.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, dark ? 'rgba(45,30,18,.38)' : 'rgba(150,118,84,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(X, Y, r, 0, TAU); x.fill(); }); }
    if (withRuts) { for (const u of [0.27, 0.73]) { const cx = u * S; const g = x.createLinearGradient(cx - 34, 0, cx + 34, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(40,26,15,.62)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx - 34, 0, 68, S); } x.fillStyle = 'rgba(78,100,44,.28)'; x.fillRect(S * 0.43, 0, S * 0.14, S); for (let i = 0; i < 160; i++) { x.strokeStyle = `rgba(${70 + Math.random() * 40 | 0},${110 + Math.random() * 50 | 0},45,.55)`; x.lineWidth = 1; const px = S * rr(0.42, 0.58), py = rr(0, S); x.beginPath(); x.moveTo(px, py); x.lineTo(px + rr(-3, 3), py - rr(5, 10)); x.stroke(); } }
    for (let i = 0; i < 320; i++) { const px = rr(0, S), py = rr(0, S), r = rr(1, 4); x.fillStyle = Math.random() < 0.5 ? 'rgba(138,128,112,.8)' : 'rgba(78,62,46,.85)'; wrapAt(S, S, px, py, 5, (X, Y) => { x.beginPath(); x.ellipse(X, Y, r, r * 0.75, rr(0, 3), 0, TAU); x.fill(); x.fillStyle = 'rgba(210,200,180,.35)'; x.beginPath(); x.arc(X - r * 0.3, Y - r * 0.3, r * 0.35, 0, TAU); x.fill(); x.fillStyle = Math.random() < 0.5 ? 'rgba(138,128,112,.8)' : 'rgba(78,62,46,.85)'; }); }
    for (let i = 0; i < 40; i++) { x.strokeStyle = 'rgba(30,20,12,.4)'; x.lineWidth = 1; const px = rr(0, S), py = rr(0, S); x.beginPath(); x.moveTo(px, py); x.lineTo(px + rr(-30, 30), py + rr(-30, 30)); x.stroke(); }
  });
}

function rockCanvas(mode) {
  const pal = mode === 'cliff' ? ['#8d8a85', '#7b7166', '#6c6258', '#9a948a', '#5f5a54', '#867660', '#a09585'] : ['#85837e', '#77726a', '#8f8a80', '#6a665e'];
  return cnv(512, 512, (x, S) => {
    x.fillStyle = pal[0]; x.fillRect(0, 0, S, S);
    if (mode === 'cliff') { let y = 0; while (y < S) { const h = rr(8, 34); x.fillStyle = pal[Math.floor(Math.random() * pal.length)]; x.fillRect(0, y, S, h); const g = x.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,.1)'); g.addColorStop(1, 'rgba(0,0,0,.18)'); x.fillStyle = g; x.fillRect(0, y, S, h); y += h; } }
    else for (let i = 0; i < 160; i++) { const px = rr(0, S), py = rr(0, S), r = rr(12, 50); wrapAt(S, S, px, py, r, (X, Y) => { x.fillStyle = pal[Math.floor(Math.random() * pal.length)] + '66'; x.beginPath(); x.arc(X, Y, r, 0, TAU); x.fill(); }); }
    const img = x.getImageData(0, 0, S, S); for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 34; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; } x.putImageData(img, 0, 0);
    for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(20,16,12,${0.25 + Math.random() * 0.35})`; x.lineWidth = rr(0.7, 2.4); let px = rr(0, S), py = rr(0, S); x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += rr(-14, 14); py += rr(8, 30) * (mode === 'cliff' ? 1 : rr(-1, 1)); x.lineTo(px, py); } x.stroke(); }
    for (let i = 0; i < 60; i++) { const px = rr(0, S), py = rr(0, S), r = rr(4, 16); wrapAt(S, S, px, py, r, (X, Y) => { x.fillStyle = Math.random() < 0.65 ? `rgba(110,130,60,${0.25 + Math.random() * 0.3})` : `rgba(200,150,60,${0.25 + Math.random() * 0.25})`; x.beginPath(); x.ellipse(X, Y, r, r * rr(0.5, 1), rr(0, 3), 0, TAU); x.fill(); }); }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(30,24,18,${0.08 + Math.random() * 0.12})`; x.fillRect(rr(0, S), rr(0, S * 0.7), rr(1, 4), rr(40, 180)); }
  });
}

let _T;
function T() {
  if (_T) return _T;
  const cliff = rockCanvas('cliff'), boulder = rockCanvas('boulder');
  _T = { grass: mkTex(grassGroundCanvas()), dirt: mkTex(dirtCanvas(false)), road: mkTex(dirtCanvas(true)), rock: mkTex(rockCanvas('cliff')), cliff: mkTex(cliff), cliffBump: mkTex(cliff), boulder: mkTex(boulder), boulderBump: mkTex(boulder) };
  return _T;
}

let _curve = null, roadPoints = [], roadDense = [];
function roadCurve() {
  if (_curve) return _curve;
  const points = [], segments = 60, baseRadius = 180;
  for (let i = 0; i < segments; i++) { const a = (i / segments) * TAU; const r = baseRadius + Math.sin(a * 3) * 18 + Math.cos(a * 5) * 9 + Math.sin(a * 7) * 4; points.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  _curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);
  roadPoints = _curve.getSpacedPoints(140); roadDense = _curve.getSpacedPoints(700);
  return _curve;
}

export function isOnRoad(x, z, margin = 5) {
  roadCurve(); const m2 = margin * margin;
  for (let i = 0; i < roadPoints.length; i++) { const p = roadPoints[i], dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz < m2) return true; }
  return false;
}
function roadDist2(x, z) { let m = 1e9; for (let i = 0; i < roadDense.length; i++) { const p = roadDense[i], dx = p.x - x, dz = p.z - z, d = dx * dx + dz * dz; if (d < m) m = d; } return m; }

export function generateTerrain(scene) {
  roadCurve();
  const SIZE = 800, SEG = 300;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG), gp = geo.attributes.position, bw = new Float32Array(gp.count * 3);
  for (let i = 0; i < gp.count; i++) {
    const wx = gp.getX(i), wz = -gp.getY(i), h = getGroundHeight(wx, wz);
    gp.setZ(i, h);
    const slope = Math.abs(h - getGroundHeight(wx + 0.5, wz)) + Math.abs(h - getGroundHeight(wx, wz + 0.5));
    const rockW = smooth(0.25, 0.65, slope);
    const roadW = 1 - smooth(1.7, 4.8, Math.sqrt(roadDist2(wx, wz)));
    const dirtT = Math.min(1, smooth(1.2, 3.0, h) + smooth(-1.0, -2.2, -h) + (hash2(wx * 0.3, wz * 0.3) - 0.5) * 0.12 + roadW * 1.25);
    const rem = 1 - rockW * (1 - roadW * 0.7);
    bw[i * 3] = Math.max(0, rem * (1 - dirtT)); bw[i * 3 + 1] = Math.max(0, rem * dirtT); bw[i * 3 + 2] = rockW * (1 - roadW * 0.7);
  }
  geo.setAttribute('blendW', new THREE.BufferAttribute(bw, 3)); geo.computeVertexNormals();
  const t = T(), mat = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uG = { value: t.grass }; sh.uniforms.uD = { value: t.dirt }; sh.uniforms.uR = { value: t.rock };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 blendW;\nvarying vec3 vBW;\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBW = blendW; vWP = (modelMatrix * vec4(position,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vBW; varying vec3 vWP; varying vec3 vWN;
      uniform sampler2D uG; uniform sampler2D uD; uniform sampler2D uR;
      float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vno(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 uv = vWP.xz * 0.16;
        vec3 g = mix(texture2D(uG, uv).rgb, texture2D(uG, uv * 3.7 + vec2(0.31, 0.17)).rgb, 0.38);
        vec3 d = mix(texture2D(uD, uv * 1.1).rgb, texture2D(uD, uv * 4.3).rgb, 0.3);
        vec3 n = pow(abs(normalize(vWN)), vec3(4.0)); n /= (n.x + n.y + n.z);
        vec3 r = texture2D(uR, vWP.zy * 0.12).rgb * n.x + texture2D(uR, vWP.xy * 0.12).rgb * n.z + texture2D(uR, vWP.xz * 0.12).rgb * n.y;
        float m1 = vno(vWP.xz * 0.06), m2 = vno(vWP.xz * 0.23 + 7.0);
        g *= mix(0.78, 1.2, m1);
        g = mix(g, g * vec3(1.18, 1.04, 0.62), smoothstep(0.62, 0.9, vno(vWP.xz * 0.035 + 3.0)));
        d *= mix(0.85, 1.15, m2);
        float ws = vBW.r + vBW.g + vBW.b + 1e-4;
        diffuseColor.rgb = (g * vBW.r + d * vBW.g + r * vBW.b) / ws;
      }`);
  };
  mat.customProgramCacheKey = () => 'terrain-v2';
  const ground = new THREE.Mesh(geo, mat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.name = 'Ground'; scene.add(ground);
  return ground;
}

export function generateRoad(scene) {
  const group = new THREE.Group(); group.name = 'Road';
  const curve = roadCurve(), t = T();
  const N = 900, M = 11, spaced = curve.getSpacedPoints(N), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), len = curve.getLength(), vRep = len / 5;
  const pos = [], uvs = [], col = [], idx = [], rows = [];
  for (let i = 0; i <= N; i++) {
    const p = spaced[i], tg = curve.getTangentAt(Math.min(1, i / N)); side.crossVectors(up, tg).normalize();
    const wv = 3.5 + (fbm(i * 0.05, 1.3, 0) - 0.5) * 1.6, cx = (fbm(i * 0.03, 7, 3) - 0.5) * 0.8;
    rows.push({ x: p.x + side.x * cx, z: p.z + side.z * cx, sx: side.x, sz: side.z, w: wv, tx: tg.x, tz: tg.z });
    for (let k = 0; k < M; k++) {
      const u = k / (M - 1), lat = (u - 0.5) * wv + cx, x = p.x + side.x * lat, z = p.z + side.z * lat;
      const rut = 0.05 * (Math.exp(-Math.pow((u - 0.27) / 0.075, 2)) + Math.exp(-Math.pow((u - 0.73) / 0.075, 2))) * (0.7 + 0.6 * fbm(i * 0.2, u * 3, 5));
      pos.push(x, getGroundHeight(x, z) + 0.085 - rut, z); uvs.push(u, i / N * vRep);
      const edge = Math.min(u, 1 - u), alpha = smooth(0.0, 0.2, edge + (fbm(i * 0.15, u * 5, 9) - 0.5) * 0.12), sh = (1 - rut * 3.2) * (0.9 + 0.2 * fbm(i * 0.4, u * 6, 2));
      col.push(sh, sh * 0.97, sh * 0.93, alpha);
    }
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < M - 1; k++) { const a = i * M + k, b = a + M; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx); geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t.road, vertexColors: true, transparent: true, alphaTest: 0.03, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  road.receiveShadow = true; group.add(road);
  
  const rng = createSeededRandom(WORLD_SEED + 5100), puddleMat = new THREE.MeshStandardMaterial({ color: 0x3a3022, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.82, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  for (let i = 0; i < 35; i++) {
    const r = rows[Math.floor(rng() * N)], side2 = rng() < 0.5 ? -1 : 1, lat = side2 * (0.5 + rng() * 0.25) * 0.5 * r.w * 0.7, x = r.x + r.sx * lat, z = r.z + r.sz * lat;
    const pd = new THREE.Mesh(new THREE.CircleGeometry(1, 20), puddleMat); pd.scale.set(0.35 + rng() * 0.5, 0.9 + rng() * 1.1, 1);
    pd.rotation.set(-Math.PI / 2, 0, -Math.atan2(r.tz, r.tx) + Math.PI / 2); pd.position.set(x, getGroundHeight(x, z) + 0.05, z); group.add(pd);
  }
  
  const pebs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), 1800), d = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < 1800; i++) {
    const r = rows[Math.floor(rng() * N)], lat = (rng() - 0.5) * r.w * 1.05, x = r.x + r.sx * lat, z = r.z + r.sz * lat, s = 0.25 + rng() * 0.9;
    d.position.set(x, getGroundHeight(x, z) + 0.07, z); d.rotation.set(rng() * 3, rng() * 3, rng() * 3); d.scale.set(s, s * (0.5 + rng() * 0.5), s * (0.7 + rng() * 0.5)); d.updateMatrix();
    pebs.setMatrixAt(i, d.matrix); pebs.setColorAt(i, c.setHSL(0.08 + rng() * 0.04, 0.12 + rng() * 0.15, 0.25 + rng() * 0.25));
  }
  pebs.receiveShadow = true; pebs.castShadow = true; pebs.frustumCulled = true; group.add(pebs);
  scene.add(group);
  console.log(`[Terrain] Грунтовая дорога-грязь: ${Math.round(len)}м (колеи, лужи, камешки)`);
  return { road, curve, group };
}

export function makeNoisyRock(radius, rng, detail = 1) {
  const geo = new THREE.IcosahedronGeometry(radius, Math.min(3, detail + 1)), pos = geo.attributes.position, seed = rng() * 100, count = pos.count, colors = new Float32Array(count * 3), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const nx = pos.getX(i) / radius, ny = pos.getY(i) / radius, nz = pos.getZ(i) / radius;
    let d = 1 + 0.46 * (fbm(nx * 1.7 + seed, ny * 1.7, nz * 1.7, 3) - 0.5) + 0.12 * (1 - Math.abs(fbm(nx * 4 + seed, ny * 4, nz * 4, 2) * 2 - 1));
    d = d * 0.65 + (Math.round(d * 6) / 6) * 0.35;
    pos.setXYZ(i, nx * radius * d, Math.max(ny * radius * d, -radius * 0.2), nz * radius * d);
    const band = Math.sin(ny * 6 + seed) * 0.5 + 0.5, n = fbm(nx * 3 + seed, ny * 3, nz * 3, 3);
    c.setHSL(0.09 + n * 0.03, 0.06 + band * 0.07, 0.38 + n * 0.16 + band * 0.04);
    if (ny > 0.35 && n > 0.42) c.lerp(new THREE.Color(0x56702f), Math.min(0.8, (n - 0.4) * 3 * (ny + 0.2)));
    else if (ny < -0.1) c.multiplyScalar(0.7);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const t = T();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t.boulder, bumpMap: t.boulderBump, bumpScale: 1.2, vertexColors: true, flatShading: true, roughness: 0.94, metalness: 0.02 }));
}

const STRATA = ['#8d8a85', '#7b7166', '#6c6258', '#9a948a', '#5f5a54', '#867660', '#a09585'].map((h) => new THREE.Color(h));
function cliffMesh(rng, R, height) {
  const seed = rng() * 50, geo = new THREE.CylinderGeometry(R * 0.62, R, height, 30, 28, false), pos = geo.attributes.position, uv = geo.attributes.uv, count = pos.count, colors = new Float32Array(count * 3), c = new THREE.Color();
  const steps = Math.max(4, Math.round(height / 0.9));
  for (let i = 0; i < count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (y + height / 2) / height, r0 = Math.hypot(x, z), a = Math.atan2(z, x), tt = t * steps, fr = tt - Math.floor(tt);
    if (r0 > 1e-4) {
      const prof = (1 - 0.38 * Math.pow(t, 1.25)) * (1 + 0.16 * Math.sin(t * 5.2 + seed));
      const nz = fbm(Math.cos(a) * 1.6 + seed, Math.sin(a) * 1.6, t * 2.4, 4), crack = Math.pow(Math.max(0, Math.sin(a * 7 + seed * 3 + t * 2)), 10) * 0.22;
      const f = Math.max(0.25, prof * (0.82 + 0.5 * nz) - crack - 0.12 * fr);
      x *= f; z *= f;
    }
    if (t > 0.985) y = height / 2 + (fbm(x * 0.6 + seed, z * 0.6, seed, 3) - 0.5) * 0.7; else y += (fbm(x * 0.5 + seed, y * 0.5, z * 0.5, 3) - 0.5) * (t > 0.9 ? 0.5 : 0.25);
    pos.setXYZ(i, x, y, z); uv.setXY(i, uv.getX(i) * 3, t * height / 2.4);
    const sIdx = Math.floor(tt) + (fbm(a * 2 + seed, tt, 0, 2) > 0.5 ? 1 : 0), base = STRATA[((sIdx * 3) % STRATA.length + STRATA.length) % STRATA.length];
    c.copy(base).offsetHSL(0, 0, (vn(x * 2 + seed, y * 2, z * 2) - 0.5) * 0.08);
    if ((fr > 0.7 || t > 0.95) && fbm(a * 3 + seed, tt * 1.7, 4, 3) > 0.46) c.lerp(new THREE.Color(0x5d6f33), 0.55);
    if (fbm(a * 9 + seed, t * 0.6, 2, 2) > 0.6) c.multiplyScalar(0.72);
    if (t < 0.12) c.multiplyScalar(0.75);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const t = T(), m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t.cliff, bumpMap: t.cliffBump, bumpScale: 1.6, vertexColors: true, roughness: 0.95, metalness: 0.02 }));
  m.castShadow = true; m.receiveShadow = true; return m;
}

function makeCliffFormation(rng) {
  const g = new THREE.Group(), meshes = [], circles = [], R = 2.2 + rng() * 1.5, Hh = 5 + rng() * 4;
  const main = cliffMesh(rng, R, Hh); main.position.y = Hh / 2 - 0.5; g.add(main); meshes.push(main); circles.push({ x: 0, z: 0, r: R * 0.82 });
  const sats = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < sats; i++) {
    const r = 0.9 + rng() * 0.9, h = 2 + rng() * 2.6, a = rng() * TAU, d = R * (0.75 + rng() * 0.5), m = cliffMesh(rng, r, h);
    m.position.set(Math.cos(a) * d, h / 2 - 0.5, Math.sin(a) * d); m.rotation.y = rng() * TAU; m.rotation.z = (rng() - 0.5) * 0.18; g.add(m); meshes.push(m); circles.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: r * 0.85 });
  }
  const rub = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < rub; i++) {
    const r = 0.35 + rng() * 0.75, a = rng() * TAU, d = R * (1.0 + rng() * 0.9), b = makeNoisyRock(r, rng, 1);
    b.position.set(Math.cos(a) * d, r * 0.25, Math.sin(a) * d); b.rotation.set(rng() * 3, rng() * 3, rng() * 3); b.castShadow = true; b.receiveShadow = true; g.add(b);
    if (r > 0.7) { meshes.push(b); circles.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: r * 0.85 }); }
  }
  return { group: g, meshes, circles };
}

let _barkT, _ringT;
function barkTex() { if (_barkT) return _barkT; _barkT = mkTex(cnv(128, 256, (x, w, h) => { x.fillStyle = '#4a3420'; x.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(20,14,8,${0.25 + Math.random() * 0.35})`; x.lineWidth = rr(0.8, 2.6); const px = rr(0, w); x.beginPath(); x.moveTo(px, 0); for (let y = 20; y <= h; y += 20) x.lineTo(px + rr(-4, 4), y); x.stroke(); } for (let i = 0; i < 30; i++) { x.strokeStyle = `rgba(110,85,50,${0.15 + Math.random() * 0.2})`; x.lineWidth = 0.7; const px = rr(0, w); x.beginPath(); x.moveTo(px, 0); for (let y = 24; y <= h; y += 24) x.lineTo(px + rr(-3, 3), y); x.stroke(); } for (let i = 0; i < 18; i++) { x.fillStyle = `rgba(90,110,50,${0.15 + Math.random() * 0.2})`; x.beginPath(); x.arc(rr(0, w), rr(0, h), rr(4, 12), 0, TAU); x.fill(); } })); return _barkT; }
function ringTex() { if (_ringT) return _ringT; _ringT = mkTex(cnv(128, 128, (x, w) => { x.fillStyle = '#b89460'; x.fillRect(0, 0, w, w); for (let r = 60; r > 2; r -= rr(2.5, 5)) { x.strokeStyle = `rgba(${80 + Math.random() * 40 | 0},${52 + Math.random() * 30 | 0},28,${0.35 + Math.random() * 0.4})`; x.lineWidth = rr(0.7, 1.8); x.beginPath(); x.ellipse(w / 2 + rr(-1, 1), w / 2 + rr(-1, 1), r, r * rr(0.94, 1), 0, 0, TAU); x.stroke(); } x.strokeStyle = 'rgba(50,30,16,.55)'; x.lineWidth = 1.2; for (let k = 0; k < 4; k++) { const a = rr(0, TAU); x.beginPath(); x.moveTo(w / 2, w / 2); x.lineTo(w / 2 + Math.cos(a) * 60, w / 2 + Math.sin(a) * 60); x.stroke(); } })); return _ringT; }

function makeStump(rng) {
  const g = new THREE.Group(), bark = new THREE.MeshStandardMaterial({ map: barkTex(), bumpMap: barkTex(), bumpScale: 1.4, roughness: 0.96 });
  const prof = [[0.0, 0], [0.5, 0], [0.4, 0.1], [0.32, 0.26], [0.28, 0.46], [0.27, 0.62]].map(([x, y]) => new THREE.Vector2(x, y)), geo = new THREE.LatheGeometry(prof, 18), p = geo.attributes.position, s = rng() * 20;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.16 * (fbm(Math.cos(a) * 2 + s, Math.sin(a) * 2, y * 2, 3) - 0.5) * 2 * (1.2 - y); p.setXYZ(i, x * k, y, z * k); }
  geo.computeVertexNormals(); const body = new THREE.Mesh(geo, bark); body.castShadow = true; body.receiveShadow = true; g.add(body);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.265, 20), new THREE.MeshStandardMaterial({ map: ringTex(), roughness: 0.9 })); top.rotation.x = -Math.PI / 2; top.position.y = 0.625; g.add(top);
  for (let i = 0; i < 5; i++) { const a = rng() * TAU, root = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.12, 0.7, 6), bark); root.position.set(Math.cos(a) * 0.42, 0.05, Math.sin(a) * 0.42); root.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25); root.castShadow = true; g.add(root); }
  return { group: g, body };
}

function makeLog(rng, len) {
  const r = 0.17 + rng() * 0.1, geo = new THREE.CylinderGeometry(r * 0.92, r, len, 14, 12), p = geo.attributes.position, s = rng() * 20;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.12 * (fbm(Math.cos(a) * 2 + s, y * 1.5, Math.sin(a) * 2, 3) - 0.5) * 2; p.setXYZ(i, x * k, y, z * k); }
  geo.computeVertexNormals(); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len * 1.4);
  const ends = new THREE.MeshStandardMaterial({ map: ringTex(), roughness: 0.9 }), bark = new THREE.MeshStandardMaterial({ map: barkTex(), bumpMap: barkTex(), bumpScale: 1.4, roughness: 0.96 });
  const m = new THREE.Mesh(geo, [bark, ends, ends]); m.castShadow = true; m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m);
  for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) { const st = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 6), bark); const y = (rng() - 0.5) * len * 0.8, a = rng() * TAU; st.position.set(Math.cos(a) * r, y, Math.sin(a) * r); st.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); g.add(st); }
  if (rng() < 0.7) { const moss = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ color: 0x4f6b2a, roughness: 1 })); moss.scale.set(r * 0.9, r * 0.28, len * (0.15 + rng() * 0.2)); moss.position.set(0, r * 0.8, (rng() - 0.5) * len * 0.5); g.add(moss); }
  g.rotation.z = Math.PI / 2; return { group: g, mesh: m, r };
}

export function generateDecorations(scene) {
  const group = new THREE.Group(); group.name = 'Decorations';
  const colliders = [], circles = [], rng = createSeededRandom(WORLD_SEED + 6000), rand = (a, b) => a + rng() * (b - a);

for (let i = 0; i < 120; i++) {
const x = rand(-370, 370), z = rand(-370, 370); if (isOnRoad(x, z, 6)) continue;
    const y = getGroundHeight(x, z), r = rand(0.4, 2.0), b = makeNoisyRock(r, rng, r > 1.0 ? 2 : 1), sx = rand(0.8, 1.35), sz = rand(0.8, 1.35);
    b.position.set(x, y + r * 0.2, z); b.rotation.set(rand(0, 0.5), rand(0, TAU), rand(0, 0.5)); b.scale.set(sx, rand(0.6, 1), sz); b.castShadow = true; b.receiveShadow = true; group.add(b);
    if (r > 0.8) colliders.push(b); if (r > 0.6) circles.push({ x, z, r: r * Math.max(sx, sz) * 0.85 });
  }
for (let i = 0; i < 30; i++) {
const x = rand(-370, 370), z = rand(-370, 370); if (isOnRoad(x, z, 10) || Math.hypot(x, z) < 14) continue;
    const y = getGroundHeight(x, z), f = makeCliffFormation(rng), yaw = rand(0, TAU), cs = Math.cos(yaw), sn = Math.sin(yaw);
    f.group.position.set(x, y, z); f.group.rotation.y = yaw; group.add(f.group);
    for (const m of f.meshes) colliders.push(m);
    for (const c of f.circles) circles.push({ x: x + c.x * cs + c.z * sn, z: z - c.x * sn + c.z * cs, r: c.r });
  }
for (let i = 0; i < 45; i++) {
const x = rand(-350, 350), z = rand(-350, 350); if (isOnRoad(x, z, 6)) continue;
    const s = makeStump(rng); s.group.position.set(x, getGroundHeight(x, z), z); s.group.rotation.y = rand(0, TAU); group.add(s.group);
    colliders.push(s.body); circles.push({ x, z, r: 0.4 });
  }
for (let i = 0; i < 40; i++) {
const x = rand(-350, 350), z = rand(-350, 350); if (isOnRoad(x, z, 7)) continue;
    const len = rand(2.0, 4.5);
    const log = makeLog(rng, len);
    log.group.position.set(x, getGroundHeight(x, z) + 0.15, z);
    log.group.rotation.y = rand(0, TAU);
    log.group.rotation.x = rand(-0.2, 0.2);
    group.add(log.group);
    colliders.push(log.mesh);
    circles.push({ x, z, r: len * 0.4 });
  }
  
  scene.add(group);
  console.log('[Terrain] Декорации v2: валуны, утёсы, пни, брёвна готовы');
  return { group, colliders, circles };
}
