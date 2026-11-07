// ============================================================================
//  RUST — однопользовательский режим (single-player)
//  Сборка без папки scr/3d/ (оружие и модели игрока) и без мультиплеера.
//  Оружие будет добавляться с нуля позже — UI уже готов к этому.
// ============================================================================
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ✅ Локации / мир
import { createTruck, createWreckCar } from './scr/world/locations/vehicles.js';
import { createRustBuggy, createBuggyController } from './scr/world/locations/buggy.js';
import { createGasStation } from './scr/world/locations/gasstation.js';
import { createWarehouse } from './scr/world/locations/warehouse.js';
import { createCheckBlock } from './scr/world/locations/checkblock.js';

// ✅ Контроллер игрока и звук
import { PlayerController } from './scr/control/player.js';
import { SoundManager } from './scr/control/soundManager.js';

// ✅ 3D-модели (загружаются через GLTFLoader)
import { FirstPersonPlayer } from './scr/3d/firstPersonPlayer.js';

// ✅ UI
import { Hotbar, ITEMS } from './scr/ui/hotbar.js';
import { createBuildMenu } from './scr/ui/buildmenu.js';
import { Inventory } from './scr/ui/inventory.js';
import { createCraftMenu } from './scr/ui/craftmenu.js';
import { initSettings } from './scr/ui/settings.js';

// ✅ Мир: флора, террейн, бочки, постройки, хранилище
import { generateFlora, updateGrass } from './scr/world/flora.js';
import { generateTerrain, generateRoad, generateDecorations, getGroundHeight } from './scr/world/terrain.js';
import { createBreakableBarrel, createBarrelDebris, spawnScrap } from './scr/world/boch.js';
import { createBuilding } from './scr/world/building.js';

// ✅ МЕДВЕДИ (модель COTW: скелет + 15 анимаций + ИИ)
import { BearManager, BEAR_SETTINGS } from './scr/world/bear.js';
import { CrateManager } from './scr/world/crates.js';
import { createStorageWorld, openStorageMenu, closeStorageMenu, isStorageMenuOpen } from './scr/world/storage.js';

// ✅ ПОСТ-ОБРАБОТКА (кинематографичная картинка)
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ============================================================================
// СЦЕНА И КАМЕРА
// ============================================================================
const scene = new THREE.Scene();
scene.background = null; // Небо теперь рисуется шейдером
scene.fog = new THREE.Fog(0x87a9c4, 120, 600);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(0, 1.7, 0);
scene.add(camera);

// ============================================================================
// DISTANCE CULLING — скрываем далёкие объекты для оптимизации
// ============================================================================
const cullItems = [];
function registerCull(group, maxDist, type = 'generic') {
    if (!group) return;
    group.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
    cullItems.push({ group, maxDist, type });
}
let _cullFrame = 0;
function updateDistanceCulling() {
    if ((_cullFrame++ & 1) === 0) return;
    const ce = camera.matrixWorld.elements;
    const cx = ce[12], cy = ce[13], cz = ce[14];
    for (const item of cullItems) {
        const g = item.group;
        if (!g.parent) continue;
        const m = g.matrixWorld.elements;
        const dx = m[12] - cx, dy = m[13] - cy, dz = m[14] - cz;
        const lim = item.maxDist;
        const vis = dx * dx + dy * dy + dz * dz < lim * lim;
        if (g.visible !== vis) g.visible = vis;
    }
}
window.__registerCull = registerCull;

// ============================================================================
// РЕНДЕРЕР
// ============================================================================
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.normalBias = 0.003;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;
window.__renderer = renderer;
document.body.appendChild(renderer.domElement);

// ============================================================================
// ОСВЕЩЕНИЕ
// ============================================================================
const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3a5a2a, 0.55);
scene.add(hemiLight);

const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff4d6, 1.8);
sun.position.set(50, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 250;
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

const skySystem = createVolumetricSky(scene, sun);

// ============================================================================
// ЗЕМЛЯ + КАМНИ
// ============================================================================
const ground = generateTerrain(scene);
const colliders = [ground];
ground.userData.isGround = true;
const stoneGeo = new THREE.DodecahedronGeometry(0.8, 0);
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
for (let i = 0; i < 50; i++) {
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.position.set((Math.random() - 0.5) * 350, 0.4, (Math.random() - 0.5) * 350);
    stone.rotation.set(Math.random(), Math.random(), Math.random());
    stone.scale.setScalar(0.6 + Math.random() * 1.2);
    stone.castShadow = true; stone.receiveShadow = true;
    stone.userData.isStone = true; stone.userData.health = 3; stone.userData.maxHealth = 3;
    stone.userData.id = 'stone_' + i;
    scene.add(stone); colliders.push(stone);
    registerCull(stone, 90, 'stone');
}

// ============================================================================
// ФЛОРА (деревья, кусты, папоротники, цветы, трава)
// ============================================================================
const flora = generateFlora(scene, { camera: camera, area: 550, trees: 220, grass: 18000, bushes: 180, ferns: 1200, flowers: 2500 });
flora.trees.traverse(obj => { if (obj.isMesh) colliders.push(obj); });
flora.bushes.traverse(obj => { if (obj.isMesh) colliders.push(obj); });
for (const tree of flora.trees.children) registerCull(tree, 160, 'tree');
for (const bush of flora.bushes.children) registerCull(bush, 110, 'bush');

// ============================================================================
// ДОРОГА + ДЕКОР
// ============================================================================
const roadData = generateRoad(scene);
const decor = generateDecorations(scene);
colliders.push(...decor.colliders);

// ============================================================================
// БЛОКПОСТЫ (45 шт.)
// ============================================================================
for (let i = 0; i < 45; i++) {
    const x = (Math.random() - 0.5) * 650;
    const z = (Math.random() - 0.5) * 650;
    if (Math.sqrt(x * x + z * z) < 20) continue;
    const y = getGroundHeight(x, z);
    const cb = createCheckBlock({ seed: Math.random() * 10000 });
    cb.group.position.set(x, y, z);
    scene.add(cb.group);
    registerCull(cb.group, 110, 'checkblock');
    for (const col of cb.colliders) {
        const safeR = (typeof col.r === 'number' && isFinite(col.r) && col.r > 0) ? col.r : 0.5;
        // ✅ фикс: пропускаем коллайдеры с NaN-координатами (сыпали ошибки в консоль)
        if (typeof col.x !== 'number' || typeof col.z !== 'number' || !isFinite(col.x) || !isFinite(col.z)) continue;
        const colMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(safeR, safeR, 2.5, 8),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        colMesh.position.set(x + col.x, y + 1.25, z + col.z);
        colMesh.userData.isCollider = true;
        scene.add(colMesh); colliders.push(colMesh);
    }
}

// ============================================================================
// МАШИНЫ НА ДОРОГЕ (14 шт.)
// ============================================================================
const vehicles = [];
for (let i = 0; i < 14; i++) {
    const t = i / 14;
    const point = roadData.curve.getPointAt(t);
    if (Math.sqrt(point.x * point.x + point.z * point.z) < 25) continue;
    const tangent = roadData.curve.getTangentAt(t);
    const y = getGroundHeight(point.x, point.z);
    const isTruck = i % 2 === 0;
    const vehicle = isTruck ? createTruck({ seed: 1000 + i * 77 }) : createWreckCar({ seed: 2000 + i * 77 });
    vehicle.group.position.set(point.x, y, point.z);
    vehicle.group.rotation.y = Math.atan2(tangent.x, tangent.z);
    vehicle.group.userData.id = 'veh_' + i;
    scene.add(vehicle.group);
    vehicles.push(vehicle);
    registerCull(vehicle.group, 140, 'vehicle');
    vehicle.group.traverse(o => {
        if (o.isMesh) {
            o.userData.isVehicle = true;
            o.userData.vehicleId = vehicle.group.userData.id;
            colliders.push(o);
        }
    });
}

// ============================================================================
// ЗАПРАВКИ (3 шт.)
// ============================================================================
const gsPositions = [
    { x: 60,   z: -60  },
    { x: -140, z: 100  },
    { x: 220,  z: -160 },
];
const gasStations = [];
for (let gsi = 0; gsi < gsPositions.length; gsi++) {
    const gsp = gsPositions[gsi];
    const gsY = getGroundHeight(gsp.x, gsp.z);
    const gs = createGasStation({ seed: 42 + gsi * 137, vehicles: true, lightScale: 1 });
    gs.group.position.set(gsp.x, gsY, gsp.z);
    scene.add(gs.group);
    gs.group.traverse(obj => { if (obj.isMesh) { obj.userData.isGasStation = true; colliders.push(obj); } });
    gasStations.push(gs);
    registerCull(gs.group, 180, 'gasstation');
}
const gasStation = gasStations[0];
const buggy = gasStation.garageCar;

// ============================================================================
// СКЛАДЫ / АМБАРЫ (2 шт.)
// ============================================================================
const warehousePositions = [
    { x: -150, z: -200, yaw: 0.35 },   // юго-запад карты
    { x: 175,  z: 150,  yaw: -1.2 },   // северо-восток карты
];
const warehouses = [];
for (let wi = 0; wi < warehousePositions.length; wi++) {
    const wp = warehousePositions[wi];
    const wh = createWarehouse({ seed: 7 + wi * 101 });
    wh.place(wp.x, wp.z, getGroundHeight, wp.yaw);
    scene.add(wh.group);
    wh.group.traverse(o => { if (o.isMesh) { o.userData.isWarehouse = true; colliders.push(o); } });
    registerCull(wh.group, 220, 'warehouse');
    warehouses.push(wh);
}

// ============================================================================
// ✅ ЯЩИКИ (военные + деревянные) — в заправках и амбарах
// ============================================================================
const crateManager = new CrateManager(scene, {
    onOpenCrate: (crate, loot) => {
        // ✅ При открытии ящика — показываем UI с лутом
        showCrateLootUI(crate, loot);
    },
});
crateManager.load().then(() => {
    // ✅ Размещаем ящики в заправках: 1 военный + 3 деревянных
    for (const gsp of gsPositions) {
        crateManager.spawnInGasStation(gsp);
    }
    // ✅ Размещаем ящики в амбарах: 2 военных + 4 деревянных
    for (const wp of warehousePositions) {
        crateManager.spawnInWarehouse(wp);
    }
    console.log('[Crates] Ящики размещены в заправках и амбарах');
}).catch(err => {
    console.warn('[Crates] Ошибка загрузки моделей ящиков:', err);
});

// ✅ UI для открытия ящика (простой overlay)
function showCrateLootUI(crate, loot) {
    // Удаляем старый UI если есть
    const old = document.getElementById('crate-ui');
    if (old) old.remove();

    const ui = document.createElement('div');
    ui.id = 'crate-ui';
    ui.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1500;';
    const panel = document.createElement('div');
    panel.style.cssText = 'background:rgba(25,25,25,0.95);border:2px solid #000;padding:24px;color:#fff;font-family:Arial,sans-serif;min-width:300px;';
    const title = document.createElement('div');
    title.textContent = crate.type === 'military' ? '📦 ВОЕННЫЙ ЯЩИК' : '📦 ДЕРЕВЯННЫЙ ЯЩИК';
    title.style.cssText = 'font-size:18px;font-weight:bold;margin-bottom:14px;text-align:center;color:#ccc;border-bottom:1px solid #555;padding-bottom:8px;';
    panel.appendChild(title);

    const lootList = document.createElement('div');
    lootList.style.cssText = 'margin-bottom:14px;';
    if (loot.length === 0) {
        lootList.textContent = 'Ящик пуст';
        lootList.style.color = '#888';
    } else {
        for (const item of loot) {
            const row = document.createElement('div');
            row.style.cssText = 'padding:6px 8px;margin:4px 0;background:#333;display:flex;justify-content:space-between;align-items:center;';
            const name = document.createElement('span');
            name.textContent = item.id;
            name.style.color = '#ddd';
            const count = document.createElement('span');
            count.textContent = '×' + item.count;
            count.style.color = '#ff0';
            count.style.fontWeight = 'bold';
            row.appendChild(name);
            row.appendChild(count);
            lootList.appendChild(row);
            // ✅ Добавляем предмет в инвентарь
            inventory.addItem(item.id, item.count);
        }
    }
    panel.appendChild(lootList);

    const hint = document.createElement('div');
    hint.textContent = 'Нажми F или ESC чтобы закрыть';
    hint.style.cssText = 'text-align:center;color:#888;font-size:12px;';
    panel.appendChild(hint);

    ui.appendChild(panel);
    document.body.appendChild(ui);

    // ✅ Закрытие на F или ESC или клик
    const closeHandler = (e) => {
        if (e.code === 'KeyF' || e.code === 'Escape') {
            ui.remove();
            window.removeEventListener('keydown', closeHandler);
            if (document.pointerLockElement === null) {
                // восстанавливаем pointer lock
            }
        }
    };
    window.addEventListener('keydown', closeHandler);
    ui.addEventListener('click', () => {
        ui.remove();
        window.removeEventListener('keydown', closeHandler);
    });
}

// Убираем деревья и кусты, выросшие внутри складов
const inWarehouseZone = (pos, mx, mz) => {
    for (const wp of warehousePositions) {
        const c = Math.cos(wp.yaw), s = Math.sin(wp.yaw);
        const dx = pos.x - wp.x, dz = pos.z - wp.z;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) < mx && Math.abs(lz) < mz) return true;
    }
    return false;
};
const removedMeshes = new Set();
for (const tree of [...flora.trees.children]) {
    if (inWarehouseZone(tree.position, 26, 20)) {
        tree.traverse(o => { if (o.isMesh) removedMeshes.add(o); });
        flora.trees.remove(tree);
    }
}
for (const bush of [...flora.bushes.children]) {
    if (inWarehouseZone(bush.position, 24, 18)) {
        bush.traverse(o => { if (o.isMesh) removedMeshes.add(o); });
        flora.bushes.remove(bush);
    }
}
for (const d of [...decor.group.children]) {
    if (inWarehouseZone(d.position, 26, 20)) {
        d.traverse(o => { if (o.isMesh) removedMeshes.add(o); });
        decor.group.remove(d);
    }
}
for (let i = colliders.length - 1; i >= 0; i--) {
    if (removedMeshes.has(colliders[i])) colliders.splice(i, 1);
}

// ============================================================================
// 🐻 МЕДВЕДИ (модель из COTW: скелет, 15 анимаций, встроенная текстура)
// ============================================================================
// Препятствия для обхода медведями: всё, кроме земли и самих медведей
const bearObstacles = colliders.filter(o => o !== ground && !(o.userData && o.userData.isBear));

const bearManager = new BearManager(scene, {
    // звук
    playSound: (name, opts) => sound.play(name, opts),
    getListenerPos: () => camera.position,
    // коллайдеры (хитбоксы медведей ловят удары топором и пули)
    addHitboxToColliders: (mesh) => colliders.push(mesh),
    removeHitboxFromColliders: (mesh) => {
        const idx = colliders.indexOf(mesh);
        if (idx > -1) colliders.splice(idx, 1);
    },
    registerCull: (g, d, t) => registerCull(g, d, t),
    // колбэки
    onBearHurt: (bear, hp, maxHp) => {
        showToast(`🐻 Медведь: ${Math.ceil(hp)}/${maxHp} HP`);
    },
    onBearKilled: (bear) => {
        // ✅ Лут больше не падает автоматически — его нужно добыть с туши
        //    (удары инструментом по трупу дают 1–3 рандомных ресурса).
        showToast(`🐻 Медведь убит! Добей тушу инструментом, чтобы получить ресурсы`);
    },
    onPlayerDamaged: (dmg, bear) => {
        if (inBuggy) return;                       // в багги медведь не достаёт
        hp -= dmg;
        setHp();
        flashDamage(dmg / 30);
        if (hp <= 0) die();
    },
    onBearGiveUp: () => {},
});

// Безопасные точки спавна: подальше от респауна, заправок, складов и дороги
const _roadPoints = [];
if (roadData && roadData.curve) {
    for (let i = 0; i <= 60; i++) _roadPoints.push(roadData.curve.getPointAt(i / 60));
}
function isBearSpawnSafe(x, z) {
    if (Math.hypot(x, z) < 45) return false;                       // не у респауна игрока
    for (const gsp of gsPositions) if (Math.hypot(x - gsp.x, z - gsp.z) < 50) return false;
    for (const wp of warehousePositions) if (Math.hypot(x - wp.x, z - wp.z) < 55) return false;
    for (const p of _roadPoints) {
        if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < 15 * 15) return false;
    }
    return true;
}

// Загружаем модель и спавним медведей (асинхронно — игра не ждёт)
bearManager.load().then(() => {
    bearManager.spawn(BEAR_SETTINGS.count, isBearSpawnSafe);
    window.__bearManager = bearManager;   // дебаг: доступ из консоли
    // ✅ Респавн популяции: заполняем недостающих (alive + pendingRespawns < count).
    //    Тушки, которые были полностью добыты, уже стоят в очереди на респавн
    //    через BEAR_SETTINGS.respawnDelay (600 сек = 10 минут). Этот таймер только
    //    заполняет «провалы» начального спавна (если медведь не заспавнился из-за
    //    небезопасной позиции) и не трогает тушки, которые уже ждут своего 10-мин.
    setInterval(() => {
        const alive = bearManager.aliveCount;
        const pending = bearManager.pendingRespawnCount;
        if (alive + pending < BEAR_SETTINGS.count && !document.hidden) {
            let placed = false, tries = 0;
            while (!placed && tries < 60) {
                tries++;
                const x = (Math.random() - 0.5) * 480;
                const z = (Math.random() - 0.5) * 480;
                if (!isBearSpawnSafe(x, z)) continue;
                // и подальше от игрока
                if (Math.hypot(x - camera.position.x, z - camera.position.z) < 70) continue;
                bearManager.spawnBearAt(x, z);
                placed = true;
            }
        }
    }, 15000);
}).catch(err => {
    console.warn('[Bear] Медведи не загрузились:', err);
});

// ============================================================================
// БАГГИ — управление с клавиатуры
// ============================================================================
const buggyInput = { forward: false, backward: false, left: false, right: false, brake: false };

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') buggyInput.forward = true;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') buggyInput.backward = true;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') buggyInput.left = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') buggyInput.right = true;
    if (e.code === 'Space') buggyInput.brake = true;
});
window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') buggyInput.forward = false;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') buggyInput.backward = false;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') buggyInput.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') buggyInput.right = false;
    if (e.code === 'Space') buggyInput.brake = false;
});

const gsX = gasStations[0].group.position.x;
const gsZ = gasStations[0].group.position.z;
const gsY = gasStations[0].group.position.y;
const gsFloorGround = (x, z) => {
    let h = getGroundHeight(x, z);
    const lx = x - gsX, lz = z - gsZ;
    if (lx > -11 && lx < 11 && lz > -8.4 && lz < 14.5) h = Math.max(h, gsY);
    return h;
};

const buildingSystem = createBuilding(scene, ground, getGroundHeight);
const storageWorld = createStorageWorld(scene, getGroundHeight, buildingSystem);

const buggyDriverCtl = createBuggyController(buggy, camera, {
    getGroundHeight: gsFloorGround,
    colliders: colliders,
    get buildingColliders() { return buildingSystem.colliders; }
});

buggy.group.traverse(o => { if (o.isMesh) { o.userData.isVehicle = true; colliders.push(o); } });
if (buggy.seatHitboxes) {
    for (const hb of buggy.seatHitboxes) {
        hb.userData.isBuggySeat = true;
        hb.userData.buggyRef = buggy;
        colliders.push(hb);
    }
}

// ============================================================================
// ЗВУКОВОЙ МЕНЕДЖЕР
// ============================================================================
const sound = new SoundManager(camera);
sound.load('chop1', './sounds/wood/WoodChop_01.wav');
sound.load('treeFall', './sounds/wood/BigTreeFalling_03.ogg');
sound.load('stoneHit1', './sounds/stone/Stone Hit 01.wav');
sound.load('stoneBreak', './sounds/stone/StoneBreak_01.ogg');
sound.load('barrelBreak', './sounds/boch/BarrelBreak_02.ogg');
sound.load('metalHit', './sounds/boch/Metal Hit 01.wav');
// ✅ Звук выстрела АК-47
sound.load('akShot', './sounds/AssaultRifle_Shot_Tail_01.wav');
// ✅ Звук выстрела берданки
sound.load('berdanaShot', './sounds/berdana/shot.mp3');

// ✅ Звуки медведя (3 новых звука, загружены пользователем):
//    notice — медведь заметил игрока (idle/wander → alerted)
//    attack — медведь нападает на игрока (chase → attack)
//    death  — смерть медведя
//    pain   — звук получения урона (оставлен)
sound.load('bear_notice', './sounds/bear/notice.mp3');
sound.load('bear_attack', './sounds/bear/attack.mp3');
sound.load('bear_death',  './sounds/bear/death.mp3');
sound.load('bear_pain',   './sounds/bear/pain.wav');

// ============================================================================
// 3D-МОДЕЛИ ИГРОКА И ОРУЖИЯ
// ============================================================================
// ✅ Игрок от 1-го лица: player_claude.glb + axe_claude.glb (полный риг,
//    IK-руки, пальцы, анимации idle/atk1/atk2). Топор уже привязан внутри
//    класса FirstPersonPlayer — отдельный StoneAxe больше не нужен.
const fpPlayer = new FirstPersonPlayer(camera, scene, renderer);
fpPlayer.setVisible(false);  // оружие скрыто, пока игрок не выберет его в хотбаре

// ✅ Когда модель игрока загрузится — включить 1-е лицо (clipping + только руки)
window.__onPlayerLoaded = (player) => {
    player.setFirstPerson(true);
    console.log('[Main] 1-е лицо включено (player_claude + axe_claude)');
};

// ============================================================================
// HP-СИСТЕМА
// ============================================================================
let hp = 100;
const hpBar = document.getElementById('hpbar');
const hpText = document.getElementById('hptext');
function setHp() {
    hp = Math.max(0, Math.min(100, hp));
    hpBar.style.width = hp + '%';
    hpText.textContent = Math.round(hp);
}

// ============================================================================
// 🩸 КРАСНАЯ ВСПЫШКА ПРИ УРОНЕ (создаётся динамически)
// ============================================================================
const dmgFlash = document.createElement('div');
dmgFlash.id = 'dmgflash';
dmgFlash.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:25;opacity:0;' +
    'transition:opacity 0.35s;background:radial-gradient(ellipse at center,' +
    'rgba(160,10,10,0) 40%,rgba(160,10,10,0.55) 100%);';
document.body.appendChild(dmgFlash);
let dmgFlashT = 0;
function flashDamage(strength = 1) {
    dmgFlash.style.transition = 'none';
    dmgFlash.style.opacity = String(Math.min(0.9, 0.45 + strength * 0.45));
    requestAnimationFrame(() => {
        dmgFlash.style.transition = 'opacity 0.5s';
        dmgFlash.style.opacity = '0';
    });
}

// ============================================================================
// TOAST (всплывающие подсказки)
// ============================================================================
let toastEl = null, toastTimer = null;
function showToast(text) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
}

// ============================================================================
// RAYCASTER (для добычи ресурсов, проверок дверей и т.д.)
// ============================================================================
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
function getHit() {
    raycaster.setFromCamera(screenCenter, camera);
    raycaster.far = 200;
    // ✅ true = рекурсивно — проверяет children Group (деревья, камни, машины)
    const intersects = raycaster.intersectObjects(colliders, true);
    if (intersects.length > 0) return intersects[0];
    return null;
}
function hasWallBetween(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.01) return false;
    dir.normalize();
    const ray = new THREE.Raycaster(from.clone(), dir, 0, dist);
    const hits = ray.intersectObjects(buildingSystem.group.children, true);
    for (const h of hits) {
        let obj = h.object;
        while (obj) {
            if (obj.userData && obj.userData.piece) {
                if (obj.userData.piece.part === 'window' || obj.userData.piece.part === 'doorway') return false;
                return true;
            }
            if (obj.userData && obj.userData.doorKey) {
                const door = buildingSystem.doors.get(obj.userData.doorKey);
                if (door && door.t > 0.5) return false;
                return true;
            }
            obj = obj.parent;
        }
    }
    return false;
}

// ============================================================================
// СОСТОЯНИЕ ОРУЖИЯ / РЕЖИМЫ
// ✅ Локальный идентификатор игрока (для замков дверей — заменяет net.id в сингле)
const PLAYER_ID = 'local_player_' + Math.floor(Math.random() * 1e9).toString(36);

let currentWeapon = 'none';
let inBuggy = false;
let currentBuggySeat = null;
let currentBuggyVehicle = null;
const isDriver = () => inBuggy && currentBuggySeat === 'driver';

// ✅ Cooldown'ы оружия/инструментов (сек)
let toolCooldown     = 0;   // для топора/кирки между ударами
let akFireCooldown   = 0;   // для АК (автоогонь при зажатой ЛКМ)
let berdanaCooldown  = 0;   // для берданки (одиночные с кулдауном 0.5 сек)
const TOOL_COOLDOWN      = 0.45;   // 450 мс между ударами
const AK_FIRE_INTERVAL   = 0.10;   // 100 мс между выстрелами АК (600 выстр/мин)
const BERDANA_COOLDOWN   = 0.50;   // 500 мс между выстрелами берданки
const AK_MAG_SIZE        = 30;
const BERDANA_MAG_SIZE   = 18;

// ✅ Флаг: показывать ли модель игрока от 1-го лица.
//    В Rust 1-м лице тело игрока НЕ видно (только руки+топор).
//    Поэтому по умолчанию false — модель скрыта, виден только топор.
//    Можно переключить в true если хочешь видеть плечи/грудь как на превью.
let playerVisible = false;
// ✅ Сигнал для firstPersonPlayer: сразу скрыть тело после загрузки
window.__initialPlayerVisible = false;

window.buildMode = false;
window.storageMode = false;
window.doorMode = false;
window.lockMode = false;

// ✅ Оружие (руки + топор) — управляется классом FirstPersonPlayer.
//    Показывается, когда в хотбаре выбран камень или кирка.
function hideAllWeapons() {
    // Скрываем руки + топор (если были показаны)
    if (fpPlayer) fpPlayer.setVisible(false);
}
function resetBuildModes() {
    window.buildMode = false;
    window.storageMode = false;
    window.doorMode = false;
    window.lockMode = false;
    storageWorld.hideGhost();
    buildingSystem.hideDoorGhost();
    buildingSystem.hideLockGhost();
}
function checkActiveWeapon() {
    hideAllWeapons();
    if (isDriver()) { currentWeapon = 'none'; resetBuildModes(); fpPlayer.setWeapon('none'); return; }
    const item = hotbar.getCurrentItem();
    // ✅ Отладка: какой предмет сейчас выбран и что мы делаем
    console.log('[checkActiveWeapon] item:', item ? item.id : 'none');
    if (!item) {
        currentWeapon = 'none';
        resetBuildModes();
        fpPlayer.setWeapon('none');
        return;
    }
    if (item.id !== 'blueprint' && window.buildMode) {
        window.buildMode = false;
        buildingSystem.cancel();
        buildingSystem.hideDoorGhost();
    }
    if (item.id === 'storage_chest') {
        currentWeapon = 'storage';
        resetBuildModes();
        window.storageMode = true;
        storageWorld.showGhost();
        fpPlayer.setWeapon('none');
        return;
    }
    if (item.id === 'door') {
        currentWeapon = 'door';
        resetBuildModes();
        window.doorMode = true;
        buildingSystem.showDoorGhostForPlace();
        fpPlayer.setWeapon('none');
        return;
    }
    if (item.id === 'lock') {
        currentWeapon = 'lock';
        resetBuildModes();
        window.lockMode = true;
        buildingSystem.showLockGhostForPlace(PLAYER_ID);
        fpPlayer.setWeapon('none');
        return;
    }
    resetBuildModes();
    // ✅ Инструменты: топор (рубит деревья) / кирка (руби камни) — setWeapon включает видимость рук
    if (item.id === 'rock')                { currentWeapon = 'rock';             fpPlayer.setWeapon('axe');     }
    else if (item.id === 'stonePickaxe')    { currentWeapon = 'stonePickaxe';     fpPlayer.setWeapon('pickaxe'); }
    else if (item.id === 'concretePickaxe') { currentWeapon = 'concretePickaxe';  fpPlayer.setWeapon('pickaxe'); }
    // ✅ Оружие: АК-47 (автомат) / берданка (винтовка)
    else if (item.id === 'ak47')            { currentWeapon = 'ak47';             fpPlayer.setWeapon('ak47');    }
    else if (item.id === 'berdana')         { currentWeapon = 'berdana';          fpPlayer.setWeapon('berdana'); }
    else if (item.id === 'blueprint')       { currentWeapon = 'blueprint';        fpPlayer.setWeapon('none');    }
    else                                    { currentWeapon = 'none';             fpPlayer.setWeapon('none');    }
}

// ============================================================================
// ИНВЕНТАРЬ + ХОТБАР + КРАФТ-МЕНЮ (пустое) + МЕНЮ СТРОЯ
// ============================================================================
const inventory = new Inventory();
const hotbar = new Hotbar(inventory, (item, index) => { checkActiveWeapon(); });
inventory.hotbar = hotbar;
window.inventory = inventory;
window.__inventoryRef = inventory;

// ✅ Стартовые патроны (предметы уже расставлены в inventory.js)
window.__akAmmo = AK_MAG_SIZE;
window.__berdanaAmmo = BERDANA_MAG_SIZE;
// ✅ Несколько попыток render хотбара — чтобы точно отрисовался после загрузки DOM
setTimeout(() => { hotbar.render(); inventory.render && inventory.render(); }, 50);
setTimeout(() => { hotbar.render(); }, 200);
setTimeout(() => { hotbar.render(); }, 500);
console.log('[Hotbar] Стартовый инвентарь. Хотбар (0-5):', inventory.slots.slice(0, 6).map(s => s ? s.item.id : 'empty'));
console.log('[Hotbar] Инвентарь (6+):', inventory.slots.slice(6, 12).map(s => s ? s.item.id : 'empty'));

const craftMenu = createCraftMenu(document.body, inventory, {
    onCrafted: (id, count) => { showToast(`✅ Создано: ${id} x${count}`); },
    onHint: (msg) => showToast(msg),
    onToggle: (isOpen) => {}
});

const buildMenu = createBuildMenu(document.body, buildingSystem);

checkActiveWeapon();

// ============================================================================
// УПРАВЛЕНИЕ ИГРОКОМ
// ============================================================================
const controls = new PointerLockControls(camera, document.body);
const player = new PlayerController(controls, camera, ground);
// ✅ Передаём colliders в player для collision detection (деревья, камни, машины)
player.colliders = colliders;
let settingsUI = null;

const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
    // ✅ Синглплеер: просто блокируем указатель — никакого нет-коннекта
    try { controls.lock(); } catch (e) {}
});
controls.addEventListener('lock', () => {
    overlay.style.display = 'none';
    player.enabled = true;
    if (inventory.isOpen) inventory.close();
    if (isStorageMenuOpen()) closeStorageMenu();
});
controls.addEventListener('unlock', () => {
    if (!settingsUI || !settingsUI.isOpen()) overlay.style.display = 'flex';
    player.enabled = false;
    mouseDown = false;
});

// ============================================================================
// РЕСПАВН / СМЕРТЬ (синглплеер)
// ============================================================================
function respawn() {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    camera.position.set(x, getGroundHeight(x, z) + 1.7, z);
    player.velocity.set(0, 0, 0);
    hp = 100; setHp();
}
function die() {
    showToast('☠️ Ты погиб! Респаун…');
    respawn();
}

function applyBuildingDamage(dmg) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(screenCenter, camera);
    const hitInfo = buildingSystem.tryHitPiece(ray, 5.0);
    if (hitInfo) {
        const hpData = buildingSystem.getPieceHp(hitInfo.key);
        if (hpData) {
            const newHp = Math.max(0, hpData.hp - dmg);
            if (hitInfo.isDoor) {
                buildingSystem.damageDoor(hitInfo.key, newHp, hpData.maxHp);
                if (newHp <= 0) { buildingSystem.removeDoor(hitInfo.key); }
            } else {
                buildingSystem.damagePiece(hitInfo.key, newHp, hpData.maxHp);
                if (newHp <= 0) { buildingSystem.removePiece(hitInfo.key); }
            }
        }
    }
}

// ============================================================================
// ДОБЫЧА РЕСУРСОВ
// ============================================================================
function findTree(obj) { let cur = obj; while (cur) { if (cur.userData && cur.userData.isTree) return cur; cur = cur.parent; } return null; }
function hitTree(tree) {
    const ud = tree.userData;
    if (ud.falling || ud.fallen) return;
    ud.health--; ud.shakeT = 0.35;
    sound.play('chop1', { volume: 0.9 });
    inventory.addItem('wood', 20); showToast(`🪓 +20 дерева (${ud.health}/${ud.maxHealth})`);
    if (ud.health <= 0) {
        ud.falling = true; ud.fallT = 0; ud.fallDir = Math.random() > 0.5 ? 1 : -1;
        sound.play('treeFall', { volume: 1 });
        inventory.addItem('wood', 100); showToast('🌲 Дерево упало! +100 дерева');
    }
}
function findStone(obj) { let cur = obj; while (cur) { if (cur.userData && cur.userData.isStone) return cur; cur = cur.parent; } return null; }
function hitStone(stoneMesh) {
    const ud = stoneMesh.userData;
    if (ud.health <= 0) return;
    ud.health--;
    stoneMesh.rotation.x += (Math.random() - 0.5) * 0.15; stoneMesh.rotation.z += (Math.random() - 0.5) * 0.15;
    sound.play('stoneHit1', { volume: 0.9 });
    inventory.addItem('stone', 15); showToast(`⛏️ +15 камня (${ud.health}/${ud.maxHealth})`);
    if (ud.health <= 0) {
        scene.remove(stoneMesh); const idx = colliders.indexOf(stoneMesh); if (idx > -1) colliders.splice(idx, 1);
        sound.play('stoneBreak', { volume: 1.0 });
        inventory.addItem('stone', 30); showToast('💥 Камень разрушен! +30 камня');
    }
}
// ✅ Удар инструментом (топор → деревьям, кирка → камням).
// Урон наносится СРАЗУ при клике. Кулдаун 0.5 сек между ударами.
function hitWithTool() {
    if (toolCooldown > 0) return;
    toolCooldown = 0.5;

    if (!window.__swingCounter) window.__swingCounter = 0;
    const swingType = (window.__swingCounter++ % 2 === 0) ? 'atk1' : 'atk2';
    fpPlayer.triggerSwing(swingType);
    sound.play('chop1', { volume: 0.4 });

    const hit = getHit();
    if (!hit || hit.distance >= 3.5) return;

    const bear = findBear(hit.object);
    if (bear) {
        if (bear.dead) {
            const drops = bear.harvest({ playerPos: camera.position });
            if (drops) {
                const NAMES = { rawMeat: 'Мясо', bone: 'Кости', cloth: 'Ткань', animalFat: 'Животный жир' };
                let msg = [];
                for (const itemId in drops) {
                    inventory.addItem(itemId, drops[itemId]);
                    msg.push(`+${drops[itemId]} ${NAMES[itemId] || itemId}`);
                }
                showToast('🐻 ' + msg.join(', '));
            }
        } else {
            bear.damage(45, { playerPos: camera.position });
        }
        return;
    }
    // ✅ Топор → только деревья
    if (currentWeapon === 'rock') {
        const tree = findTree(hit.object);
        if (tree) hitTree(tree);
    }
    // ✅ Кирка → только камни
    else if (currentWeapon === 'stonePickaxe' || currentWeapon === 'concretePickaxe') {
        const stone = findStone(hit.object);
        if (stone) hitStone(stone);
    }
}

// ✅ Выстрел из АК-47 (используется и для одиночного, и для автоогня)
function fireAK() {
    fpPlayer.triggerShoot();
    if (!window.__akAmmo) window.__akAmmo = AK_MAG_SIZE;
    if (window.__akAmmo <= 0) {
        showToast('🔫 Нет патронов! Нажми R чтобы перезарядить');
        return;
    }
    window.__akAmmo--;
    sound.play('akShot', { volume: 0.7 });
    showToast('🔫 ' + window.__akAmmo + '/' + AK_MAG_SIZE);
    // 🐻 Проверяем попадание пули
    const shotHit = getHit();
    if (shotHit) {
        const shotBear = findBear(shotHit.object);
        if (shotBear && !shotBear.dead) shotBear.damage(38, { playerPos: camera.position });
    }
}

// ✅ Выстрел из берданки (винтовка, одиночные с кулдауном 0.5 сек)
function fireBerdana() {
    fpPlayer.triggerShoot();
    if (!window.__berdanaAmmo) window.__berdanaAmmo = BERDANA_MAG_SIZE;
    if (window.__berdanaAmmo <= 0) {
        showToast('🎯 Нет патронов! Нажми R чтобы перезарядить');
        return;
    }
    window.__berdanaAmmo--;
    sound.play('berdanaShot', { volume: 0.85 });
    showToast('🎯 ' + window.__berdanaAmmo + '/' + BERDANA_MAG_SIZE);
    // 🐻 Проверяем попадание пули (берданка мощнее — 55 урона)
    const shotHit = getHit();
    if (shotHit) {
        const shotBear = findBear(shotHit.object);
        if (shotBear && !shotBear.dead) shotBear.damage(55, { playerPos: camera.position });
    }
}

function findBarrel(obj) { let cur = obj; while (cur) { if (cur.userData && cur.userData.isBreakableBarrel) return cur; cur = cur.parent; } return null; }
function hitBarrel(barrelMesh) {
    const ud = barrelMesh.userData;
    if (ud.health <= 0 || ud.breaking) return;
    ud.health--; sound.play('metalHit', { volume: 0.8 });
    showToast(`🛢️ Удар по бочке (${ud.health}/${ud.maxHealth})`);
    barrelMesh.rotation.x += (Math.random() - 0.5) * 0.1; barrelMesh.rotation.z += (Math.random() - 0.5) * 0.1;
    if (ud.health <= 0) {
        ud.breaking = true;
        breakBarrel(barrelMesh);
    }
}
function findScrap(obj) { let cur = obj; while (cur) { if (cur.userData && cur.userData.isScrap) return cur; cur = cur.parent; } return null; }
// 🐻 Найти медведя по объекту попадания (хитбокс → медведь)
function findBear(obj) { let cur = obj; while (cur) { if (cur.userData && cur.userData.isBear && cur.userData.bear) return cur.userData.bear; cur = cur.parent; } return null; }
// дебаг: проверка попадания в медведя тем же рейкастом, что и выстрел АК
window.__bearDebugShot = () => {
    const hit = getHit();
    if (!hit) return null;
    const bear = findBear(hit.object);
    return { distance: Math.round(hit.distance * 10) / 10, hitBear: !!bear, bearIndex: bear ? bear.index : null, objectType: hit.object.userData.isGround ? 'ground' : hit.object.userData.isTree ? 'tree' : hit.object.type };
};
function pickScrap(scrapGroup) {
    const ud = scrapGroup.userData;
    if (ud.picked) return;
    ud.picked = true;
    const amount = Math.floor(Math.random() * 7) + 2;
    inventory.addItem('scrap', amount); showToast(`🔩 Подобран скрап! (+${amount})`);
    scene.remove(scrapGroup); scrapGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    if (window.worldScraps) { const idx = window.worldScraps.findIndex(s => s.group === scrapGroup); if (idx > -1) window.worldScraps.splice(idx, 1); }
}
function breakBarrel(barrelMesh) {
    const ud = barrelMesh.userData;
    const pos = barrelMesh.getWorldPosition(new THREE.Vector3());
    sound.play('barrelBreak', { volume: 1.0 });
    const debris = createBarrelDebris(scene, pos.x, pos.y + 0.4, pos.z, ud.barrelColor);
    if (!window.barrelDebris) window.barrelDebris = [];
    window.barrelDebris.push({ debris, life: 0, maxLife: 3.5, onGround: false });
    const scrapData = spawnScrap(scene, pos.x, pos.y + 0.5, pos.z);
    scrapData.id = 'scrap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    if (!window.worldScraps) window.worldScraps = [];
    window.worldScraps.push(scrapData);
    for (const mesh of scrapData.meshes) colliders.push(mesh);
    showToast('💥 Бочка разрушена! Скрап выпал');
    const parent = barrelMesh.parent;
    if (parent) parent.remove(barrelMesh);
    const idx = colliders.indexOf(barrelMesh);
    if (idx > -1) colliders.splice(idx, 1);
}

// ============================================================================
// ОБРАБОТКА МЫШИ
// ============================================================================
let mouseDown = false;

window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousedown', (e) => {
    if (inventory.isOpen || isStorageMenuOpen()) return;
    if (!player.enabled && !inBuggy) return;
    if (isDriver()) return;

    // 1. Сундук-призрак (storageMode)
    if (window.storageMode) {
        if (e.button === 0) {
            if (inventory.countItem('wood') >= 50 && inventory.countItem('storage_chest') >= 1) {
                const placed = storageWorld.tryPlace();
                if (placed) {
                    inventory.removeItem('wood', 50);
                    inventory.removeItem('storage_chest', 1);
                    showToast('📦 Сундук установлен');
                    window.storageMode = false;
                    storageWorld.hideGhost();
                    checkActiveWeapon();
                } else { showToast('❌ Здесь нельзя поставить!'); }
            } else { showToast('❌ Нужно 50 дерева и сундук!'); }
        } else if (e.button === 2) {
            window.storageMode = false;
            storageWorld.hideGhost();
            checkActiveWeapon();
        }
        return;
    }
    // 2. Дверь-призрак (doorMode)
    if (window.doorMode) {
        if (e.button === 0) {
            if (inventory.countItem('door') >= 1) {
                const placed = buildingSystem.tryPlaceDoor();
                if (placed) {
                    inventory.removeItem('door', 1);
                    showToast('🚪 Дверь установлена');
                    if (inventory.countItem('door') < 1) { window.doorMode = false; buildingSystem.hideDoorGhost(); checkActiveWeapon(); }
                } else { showToast('❌ Нет дверного проёма!'); }
            } else { showToast('❌ Нет двери!'); }
        } else if (e.button === 2) { window.doorMode = false; buildingSystem.hideDoorGhost(); checkActiveWeapon(); }
        return;
    }
    // 3. Замок-призрак (lockMode)
    if (window.lockMode) {
        if (e.button === 0) {
            if (inventory.countItem('lock') >= 1) {
                const ray = new THREE.Raycaster();
                ray.setFromCamera(screenCenter, camera);
                const res = buildingSystem.tryPlaceLock(ray, 4.0, PLAYER_ID);
                if (res && res.success) {
                    inventory.removeItem('lock', 1);
                    showToast('🔒 Замок установлен');
                    if (inventory.countItem('lock') < 1) { window.lockMode = false; buildingSystem.hideLockGhost(); checkActiveWeapon(); }
                } else if (res && res.failed) { showToast('❌ Уже заперто'); }
                else { showToast('❌ Нет двери перед тобой'); }
            } else { showToast('❌ Нет замка!'); }
        } else if (e.button === 2) { window.lockMode = false; buildingSystem.hideLockGhost(); checkActiveWeapon(); }
        return;
    }
    // 4. Режим строительства (buildMode)
    if (window.buildMode) {
        if (e.button === 0) {
            const currentItem = hotbar.getCurrentItem();
            if (!currentItem || currentItem.id !== 'blueprint') {
                window.buildMode = false;
                buildingSystem.cancel();
                buildingSystem.hideDoorGhost();
                showToast('❌ Режим строительства выключен (нет чертежа в руках)');
                checkActiveWeapon();
                return;
            }
            // ✅ Смотрим на дверной проём → ставим дверь
            const doorPlaced = buildingSystem.tryPlaceDoor();
            if (doorPlaced) {
                if (inventory.countItem('door') >= 1) {
                    inventory.removeItem('door', 1);
                    sound.play('chop1', { volume: 0.8 });
                    showToast('🚪 Дверь установлена');
                } else {
                    showToast('❌ Нет двери в инвентаре!');
                }
                return;
            }
            // Обычное строительство
            const placed = buildingSystem.tryPlace();
            if (placed) { sound.play('chop1', { volume: 0.8 }); }
            else { showToast('❌ Здесь нельзя построить!'); }
        } else if (e.button === 2) { buildingSystem.cancel(); buildingSystem.hideDoorGhost(); }
        return;
    }

    // 5. ЛКМ — удар инструментом (rock/pickaxe) или выстрел (ak47/berdana)
    if (e.button === 0) {
        mouseDown = true;
        const isTool = (currentWeapon === 'rock' || currentWeapon === 'stonePickaxe' || currentWeapon === 'concretePickaxe');
        if (isTool) {
            // ✅ hitWithTool сам проверит cooldown и установит его
            hitWithTool();
        } else if (currentWeapon === 'ak47') {
            // ✅ АК: первый выстрел сразу, дальше — автоогонь в animate loop
            if (akFireCooldown <= 0) {
                fireAK();
                akFireCooldown = AK_FIRE_INTERVAL;
            }
        } else if (currentWeapon === 'berdana') {
            // ✅ Берданка: одиночные выстрелы с кулдауном 0.5 сек
            if (berdanaCooldown <= 0) {
                fireBerdana();
                berdanaCooldown = BERDANA_COOLDOWN;
            }
        }
    }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
});

// ============================================================================
// ОБРАБОТКА КЛАВИШ
// ============================================================================
window.addEventListener('keydown', (e) => {
    // 1. Выбор частей в режиме стройки
    if (window.buildMode) {
        if (e.code === 'Digit1') { e.preventDefault(); buildingSystem.setPart('foundation'); showToast(`🏗️ Фундамент`); return; }
        if (e.code === 'Digit2') { e.preventDefault(); buildingSystem.setPart('wall'); showToast(`🏗️ Стена`); return; }
        if (e.code === 'Digit3') { e.preventDefault(); buildingSystem.setPart('window'); showToast(`🏗️ Окно`); return; }
        if (e.code === 'Digit4') { e.preventDefault(); buildingSystem.setPart('doorway'); showToast(`🏗️ Проем`); return; }
        if (e.code === 'Digit5') { e.preventDefault(); buildingSystem.setPart('ceiling'); showToast(`🏗️ Потолок`); return; }
    }

    // 2. F — взаимодействие (выход из багги, сундук, дверь, заправка, машина, посадка в багги)
    if (e.code === 'KeyF') {
        e.preventDefault();

        if (inBuggy) {
            if (currentBuggySeat) {
                buggy.standUp(currentBuggySeat);
                buggyDriverCtl.exitDriver();
                const exitDir = currentBuggySeat === 'driver' ? -1.8 : 1.8;
                const exitOffset = new THREE.Vector3(exitDir, 0, 0);
                exitOffset.applyQuaternion(buggy.group.quaternion);
                camera.position.add(exitOffset);
                player.velocity.set(0, 0, 0);
                inBuggy = false;
                currentBuggySeat = null;
                currentBuggyVehicle = null;
                player.enabled = true;
                checkActiveWeapon();
                showToast('🚪 Ты вышел из вездехода');
                return;
            }
        }

        if (!player.enabled || inventory.isOpen || isStorageMenuOpen()) return;

        const ray = new THREE.Raycaster();
        ray.setFromCamera(screenCenter, camera);
        ray.far = 4.0;

        // Сундуки
        const storageHit = storageWorld.tryInteract(ray, 3.5);
        if (storageHit) {
            openStorageMenu(storageHit, inventory);
            return;
        }
        // ✅ Ящики (военные/деревянные) — открытие на F
        const crateHit = ray.intersectObjects(scene.children, true).find(h => h.distance <= 4.0);
        if (crateHit) {
            const crate = crateManager.findCrate(crateHit.object);
            if (crate) {
                if (crate.opened) {
                    showToast('📦 Ящик уже открыт');
                } else {
                    const loot = crateManager.openCrate(crate);
                    crateManager.opts.onOpenCrate(crate, loot);
                    if (document.pointerLockElement) document.exitPointerLock();
                }
                return;
            }
        }
        // Двери построек
        const doorHit = buildingSystem.tryToggleDoor(ray, 4.0);
        if (doorHit) {
            if (doorHit.locked) {
                if (doorHit.lockOwner === PLAYER_ID) {
                    buildingSystem.setDoorLocked(doorHit.key, false);
                    showToast('🔓 Замок снят');
                } else {
                    showToast('🔒 Дверь заперта!');
                }
            } else {
                const isOpen = buildingSystem.isDoorOpen(doorHit.key);
                buildingSystem.setDoorOpen(doorHit.key, !isOpen);
                showToast(`🚪 Дверь ${!isOpen ? 'открыта' : 'закрыта'}`);
            }
            return;
        }
        // Части газовых станций
        for (const gs of gasStations) {
            if (gs && gs.rig) {
                const hits = ray.intersectObjects(gs.group.children, true);
                for (const h of hits) {
                    if (h.distance <= 4.0) {
                        let obj = h.object;
                        while (obj) {
                            if (obj.userData && obj.userData.part) {
                                const partName = obj.userData.part;
                                if (gs.names.includes(partName) || partName === 'garage') {
                                    gs.toggle(partName);
                                    showToast(`⚙️ ${partName} ${gs.isOpen(partName) ? 'открыто' : 'закрыто'}`);
                                    return;
                                }
                            }
                            obj = obj.parent;
                        }
                    }
                }
            }
        }
        // Машины на дороге
        for (const v of vehicles) {
            if (typeof v.toggle !== 'function') continue;
            const hits = ray.intersectObjects(v.group.children, true);
            for (const h of hits) {
                if (h.distance <= 4.0) {
                    let obj = h.object;
                    while (obj) {
                        if (obj.userData && obj.userData.part) {
                            const partName = obj.userData.part;
                            v.toggle(partName);
                            showToast(`🚗 ${partName} ${v.isOpen(partName) ? 'открыто' : 'закрыто'}`);
                            return;
                        }
                        obj = obj.parent;
                    }
                }
            }
        }
        // Посадка в багги
        if (!inBuggy && buggy && buggy.seatHitboxes) {
            const seatHits = ray.intersectObjects(buggy.seatHitboxes, false);
            if (seatHits.length > 0 && seatHits[0].distance <= 4.0) {
                const seatId = seatHits[0].object.userData.seatId;
                if (seatId) {
                    const seat = buggy.getSeat(seatId);
                    if (seat && !seat.occupied) {
                        buggy.sit(seatId, PLAYER_ID);
                        inBuggy = true;
                        currentBuggySeat = seatId;
                        currentBuggyVehicle = buggy;
                        if (seatId === 'driver') buggyDriverCtl.enterDriver();
                        player.enabled = false;
                        checkActiveWeapon();
                        if (seatId === 'driver') {
                            const t = buggy.getSeatTransform(seatId);
                            if (t) { camera.position.copy(t.position); camera.position.y += 0.76; }
                        } else {
                            const transform = buggy.getSeatTransform(seatId);
                            if (transform) { camera.position.copy(transform.position); }
                        }
                        showToast(`🚗 Ты сел в вездеход (${seatId === 'driver' ? 'водитель' : 'пассажир'})`);
                        return;
                    } else { showToast('❌ Сиденье занято!'); }
                }
            }
        }
    } // конец KeyF

    // 3. Tab — инвентарь (открыть)
    if (e.code === 'Tab') {
        e.preventDefault();
        if (inventory.isOpen) inventory.close();
        else { inventory.open(); controls.unlock(); }
        return;
    }

    // 4. Q — крафт-меню (пустое)
    if (e.code === 'KeyQ') { e.preventDefault(); craftMenu.toggle(); return; }

    // ✅ R — перезарядка АК-47 или берданки
    if (e.code === 'KeyR' && (currentWeapon === 'ak47' || currentWeapon === 'berdana')) {
        e.preventDefault();
        if (currentWeapon === 'ak47') {
            window.__akAmmo = AK_MAG_SIZE;
            showToast('🔫 Перезарядка АК: ' + AK_MAG_SIZE + '/' + AK_MAG_SIZE);
        } else {
            window.__berdanaAmmo = BERDANA_MAG_SIZE;
            showToast('🎯 Перезарядка берданки: ' + BERDANA_MAG_SIZE + '/' + BERDANA_MAG_SIZE);
        }
        return;
    }

    if (!player.enabled && !inBuggy) return;
    if (isDriver()) return;
    if (inventory.isOpen) { if (e.code === 'Escape' || e.code === 'KeyE') inventory.close(); return; }

    // 5. Z — открыть меню выбора частей для стройки (когда в руках blueprint)
    if (e.code === 'KeyZ' && currentWeapon === 'blueprint') {
        e.preventDefault();
        buildMenu.toggle();
        return;
    }
});

// ============================================================================
// РЕСАЙЗ
// ============================================================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyQuality();
});

// ============================================================================
//  🌤 НЕБО И ОБЛАКА (GPU Шейдер, объёмный пар)
// ============================================================================
function createVolumetricSky(scene, sunLight) {
    const vertexShader = `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const fragmentShader = `
        precision highp float;
        uniform float uTime;
        varying vec3 vWorldPosition;
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            vec3 i = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            i = mod289(i);
            vec4 p = permute(permute(permute(
                     i.z + vec4(0.0, i1.z, i2.z, 1.0))
                   + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                   + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }
        float fbm(vec3 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 5; i++) { v += a * snoise(p); p *= 2.0; a *= 0.5; }
            return v;
        }
        void main() {
            vec3 dir = normalize(vWorldPosition);
            float t = uTime * 0.02;
            float h = dir.y;
            vec3 horizon = vec3(0.78, 0.85, 0.92);
            vec3 zenith  = vec3(0.30, 0.55, 0.85);
            vec3 sky = mix(horizon, zenith, pow(max(h, 0.0), 0.45));

            // облака
            vec3 cp = dir * 3.0 + vec3(t, 0.0, t * 0.5);
            float cloud = fbm(cp);
            cloud = smoothstep(0.1, 0.7, cloud);
            sky = mix(sky, vec3(1.0), cloud * 0.45 * pow(max(h, 0.0), 0.3));

            // солнечный диск
            float d = max(dot(dir, normalize(vec3(0.5, 0.7, 0.3))), 0.0);
            sky += pow(d, 256.0) * vec3(1.0, 0.85, 0.6) * 2.0;
            sky += pow(d, 16.0)  * vec3(1.0, 0.75, 0.5) * 0.3;

            gl_FragColor = vec4(sky, 1.0);
        }
    `;
    const skyGeo = new THREE.SphereGeometry(2000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader, fragmentShader,
        side: THREE.BackSide, depthWrite: false,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.frustumCulled = false;
    scene.add(skyMesh);
    return { skyMesh };
}

// ============================================================================
// ПОСТ-ОБРАБОТКА
// ============================================================================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
    0.22, 0.4, 0.88
);
composer.addPass(bloomPass);
{ const _bloomSetSize = bloomPass.setSize.bind(bloomPass);
  bloomPass.setSize = (w, h) => _bloomSetSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); }

const colorGradingShader = {
    uniforms: {
        tDiffuse: { value: null },
        uContrast: { value: 1.05 },
        uSaturation: { value: 1.03 },
        uBrightness: { value: 1.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uContrast, uSaturation, uBrightness;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            color.rgb *= uBrightness;
            color.rgb = (color.rgb - 0.5) * uContrast + 0.5;
            float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            color.rgb = mix(vec3(gray), color.rgb, uSaturation);
            gl_FragColor = color;
        }
    `
};
const gradingPass = new ShaderPass(colorGradingShader);
composer.addPass(gradingPass);

const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
composer.addPass(fxaaPass);

// ============================================================================
// FPS-СЧЁТЧИК + АДАПТИВНАЯ ОПТИМИЗАЦИЯ
// ============================================================================
const fpsEl = document.createElement('div');
fpsEl.style.cssText = 'position:fixed;top:10px;right:10px;z-index:7;pointer-events:none;background:rgba(10,14,18,0.65);border:2px solid rgba(150,160,170,0.4);border-radius:6px;padding:6px 10px;font:bold 12px Consolas,monospace;color:#fff;line-height:1.55;text-align:right;white-space:pre;';
document.body.appendChild(fpsEl);

const perf = { frames: 0, acc: 0, last: performance.now(), fps: 60, ms: 16, quality: 0, cool: 0, upStreak: 0, enabled: true, bloomManual: false, auto: true };
const QUALITY = [
    [1.5, 2048, true],
    [1.25, 2048, true],
    [1.0, 1024, true],
    [0.85, 1024, false],
    [0.7, 0, false],
];
function applyQuality() {
    const [prCap, smSize, bloomOn] = QUALITY[perf.quality];
    const pr = Math.min(window.devicePixelRatio || 1, prCap);
    renderer.setPixelRatio(pr);
    composer.setPixelRatio(pr);
    composer.setSize(window.innerWidth, window.innerHeight);
    fxaaPass.uniforms['resolution'].value.set(1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr));
    if (smSize > 0) {
        if (sun.shadow.mapSize.x !== smSize) {
            sun.shadow.mapSize.set(smSize, smSize);
            if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        }
        if (!sun.castShadow && perf.gpuOn !== false) sun.castShadow = true;
    } else if (sun.castShadow) {
        sun.castShadow = false;
    }
    bloomPass.enabled = perf.bloomManual ? bloomPass.enabled : bloomOn;
    console.log(`[Perf] Качество → уровень ${perf.quality + 1}/${QUALITY.length} (масштаб ${pr.toFixed(2)}x, тени ${smSize || 'выкл'}, bloom ${bloomOn ? 'вкл' : 'выкл'})`);
}
window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { e.preventDefault(); perf.enabled = !perf.enabled; fpsEl.style.display = perf.enabled ? '' : 'none'; }
});
function perfFrame() {
    const now = performance.now();
    const dt = now - perf.last; perf.last = now;
    perf.frames++; perf.acc += dt;
    if (perf.acc < 500) return;
    perf.fps = Math.round(perf.frames * 1000 / perf.acc);
    perf.ms = perf.acc / perf.frames;
    perf.frames = 0; perf.acc = 0;
    if ((perf.auto !== false) && document.hasFocus && document.hasFocus()) {
        if (perf.cool > 0) perf.cool--;
        else if (perf.fps < 45 && perf.quality < QUALITY.length - 1) { perf.quality++; applyQuality(); perf.cool = 6; perf.upStreak = 0; }
        else if (perf.fps > 57 && perf.quality > 0) {
            if (++perf.upStreak >= 3) { perf.quality--; applyQuality(); perf.cool = 10; perf.upStreak = 0; }
        } else perf.upStreak = 0;
    }
    if (perf.enabled) {
        const info = renderer.info.render;
        const q = QUALITY[perf.quality];
        const pr = Math.min(window.devicePixelRatio || 1, q[0]);
        const col = perf.fps >= 55 ? '#4dff6a' : perf.fps >= 30 ? '#ffd24d' : '#ff5a4d';
        fpsEl.textContent =
            `FPS: ${perf.fps}  (${perf.ms.toFixed(1)} мс/кадр)\n` +
            `GPU: ${info.calls} вызовов | ${(info.triangles / 1000).toFixed(0)}к тр-ков\n` +
            `Качество ${perf.quality + 1}/5 | ${pr.toFixed(2)}x | тени ${q[1] || 'выкл'} | bloom ${q[2] ? 'вкл' : 'выкл'}\n` +
            `F3 — скрыть панель`;
        fpsEl.style.color = col;
    }
}
applyQuality();

// ============================================================================
// ⚙ МЕНЮ НАСТРОЕК (F2)
// ============================================================================
settingsUI = initSettings({
    renderer, scene, sun, controls,
    bloomPass, fxaaPass, gradingPass,
    QUALITY, applyQuality, perf, fpsEl,
    skySystem,
    setDrawZone(f) {
        for (const it of cullItems) {
            if (it.baseDist === undefined) it.baseDist = it.maxDist;
            it.maxDist = it.baseDist * f;
        }
        scene.fog.near = 120 * f;
        scene.fog.far = Math.max(140, 600 * f);
    },
    showToast, showOverlay: () => { overlay.style.display = 'flex'; },
});
window.__rcSettings = settingsUI;
window.__gfx = { sun, bloomPass, fxaaPass, gradingPass, scene };

// ============================================================================
// ГЛАВНЫЙ ЦИКЛ
// ============================================================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    perfFrame();

    // Солнце следует за игроком
    sun.position.set(camera.position.x + 50, camera.position.y + 80, camera.position.z + 30);
    sun.target.position.copy(camera.position);

    if (!isDriver()) buggyDriverCtl.tick(delta);

    if (inBuggy) {
        window.mySeatId = currentBuggySeat;
        if (currentBuggySeat === 'driver') {
            buggyDriverCtl.update(delta, {
                forward: buggyInput.forward,
                back: buggyInput.backward,
                left: buggyInput.left,
                right: buggyInput.right,
                brake: buggyInput.brake
            });
            const q = new THREE.Quaternion().copy(buggy.group.quaternion);
            q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
            camera.quaternion.copy(q);
        } else {
            const transform = buggy.getSeatTransform(currentBuggySeat);
            if (transform) { camera.position.copy(transform.position); }
        }
    } else {
        window.mySeatId = null;
    }

    if (!inBuggy) {
        player.update(delta);
        const buildResult = buildingSystem.collideCircle(camera.position, 0.35, camera.position.y - 1.7);
        if (buildResult && buildResult.grounded && buildResult.groundY !== null) {
            camera.position.y = buildResult.groundY + 1.7;
            player.velocity.y = 0; player.isOnGround = true;
        }
        for (const gs of gasStations) {
            const feet = new THREE.Vector3(camera.position.x, camera.position.y - 1.7, camera.position.z);
            const res = gs.resolveAll(feet, 0.35, 1.8, 0.6);
            camera.position.x = feet.x; camera.position.z = feet.z;
            if (res.grounded && res.ground !== null) { camera.position.y = res.ground + 1.7; player.velocity.y = 0; player.isOnGround = true; }
        }
        for (const wh of warehouses) {
            const feet = new THREE.Vector3(camera.position.x, camera.position.y - 1.7, camera.position.z);
            const res = wh.resolveAll(feet, 0.35, 1.8, 0.6, player.velocity.y);
            camera.position.x = feet.x; camera.position.z = feet.z;
            if (res.grounded && res.ground !== null) { camera.position.y = res.ground + 1.7; player.velocity.y = 0; player.isOnGround = true; }
        }
    }

    // Тряска деревьев и падение
    for (const tree of flora.trees.children) {
        const ud = tree.userData;
        if (!ud || !ud.isTree) continue;
        if (ud.shakeT > 0 && !ud.falling) {
            ud.shakeT -= delta;
            tree.rotation.x = Math.sin(ud.shakeT * 50) * 0.03 * Math.max(0, ud.shakeT);
            if (ud.shakeT <= 0) tree.rotation.x = 0;
        }
        if (ud.falling) {
            ud.fallT += delta;
            const t = Math.min(ud.fallT / 1.8, 1);
            tree.rotation.z = t * t * (Math.PI / 2) * 0.94 * ud.fallDir;
            if (t >= 1) ud.fallen = true;
        }
    }

    // Обновление призраков (storage / door / lock / build)
    if (window.storageMode) {
        const ray = new THREE.Raycaster(); ray.setFromCamera(screenCenter, camera);
        storageWorld.updateGhost(ray, [ground, buildingSystem.group]);
    }
    if (window.doorMode) {
        const ray = new THREE.Raycaster(); ray.setFromCamera(screenCenter, camera);
        buildingSystem.updateDoorAim(ray, camera);
    }
    if (window.lockMode) {
        const ray = new THREE.Raycaster(); ray.setFromCamera(screenCenter, camera);
        buildingSystem.updateLockAim(ray, camera, PLAYER_ID);
    }
    if (window.buildMode) {
        const ray = new THREE.Raycaster(); ray.setFromCamera(screenCenter, camera);
        buildingSystem.updateAim(ray, camera);
        buildingSystem.updateDoorAim(ray, camera);
    } else if (!window.doorMode && !window.lockMode) {
        buildingSystem.hideDoorGhost();
    }

    buildingSystem.update(delta);
    storageWorld.update(delta);
    craftMenu.update(delta);

    // 🐻 Медведи: ИИ, анимации, атаки
    bearManager.update(delta, camera.position, {
        playerCrouching: !!(player.isCrouching),
        playerSprinting: !!(player.keys && player.keys.sprint),
        playerMoving: !!player.isMoving,
        playerInBuggy: inBuggy,
        getObstacles: () => bearObstacles,
    });

    // ✅ Cooldown'ы оружия/инструментов
    if (toolCooldown > 0)    toolCooldown    = Math.max(0, toolCooldown - delta);
    if (akFireCooldown > 0)  akFireCooldown  = Math.max(0, akFireCooldown - delta);
    if (berdanaCooldown > 0) berdanaCooldown = Math.max(0, berdanaCooldown - delta);

    // ✅ Автоогонь АК-47 при зажатой ЛКМ
    if (mouseDown && currentWeapon === 'ak47' && akFireCooldown <= 0 && !window.buildMenuOpen && document.pointerLockElement) {
        fireAK();
        akFireCooldown = AK_FIRE_INTERVAL;
    }

    // ✅ Обновление игрока от 1-го лица
    if (fpPlayer && fpPlayer.loaded && !inBuggy) {
        const isMoving = player.velocity.length() > 0.5;
        const isSprinting = isMoving && (player.keys.sprint || false);
        fpPlayer.setRunning(isSprinting);
        fpPlayer.update(delta, {
            state: player.getState ? player.getState() : 'idle',
            crouch: player.isCrouching || false,
        });
    }



    // Обновление машин, заправок, складов
    for (const v of vehicles) v.update(delta);
    for (const gs of gasStations) gs.update(delta);
    for (const wh of warehouses) wh.update(delta);

    // Физика обломков бочек
    if (window.barrelDebris) {
        for (let i = window.barrelDebris.length - 1; i >= 0; i--) {
            const b = window.barrelDebris[i];
            b.life += delta;
            if (!b.onGround) {
                for (const child of b.debris.children) {
                    if (child.userData.isDebris) {
                        child.userData.vel.y -= 12 * delta;
                        child.position.addScaledVector(child.userData.vel, delta);
                        child.rotation.x += child.userData.rotVel.x * delta;
                        child.rotation.y += child.userData.rotVel.y * delta;
                        child.rotation.z += child.userData.rotVel.z * delta;
                        const groundY = getGroundHeight(child.position.x, child.position.z);
                        if (child.position.y <= groundY) {
                            child.position.y = groundY;
                            child.userData.vel.y = -child.userData.vel.y * 0.3;
                            child.userData.vel.x *= 0.7;
                            child.userData.vel.z *= 0.7;
                            if (Math.abs(child.userData.vel.y) < 0.5) { child.userData.vel.y = 0; b.onGround = true; }
                        }
                    }
                }
            }
            if (b.life >= b.maxLife) {
                scene.remove(b.debris);
                b.debris.traverse(o => { if (o.geometry) o.geometry.dispose(); });
                window.barrelDebris.splice(i, 1);
            }
        }
    }

    // Обновление скрапа на земле (анимация, если есть)
    if (window.worldScraps) {
        for (const s of window.worldScraps) {
            if (!s.group.userData.picked && s.update) s.update(delta);
        }
    }

    updateDistanceCulling();
    if (skySystem && skySystem.skyMesh) {
        skySystem.skyMesh.material.uniforms.uTime.value = performance.now();
    }
    renderer.info.reset();
    // ✅ Рендерим основную сцену, ЗАТЕМ руки + оружие поверх (без composer)
    renderer.render(scene, camera);
    if (fpPlayer && fpPlayer.loaded) fpPlayer.renderOverlay();

    updateGrass(flora.grass, camera);
}

// ============================================================================
// ДИАГНОСТИЧЕСКИЕ КЛАВИШИ (F7, F8, F9)
// ============================================================================
let bloomEnabled = true;
let floraEnabled = true;

window.addEventListener('keydown', (e) => {
    if (e.code === 'F9') {
        const camPos = camera.position;
        const nearby = [];
        scene.traverse(obj => {
            if (obj.isMesh && obj.geometry) {
                const dist = camPos.distanceTo(obj.getWorldPosition(new THREE.Vector3()));
                if (dist < 50) nearby.push({ obj, dist, name: obj.name || obj.type });
            }
        });
        nearby.sort((a, b) => a.dist - b.dist);
        console.table(nearby.slice(0, 10).map(n => ({ name: n.name, distance: n.dist.toFixed(2), visible: n.obj.visible })));
        nearby.slice(0, 5).forEach(n => { n.obj.visible = !n.obj.visible; });
    }
    if (e.code === 'F8') {
        bloomEnabled = !bloomEnabled;
        bloomPass.enabled = bloomEnabled;
        perf.bloomManual = true;
        console.log(`F8: Bloom ${bloomEnabled ? 'включён' : 'выключен'} (вручную)`);
    }
    if (e.code === 'F7') {
        floraEnabled = !floraEnabled;
        flora.trees.visible = floraEnabled;
        flora.bushes.visible = floraEnabled;
        flora.ferns.visible = floraEnabled;
        flora.flowers.visible = floraEnabled;
        console.log(`F7: Флора ${floraEnabled ? 'включена' : 'выключена'}`);
    }

    // ✅ B — переключить 1-е/3-е лицо
    if (e.code === 'KeyB') {
        playerVisible = !playerVisible;
        if (fpPlayer) {
            fpPlayer.setFirstPerson(!playerVisible);
            checkActiveWeapon();
        }
        showToast(playerVisible ? '🧍 Тело игрока: видно (3-е лицо)' : '👁️ Тело игрока: скрыто (1-е лицо, как в Rust)');
    }
});

animate();
setHp();
console.log('[Rust] Готово! Синглплеер без оружия (оружие будет добавлено с нуля).');
