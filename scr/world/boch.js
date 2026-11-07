// scr/world/boch.js
// ✅ Патч: createScrap встроен инлайн (оригинал был в scr/3d/scrap.js — удалён).
import * as THREE from 'three';

const H = Math.PI / 2;
const mk = (c, r = 0.7, m = 0.2, map = false) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

// ✅ Простая кучка металлического скрапа (замена scr/3d/scrap.js)
function createScrap({ seed = Math.random() * 10000, spin = false } = {}) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6e7075, roughness: 0.45, metalness: 0.75 });
  const mat2 = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6, metalness: 0.5 });

  // Детерминированный псевдо-случайный генератор от seed
  let _s = Math.floor(seed) || 1;
  const rnd = () => { _s = (_s * 1664525 + 1013904223) | 0; return ((_s >>> 0) % 100000) / 100000; };

  // 4–6 изогнутых металлических обломков
  const count = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < count; i++) {
    const piece = new THREE.Group();
    const len = 0.18 + rnd() * 0.18;
    const w = 0.05 + rnd() * 0.04;
    const m = (rnd() > 0.5 ? mat : mat2).clone();
    m.color.offsetHSL(0, 0, (rnd() - 0.5) * 0.08);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, w, w * 0.6), m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.rotation.set((rnd() - 0.5) * 0.6, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.6);
    piece.add(mesh);
    piece.position.set((rnd() - 0.5) * 0.18, rnd() * 0.06, (rnd() - 0.5) * 0.18);
    piece.rotation.y = rnd() * Math.PI * 2;
    group.add(piece);
  }
  // Один крупный плоский лист
  const sheetMat = new THREE.MeshStandardMaterial({ color: 0x5a5d62, roughness: 0.7, metalness: 0.6, side: THREE.DoubleSide });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.18), sheetMat);
  sheet.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5);
  sheet.position.set((rnd() - 0.5) * 0.1, 0.02, (rnd() - 0.5) * 0.1);
  sheet.castShadow = true; sheet.receiveShadow = true;
  group.add(sheet);

  const baseSpin = spin;
  return {
    group,
    update(dt) {
      if (baseSpin) group.rotation.y += dt * 0.6;
    },
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); }
      });
    },
  };
}

export function createBarrel(color = 0xa8321f, open = false) {
    const g = new THREE.Group();
    const body = mk(color, 0.55, 0.45);
    body.side = THREE.DoubleSide;
    const prof = [[0, 0], [0.25, 0], [0.27, 0.03], [0.28, 0.08], [0.292, 0.44], [0.28, 0.8], [0.27, 0.85], [0.25, 0.88], [0, 0.88]].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 28), body));
    for (const y of [0.2, 0.44, 0.68]) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.288, 0.013, 8, 28), mk(color, 0.5, 0.55));
        rib.rotation.x = H; rib.position.y = y; g.add(rib);
    }
    const topRib = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.016, 8, 28), mk(color, 0.5, 0.55));
    topRib.rotation.x = H; topRib.position.y = 0.88; g.add(topRib);
    if (open) {
        const dark = mk(0x0d0e0f, 0.9, 0, false);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 24), dark);
        top.position.y = 0.72; g.add(top);
    } else {
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.232, 0.232, 0.014, 24), mk(color, 0.6, 0.4));
        lid.position.y = 0.872; g.add(lid);
        const cap1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.025, 12), mk(0x1d1d1d, 0.5, 0.6, false));
        cap1.position.set(0.11, 0.89, 0.04); g.add(cap1);
        const cap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.02, 12), mk(0xd9a524, 0.4, 0.7, false));
        cap2.position.set(-0.12, 0.888, -0.08); g.add(cap2);
    }
    return g;
}

export function createBreakableBarrel(color = 0xa8321f) {
    const mesh = createBarrel(color);
    mesh.userData.isBreakableBarrel = true;
    mesh.userData.health = 3;
    mesh.userData.maxHealth = 3;
    mesh.userData.barrelColor = color;
    return mesh;
}

export function createBarrelDebris(scene, x, y, z, color) {
    const debrisGroup = new THREE.Group();
    debrisGroup.position.set(x, y, z);
    const m1 = mk(color, 0.6, 0.4);
    const m2 = mk(0x1d1e20, 0.8, 0.3, false);
    for (let i = 0; i < 4; i++) {
        const w = 0.08 + Math.random() * 0.07;
        const h = 0.06 + Math.random() * 0.06;
        const d = 0.06 + Math.random() * 0.04;
        const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Math.random() > 0.5 ? m1 : m2);
        piece.position.set((Math.random() - 0.5) * 0.15, 0.1 + Math.random() * 0.1, (Math.random() - 0.5) * 0.15);
        piece.rotation.set((Math.random() - 0.5), Math.random() * Math.PI * 2, (Math.random() - 0.5));
        piece.userData.isDebris = true;
        piece.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3);
        piece.userData.rotVel = new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
        debrisGroup.add(piece);
    }
    scene.add(debrisGroup);
    return debrisGroup;
}

export function spawnScrap(scene, x, y, z) {
    // ✅ spin: false отключает вращение
    const scrap = createScrap({ seed: Math.random() * 10000, spin: false });
    scrap.group.position.set(x, y, z);

    // ✅ Небольшой случайный наклон, чтобы скрап лежал естественно, а не торчал вертикально
    scrap.group.rotation.set(
        (Math.random() - 0.5) * 0.4, // наклон по X
        Math.random() * Math.PI * 2, // поворот вокруг оси
        (Math.random() - 0.5) * 0.4  // наклон по Z
    );

    scrap.group.userData.isScrap = true;
    scrap.group.userData.picked = false;
    scene.add(scrap.group);
// ✅ Регистрируем скрап для distance culling
if (window.__registerCull) window.__registerCull(scrap.group, 85, 'scrap');

    const meshes = [];
    scrap.group.traverse(o => {
        if (o.isMesh) meshes.push(o);
    });
    return { group: scrap.group, meshes, update: scrap.update, dispose: scrap.dispose };
}
