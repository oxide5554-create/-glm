import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const CELL = 3.0;
export const LEVEL_H = 2.8;
const DOOR_W = 1.4;
const DOOR_H = 2.0;
const WALL_THICK = 0.12;
const MIN_LEVEL = 1;
const MAX_LEVEL = 3;
let currentBuildLevel = 1;

export const PARTS = {
  foundation: { name: "Фундамент", key: "1", emoji: "🟫" },
  wall:       { name: "Стена",     key: "2", emoji: "" },
  window:     { name: "Окно",      key: "3", emoji: "🪟" },
  doorway:    { name: "Проем",     key: "4", emoji: "⬜" },
  ceiling:    { name: "Потолок",   key: "5", emoji: "" }
};

function box(size, pos, mat = 0) { return { size, pos, mat }; }

function partBoxes(part, pillarHeight = 0) {
  const C = CELL, H = C / 2;
  const sideW = (C - DOOR_W) / 2;
  const topH = LEVEL_H - DOOR_H;
  if (part === "foundation") {
    const pillarY = -0.125 - (pillarHeight / 2);
    return [
      box([C, 0.25, C], [0, 0, 0], 2),
      box([0.16, pillarHeight, 0.16], [ H - 0.25, pillarY,  H - 0.25], 1),
      box([0.16, pillarHeight, 0.16], [-(H - 0.25), pillarY,  H - 0.25], 1),
      box([0.16, pillarHeight, 0.16], [ H - 0.25, pillarY, -(H - 0.25)], 1),
      box([0.16, pillarHeight, 0.16], [-(H - 0.25), pillarY, -(H - 0.25)], 1)
    ];
  }
  if (part === "ceiling") return [ box([C, 0.15, C], [0, -0.075, 0], 0) ];
  if (part === "wall")    return [ box([WALL_THICK, LEVEL_H, C], [0, LEVEL_H/2, 0], 0) ];
  if (part === "window") return [
    box([WALL_THICK, 0.9, C], [0, 0.45, 0], 0),
    box([WALL_THICK, 0.7, C], [0, LEVEL_H - 0.35, 0], 0),
    box([WALL_THICK, 1.2, 0.6], [0, 1.5, H - 0.3], 0),
    box([WALL_THICK, 1.2, 0.6], [0, 1.5, -(H - 0.3)], 0)
  ];
  if (part === "doorway") return [
    box([WALL_THICK, LEVEL_H, sideW], [0, LEVEL_H/2, H - sideW/2], 0),
    box([WALL_THICK, LEVEL_H, sideW], [0, LEVEL_H/2, -(H - sideW/2)], 0),
    box([WALL_THICK, topH, DOOR_W], [0, DOOR_H + topH/2, 0], 0)
  ];
  return [];
}

function generateWoodTexture(isDark = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const base = isDark ? '#4a3525' : '#8b6b4a';
  const dark = isDark ? '#2a1a10' : '#5c4025';
  ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 512);
  const plankH = 128;
  for (let y = 0; y < 512; y += plankH) {
    ctx.fillStyle = dark; ctx.fillRect(0, y, 512, 3);
    for (let i = 0; i < 60; i++) {
      const alpha = Math.random() * 0.2 + 0.05;
      ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
      ctx.lineWidth = Math.random() * 2 + 0.5;
      ctx.beginPath();
      let x = 0; let yPos = y + Math.random() * plankH;
      ctx.moveTo(x, yPos);
      while (x < 512) { x += Math.random() * 30 + 10; yPos += (Math.random() - 0.5) * 5; ctx.lineTo(x, yPos); }
      ctx.stroke();
    }
    if (Math.random() > 0.6) {
      const kx = Math.random() * 512; const ky = y + Math.random() * plankH;
      const kr = Math.random() * 8 + 4;
      ctx.fillStyle = dark; ctx.beginPath();
      ctx.ellipse(kx, ky, kr, kr * 0.6, Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(20, y + plankH / 2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(492, y + plankH / 2, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 15; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.4 + 0.1})`;
    ctx.lineWidth = Math.random() * 1.5; ctx.beginPath();
    let x = Math.random() * 512; let y = Math.random() * 512; ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function generateStoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5a5a5a'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 512; const y = Math.random() * 512;
    const w = Math.random() * 100 + 50; const h = Math.random() * 80 + 40;
    const gray = Math.floor(Math.random() * 50 + 70);
    ctx.fillStyle = `rgb(${gray}, ${gray - 5}, ${gray - 10})`;
    ctx.beginPath();
    const points = 6 + Math.floor(Math.random() * 4);
    for (let p = 0; p < points; p++) {
      const angle = (p / points) * Math.PI * 2;
      const rx = w * (0.7 + Math.random() * 0.3); const ry = h * (0.7 + Math.random() * 0.3);
      const px = x + Math.cos(angle) * rx; const py = y + Math.sin(angle) * ry;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.stroke();
  }
  for (let i = 0; i < 20; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.5})`;
    ctx.lineWidth = Math.random() * 2; ctx.beginPath();
    let x = Math.random() * 512; let y = Math.random() * 512; ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const woodTex = generateWoodTexture(false);
const woodDarkTex = generateWoodTexture(true);
const stoneTex = generateStoneTexture();
const matWood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9, metalness: 0.0 });
const matWoodD = new THREE.MeshStandardMaterial({ map: woodDarkTex, roughness: 0.9, metalness: 0.0 });
const matStone = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, metalness: 0.0 });
const matGhostOK = new THREE.MeshBasicMaterial({ color: 0x39d353, transparent: true, opacity: 0.45, depthWrite: false });
const matGhostBad = new THREE.MeshBasicMaterial({ color: 0xe04338, transparent: true, opacity: 0.45, depthWrite: false });

function makeGhostMesh(part, pillarHeight = 0) {
  const geos = partBoxes(part, pillarHeight).map(b => {
    const g = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
    g.translate(b.pos[0], b.pos[1], b.pos[2]); return g;
  });
  return new THREE.Mesh(mergeGeometries(geos, false), matGhostOK);
}

function makePieceGroup(part, piece) {
  const g = new THREE.Group();
  const pHeight = piece.part === "foundation" ? (piece.pillarHeight || 0) : 0;
  for (const b of partBoxes(part, pHeight)) {
    let mat = matWood;
    if (b.mat === 1) mat = matWoodD;
    else if (b.mat === 2) mat = matStone;
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]), mat);
    m.position.set(b.pos[0], b.pos[1], b.pos[2]);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.piece = piece; g.add(m);
  }
  return g;
}

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const fkey = (i, k) => `f${i},${k}`;
const ckey = (i, k) => `c${i},${k}`;
function canon(i, k, edge) {
  if (edge === "XM") return { i: i - 1, k, edge: "XP" };
  if (edge === "ZM") return { i, k: k - 1, edge: "ZP" };
  return { i, k, edge };
}
const wkey = (i, k, edge) => { const c = canon(i, k, edge); return `w${c.i},${c.k},${c.edge}`; };
const dkey = (i, k, edge) => { const c = canon(i, k, edge); return `d${c.i},${c.k},${c.edge}`; };

let _doorTex = null;
function makeDoorTexture() {
  if (_doorTex) return _doorTex;
  const S = 256;
  const c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d");
  x.fillStyle = "#6f4e2c"; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 5; i++) {
    const px = i * (S / 5);
    const sh = 0.85 + Math.random() * 0.3;
    x.fillStyle = `rgb(${(122*sh)|0},${(86*sh)|0},${(52*sh)|0})`;
    x.fillRect(px + 2, 0, S/5 - 4, S);
    for (let g = 0; g < 26; g++) {
      x.strokeStyle = "rgba(60,40,22," + (0.08 + Math.random()*0.15) + ")";
      x.lineWidth = 0.6 + Math.random() * 1.2;
      const gx = px + 4 + Math.random() * (S/5 - 8);
      x.beginPath(); x.moveTo(gx, 0);
      let yy = 0;
      while (yy < S) { yy += 8 + Math.random() * 14; x.lineTo(gx + (Math.random()-0.5)*4, yy); }
      x.stroke();
    }
    x.fillStyle = "rgba(30,20,10,0.55)";
    x.fillRect(px, 0, 2, S); x.fillRect(px + S/5 - 2, 0, 2, S);
  }
  x.fillStyle = "rgba(90,62,36,0.95)";
  x.fillRect(0, 26, S, 20); x.fillRect(0, S - 46, S, 20);
  x.fillStyle = "rgba(40,26,14,0.5)";
  x.fillRect(0, 44, S, 3); x.fillRect(0, S - 48, S, 3);
  x.save(); x.translate(S/2, S/2); x.rotate(-0.5);
  x.fillStyle = "rgba(96,66,38,0.9)"; x.fillRect(-S, -14, S*2, 28); x.restore();
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random()-0.5)*18; d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
  x.putImageData(img, 0, 0);
  _doorTex = new THREE.CanvasTexture(c);
  _doorTex.colorSpace = THREE.SRGBColorSpace; _doorTex.anisotropy = 8;
  return _doorTex;
}

function getBoxCollider(c, minY, maxY) {
  const h = WALL_THICK / 2;
  if (c.edge === "XP" || c.edge === "XM") {
    const x = c.edge === "XP" ? (c.i + 1) * CELL : c.i * CELL;
    return { minX: x-h, maxX: x+h, minZ: c.k*CELL, maxZ: (c.k+1)*CELL, minY, maxY };
  }
  const z = c.edge === "ZP" ? (c.k + 1) * CELL : c.k * CELL;
  return { minX: c.i*CELL, maxX: (c.i+1)*CELL, minZ: z-h, maxZ: z+h, minY, maxY };
}

function doorCollider(c, baseY) {
  const halfDoorW = DOOR_W / 2;
  const h = WALL_THICK / 2;
  if (c.edge === "XP" || c.edge === "XM") {
    const x = c.edge === "XP" ? (c.i + 1) * CELL : c.i * CELL;
    const zCenter = (c.k + 0.5) * CELL;
    return { minX:x-h, maxX:x+h, minZ:zCenter-halfDoorW, maxZ:zCenter+halfDoorW, minY:baseY, maxY:baseY+DOOR_H, step:false, on:true };
  }
  const z = c.edge === "ZP" ? (c.k + 1) * CELL : c.k * CELL;
  const xCenter = (c.i + 0.5) * CELL;
  return { minX:xCenter-halfDoorW, maxX:xCenter+halfDoorW, minZ:z-h, maxZ:z+h, minY:baseY, maxY:baseY+DOOR_H, step:false, on:true };
}

export function createBuilding(scene, terrainMesh, getHeight) {
  const group = new THREE.Group();
  scene.add(group);
  const pieces = new Map();
  const colliders = [];
  const doors = new Map();
  let ghost = null;
  let activePart = null;
  let pending = null;
  let valid = false;
  let doorGhost = null;
  let doorPending = null;
  let doorValid = false;

  function pieceAt(i, k) { return pieces.get(fkey(i, k)); }
  function groundY(i, k) { return getHeight((i + 0.5) * CELL, (k + 0.5) * CELL); }

  function setPart(part) {
    activePart = part;
    if (ghost) { scene.remove(ghost); ghost = null; }
    if (part) { ghost = makeGhostMesh(part, 0); ghost.visible = false; scene.add(ghost); }
  }

  function cancel() { setPart(null); pending = null; valid = false; hideDoorGhost(); }
  function isActive() { return !!activePart; }

  function setBuildLevel(delta) {
    currentBuildLevel = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, currentBuildLevel + delta));
  }
  function getBuildLevel() { return currentBuildLevel; }

  function getBaseHeight(i, k) {
    const f = pieces.get(fkey(i, k));
    if (f && f.part === "foundation") return f.y;
    const c = pieces.get(ckey(i, k));
    if (c && c.part === "ceiling") return (c.baseY || 0) + LEVEL_H;
    const gy = groundY(i, k);
    if (isNaN(gy)) return 0;
    return gy + 0.25 + (currentBuildLevel - 1) * LEVEL_H;
  }

  function checkValid(p) {
    if (!p) return false;
    if (pieces.size > 400) return false;

    if (p.part === "foundation") {
      return !pieces.has(fkey(p.i, p.k));
    }

    if (p.part === "ceiling") {
      if (!pieces.has(fkey(p.i, p.k))) return false;
      if (pieces.has(ckey(p.i, p.k))) return false;
      let openers = 0;
      for (const e of ["XP", "XM", "ZP", "ZM"]) {
        if (pieces.has(wkey(p.i, p.k, e))) openers++;
      }
      return openers >= 1;
    }

    if (p.part === "wall" || p.part === "window" || p.part === "doorway") {
      if (!pieces.has(fkey(p.i, p.k))) return false;
      if (!["XP", "XM", "ZP", "ZM"].includes(p.edge)) return false;
      if (pieces.has(wkey(p.i, p.k, p.edge))) {
        return false; 
      }
      return true;
    }

    return false;
  }

  function transform(p) {
    if (p.part === "foundation") {
      const dropDist = Math.max(0, p.y - 0.25 - p.groundY);
      return { pos: [(p.i + 0.5) * CELL, p.y - 0.125, (p.k + 0.5) * CELL], rotY: 0, pillarHeight: dropDist };
    }
    if (p.part === "ceiling") {
      const baseY = getBaseHeight(p.i, p.k);
      return { pos: [(p.i + 0.5) * CELL, baseY + LEVEL_H, (p.k + 0.5) * CELL], rotY: 0 };
    }
    const baseY = getBaseHeight(p.i, p.k);
    const c = canon(p.i, p.k, p.edge);
    let x, z, rotY;
    if (c.edge === "XP") { x = (c.i + 1) * CELL; z = (c.k + 0.5) * CELL; rotY = 0; }
    else if (c.edge === "XM") { x = c.i * CELL; z = (c.k + 0.5) * CELL; rotY = 0; }
    else if (c.edge === "ZP") { x = (c.i + 0.5) * CELL; z = (c.k + 1) * CELL; rotY = Math.PI / 2; }
    else { x = (c.i + 0.5) * CELL; z = c.k * CELL; rotY = Math.PI / 2; }
    return { pos: [x, baseY, z], rotY };
  }

  function addCollidersForPiece(piece, key) {
    const c = canon(piece.i, piece.k, piece.edge || "XP");
    if (piece.part === "foundation") {
      colliders.push({ minX: piece.i*CELL, maxX: (piece.i+1)*CELL, minZ: piece.k*CELL, maxZ: (piece.k+1)*CELL, minY: piece.y - 0.25, maxY: piece.y, step: true, on: true, pieceKey: key, isGlass: false });
    } else if (piece.part === "ceiling") {
      const baseY = piece.baseY || getBaseHeight(piece.i, piece.k);
      colliders.push({ minX: piece.i*CELL, maxX: (piece.i+1)*CELL, minZ: piece.k*CELL, maxZ: (piece.k+1)*CELL, minY: baseY + LEVEL_H - 0.15, maxY: baseY + LEVEL_H, step: true, on: true, pieceKey: key, isGlass: false });
    } else if (piece.part === "wall") {
      const baseY = piece.baseY || getBaseHeight(piece.i, piece.k);
      const cc = getBoxCollider(c, baseY, baseY + LEVEL_H);
      cc.step = false; cc.on = true; cc.pieceKey = key; cc.isGlass = false;
      colliders.push(cc);
    } else if (piece.part === "window") {
      const baseY = piece.baseY || getBaseHeight(piece.i, piece.k);
      colliders.push({ ...getBoxCollider(c, baseY, baseY + 0.9), step: false, on: true, pieceKey: key, isGlass: false });
      colliders.push({ ...getBoxCollider(c, baseY + LEVEL_H - 0.7, baseY + LEVEL_H), step: false, on: true, pieceKey: key, isGlass: false });
      colliders.push({ ...getBoxCollider(c, baseY + 0.9, baseY + LEVEL_H - 0.7), step: false, on: true, pieceKey: key, isGlass: true });
    } else if (piece.part === "doorway") {
      const baseY = piece.baseY || getBaseHeight(piece.i, piece.k);
      const sideW = (CELL - DOOR_W) / 2;
      const h = WALL_THICK / 2;
      if (c.edge === "XP" || c.edge === "XM") {
        const x = c.edge === "XP" ? (c.i+1)*CELL : c.i*CELL;
        const z0 = c.k*CELL, z1 = (c.k+1)*CELL;
        colliders.push({ minX:x-h, maxX:x+h, minZ:z0, maxZ:z0+sideW, minY:baseY, maxY:baseY+LEVEL_H, step:false, on:true, pieceKey:key, isGlass:false });
        colliders.push({ minX:x-h, maxX:x+h, minZ:z1-sideW, maxZ:z1, minY:baseY, maxY:baseY+LEVEL_H, step:false, on:true, pieceKey:key, isGlass:false });
      } else {
        const z = c.edge === "ZP" ? (c.k+1)*CELL : c.k*CELL;
        const x0 = c.i*CELL, x1 = (c.i+1)*CELL;
        colliders.push({ minX:x0, maxX:x0+sideW, minZ:z-h, maxZ:z+h, minY:baseY, maxY:baseY+LEVEL_H, step:false, on:true, pieceKey:key, isGlass:false });
        colliders.push({ minX:x1-sideW, maxX:x1, minZ:z-h, maxZ:z+h, minY:baseY, maxY:baseY+LEVEL_H, step:false, on:true, pieceKey:key, isGlass:false });
      }
    }
  }

  function updateAim(ray, camera) {
    if (!activePart || !ghost) return;
    const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
    const camPos = camera.position.clone();
    const horizDir = camDir.clone(); horizDir.y = 0; horizDir.normalize();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -camPos.y);
    const rayLine = new THREE.Ray(camPos, horizDir);
    let targetPos = new THREE.Vector3();
    rayLine.intersectPlane(plane, targetPos);
    if (!targetPos || targetPos.distanceTo(camPos) < 1.5) targetPos.copy(camPos).addScaledVector(horizDir, 4.0);
    let hi = Math.floor(targetPos.x / CELL);
    let hk = Math.floor(targetPos.z / CELL);
    if (activePart === "ceiling" && !pieces.has(fkey(hi, hk))) {
      if (ghost) ghost.visible = false;
      pending = null; valid = false; return;
    }
    let targetY = groundY(hi, hk) + 0.25 + (currentBuildLevel - 1) * LEVEL_H;
    let isMagnetized = false;
    if (activePart === "foundation" || activePart === "ceiling") {
      const localFoundation = pieces.get(fkey(hi, hk));
      if (localFoundation && localFoundation.part === "foundation") {
        targetY = localFoundation.y;
      } else {
        for (const [dx, dz] of NB) {
          const neighbor = pieces.get(fkey(hi + dx, hk + dz));
          if (neighbor && neighbor.part === "foundation") { targetY = neighbor.y; isMagnetized = true; break; }
        }
      }
    }
    let p = null;
    if (activePart === "foundation" || activePart === "ceiling") {
      p = { part: activePart, i: hi, k: hk, y: targetY, edge: null, isMagnetized, groundY: groundY(hi, hk) };
    } else {
      let bestDist = Infinity, bestSnap = null;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const ci = hi + dx, ck = hk + dz;
          const neighbor = pieces.get(fkey(ci, ck));
          if (neighbor && neighbor.part === "foundation") {
            for (const edge of ["XP", "XM", "ZP", "ZM"]) {
              let ex = ci * CELL, ez = ck * CELL;
              if (edge === "XP") ex = (ci + 1) * CELL;
              if (edge === "XM") ex = ci * CELL;
              if (edge === "ZP") ez = (ck + 1) * CELL;
              if (edge === "ZM") ez = ck * CELL;
              if (edge === "XP" || edge === "XM") ez = (ck + 0.5) * CELL;
              if (edge === "ZP" || edge === "ZM") ex = (ci + 0.5) * CELL;
              const dist = Math.hypot(targetPos.x - ex, targetPos.z - ez);
              if (dist < 2.5 && dist < bestDist) { bestDist = dist; bestSnap = { i: ci, k: ck, edge: edge }; }
            }
          }
        }
      }
      if (bestSnap) p = { part: activePart, i: bestSnap.i, k: bestSnap.k, edge: bestSnap.edge };
      else {
        let edge = Math.abs(horizDir.x) > Math.abs(horizDir.z) ? (horizDir.x > 0 ? "XP" : "XM") : (horizDir.z > 0 ? "ZP" : "ZM");
        p = { part: activePart, i: hi, k: hk, edge: edge };
      }
    }
    pending = p; valid = checkValid(p);
    const yDiff = ghost.userData ? Math.abs(ghost.userData.y - p.y) : 999;
    if (!ghost.userData || yDiff > 0.05 || ghost.userData.part !== p.part) {
      scene.remove(ghost);
      const pillarH = p.part === "foundation" ? Math.max(0, p.y - 0.25 - p.groundY) : 0;
      ghost = makeGhostMesh(p.part, pillarH);
      ghost.userData = { y: p.y, part: p.part };
      scene.add(ghost);
    }
    const tr = transform(p);
    ghost.position.set(tr.pos[0], tr.pos[1], tr.pos[2]);
    ghost.rotation.y = tr.rotY;
    ghost.material = valid ? matGhostOK : matGhostBad;
    ghost.visible = true;
  }

  function tryPlace() {
    if (!pending || !valid || pieces.size > 400) return null;
    const piece = { ...pending };
    const defaultMax = piece.part === "foundation" ? 250 : 200;
    piece.hp = defaultMax;
    piece.maxHp = defaultMax;
    if (piece.part === "foundation") {
      piece.groundY = groundY(piece.i, piece.k);
      piece.pillarHeight = Math.max(0, piece.y - 0.25 - piece.groundY);
    } else {
      piece.baseY = getBaseHeight(piece.i, piece.k);
    }
    const key = piece.part === "foundation" ? fkey(piece.i, piece.k)
      : piece.part === "ceiling" ? ckey(piece.i, piece.k)
      : wkey(piece.i, piece.k, piece.edge);
    if (pieces.has(key)) return null;
    piece.key = key; pieces.set(key, piece);
    const g = makePieceGroup(piece.part, piece);
    const tr = transform(piece);
    g.position.set(tr.pos[0], tr.pos[1], tr.pos[2]); g.rotation.y = tr.rotY;
    group.add(g); piece.group = g;
    addCollidersForPiece(piece, key);
    return { key, piece };
  }

  function addPiece(key, piece) {
    console.log("[BUILDING] addPiece called:", key, piece?.part, piece);
    if (pieces.has(key)) {
      console.log("[BUILDING] Piece already exists:", key);
      return;
    }
    if (!piece || !piece.part) {
      console.error("[BUILDING] Invalid piece data received:", piece);
      return;
    }
    piece.key = key;
    const defaultMax = piece.part === "foundation" ? 250 : 200;
    if (piece.hp == null) piece.hp = defaultMax;
    if (piece.maxHp == null) piece.maxHp = defaultMax;
    if (piece.part === "foundation") {
      if (piece.groundY === undefined) piece.groundY = groundY(piece.i, piece.k);
      if (piece.y === undefined) piece.y = piece.groundY + 0.25;
      piece.pillarHeight = Math.max(0, piece.y - 0.25 - piece.groundY);
    } else {
      piece.baseY = piece.baseY !== undefined ? piece.baseY : getBaseHeight(piece.i, piece.k);
    }
    pieces.set(key, piece);
    const g = makePieceGroup(piece.part, piece);
    const tr = transform(piece);
    g.position.set(tr.pos[0], tr.pos[1], tr.pos[2]); g.rotation.y = tr.rotY;
    group.add(g); piece.group = g;
    addCollidersForPiece(piece, key);
    console.log("[BUILDING] Added piece successfully:", key, piece.part);
  }

  function tryHitPiece(ray, maxDist = 3.2) {
    const hits = ray.intersectObject(group, true);
    for (const h of hits) {
      if (h.distance > maxDist) break;
      let o = h.object;
      while (o) {
        if (o.userData && o.userData.piece && o.userData.piece.key) {
          return { key: o.userData.piece.key, point: h.point.clone(), isDoor: false };
        }
        if (o.userData && o.userData.doorKey) {
          return { key: o.userData.doorKey, point: h.point.clone(), isDoor: true };
        }
        o = o.parent;
      }
    }
    return null;
  }

  function removePiece(key) {
    const piece = pieces.get(key);
    if (!piece) return false;
    pieces.delete(key);
    if (piece.group) {
      group.remove(piece.group);
      piece.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    }
    for (let i = colliders.length - 1; i >= 0; i--) {
      if (colliders[i].pieceKey === key) colliders.splice(i, 1);
    }
    return true;
  }

  function collideCircle(pos, r, feetY) {
    const headY = feetY + 1.8;
    for (let ci = 0; ci < colliders.length; ci++) {
      const c = colliders[ci];
      if (c.on === false) continue;
      const margin = c.step ? 0.45 : 0.05;
      if (feetY >= c.maxY - margin) continue;
      if (headY <= c.minY + 0.05) continue;
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx; const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2); const push = (r - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      } else {
        const p1 = pos.x - c.minX; const p2 = c.maxX - pos.x;
        const p3 = pos.z - c.minZ; const p4 = c.maxZ - pos.z;
        const m = Math.min(p1, p2, p3, p4);
        if (m === p1) pos.x = c.minX - r;
        else if (m === p2) pos.x = c.maxX + r;
        else if (m === p3) pos.z = c.minZ - r;
        else pos.z = c.maxZ + r;
      }
    }
    // ✅ НОВОЕ: возвращаем support height для шага по фундаменту.
    //    Раньше функция была void — main.js не получал grounded/groundY,
    //    и игрок проваливался сквозь фундамент вместо ходьбы по нему.
    const support = supportHeight(pos.x, pos.z, feetY);
    if (support !== null) {
      return { grounded: true, groundY: support };
    }
    return { grounded: false, groundY: null };
  }

  function supportHeight(x, z, feetY) {
    let best = null;
    for (const c of colliders) {
      if (!c.step || c.on === false) continue;
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      const stepMargin = 0.15;
      if (feetY < c.minY - stepMargin) continue;
      if (best == null || c.maxY > best) best = c.maxY;
    }
    return best;
  }

  function buildDoorGroup() {
    const root = new THREE.Group(); root.userData.isDoorRoot = true;
    const pivot = new THREE.Group(); pivot.position.set(0, 0, -DOOR_W / 2); root.add(pivot);
    const mat = new THREE.MeshStandardMaterial({ map: makeDoorTexture(), roughness: 0.86, metalness: 0.05 });
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.09, DOOR_H, DOOR_W), mat);
    leaf.position.set(0, DOOR_H / 2, DOOR_W / 2);
    leaf.castShadow = true; leaf.receiveShadow = true; leaf.userData.isDoorLeaf = true;
    pivot.add(leaf);
    const metalM = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.6, metalness: 0.6 });
    for (const hy of [0.45, 1.75]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.5), metalM);
      strap.position.set(0, hy, 0.4); pivot.add(strap);
    }
    const knobG = new THREE.SphereGeometry(0.045, 8, 6);
    const k1 = new THREE.Mesh(knobG, metalM); k1.position.set(0.06, 1.05, 1.15); pivot.add(k1);
    const k2 = new THREE.Mesh(knobG, metalM); k2.position.set(-0.06, 1.05, 1.15); pivot.add(k2);
    return { root, pivot, leaf };
  }

  function buildLockMesh() {
    const group = new THREE.Group();
    group.name = "doorLock";
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.20, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.85, flatShading: true })
    );
    plate.position.set(0.06, 1.0, 1.25);
    plate.castShadow = true;
    group.add(plate);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.14, 0.10),
      new THREE.MeshStandardMaterial({ color: 0x4a4a4e, roughness: 0.5, metalness: 0.75, flatShading: true })
    );
    body.position.set(0.09, 1.0, 1.25);
    body.castShadow = true;
    group.add(body);
    const shackle = new THREE.Mesh(
      new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x6a6a6e, roughness: 0.35, metalness: 0.9, flatShading: true })
    );
    shackle.position.set(0.09, 1.12, 1.25);
    shackle.rotation.set(0, Math.PI / 2, Math.PI);
    shackle.castShadow = true;
    group.add(shackle);
    const keyhole = new THREE.Mesh(
      new THREE.CircleGeometry(0.012, 8),
      new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide })
    );
    keyhole.position.set(0.121, 1.0, 1.25);
    keyhole.rotation.set(0, Math.PI / 2, 0);
    group.add(keyhole);
    for (const dy of [-0.06, 0.06]) {
      const rivet = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 6, 4),
        new THREE.MeshStandardMaterial({ color: 0x8a8a8e, roughness: 0.3, metalness: 0.9 })
      );
      rivet.position.set(0.076, 1.0 + dy, 1.25);
      group.add(rivet);
    }
    return group;
  }

  function addDoor(key, piece, open = false, locked = false, lockOwner = null) {
    if (doors.has(key)) return null;
    const { root, pivot, leaf } = buildDoorGroup();
    const c = canon(piece.i, piece.k, piece.edge);
    const tr = transform({ part: "wall", i: piece.i, k: piece.k, edge: piece.edge });
    root.position.set(tr.pos[0], tr.pos[1], tr.pos[2]); 
    root.rotation.y = tr.rotY;
    group.add(root);
    leaf.userData.doorKey = key; 
    root.userData.doorKey = key;
    const baseY = piece.baseY || getBaseHeight(piece.i, piece.k);
    const col = doorCollider(c, baseY);
    col.on = !open; 
    col.doorKey = key;
    colliders.push(col);
    let lockMesh = null;
    if (locked) {
      lockMesh = buildLockMesh();
      pivot.add(lockMesh);
    }    
    const door = {
      key, piece, root, pivot, leaf,
      t: open ? 1 : 0,
      target: open ? 1 : 0,
      col,
      locked: !!locked,
      lockOwner: lockOwner,
      lockMesh,
      hp: piece.hp || 200,
      maxHp: piece.maxHp || 200
    };
    if (open) pivot.rotation.y = -Math.PI / 2;
    doors.set(key, door);
    return door;
  }

  function setDoorOpen(key, open) {
    const d = doors.get(key);
    if (d) d.target = open ? 1 : 0;
  }

  function setDoorLocked(key, locked, owner = null) {
    const d = doors.get(key);
    if (!d) return;
    d.locked = !!locked;
    d.lockOwner = owner;
    if (locked && !d.lockMesh) {
      d.lockMesh = buildLockMesh();
      d.pivot.add(d.lockMesh);
    } else if (!locked && d.lockMesh) {
      d.pivot.remove(d.lockMesh);
      d.lockMesh.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      d.lockMesh = null;
    }
  }

  function isDoorLocked(key) { 
    return doors.get(key)?.locked === true; 
  }

  function isDoorOpen(key) { return doors.get(key)?.target === 1; }

  function tryToggleDoor(ray, maxDist = 4.0) {
    for (const d of doors.values()) {
      const hits = ray.intersectObject(d.root, true);
      if (hits.length && hits[0].distance <= maxDist) {
        if (d.locked) return { key: d.key, locked: true, lockOwner: d.lockOwner };
        return { key: d.key, locked: false };
      }
    }
    return null;
  }

  function makeDoorGhost() {
    const g = new THREE.BoxGeometry(0.09, DOOR_H, DOOR_W); g.translate(0, DOOR_H / 2, 0);
    const m = new THREE.Mesh(g, matGhostOK); m.visible = false; scene.add(m); return m;
  }

  function hideDoorGhost() {
    doorPending = null; doorValid = false;
    if (doorGhost) doorGhost.visible = false;
  }

  let lockGhost = null;
  let lockGhostDoor = null;

  function makeLockGhost() {
    const g = buildLockMesh();
    g.traverse(o => {
      if (o.isMesh) {
        o.material = new THREE.MeshBasicMaterial({
          color: 0x39d353, transparent: true, opacity: 0.55, depthWrite: false
        });
      }
    });
    g.visible = false;
    scene.add(g);
    return g;
  }

  function updateLockAim(ray, camera, myId) {
    if (!lockGhost) lockGhost = makeLockGhost();
    let foundDoor = null;
    for (const d of doors.values()) {
      const hits = ray.intersectObject(d.root, true);
      if (hits.length && hits[0].distance <= 4.0) {
        foundDoor = d;
        break;
      }
    }
    if (foundDoor) {
      if (foundDoor !== lockGhostDoor) {
        if (lockGhost.parent) lockGhost.parent.remove(lockGhost);
        foundDoor.root.add(lockGhost);
        lockGhostDoor = foundDoor;
      }
      lockGhost.visible = true;
      const color = foundDoor.locked ? 0xe04338 : 0x39d353;
      lockGhost.traverse(o => {
        if (o.isMesh) o.material.color.setHex(color);
      });
    } else {
      lockGhost.visible = false;
      if (lockGhostDoor && lockGhost.parent) {
        lockGhost.parent.remove(lockGhost);
        scene.add(lockGhost);
      }
      lockGhostDoor = null;
    }
  }

  function hideLockGhost() {
    if (lockGhost) {
      lockGhost.visible = false;
      if (lockGhost.parent && lockGhost.parent !== scene) {
        lockGhost.parent.remove(lockGhost);
        scene.add(lockGhost);
      }
      lockGhostDoor = null;
    }
  }

  function tryPlaceLock(ray, maxDist, myId) {
    for (const d of doors.values()) {
      const hits = ray.intersectObject(d.root, true);
      if (hits.length && hits[0].distance <= maxDist) {
        if (d.locked) return { failed: true, reason: "already_locked", key: d.key };
        d.locked = true;
        d.lockOwner = myId;
        if (!d.lockMesh) {
          d.lockMesh = buildLockMesh();
          d.pivot.add(d.lockMesh);
        }
        hideLockGhost();
        return { key: d.key, success: true };
      }
    }
    return null;
  }

  function updateDoorAim(ray, camera) {
    if (!doorGhost) doorGhost = makeDoorGhost();
    const hits = ray.intersectObject(group, true);
    let foundDoorway = null;
    for (const h of hits) {
      if (h.distance > 8) break;
      let obj = h.object;
      while (obj) {
        if (obj.userData && obj.userData.piece && obj.userData.piece.part === "doorway") { foundDoorway = obj.userData.piece; break; }
        obj = obj.parent;
      }
      if (foundDoorway) break;
    }
    if (foundDoorway) {
      doorPending = foundDoorway; doorValid = true;
      const tr = transform({ part: "wall", i: foundDoorway.i, k: foundDoorway.k, edge: foundDoorway.edge });
      doorGhost.position.set(tr.pos[0], tr.pos[1], tr.pos[2]); doorGhost.rotation.y = tr.rotY;
      doorGhost.material = matGhostOK; doorGhost.visible = true;
    } else {
      doorPending = null; doorValid = false; doorGhost.visible = false;
    }
  }

  function tryPlaceDoor() {
    if (!doorValid || !doorPending) return null;
    const key = dkey(doorPending.i, doorPending.k, doorPending.edge);
    if (doors.has(key)) return null;
    const piece = { part: "door", i: doorPending.i, k: doorPending.k, edge: doorPending.edge };
    piece.baseY = getBaseHeight(piece.i, piece.k);
    addDoor(key, piece, false); hideDoorGhost();
    return { key, piece };
  }

  function update(dt) {
    for (const d of doors.values()) {
      if (d.t !== d.target) {
        const sp = 3.0 * dt;
        if (d.t < d.target) d.t = Math.min(d.target, d.t + sp);
        else d.t = Math.max(d.target, d.t - sp);
        const e = d.t * d.t * (3 - 2 * d.t);
        d.pivot.rotation.y = -Math.PI / 2 * e;
        d.col.on = d.t < 0.5;
      }
    }
  }

  function damagePiece(key, newHp, newMaxHp) {
    const piece = pieces.get(key);
    if (!piece) return;
    piece.hp = newHp;
    if (newMaxHp != null) piece.maxHp = newMaxHp;
    if (piece.group) {
      const ratio = newHp / (piece.maxHp || 200);
      piece.group.traverse(o => {
        if (o.isMesh && o.material && !o.userData.isGlass) {
          if (!o.userData.origColor) {
            o.userData.origColor = o.material.color ? o.material.color.clone() : null;
          }
          if (o.userData.origColor && o.material.color) {
            const dmgColor = new THREE.Color(0x3a1a0a);
            o.material.color.copy(o.userData.origColor).lerp(dmgColor, (1 - ratio) * 0.6);
          }
        }
      });
    }
  }

  function damageDoor(key, newHp, newMaxHp) {
    const door = doors.get(key);
    if (!door) return;
    door.hp = newHp;
    if (newMaxHp != null) door.maxHp = newMaxHp;
    if (door.root) {
      const ratio = newHp / (door.maxHp || 200);
      door.root.traverse(o => {
        if (o.isMesh && o.material && o.material.color) {
          if (!o.userData.origColor) o.userData.origColor = o.material.color.clone();
          if (o.userData.origColor) {
            const dmgColor = new THREE.Color(0x3a1a0a);
            o.material.color.copy(o.userData.origColor).lerp(dmgColor, (1 - ratio) * 0.6);
          }
        }
      });
    }
  }

  function removeDoor(key) {
    const door = doors.get(key);
    if (!door) return false;
    doors.delete(key);
    if (door.root) {
      group.remove(door.root);
      door.root.traverse(o => {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
        }
      });
    }
    for (let i = colliders.length - 1; i >= 0; i--) {
      if (colliders[i].doorKey === key) colliders.splice(i, 1);
    }
    return true;
  }

  function getPieceHp(key) {
    const piece = pieces.get(key);
    if (piece) return { hp: piece.hp || 0, maxHp: piece.maxHp || 200 };
    const door = doors.get(key);
    if (door) return { hp: door.hp || 200, maxHp: door.maxHp || 200 };
    return null;
  }

  return {
    setPart, cancel, isActive, updateAim, tryPlace, update,
    collideCircle, supportHeight, tryHitPiece, removePiece,
    addPiece, addDoor, setDoorOpen, isDoorOpen, tryToggleDoor, updateDoorAim, hideDoorGhost, tryPlaceDoor,
    setBuildLevel, getBuildLevel,
    setDoorLocked, isDoorLocked, updateLockAim, hideLockGhost, tryPlaceLock,
    damagePiece, damageDoor, removeDoor, getPieceHp,
    get colliders() { return colliders; },
    get pieces() { return pieces; },
    get part() { return activePart; },
    get group() { return group; }
  };
}
