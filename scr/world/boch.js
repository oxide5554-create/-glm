// scr/world/boch.js
// ✅ Патч: createScrap встроен инлайн (оригинал был в scr/3d/scrap.js — удалён).
// ✅ НОВОЕ: createBreakableBarrel использует GLB-модель old_rusted_metal_barrel.glb.
// ✅ НОВОЕ: createScrap использует GLB-модель rust_scrap_v2.glb + физику падения.
//    Декоративные бочки (createBarrel) остались как есть.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const H = Math.PI / 2;
const mk = (c, r = 0.7, m = 0.2, map = false) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

// ✅ НОВОЕ: кэш GLB-модели скрапа (как у бочек — preload + deferred replacement).
let _scrapGltf = null;
const _pendingScraps = [];
const SCRAP_GLB_PATH = './scr/3d/rust_scrap_v2.glb';

// ✅ НОВОЕ: предзагрузка GLB-модели скрапа.
export function preloadScrapModel() {
    if (_scrapGltf) return Promise.resolve(_scrapGltf);
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(SCRAP_GLB_PATH, (gltf) => {
            _scrapGltf = gltf;
            gltf.scene.traverse(o => {
                if (o.isMesh) {
                    o.castShadow = true;
                    o.receiveShadow = true;
                    if (o.material) {
                        o.material.side = THREE.DoubleSide;
                        if (o.material.map) o.material.map.anisotropy = 8;
                    }
                }
            });
            // ✅ Масштаб под размер скрапа (~0.25м)
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const size = box.getSize(new THREE.Vector3());
            const len = Math.max(size.x, size.y, size.z);
            const TARGET_LEN = 0.28;
            if (len > 0.001) {
                gltf.scene.scale.multiplyScalar(TARGET_LEN / len);
                gltf.scene.updateMatrixWorld(true);
            }
            const box2 = new THREE.Box3().setFromObject(gltf.scene);
            gltf.scene.position.y -= box2.min.y;
            gltf.scene.updateMatrixWorld(true);
            console.log('[Boch] GLB-модель скрапа загружена');
            _replacePendingScraps();
            resolve(_scrapGltf);
        }, undefined, (err) => {
            console.warn('[Boch] Ошибка загрузки GLB скрапа, fallback на процедурный:', err);
            reject(err);
        });
    });
}

function _replacePendingScraps() {
    if (!_scrapGltf || !_scrapGltf.scene) return;
    let replaced = 0;
    for (const group of _pendingScraps) {
        while (group.children.length) {
            const child = group.children[0];
            group.remove(child);
            child.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); }
            });
        }
        const clone = _scrapGltf.scene.clone(true);
        clone.traverse(o => { if (o.isMesh && o.material) o.material = o.material.clone(); });
        group.add(clone);
        replaced++;
    }
    _pendingScraps.length = 0;
    if (replaced > 0) console.log('[Boch] Заменено процедурных скрапов на GLB: ' + replaced);
}

// ✅ НОВОЕ: кэш загруженной GLB-модели барреля.
//    Загружается один раз через preloadBarrelModel(), потом клонируется.
let _barrelGltf = null;
const BARREL_GLB_PATH = './scr/3d/old_rusted_metal_barrel.glb';
// ✅ Список бочек, созданных ДО загрузки GLB (процедурные).
//    Когда GLB загрузится — они будут заменены на GLB-клон.
const _pendingBarrels = [];

// ✅ НОВОЕ: предзагрузка GLB-модели барреля.
//    Вызывается из main.js на старте (до спавна бочек).
//    Возвращает Promise, который резолвится когда модель загружена.
//    ✅ ФИКС: после загрузки GLB заменяет ВСЕ ранее созданные процедурные бочки
//    на GLB-клон (отложенная замена — решает race condition).
export function preloadBarrelModel() {
    if (_barrelGltf) return Promise.resolve(_barrelGltf);
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(BARREL_GLB_PATH, (gltf) => {
            _barrelGltf = gltf;
            // ✅ Подготавливаем модель: тени + DoubleSide + anisotropy
            gltf.scene.traverse(o => {
                if (o.isMesh) {
                    o.castShadow = true;
                    o.receiveShadow = true;
                    if (o.material) {
                        o.material.side = THREE.DoubleSide;
                        if (o.material.map) o.material.map.anisotropy = 8;
                    }
                }
            });
            // ✅ Центрируем и масштабируем под стандартный размер бочки (~0.9м высотой)
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const size = box.getSize(new THREE.Vector3());
            const len = Math.max(size.x, size.y, size.z);
            const TARGET_LEN = 0.9;
            if (len > 0.001) {
                gltf.scene.scale.multiplyScalar(TARGET_LEN / len);
                gltf.scene.updateMatrixWorld(true);
            }
            const box2 = new THREE.Box3().setFromObject(gltf.scene);
            gltf.scene.position.y -= box2.min.y;
            gltf.scene.updateMatrixWorld(true);
            console.log('[Boch] GLB-модель барреля загружена');
            // ✅ ФИКС: заменяем все ожидающие процедурные бочки на GLB
            _replacePendingBarrels();
            resolve(_barrelGltf);
        }, undefined, (err) => {
            console.warn('[Boch] Ошибка загрузки GLB барреля, fallback на процедурную:', err);
            reject(err);
        });
    });
}

// ✅ ФИКС: отложенная замена процедурных бочек на GLB-клон.
//    Вызывается после того как GLB загрузился. Каждая бочка-Group сохраняет
//    свою позицию/поворот/userData/parent — заменяем только визуальное содержимое.
function _replacePendingBarrels() {
    if (!_barrelGltf || !_barrelGltf.scene) return;
    let replaced = 0;
    for (const group of _pendingBarrels) {
        // 1) Удаляем старые процедурные children
        while (group.children.length) {
            const child = group.children[0];
            group.remove(child);
            child.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
                    else o.material.dispose();
                }
            });
        }
        // 2) Добавляем GLB-клон как child (со всеми трансформами из preload)
        const clone = _barrelGltf.scene.clone(true);
        clone.traverse(o => {
            if (o.isMesh && o.material) o.material = o.material.clone();
        });
        group.add(clone);
        replaced++;
    }
    _pendingBarrels.length = 0;
    if (replaced > 0) {
        console.log('[Boch] Заменено процедурных бочек на GLB: ' + replaced);
    }
}

// ✅ Скрап — использует GLB-модель rust_scrap_v2.glb если загружена, иначе процедурный.
//    ✅ Физика: scrap падает с начальным случайным импульсом и гравитацией,
//       пока не коснётся земли (getGroundHeight).
function createScrap({ seed = Math.random() * 10000, spin = false, physics = true, getGroundHeight = null } = {}) {
  const group = new THREE.Group();

  // ✅ GLB-модель если загружена
  if (_scrapGltf && _scrapGltf.scene) {
    const clone = _scrapGltf.scene.clone(true);
    clone.traverse(o => { if (o.isMesh && o.material) o.material = o.material.clone(); });
    group.add(clone);
  } else {
    // ✅ Fallback: процедурный скрап + регистрация для отложенной замены
    const mat = new THREE.MeshStandardMaterial({ color: 0x6e7075, roughness: 0.45, metalness: 0.75 });
    const mat2 = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6, metalness: 0.5 });
    let _s = Math.floor(seed) || 1;
    const rnd = () => { _s = (_s * 1664525 + 1013904223) | 0; return ((_s >>> 0) % 100000) / 100000; };
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
    const sheetMat = new THREE.MeshStandardMaterial({ color: 0x5a5d62, roughness: 0.7, metalness: 0.6, side: THREE.DoubleSide });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.18), sheetMat);
    sheet.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5);
    sheet.position.set((rnd() - 0.5) * 0.1, 0.02, (rnd() - 0.5) * 0.1);
    sheet.castShadow = true; sheet.receiveShadow = true;
    group.add(sheet);
    _pendingScraps.push(group);
  }

  const baseSpin = spin;
  // ✅ Физика: начальная скорость — МАЛЕНЬКАЯ (скрап падает, а не летит).
  //    Было: вверх 2.5-5, вбок ±2.5 → скрап "вылетал" из бочки.
  //    Стало: вверх 0.5-1.5, вбок ±0.8 → скрап чуть подпрыгивает и падает рядом.
  const velocity = physics ? new THREE.Vector3(
    (Math.random() - 0.5) * 0.8,   // слабый вбок X
    0.5 + Math.random() * 1.0,      // слабо вверх
    (Math.random() - 0.5) * 0.8    // слабый вбок Z
  ) : new THREE.Vector3(0, 0, 0);
  let physicsActive = physics && !!getGroundHeight;

  return {
    group,
    update(dt) {
      // ✅ Физика падения
      if (physicsActive && getGroundHeight) {
        velocity.y -= 9.8 * dt;              // гравитация
        group.position.x += velocity.x * dt;
        group.position.y += velocity.y * dt;
        group.position.z += velocity.z * dt;
        // ✅ Проверка столкновения с землёй
        const groundY = getGroundHeight(group.position.x, group.position.z);
        if (group.position.y <= groundY) {
          group.position.y = groundY;        // фиксируем на земле
          velocity.set(0, 0, 0);
          physicsActive = false;             //停止 падения
        }
      }
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

// ✅ ИЗМЕНЕНО: createBreakableBarrel использует GLB-модель если загружена.
//    Если GLB ещё не загружена — создаёт процедурную бочку и регистрирует её
//    в _pendingBarrels. Когда GLB загрузится, _replacePendingBarrels() заменит
//    содержимое всех таких бочек на GLB-клон (позиция/поворок/userData сохранятся).
export function createBreakableBarrel(color = 0xa8321f) {
    const group = new THREE.Group();
    if (_barrelGltf && _barrelGltf.scene) {
        // ✅ GLB уже загружен — сразу клонируем
        const clone = _barrelGltf.scene.clone(true);
        clone.traverse(o => {
            if (o.isMesh && o.material) o.material = o.material.clone();
        });
        group.add(clone);
    } else {
        // ✅ GLB ещё не загружен — процедурная бочка + регистрация для замены
        const proc = createBarrel(color);
        // Перемещаем children из proc в group (чтобы group была единственным корнем)
        while (proc.children.length) group.add(proc.children[0]);
        _pendingBarrels.push(group);
    }
    group.userData.isBreakableBarrel = true;
    group.userData.health = 3;
    group.userData.maxHealth = 3;
    group.userData.barrelColor = color;
    return group;
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

export function spawnScrap(scene, x, y, z, getGroundHeight = null) {
    // ✅ physics + getGroundHeight — скрап падает пока не коснётся земли
    const scrap = createScrap({ seed: Math.random() * 10000, spin: false, physics: true, getGroundHeight });
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
